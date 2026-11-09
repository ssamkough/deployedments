import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeFramework } from './frameworks.ts';
import { parseRepoUrl } from './github.ts';
import { mapNetlifySite, type NetlifySite } from './providers/netlify.ts';
import { isLive, mapVercelProject, pickProductionHost, type VercelProject } from './providers/vercel.ts';
import { detectServices, mergeServices } from './signatures.ts';
import { computeStats } from './stats.ts';
import type { Deployment } from './types.ts';

describe('parseRepoUrl', () => {
  it('parses https, .git and ssh urls', () => {
    for (const url of ['https://github.com/o/r', 'https://github.com/o/r.git', 'git@github.com:o/r.git']) {
      assert.deepEqual(parseRepoUrl(url, 'main'), { host: 'github', url: 'https://github.com/o/r', owner: 'o', name: 'r', branch: 'main' });
    }
  });
  it('recognises other hosts and rejects junk', () => {
    assert.equal(parseRepoUrl('https://gitlab.com/o/r')?.host, 'gitlab');
    assert.equal(parseRepoUrl('not a url'), undefined);
    assert.equal(parseRepoUrl(null), undefined);
  });
});

describe('normalizeFramework', () => {
  it('unifies provider slugs and drops unknowns', () => {
    assert.equal(normalizeFramework('next'), 'Next.js');
    assert.equal(normalizeFramework('nextjs'), 'Next.js');
    assert.equal(normalizeFramework('#static'), 'Static HTML');
    assert.equal(normalizeFramework('unknown'), undefined);
    assert.equal(normalizeFramework(''), undefined);
    assert.equal(normalizeFramework('some-new-thing'), 'Some New Thing');
  });
});

describe('detectServices', () => {
  it('finds services from dependencies, including scoped packages', () => {
    const ids = detectServices({ dependencies: ['@netlify/blobs', 'inngest', '@clerk/nextjs', 'left-pad'] }).map((s) => s.id);
    assert.deepEqual(ids.sort(), ['clerk', 'inngest', 'netlify-blobs']);
  });
  it('finds services from env var names, including framework prefixes', () => {
    const found = detectServices({ envKeys: ['NEXT_PUBLIC_SUPABASE_URL', 'STRIPE_SECRET_KEY', 'NODE_ENV'] });
    assert.deepEqual(found.map((s) => s.id).sort(), ['stripe', 'supabase']);
    assert.match(found[0]!.detail!, /environment variable/);
  });
  it('does not match by package-name substring', () => {
    assert.deepEqual(detectServices({ dependencies: ['ai-utils', 'inngest-fake', 'stripe-mock'] }), []);
  });
  it('prefers dependency evidence and dedupes when merging', () => {
    const [fromDeps] = detectServices({ dependencies: ['inngest'], envKeys: ['INNGEST_EVENT_KEY'] });
    assert.equal(fromDeps?.source, 'dependency');
    const merged = mergeServices([{ id: 'x', label: 'X', kind: 'other', source: 'platform' }], [{ id: 'x', label: 'X2', kind: 'other', source: 'environment' }]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.label, 'X');
  });
});

const netlifySite: NetlifySite = {
  id: 'abc',
  name: 'my-site',
  url: 'http://my-site.example.com',
  ssl_url: 'https://my-site.example.com',
  admin_url: 'https://app.netlify.com/projects/my-site',
  default_domain: 'my-site.netlify.app',
  custom_domain: 'my-site.example.com',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  account_name: 'Me',
  build_settings: { repo_url: 'https://github.com/me/my-site', repo_branch: 'main', cmd: 'npm run build', dir: 'dist' },
  plugins: [{ package: '@netlify/plugin-lighthouse' }],
  published_deploy: {
    state: 'ready',
    framework: 'astro',
    branch: 'main',
    commit_ref: '0123456789abcdef',
    published_at: '2025-01-02T00:00:00.000Z',
    available_functions: [{}, {}],
    edge_functions_present: true,
  },
};

describe('mapNetlifySite', () => {
  const d = mapNetlifySite(netlifySite, { envKeys: ['SUPABASE_URL'], formCount: 1, repo: { dependencies: ['@netlify/blobs'], language: 'TypeScript', private: true } });
  it('maps core fields', () => {
    assert.equal(d.id, 'netlify:abc');
    assert.equal(d.url, 'https://my-site.example.com');
    assert.equal(d.host, 'my-site.example.com');
    assert.equal(d.framework, 'Astro');
    assert.deepEqual(d.customDomains, ['my-site.example.com']);
    assert.equal(d.lastDeployedAt, '2025-01-02T00:00:00.000Z');
    assert.equal(d.repo?.url, 'https://github.com/me/my-site');
    assert.equal(d.repo?.private, true);
  });
  it('combines platform, plugin, env and dependency services', () => {
    const ids = d.services.map((s) => s.id);
    for (const id of ['netlify-functions', 'netlify-edge-functions', 'netlify-forms', 'netlify-blobs', 'supabase', 'netlify-plugin:@netlify/plugin-lighthouse']) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
  });
  it('survives a bare-bones site', () => {
    const bare = mapNetlifySite({ id: 'z', name: 'z', created_at: '2020-01-01', updated_at: '2020-01-01' }, { envKeys: [], formCount: 0, repo: { dependencies: [] } });
    assert.equal(bare.url, 'https://z.netlify.app');
    assert.equal(bare.repo, undefined);
    assert.deepEqual(bare.services, []);
  });
});

