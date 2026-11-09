/**
 * Build-time data collection: queries every configured provider, captures screenshots and writes
 * `src/data/generated/deployments.json` for Astro to render statically.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from '../src/lib/context.ts';
import { fixtureDeployments } from '../src/lib/fixtures.ts';
import { hostOf, toHttps } from '../src/lib/format.ts';
import { parseRepoUrl } from '../src/lib/github.ts';
import { collectNetlify } from '../src/lib/providers/netlify.ts';
import { collectVercel } from '../src/lib/providers/vercel.ts';
import { captureScreenshots } from '../src/lib/screenshots.ts';
import type { Deployment, DeploymentSnapshot } from '../src/lib/types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const env = process.env;
const onNetlify = env.NETLIFY === 'true';
const ctx = createContext(env);

/** On Netlify's build image, the running site is described by env vars. */
function currentNetlifySite(): Deployment | undefined {
  if (!onNetlify || !env.SITE_ID) return undefined;
  const url = toHttps(env.URL || `https://${env.SITE_NAME ?? env.SITE_ID}.netlify.app`);
  const now = new Date().toISOString();
  return {
    id: `netlify:${env.SITE_ID}`,
    provider: 'netlify',
    providerId: env.SITE_ID,
    name: env.SITE_NAME ?? 'deployedments',
    url,
    host: hostOf(url),
    customDomains: [],
    createdAt: now,
    updatedAt: now,
    lastDeployedAt: now,
    framework: 'Astro',
    repo: parseRepoUrl(env.REPOSITORY_URL, env.HEAD),
    services: [],
    metadata: [{ label: 'Site ID', value: env.SITE_ID, code: true }],
  };
}

async function gather(): Promise<{ deployments: Deployment[]; sample: boolean }> {
  const netlifyToken = env.NETLIFY_AUTH_TOKEN?.trim();
  const vercelToken = env.VERCEL_TOKEN?.trim();

  if (!netlifyToken && !vercelToken) {
    if (onNetlify) {
      throw new Error('No provider credentials. Set NETLIFY_AUTH_TOKEN and/or VERCEL_TOKEN in the Netlify site environment variables.');
    }
    ctx.warn('No NETLIFY_AUTH_TOKEN or VERCEL_TOKEN found; building with SAMPLE data. See .env.example.');
    return { deployments: fixtureDeployments(), sample: true };
  }

  const results = await Promise.all([
    netlifyToken ? collectNetlify(netlifyToken, ctx) : [],
    vercelToken ? collectVercel(vercelToken, ctx) : [],
  ]);
  if (!netlifyToken) ctx.warn('NETLIFY_AUTH_TOKEN not set; Netlify sites are not included.');
  if (!vercelToken) ctx.warn('VERCEL_TOKEN not set; Vercel projects are not included.');
  return { deployments: results.flat(), sample: false };
}

async function main() {
  console.log('Collecting deployments…');
  const { deployments: collected, sample } = await gather();

  // De-duplicate, then make sure this site is always listed.
  const byId = new Map(collected.map((d) => [d.id, d]));
  const self = currentNetlifySite();
  if (self && !byId.has(self.id)) {
    byId.set(self.id, self);
    ctx.warn('This site was not returned by the Netlify API (token may lack access); added from build environment.');
  }
  const selfId = self?.id;
  const deployments = [...byId.values()]
    .map((d) => ({ ...d, isSelf: d.isSelf || d.id === selfId || undefined }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));

  if (!deployments.some((d) => d.isSelf)) {
    ctx.warn('This site is not in the list yet. It appears automatically once deployed to Netlify with a token that can read it.');
  }

  if (env.SCREENSHOTS === 'off' || sample) {
    console.log(`  screenshots: skipped (${sample ? 'sample data' : 'SCREENSHOTS=off'})`);
  } else {
    await captureScreenshots(
      deployments,
      { directory: path.join(root, 'public/screenshots'), publicPath: '/screenshots', microlinkKey: env.MICROLINK_API_KEY || undefined },
      ctx,
    );
  }

  for (const d of deployments) delete d.fallbackScreenshotUrl;

  const snapshot: DeploymentSnapshot = {
    collectedAt: new Date().toISOString(),
    sample,
    warnings: ctx.warnings,
    deployments,
  };
  const out = path.join(root, 'src/data/generated/deployments.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Wrote ${deployments.length} deployments to ${path.relative(root, out)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
