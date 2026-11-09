import { HttpError, request } from './http.ts';
import type { RepoLink } from './types.ts';

/** Parses https and ssh git URLs. Returns undefined when there's nothing usable. */
export function parseRepoUrl(raw?: string | null, branch?: string | null): RepoLink | undefined {
  if (!raw) return undefined;
  const match =
    /^(?:https?:\/\/|git@|ssh:\/\/git@)(?<host>[^/:]+)[/:](?<owner>[^/]+)\/(?<name>[^/]+?)(?:\.git)?\/?$/.exec(
      raw.trim(),
    );
  const { host, owner, name } = match?.groups ?? {};
  if (!host || !owner || !name) return undefined;
  const kind = host.includes('github') ? 'github' : host.includes('gitlab') ? 'gitlab' : host.includes('bitbucket') ? 'bitbucket' : 'other';
  return { host: kind, url: `https://${host}/${owner}/${name}`, owner, name, branch: branch || undefined };
}

export interface RepoInspection {
  /** Names from dependencies / devDependencies in package.json. */
  dependencies: string[];
  description?: string;
  language?: string;
  private?: boolean;
  topics?: string[];
}

/**
 * Minimal read-only GitHub client. Everything is best-effort: if we hit a rate limit or lack
 * access, we warn once and carry on without repo enrichment.
 */
export class GithubClient {
  #disabled = false;
  #warned = false;

  constructor(
    private readonly token: string | undefined,
    private readonly warn: (message: string) => void,
  ) {}

  async inspect(repo: RepoLink | undefined, directory?: string | null): Promise<RepoInspection> {
    const empty: RepoInspection = { dependencies: [] };
    if (!repo || repo.host !== 'github' || !repo.owner || !repo.name || this.#disabled) return empty;

    const base = `https://api.github.com/repos/${repo.owner}/${repo.name}`;
    const dir = (directory ?? '').replace(/^\/+|\/+$/g, '');
    const pkgPath = dir ? `${dir}/package.json` : 'package.json';
    const ref = repo.branch ? `?ref=${encodeURIComponent(repo.branch)}` : '';

    const [info, pkg] = await Promise.all([
      this.#json<{ description?: string | null; language?: string | null; private?: boolean; topics?: string[] }>(base),
      this.#json<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(
        `${base}/contents/${pkgPath}${ref}`,
        'application/vnd.github.raw+json',
      ),
    ]);

    return {
      dependencies: [...Object.keys(pkg?.dependencies ?? {}), ...Object.keys(pkg?.devDependencies ?? {})],
      description: info?.description ?? undefined,
      language: info?.language ?? undefined,
      private: info?.private,
      topics: info?.topics,
    };
  }

  async #json<T>(url: string, accept = 'application/vnd.github+json'): Promise<T | undefined> {
    if (this.#disabled) return undefined;
    try {
      const res = await request(url, {
        retries: 1,
        headers: {
          accept,
          'user-agent': 'deployedments',
          'x-github-api-version': '2022-11-28',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
      });
      return JSON.parse(await res.text()) as T;
    } catch (error) {
      if (error instanceof HttpError && (error.status === 403 || error.status === 429)) {
        this.#disabled = true;
        if (!this.#warned) {
          this.#warned = true;
          this.warn(
            this.token
              ? 'GitHub denied a request (rate limit or permissions); repo enrichment skipped for remaining sites.'
              : 'GitHub rate limit hit without GITHUB_TOKEN; set one to detect integrations from package.json.',
          );
        }
      }
      // 404 (no package.json / no access) and anything else is simply "no data".
      return undefined;
    }
  }
}