const vercelProject: VercelProject = {
  id: 'prj_1',
  name: 'shop',
  framework: 'nextjs',
  createdAt: Date.parse('2024-02-01T00:00:00Z'),
  updatedAt: Date.parse('2025-02-01T00:00:00Z'),
  link: { type: 'github', org: 'me', repo: 'shop', productionBranch: 'main' },
  targets: { production: { readyState: 'READY', createdAt: Date.parse('2025-02-02T00:00:00Z'), alias: ['shop-me.vercel.app', 'shop.example.com'] } },
  speedInsights: { id: 'x' },
};

describe('vercel mapping', () => {
  it('prefers custom domains and detects live projects', () => {
    assert.equal(pickProductionHost(vercelProject), 'shop.example.com');
    assert.equal(pickProductionHost({ ...vercelProject, targets: null }), 'shop.vercel.app');
    assert.equal(isLive(vercelProject), true);
    assert.equal(isLive({ ...vercelProject, targets: { production: { readyState: 'ERROR' } } }), false);
  });
  it('maps a project with attached services', () => {
    const d = mapVercelProject(vercelProject, { slug: 'me', name: 'Me' }, {
      envKeys: ['BLOB_READ_WRITE_TOKEN'],
      attached: [{ id: 'vercel-integration:neon', label: 'Neon', kind: 'database', source: 'integration' }],
      repo: { dependencies: ['inngest'] },
    });
    assert.equal(d.id, 'vercel:prj_1');
    assert.equal(d.framework, 'Next.js');
    assert.equal(d.repo?.url, 'https://github.com/me/shop');
    assert.equal(d.dashboardUrl, 'https://vercel.com/me/shop');
    assert.equal(d.createdAt, '2024-02-01T00:00:00.000Z');
    assert.deepEqual(d.customDomains, ['shop.example.com']);
    assert.deepEqual(d.services.map((s) => s.id).sort(), ['inngest', 'vercel-blob', 'vercel-integration:neon', 'vercel-speed-insights']);
  });
});

describe('computeStats', () => {
  const base = { customDomains: [] as string[], services: [] as Deployment['services'], metadata: [] as Deployment['metadata'], host: 'x', url: 'https://x', providerId: '1' };
  const make = (over: Partial<Deployment>): Deployment => ({
    ...base, id: 'a', provider: 'netlify', name: 'a', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z', ...over,
  });
  const deployments = [
    make({ id: 'n1', provider: 'netlify', framework: 'Astro', createdAt: '2023-05-01T00:00:00Z', lastDeployedAt: '2026-01-01T00:00:00Z' }),
    make({ id: 'n2', provider: 'netlify', framework: 'Astro', customDomains: ['a.dev'], lastDeployedAt: '2026-01-01T00:00:00Z' }),
    make({ id: 'v1', provider: 'vercel', repo: { host: 'github', url: 'u', language: 'TypeScript' }, services: [{ id: 's', label: 'S', kind: 'other', source: 'platform' }], lastDeployedAt: '2026-01-01T00:00:00Z' }),
    make({ id: 'old', provider: 'vercel', updatedAt: '2020-01-01T00:00:00Z', createdAt: '2020-01-01T00:00:00Z' }),
  ];
  const stats = computeStats(deployments, new Date('2026-06-01T00:00:00Z'));
  it('tallies providers, frameworks and flags', () => {
    assert.equal(stats.total, 4);
    assert.deepEqual(stats.byProvider.map((r) => [r.key, r.count]), [['netlify', 2], ['vercel', 2]]);
    assert.deepEqual(stats.byFramework[0], { key: 'Astro', label: 'Astro', count: 2 });
    assert.equal(stats.byFramework.find((r) => r.key === 'none')?.label, 'Not detected');
    assert.equal(stats.withRepo, 1);
    assert.equal(stats.withCustomDomain, 1);
    assert.equal(stats.withServices, 1);
    assert.deepEqual(stats.byLanguage.map((r) => r.key), ['TypeScript']);
  });
  it('orders years ascending and finds extremes and stale entries', () => {
    assert.deepEqual(stats.byYearCreated.map((r) => r.key), ['2020', '2023', '2024']);
    assert.equal(stats.oldest?.id, 'old');
    assert.deepEqual(stats.stale.map((d) => d.id), ['old']);
  });
  it('handles an empty list', () => {
    const empty = computeStats([]);
    assert.equal(empty.total, 0);
    assert.equal(empty.averageServices, 0);
  });
});
