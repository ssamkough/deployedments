import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { mapLimit } from './http.ts';
import type { CollectContext } from './context.ts';
import type { Deployment } from './types.ts';

export const SCREENSHOT_WIDTH = 800;
export const SCREENSHOT_HEIGHT = 500;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface Options {
  /** Directory the images are written to (inside `public/`). */
  directory: string;
  /** URL prefix those files are served under. */
  publicPath: string;
  microlinkKey?: string;
}

const fileNameFor = (d: Deployment) => `${d.provider}-${d.providerId.replace(/[^a-z0-9_-]/gi, '_')}.webp`;

async function isFresh(file: string, d: Deployment): Promise<boolean> {
  try {
    const { mtimeMs } = await stat(file);
    const deployedAt = d.lastDeployedAt ? Date.parse(d.lastDeployedAt) : 0;
    return Date.now() - mtimeMs < MAX_AGE_MS && mtimeMs > deployedAt;
  } catch {
    return false;
  }
}

async function downloadImage(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(90_000), redirect: 'follow' });
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status });
  const type = res.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) throw new Error(`expected an image but got ${type || 'unknown content-type'}`);
  return Buffer.from(await res.arrayBuffer());
}

async function toWebp(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT, { fit: 'cover', position: 'top' })
    .webp({ quality: 74 })
    .toBuffer();
}

/**
 * Captures a screenshot per deployment via Microlink (falling back to the provider's own preview
 * when it has one) and stores optimised WebP files. Existing recent files are reused, so only
 * new or recently-deployed sites cost an API call.
 */
export async function captureScreenshots(deployments: Deployment[], options: Options, ctx: CollectContext): Promise<void> {
  await mkdir(options.directory, { recursive: true });

  // Remove screenshots of sites that no longer exist.
  const wanted = new Set(deployments.map(fileNameFor));
  for (const file of await readdir(options.directory)) {
    if (file.endsWith('.webp') && !wanted.has(file)) await rm(path.join(options.directory, file));
  }

  let microlinkExhausted = false;
  let captured = 0;
  let reused = 0;
  let failed = 0;

  await mapLimit(deployments, 3, async (d) => {
    const name = fileNameFor(d);
    const file = path.join(options.directory, name);
    if (await isFresh(file, d)) {
      d.screenshot = `${options.publicPath}/${name}`;
      reused++;
      return;
    }

    let image: Buffer | undefined;
    if (!microlinkExhausted) {
      const params = new URLSearchParams({
        url: d.url,
        screenshot: 'true',
        meta: 'false',
        embed: 'screenshot.url',
        'viewport.width': '1280',
        'viewport.height': '800',
        waitForTimeout: '1500',
      });
      try {
        image = await downloadImage(
          `https://api.microlink.io/?${params}`,
          options.microlinkKey ? { 'x-api-key': options.microlinkKey } : {},
        );
      } catch (error) {
        if ((error as { status?: number }).status === 429) {
          microlinkExhausted = true;
          ctx.warn('Microlink rate limit reached; remaining screenshots use provider previews or placeholders. Set MICROLINK_API_KEY or rebuild later (screenshots are cached).');
        }
      }
    }
    if (!image && d.fallbackScreenshotUrl) {
      image = await downloadImage(d.fallbackScreenshotUrl).catch(() => undefined);
    }

    if (!image) {
      // Keep a stale screenshot rather than dropping to a placeholder.
      if (await stat(file).then(() => true, () => false)) d.screenshot = `${options.publicPath}/${name}`;
      failed++;
      return;
    }
    try {
      await writeFile(file, await toWebp(image));
      d.screenshot = `${options.publicPath}/${name}`;
      captured++;
    } catch {
      failed++;
    }
  });

  console.log(`  screenshots: ${captured} captured, ${reused} cached, ${failed} unavailable`);
  if (failed > 0) ctx.warn(`${failed} deployment(s) have no screenshot and will show a placeholder.`);
}
