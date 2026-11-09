import type { CollectContext } from '../context.ts';
import { normalizeFramework } from '../frameworks.ts';
import { hostOf, toHttps } from '../format.ts';
import { parseRepoUrl, type RepoInspection } from '../github.ts';
import { HttpError, fetchJson, mapLimit } from '../http.ts';
import { detectServices, mergeServices } from '../signatures.ts';
import type { Deployment, MetadataEntry, Service } from '../types.ts';

const API = 'https://api.netlify.com/api/v1';

/** The subset of Netlify's Site object we read. */
export interface NetlifySite {
  id: string;
  name: string;
  url?: string | null;
  ssl_url?: string | null;
  admin_url?: string;
  default_domain?: string;
  custom_domain?: string | null;
  domain_aliases?: string[];
  state?: string;
  created_at: string;
  updated_at: string;
  screenshot_url?: string | null;
  account_id?: string;
  account_name?: string;
  account_slug?: string;
  plan?: string;
  has_database?: boolean;
  has_password?: boolean;
  use_server?: boolean;
  created_via?: string | null;
  functions_region?: string | null;
  build_settings?: {
    provider?: string | null;
    repo_url?: string | null;
    repo_branch?: string | null;
    cmd?: string | null;
    dir?: string | null;
    base?: string | null;
    package_path?: string | null;
  } | null;
  plugins?: Array<{ package: string; pinned_version?: string }>;
  published_deploy?: {
    id?: string;
    state?: string;
    branch?: string | null;
    commit_ref?: string | null;
    commit_url?: string | null;
    title?: string | null;
    framework?: string | null;
    published_at?: string | null;
    deploy_time?: number | null;
    context?: string | null;
    available_functions?: unknown[] | null;
    function_schedules?: unknown[] | null;
    edge_functions_present?: boolean | null;
    screenshot_url?: string | null;
  } | null;
}

export interface NetlifyExtras {
  envKeys: string[];
  formCount: number;
  repo: RepoInspection;
}

const PLUGIN_LABELS: Record<string, string> = {
  '@netlify/plugin-nextjs': 'Next.js Runtime',
  '@netlify/plugin-lighthouse': 'Lighthouse',
  '@netlify/plugin-emails': 'Netlify Emails',
  'netlify-plugin-cache': 'Build cache',
};

