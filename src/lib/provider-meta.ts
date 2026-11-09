import type { ProviderId, ServiceKind, ServiceSource } from './types.ts';

export const PROVIDERS: Record<ProviderId, { label: string }> = {
  netlify: { label: 'Netlify' },
  vercel: { label: 'Vercel' },
};

export const KIND_LABELS: Record<ServiceKind, string> = {
  platform: 'Platform feature',
  storage: 'Storage',
  database: 'Database',
  auth: 'Authentication',
  payments: 'Payments',
  analytics: 'Analytics',
  monitoring: 'Monitoring',
  ai: 'AI',
  cms: 'Content',
  email: 'Email',
  queue: 'Jobs & queues',
  other: 'Integration',
};

export const SOURCE_LABELS: Record<ServiceSource, string> = {
  platform: 'Reported by the platform',
  integration: 'Installed integration',
  environment: 'Detected from environment variables',
  dependency: 'Detected from package.json',
  plugin: 'Build plugin',
};

/** Deterministic hue so placeholder tiles look distinct but stable across builds. */
export function hueFor(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}
