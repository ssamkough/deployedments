import { hostOf } from './format.ts';
import type { Deployment, Service } from './types.ts';

/**
 * Sample data used when no provider credentials are configured, so `npm run dev` works on a fresh
 * clone. All names and URLs are invented.
 */

const svc = (id: string, label: string, kind: Service['kind'], source: Service['source'], detail?: string): Service => ({ id, label, kind, source, detail });

const SERVICES = {
  blobs: svc('netlify-blobs', 'Netlify Blobs', 'storage', 'dependency', 'via @netlify/blobs in package.json'),
  functions: svc('netlify-functions', 'Netlify Functions', 'platform', 'platform', '3 deployed'),
  edge: svc('netlify-edge-functions', 'Edge Functions', 'platform', 'platform'),
  forms: svc('netlify-forms', 'Netlify Forms', 'platform', 'platform', '1 form'),
  inngest: svc('inngest', 'Inngest', 'queue', 'dependency', 'via inngest in package.json'),
  supabase: svc('supabase', 'Supabase', 'database', 'environment', 'via SUPABASE_URL environment variable'),
  vercelBlob: svc('vercel-blob', 'Vercel Blob', 'storage', 'integration', 'assets'),
  vercelAnalytics: svc('vercel-analytics', 'Vercel Web Analytics', 'analytics', 'platform'),
  vercelCron: svc('vercel-cron', 'Vercel Cron Jobs', 'platform', 'platform', '2 job(s)'),
  neon: svc('neon', 'Neon', 'database', 'integration', 'Installed from the Vercel Marketplace'),
  stripe: svc('stripe', 'Stripe', 'payments', 'environment', 'via STRIPE_SECRET_KEY environment variable'),
  clerk: svc('clerk', 'Clerk', 'auth', 'dependency', 'via @clerk/nextjs in package.json'),
  sentry: svc('sentry', 'Sentry', 'monitoring', 'dependency', 'via @sentry/astro in package.json'),
  openai: svc('openai', 'OpenAI', 'ai', 'environment', 'via OPENAI_API_KEY environment variable'),
  aiSdk: svc('vercel-ai-sdk', 'Vercel AI SDK', 'ai', 'dependency', 'via ai in package.json'),
  sanity: svc('sanity', 'Sanity', 'cms', 'dependency', 'via @sanity/client in package.json'),
};

interface Seed {
  provider: 'netlify' | 'vercel';
  name: string;
  framework?: string;
  created: string;
  updated: string;
  deployed: string;
  repo?: { owner: string; name: string; description?: string; language?: string; private?: boolean };
  domain?: string;
  services?: Service[];
  self?: boolean;
}

