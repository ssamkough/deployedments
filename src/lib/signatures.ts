import type { Service, ServiceKind, ServiceSource } from './types.ts';

interface Signature {
  id: string;
  label: string;
  kind: ServiceKind;
  /** npm package names; a trailing `/` matches a whole scope (e.g. `@clerk/`). */
  packages?: string[];
  /** Matched against environment variable *names* only. */
  env?: RegExp[];
}

const prefix = (name: string) => new RegExp(`^(?:NEXT_PUBLIC_|VITE_|PUBLIC_|NUXT_PUBLIC_)?${name}`);

/**
 * Known services, detected from the dependencies in a repo's package.json and from the names
 * of environment variables configured on the deployment. Values are never read.
 */
const SIGNATURES: Signature[] = [
  // Netlify
  { id: 'netlify-blobs', label: 'Netlify Blobs', kind: 'storage', packages: ['@netlify/blobs'] },
  { id: 'netlify-db', label: 'Netlify DB', kind: 'database', packages: ['@netlify/neon'], env: [/^NETLIFY_DATABASE_URL/] },
  { id: 'netlify-image-cdn', label: 'Netlify Image CDN', kind: 'platform', packages: ['@netlify/images'] },
  // Vercel
  { id: 'vercel-blob', label: 'Vercel Blob', kind: 'storage', packages: ['@vercel/blob'], env: [/^BLOB_READ_WRITE_TOKEN$/] },
  { id: 'vercel-kv', label: 'Vercel KV', kind: 'database', packages: ['@vercel/kv'], env: [/^KV_(?:REST_API|URL)/] },
  { id: 'vercel-postgres', label: 'Vercel Postgres', kind: 'database', packages: ['@vercel/postgres'] },
  { id: 'vercel-edge-config', label: 'Vercel Edge Config', kind: 'storage', packages: ['@vercel/edge-config'], env: [/^EDGE_CONFIG$/] },
  { id: 'vercel-analytics', label: 'Vercel Web Analytics', kind: 'analytics', packages: ['@vercel/analytics'] },
  { id: 'vercel-speed-insights', label: 'Vercel Speed Insights', kind: 'analytics', packages: ['@vercel/speed-insights'] },
  { id: 'vercel-ai-sdk', label: 'Vercel AI SDK', kind: 'ai', packages: ['ai', '@ai-sdk/'] },
  { id: 'vercel-ai-gateway', label: 'Vercel AI Gateway', kind: 'ai', env: [/^AI_GATEWAY_API_KEY$/] },
  { id: 'vercel-sandbox', label: 'Vercel Sandbox', kind: 'platform', packages: ['@vercel/sandbox'] },
  // Queues / background jobs
  { id: 'inngest', label: 'Inngest', kind: 'queue', packages: ['inngest', '@inngest/'], env: [/^INNGEST_/] },
  { id: 'trigger-dev', label: 'Trigger.dev', kind: 'queue', packages: ['@trigger.dev/'], env: [/^TRIGGER_(?:SECRET_KEY|API_URL)/] },
  { id: 'qstash', label: 'Upstash QStash', kind: 'queue', packages: ['@upstash/qstash'], env: [/^QSTASH_/] },
  // Data
  { id: 'supabase', label: 'Supabase', kind: 'database', packages: ['@supabase/'], env: [prefix('SUPABASE_')] },
  { id: 'neon', label: 'Neon', kind: 'database', packages: ['@neondatabase/'], env: [/^NEON_/] },
  { id: 'upstash-redis', label: 'Upstash Redis', kind: 'database', packages: ['@upstash/redis', '@upstash/ratelimit'], env: [/^UPSTASH_REDIS_/] },
  { id: 'planetscale', label: 'PlanetScale', kind: 'database', packages: ['@planetscale/'], env: [/^PLANETSCALE_/] },
  { id: 'turso', label: 'Turso', kind: 'database', packages: ['@libsql/client'], env: [/^TURSO_/] },
  { id: 'mongodb', label: 'MongoDB', kind: 'database', packages: ['mongodb', 'mongoose'], env: [/^MONGODB_/] },
  { id: 'convex', label: 'Convex', kind: 'database', packages: ['convex'], env: [prefix('CONVEX_')] },
  { id: 'firebase', label: 'Firebase', kind: 'database', packages: ['firebase', 'firebase-admin'], env: [prefix('FIREBASE_')] },
  { id: 'prisma', label: 'Prisma', kind: 'database', packages: ['prisma', '@prisma/client'] },
  { id: 'drizzle', label: 'Drizzle ORM', kind: 'database', packages: ['drizzle-orm'] },
  { id: 'cloudinary', label: 'Cloudinary', kind: 'storage', packages: ['cloudinary', 'next-cloudinary', '@cloudinary/'], env: [prefix('CLOUDINARY_')] },
  { id: 'uploadthing', label: 'UploadThing', kind: 'storage', packages: ['uploadthing', '@uploadthing/'], env: [/^UPLOADTHING_/] },
  { id: 'aws-s3', label: 'AWS S3', kind: 'storage', packages: ['@aws-sdk/client-s3'] },
  // Auth
  { id: 'clerk', label: 'Clerk', kind: 'auth', packages: ['@clerk/'], env: [prefix('CLERK_')] },
  { id: 'auth0', label: 'Auth0', kind: 'auth', packages: ['@auth0/', 'auth0'], env: [/^AUTH0_/] },
  { id: 'auth-js', label: 'Auth.js', kind: 'auth', packages: ['next-auth', '@auth/'], env: [/^(?:NEXTAUTH_|AUTH_SECRET$)/] },
  { id: 'better-auth', label: 'Better Auth', kind: 'auth', packages: ['better-auth'], env: [/^BETTER_AUTH_/] },
  // Payments / email
  { id: 'stripe', label: 'Stripe', kind: 'payments', packages: ['stripe', '@stripe/'], env: [prefix('STRIPE_')] },
  { id: 'resend', label: 'Resend', kind: 'email', packages: ['resend'], env: [/^RESEND_/] },
  { id: 'sendgrid', label: 'SendGrid', kind: 'email', packages: ['@sendgrid/mail'], env: [/^SENDGRID_/] },
  { id: 'postmark', label: 'Postmark', kind: 'email', packages: ['postmark'], env: [/^POSTMARK_/] },
  // Observability
  { id: 'sentry', label: 'Sentry', kind: 'monitoring', packages: ['@sentry/'], env: [prefix('SENTRY_')] },
  { id: 'posthog', label: 'PostHog', kind: 'analytics', packages: ['posthog-js', 'posthog-node'], env: [prefix('POSTHOG_')] },
  { id: 'plausible', label: 'Plausible', kind: 'analytics', packages: ['plausible-tracker', 'next-plausible'], env: [/PLAUSIBLE_/] },
  { id: 'logrocket', label: 'LogRocket', kind: 'monitoring', packages: ['logrocket'] },
  // AI
  { id: 'openai', label: 'OpenAI', kind: 'ai', packages: ['openai', '@ai-sdk/openai'], env: [/^OPENAI_/] },
  { id: 'anthropic', label: 'Anthropic', kind: 'ai', packages: ['@anthropic-ai/sdk', '@ai-sdk/anthropic'], env: [/^ANTHROPIC_/] },
  { id: 'google-ai', label: 'Google AI', kind: 'ai', packages: ['@google/generative-ai', '@google/genai', '@ai-sdk/google'], env: [/^(?:GEMINI_|GOOGLE_GENERATIVE_AI_)/] },
  // CMS / search
  { id: 'sanity', label: 'Sanity', kind: 'cms', packages: ['@sanity/', 'sanity', 'next-sanity'], env: [prefix('SANITY_')] },
  { id: 'contentful', label: 'Contentful', kind: 'cms', packages: ['contentful'], env: [/^CONTENTFUL_/] },
  { id: 'storyblok', label: 'Storyblok', kind: 'cms', packages: ['@storyblok/'], env: [/^STORYBLOK_/] },
  { id: 'algolia', label: 'Algolia', kind: 'other', packages: ['algoliasearch', 'react-instantsearch'], env: [prefix('ALGOLIA_')] },
];

