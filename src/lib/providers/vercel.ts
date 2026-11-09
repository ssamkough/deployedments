import type { CollectContext } from '../context.ts';
import { normalizeFramework } from '../frameworks.ts';
import { hostOf, toHttps } from '../format.ts';
import { parseRepoUrl, type RepoInspection } from '../github.ts';
import { HttpError, fetchJson, mapLimit } from '../http.ts';
import { detectServices, mergeServices } from '../signatures.ts';
import type { Deployment, MetadataEntry, Service } from '../types.ts';

const API = 'https://api.vercel.com';

/** The subset of Vercel's Project object we read. */
export interface VercelProject {
  id: string;
  name: string;
  accountId?: string;
  framework?: string | null;
  createdAt: number;
  updatedAt: number;
  rootDirectory?: string | null;
  nodeVersion?: string | null;
  buildCommand?: string | null;
  outputDirectory?: string | null;
  live?: boolean;
  link?: {
    type?: string;
    org?: string;
    repo?: string;
    productionBranch?: string;
    gitCredentialId?: string;
  } | null;
  targets?: {
    production?: {
      alias?: string[];
      readyState?: string;
      createdAt?: number;
      url?: string;
      meta?: Record<string, string>;
    } | null;
  } | null;
  latestDeployments?: Array<{ alias?: string[]; readyState?: string; createdAt?: number; url?: string; target?: string | null }>;
  speedInsights?: { id?: string } | null;
  webAnalytics?: { id?: string } | null;
  crons?: { definitions?: unknown[] } | null;
  ssoProtection?: { deploymentType?: string } | null;
  passwordProtection?: unknown;
}

export interface VercelScope {
  /** Undefined for the personal account. */
  teamId?: string;
  slug: string;
  name: string;
}

export interface VercelExtras {
  envKeys: string[];
  /** Services Vercel itself reports (marketplace integrations, storage). */
  attached: Service[];
  repo: RepoInspection;
}

const slugToLabel = (slug: string) =>
  slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ');

/** Picks the best public hostname: custom domain > any alias > <name>.vercel.app. */
export function pickProductionHost(project: VercelProject): string {
  const aliases = [
    ...(project.targets?.production?.alias ?? []),
    ...(project.latestDeployments?.find((d) => d.target === 'production')?.alias ?? []),
  ];
  const custom = aliases.find((a) => !a.endsWith('.vercel.app'));
  const shortest = [...aliases].sort((a, b) => a.length - b.length)[0];
  return custom ?? shortest ?? `${project.name}.vercel.app`;
}

export function isLive(project: VercelProject): boolean {
  return project.targets?.production?.readyState === 'READY' ||
    project.latestDeployments?.some((d) => d.target === 'production' && d.readyState === 'READY') === true;
}

/** Pure mapper: Vercel project (+ enrichment) -> Deployment. Exported for tests. */
export function mapVercelProject(project: VercelProject, scope: VercelScope, extras: VercelExtras): Deployment {
  const host = pickProductionHost(project);
  const url = toHttps(`https://${host}`);
  const production = project.targets?.production;
  const lastDeployedMs = production?.createdAt ?? project.latestDeployments?.[0]?.createdAt;

  const repo = project.link?.type && project.link.org && project.link.repo
    ? parseRepoUrl(`https://${project.link.type}.${project.link.type === 'bitbucket' ? 'org' : 'com'}/${project.link.org}/${project.link.repo}`, project.link.productionBranch)
    : undefined;
  if (repo) {
    repo.description = extras.repo.description;
    repo.language = extras.repo.language;
    repo.private = extras.repo.private;
    repo.topics = extras.repo.topics;
  }

  const platform: Service[] = [];
  if (project.speedInsights?.id) platform.push({ id: 'vercel-speed-insights', label: 'Vercel Speed Insights', kind: 'analytics', source: 'platform' });
  if (project.webAnalytics?.id) platform.push({ id: 'vercel-analytics', label: 'Vercel Web Analytics', kind: 'analytics', source: 'platform' });
  if (project.crons?.definitions?.length) {
    platform.push({ id: 'vercel-cron', label: 'Vercel Cron Jobs', kind: 'platform', source: 'platform', detail: `${project.crons.definitions.length} job(s)` });
  }

  const services = mergeServices(
    platform,
    extras.attached,
    detectServices({ dependencies: extras.repo.dependencies, envKeys: extras.envKeys }),
  );

  const metadata: MetadataEntry[] = [];
  const add = (label: string, value?: string | number | boolean | null, code = false) => {
    if (value === undefined || value === null || value === '') return;
    metadata.push({ label, value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value), code });
  };
  add('Project ID', project.id, true);
  add('Default domain', `${project.name}.vercel.app`);
  add('Team', scope.name);
  add('Production branch', project.link?.productionBranch);
  add('Root directory', project.rootDirectory, true);
  add('Node.js version', project.nodeVersion);
  add('Build command', project.buildCommand, true);
  add('Output directory', project.outputDirectory, true);
  add('Deployment protection', project.ssoProtection ? 'Vercel Authentication' : project.passwordProtection ? 'Password' : undefined);

  return {
    id: `vercel:${project.id}`,
    provider: 'vercel',
    providerId: project.id,
    name: project.name,
    url,
    host: hostOf(url),
    customDomains: (production?.alias ?? []).filter((a) => !a.endsWith('.vercel.app')),
    createdAt: new Date(project.createdAt).toISOString(),
    updatedAt: new Date(project.updatedAt).toISOString(),
    lastDeployedAt: lastDeployedMs ? new Date(lastDeployedMs).toISOString() : undefined,
    framework: normalizeFramework(project.framework),
    team: scope.name,
    repo,
    dashboardUrl: `https://vercel.com/${scope.slug}/${project.name}`,
    services,
    metadata,
  };
}