const SEEDS: Seed[] = [
  { provider: 'netlify', name: 'deployedments', framework: 'Astro', created: '2026-11-09', updated: '2026-11-09', deployed: '2026-11-09', repo: { owner: 'sample-user', name: 'deployedments', description: 'A static gallery of every deployment I have live across cloud providers.', language: 'TypeScript' }, services: [SERVICES.functions], self: true },
  { provider: 'netlify', name: 'sample-portfolio', framework: 'Astro', created: '2023-02-14', updated: '2026-10-02', deployed: '2026-10-02', domain: 'sample.dev', repo: { owner: 'sample-user', name: 'portfolio', language: 'Astro' }, services: [SERVICES.forms, SERVICES.sentry] },
  { provider: 'netlify', name: 'recipe-box', framework: 'Next.js', created: '2024-05-20', updated: '2026-08-11', deployed: '2026-08-11', repo: { owner: 'sample-user', name: 'recipe-box', language: 'TypeScript', private: true }, services: [SERVICES.blobs, SERVICES.functions, SERVICES.supabase] },
  { provider: 'netlify', name: 'pixel-garden', framework: 'Vite', created: '2022-09-03', updated: '2025-01-19', deployed: '2025-01-19', repo: { owner: 'sample-user', name: 'pixel-garden', language: 'JavaScript' } },
  { provider: 'netlify', name: 'tiny-docs', framework: 'Docusaurus', created: '2024-11-30', updated: '2026-06-24', deployed: '2026-06-24', domain: 'docs.tiny.example', repo: { owner: 'tiny-org', name: 'docs', language: 'MDX' } },
  { provider: 'netlify', name: 'landing-lab', framework: 'Static HTML', created: '2021-04-08', updated: '2021-04-08', deployed: '2021-04-08', services: [SERVICES.forms] },
  { provider: 'netlify', name: 'queue-playground', framework: 'Remix', created: '2025-07-12', updated: '2026-09-15', deployed: '2026-09-15', repo: { owner: 'sample-user', name: 'queue-playground', language: 'TypeScript' }, services: [SERVICES.inngest, SERVICES.blobs, SERVICES.edge, SERVICES.functions] },
  { provider: 'vercel', name: 'shop-front', framework: 'Next.js', created: '2024-01-18', updated: '2026-10-28', deployed: '2026-10-28', domain: 'shop.sample.example', repo: { owner: 'sample-user', name: 'shop-front', language: 'TypeScript', private: true }, services: [SERVICES.stripe, SERVICES.clerk, SERVICES.neon, SERVICES.vercelAnalytics] },
  { provider: 'vercel', name: 'ai-notes', framework: 'Next.js', created: '2025-03-02', updated: '2026-11-01', deployed: '2026-11-01', repo: { owner: 'sample-user', name: 'ai-notes', language: 'TypeScript' }, services: [SERVICES.aiSdk, SERVICES.openai, SERVICES.vercelBlob, SERVICES.inngest] },
  { provider: 'vercel', name: 'cron-reporter', framework: 'Other', created: '2025-10-09', updated: '2026-03-30', deployed: '2026-03-30', repo: { owner: 'sample-user', name: 'cron-reporter', language: 'Python' }, services: [SERVICES.vercelCron] },
  { provider: 'vercel', name: 'blog-engine', framework: 'SvelteKit', created: '2023-08-25', updated: '2026-05-05', deployed: '2026-05-05', domain: 'blog.sample.example', repo: { owner: 'sample-user', name: 'blog-engine', language: 'Svelte' }, services: [SERVICES.sanity, SERVICES.vercelAnalytics] },
  { provider: 'vercel', name: 'weekend-hack', framework: 'Vite', created: '2026-09-27', updated: '2026-09-28', deployed: '2026-09-28', repo: { owner: 'sample-user', name: 'weekend-hack', language: 'TypeScript' } },
  { provider: 'vercel', name: 'old-experiment', framework: 'Create React App', created: '2020-12-01', updated: '2022-02-10', deployed: '2022-02-10' },
];

const iso = (date: string) => `${date}T12:00:00.000Z`;

export function fixtureDeployments(): Deployment[] {
  return SEEDS.map((seed, index): Deployment => {
    const providerId = `sample-${index + 1}`;
    const host = seed.domain ?? `${seed.name}.${seed.provider === 'netlify' ? 'netlify.app' : 'vercel.app'}`;
    const url = `https://${host}`;
    const repo = seed.repo
      ? {
          host: 'github' as const,
          url: `https://github.com/${seed.repo.owner}/${seed.repo.name}`,
          owner: seed.repo.owner,
          name: seed.repo.name,
          branch: 'main',
          description: seed.repo.description,
          language: seed.repo.language,
          private: seed.repo.private ?? false,
          topics: [],
        }
      : undefined;
    return {
      id: `${seed.provider}:${providerId}`,
      provider: seed.provider,
      providerId,
      name: seed.name,
      url,
      host: hostOf(url),
      customDomains: seed.domain ? [seed.domain] : [],
      createdAt: iso(seed.created),
      updatedAt: iso(seed.updated),
      lastDeployedAt: iso(seed.deployed),
      framework: seed.framework === 'Other' ? undefined : seed.framework,
      team: 'Sample Team',
      repo,
      dashboardUrl: seed.provider === 'netlify' ? `https://app.netlify.com/projects/${seed.name}` : `https://vercel.com/sample-team/${seed.name}`,
      services: [...(seed.services ?? [])].sort((a, b) => a.label.localeCompare(b.label)),
      metadata: [
        { label: seed.provider === 'netlify' ? 'Site ID' : 'Project ID', value: providerId, code: true },
        { label: 'Production branch', value: 'main' },
      ],
      isSelf: seed.self,
    };
  });
}