const humanizePlugin = (pkg: string) =>
  PLUGIN_LABELS[pkg] ??
  pkg
    .replace(/^@[^/]+\//, '')
    .replace(/^(?:netlify-)?plugin-/, '')
    .split('-')
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');

/** Pure mapper: Netlify site (+ enrichment) -> Deployment. Exported for tests. */
export function mapNetlifySite(site: NetlifySite, extras: NetlifyExtras): Deployment {
  const deploy = site.published_deploy;
  const settings = site.build_settings;
  const url = toHttps(site.ssl_url || site.url || `https://${site.default_domain ?? `${site.name}.netlify.app`}`);

  const repo = parseRepoUrl(settings?.repo_url, settings?.repo_branch);
  if (repo) {
    repo.description = extras.repo.description;
    repo.language = extras.repo.language;
    repo.private = extras.repo.private;
    repo.topics = extras.repo.topics;
  }

  const platform: Service[] = [];
  const functions = deploy?.available_functions?.length ?? 0;
  if (functions > 0) {
    platform.push({ id: 'netlify-functions', label: 'Netlify Functions', kind: 'platform', source: 'platform', detail: `${functions} deployed` });
  }
  if (deploy?.function_schedules?.length) {
    platform.push({ id: 'netlify-scheduled-functions', label: 'Scheduled Functions', kind: 'platform', source: 'platform', detail: `${deploy.function_schedules.length} scheduled` });
  }
  if (deploy?.edge_functions_present) {
    platform.push({ id: 'netlify-edge-functions', label: 'Edge Functions', kind: 'platform', source: 'platform' });
  }
  if (site.has_database) {
    platform.push({ id: 'netlify-db', label: 'Netlify DB', kind: 'database', source: 'platform' });
  }
  if (extras.formCount > 0) {
    platform.push({ id: 'netlify-forms', label: 'Netlify Forms', kind: 'platform', source: 'platform', detail: `${extras.formCount} form${extras.formCount === 1 ? '' : 's'}` });
  }
  const plugins: Service[] = (site.plugins ?? []).map((p) => ({
    id: `netlify-plugin:${p.package}`,
    label: humanizePlugin(p.package),
    kind: 'platform',
    source: 'plugin',
    detail: p.package + (p.pinned_version ? `@${p.pinned_version}` : ''),
  }));

  const services = mergeServices(
    platform,
    plugins,
    detectServices({ dependencies: extras.repo.dependencies, envKeys: extras.envKeys }),
  );

  const metadata: MetadataEntry[] = [];
  const add = (label: string, value?: string | number | boolean | null, code = false) => {
    if (value === undefined || value === null || value === '') return;
    metadata.push({ label, value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value), code });
  };
  add('Site ID', site.id, true);
  add('Default domain', site.default_domain);
  add('Account', site.account_name);
  add('Plan', site.plan);
  add('Production branch', deploy?.branch ?? settings?.repo_branch);
  add('Latest commit', deploy?.commit_ref?.slice(0, 7), true);
  add('Commit title', deploy?.title);
  add('Build command', settings?.cmd, true);
  add('Publish directory', settings?.dir, true);
  add('Functions region', site.functions_region);
  add('Last build time', deploy?.deploy_time ? `${deploy.deploy_time}s` : undefined);
  add('Password protected', site.has_password);
  add('Created via', site.created_via);

  return {
    id: `netlify:${site.id}`,
    provider: 'netlify',
    providerId: site.id,
    name: site.name,
    url,
    host: hostOf(url),
    customDomains: [site.custom_domain, ...(site.domain_aliases ?? [])].filter((d): d is string => Boolean(d)),
    createdAt: site.created_at,
    updatedAt: site.updated_at,
    lastDeployedAt: deploy?.published_at ?? undefined,
    framework: normalizeFramework(deploy?.framework),
    team: site.account_name,
    repo,
    dashboardUrl: site.admin_url,
    fallbackScreenshotUrl: deploy?.screenshot_url || site.screenshot_url || undefined,
    services,
    metadata,
  };
}

async function listSites(token: string): Promise<NetlifySite[]> {
  const headers = { authorization: `Bearer ${token}` };
  const perPage = 100;
  const sites: NetlifySite[] = [];
  for (let page = 1; ; page++) {
    const batch = await fetchJson<NetlifySite[]>(`${API}/sites?filter=all&per_page=${perPage}&page=${page}`, { headers });
    sites.push(...batch);
    if (batch.length < perPage) return sites;
  }
}

export async function collectNetlify(token: string, ctx: CollectContext): Promise<Deployment[]> {
  const headers = { authorization: `Bearer ${token}` };
  const all = await listSites(token);
  const live = all.filter((s) => s.published_deploy?.state === 'ready' && s.state !== 'disabled');
  console.log(`  netlify: ${all.length} sites, ${live.length} live`);

  const enriched = await mapLimit(live, 4, async (site) => {
    const [envKeys, formCount, inspected] = await Promise.all([
      site.account_id
        ? fetchJson<Array<{ key: string }>>(`${API}/accounts/${site.account_id}/env?site_id=${site.id}`, { headers })
            .then((vars) => vars.map((v) => v.key))
            .catch((error) => {
              if (error instanceof HttpError) ctx.warnOnce('netlify-env', `Netlify env vars unreadable (${error.status}); env-based integration detection skipped.`);
              return [] as string[];
            })
        : Promise.resolve([] as string[]),
      fetchJson<unknown[]>(`${API}/sites/${site.id}/forms`, { headers })
        .then((forms) => forms.length)
        .catch(() => 0),
      ctx.github.inspect(parseRepoUrl(site.build_settings?.repo_url, site.published_deploy?.branch ?? site.build_settings?.repo_branch), site.build_settings?.package_path ?? site.build_settings?.base),
    ]);
    return mapNetlifySite(site, { envKeys, formCount, repo: inspected });
  });

  return enriched;
}

