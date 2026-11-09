import type { Deployment, ProviderId } from './types.ts';

export interface CountRow {
  key: string;
  label: string;
  count: number;
}

export interface Stats {
  total: number;
  byProvider: CountRow[];
  byFramework: CountRow[];
  byService: CountRow[];
  byYearCreated: CountRow[];
  byTeam: CountRow[];
  byLanguage: CountRow[];
  withRepo: number;
  withCustomDomain: number;
  withServices: number;
  stale: Deployment[];
  newest?: Deployment;
  oldest?: Deployment;
  recentlyDeployed?: Deployment;
  averageServices: number;
}

export const STALE_AFTER_DAYS = 365;

const PROVIDER_LABELS: Record<ProviderId, string> = { netlify: 'Netlify', vercel: 'Vercel' };

function tally(entries: Array<{ key: string; label?: string }>, order: 'count' | 'key' = 'count'): CountRow[] {
  const map = new Map<string, CountRow>();
  for (const { key, label } of entries) {
    const row = map.get(key) ?? { key, label: label ?? key, count: 0 };
    row.count++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) =>
    order === 'key' ? a.key.localeCompare(b.key) : b.count - a.count || a.label.localeCompare(b.label),
  );
}

const ts = (iso: string) => Date.parse(iso);

export function computeStats(deployments: Deployment[], now: Date = new Date()): Stats {
  const staleCutoff = now.getTime() - STALE_AFTER_DAYS * 86_400_000;
  const lastTouched = (d: Deployment) => ts(d.lastDeployedAt ?? d.updatedAt);
  const sortBy = (fn: (d: Deployment) => number) => [...deployments].sort((a, b) => fn(a) - fn(b));

  return {
    total: deployments.length,
    byProvider: tally(deployments.map((d) => ({ key: d.provider, label: PROVIDER_LABELS[d.provider] }))),
    byFramework: tally(deployments.map((d) => ({ key: d.framework ?? 'none', label: d.framework ?? 'Not detected' }))),
    byService: tally(deployments.flatMap((d) => d.services.map((s) => ({ key: s.id, label: s.label })))),
    byYearCreated: tally(deployments.map((d) => ({ key: String(new Date(d.createdAt).getUTCFullYear()) })), 'key'),
    byTeam: tally(deployments.map((d) => ({ key: d.team ?? 'unknown', label: d.team ?? 'Unknown' }))),
    byLanguage: tally(deployments.flatMap((d) => (d.repo?.language ? [{ key: d.repo.language }] : []))),
    withRepo: deployments.filter((d) => d.repo).length,
    withCustomDomain: deployments.filter((d) => d.customDomains.length > 0).length,
    withServices: deployments.filter((d) => d.services.length > 0).length,
    stale: sortBy(lastTouched).filter((d) => lastTouched(d) < staleCutoff),
    newest: sortBy((d) => -ts(d.createdAt))[0],
    oldest: sortBy((d) => ts(d.createdAt))[0],
    recentlyDeployed: sortBy((d) => -lastTouched(d))[0],
    averageServices: deployments.length
      ? deployments.reduce((sum, d) => sum + d.services.length, 0) / deployments.length
      : 0,
  };
}