const matchesPackage = (pattern: string, dependency: string) =>
  pattern.endsWith('/') ? dependency.startsWith(pattern) : dependency === pattern;

export interface DetectionInput {
  dependencies?: readonly string[];
  envKeys?: readonly string[];
}

/** Returns one Service per signature that matched, preferring dependency evidence over env names. */
export function detectServices({ dependencies = [], envKeys = [] }: DetectionInput): Service[] {
  const found: Service[] = [];
  for (const sig of SIGNATURES) {
    const dep = dependencies.find((d) => sig.packages?.some((p) => matchesPackage(p, d)));
    const env = envKeys.find((key) => sig.env?.some((re) => re.test(key)));
    if (!dep && !env) continue;
    const source: ServiceSource = dep ? 'dependency' : 'environment';
    found.push({
      id: sig.id,
      label: sig.label,
      kind: sig.kind,
      source,
      detail: dep ? `via ${dep} in package.json` : `via ${env} environment variable`,
    });
  }
  return found;
}

/** Merges service lists; the first occurrence of an id wins (so put authoritative sources first). */
export function mergeServices(...lists: Service[][]): Service[] {
  const byId = new Map<string, Service>();
  for (const list of lists) for (const service of list) if (!byId.has(service.id)) byId.set(service.id, service);
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}