const withTeam = (path: string, scope: VercelScope) => {
  if (!scope.teamId) return `${API}${path}`;
  return `${API}${path}${path.includes('?') ? '&' : '?'}teamId=${scope.teamId}`;
};

async function listScopes(headers: Record<string, string>): Promise<VercelScope[]> {
  const [{ user }, teams] = await Promise.all([
    fetchJson<{ user: { username: string; name?: string | null } }>(`${API}/v2/user`, { headers }),
    fetchJson<{ teams: Array<{ id: string; slug: string; name: string }> }>(`${API}/v2/teams?limit=100`, { headers }).catch(() => ({ teams: [] })),
  ]);
  return [
    { slug: user.username, name: user.name || user.username },
    ...teams.teams.map((t) => ({ teamId: t.id, slug: t.slug, name: t.name })),
  ];
}

async function listProjects(headers: Record<string, string>, scope: VercelScope): Promise<VercelProject[]> {
  const projects: VercelProject[] = [];
  let until: number | undefined;
  for (;;) {
    const page = await fetchJson<{ projects: VercelProject[]; pagination?: { next?: number | null } }>(
      withTeam(`/v9/projects?limit=100${until ? `&until=${until}` : ''}`, scope),
      { headers },
    );
    projects.push(...page.projects);
    until = page.pagination?.next ?? undefined;
    if (!until) return projects;
  }
}

/** Marketplace integrations + storage stores, grouped by project id. Best-effort. */
async function listAttachedServices(headers: Record<string, string>, scope: VercelScope, ctx: CollectContext) {
  const byProject = new Map<string, Service[]>();
  const push = (projectId: string, service: Service) => {
    const list = byProject.get(projectId) ?? [];
    list.push(service);
    byProject.set(projectId, list);
  };

  const configs = await fetchJson<unknown>(withTeam('/v1/integrations/configurations?view=account', scope), { headers }).catch((error) => {
    if (error instanceof HttpError) ctx.warnOnce('vercel-integrations', `Vercel integrations unreadable (${error.status}); using env/package.json detection only.`);
    return [];
  });
  const configList = (Array.isArray(configs) ? configs : (configs as { configurations?: unknown[] }).configurations ?? []) as Array<{
    slug?: string;
    projects?: string[];
  }>;
  for (const config of configList) {
    if (!config.slug) continue;
    for (const projectId of config.projects ?? []) {
      push(projectId, { id: `vercel-integration:${config.slug}`, label: slugToLabel(config.slug), kind: 'other', source: 'integration', detail: 'Installed from the Vercel Marketplace' });
    }
  }

  const stores = await fetchJson<{ stores?: Array<{ name?: string; type?: string; projectsMetadata?: Array<{ projectId?: string }> }> }>(
    withTeam('/v1/storage/stores', scope),
    { headers },
  ).catch(() => ({ stores: [] }));
  const storeLabels: Record<string, [string, string, Service['kind']]> = {
    blob: ['vercel-blob', 'Vercel Blob', 'storage'],
    postgres: ['vercel-postgres', 'Vercel Postgres', 'database'],
    redis: ['vercel-kv', 'Vercel KV / Redis', 'database'],
    kv: ['vercel-kv', 'Vercel KV / Redis', 'database'],
    'edge-config': ['vercel-edge-config', 'Vercel Edge Config', 'storage'],
  };
  for (const store of stores.stores ?? []) {
    const known = store.type ? storeLabels[store.type] : undefined;
    for (const link of store.projectsMetadata ?? []) {
      if (!link.projectId) continue;
      push(link.projectId, known
        ? { id: known[0], label: known[1], kind: known[2], source: 'integration', detail: store.name }
        : { id: `vercel-store:${store.name}`, label: store.name ?? 'Storage', kind: 'storage', source: 'integration', detail: store.type });
    }
  }
  return byProject;
}

export async function collectVercel(token: string, ctx: CollectContext): Promise<Deployment[]> {
  const headers = { authorization: `Bearer ${token}` };
  const scopes = await listScopes(headers);
  const deployments: Deployment[] = [];

  for (const scope of scopes) {
    const projects = await listProjects(headers, scope).catch((error) => {
      // A team the token can't see (e.g. SAML-enforced) shouldn't sink the whole run.
      if (scope.teamId && error instanceof HttpError && error.status === 403) {
        ctx.warn(`Vercel team "${scope.slug}" is not accessible with this token; skipped.`);
        return [] as VercelProject[];
      }
      throw error;
    });
    const live = projects.filter(isLive);
    console.log(`  vercel (${scope.slug}): ${projects.length} projects, ${live.length} live`);
    if (live.length === 0) continue;

    const attached = await listAttachedServices(headers, scope, ctx);
    const mapped = await mapLimit(live, 4, async (project) => {
      const [envKeys, inspected] = await Promise.all([
        fetchJson<{ envs?: Array<{ key: string }> }>(withTeam(`/v10/projects/${project.id}/env`, scope), { headers })
          .then((res) => (res.envs ?? []).map((e) => e.key))
          .catch((error) => {
            if (error instanceof HttpError) ctx.warnOnce('vercel-env', `Vercel env vars unreadable (${error.status}); env-based integration detection skipped.`);
            return [] as string[];
          }),
        ctx.github.inspect(
          project.link?.type === 'github' && project.link.org && project.link.repo
            ? parseRepoUrl(`https://github.com/${project.link.org}/${project.link.repo}`, project.link.productionBranch)
            : undefined,
          project.rootDirectory,
        ),
      ]);
      return mapVercelProject(project, scope, { envKeys, attached: attached.get(project.id) ?? [], repo: inspected });
    });
    deployments.push(...mapped);
  }
  return deployments;
}
