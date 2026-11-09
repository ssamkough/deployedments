export type ProviderId = 'netlify' | 'vercel';

export type ServiceKind =
  | 'platform'
  | 'storage'
  | 'database'
  | 'auth'
  | 'payments'
  | 'analytics'
  | 'monitoring'
  | 'ai'
  | 'cms'
  | 'email'
  | 'queue'
  | 'other';

/** How we learned that a deployment uses a service. */
export type ServiceSource = 'platform' | 'integration' | 'environment' | 'dependency' | 'plugin';

export interface Service {
  /** Stable slug, e.g. `netlify-blobs`. Used for filtering. */
  id: string;
  label: string;
  kind: ServiceKind;
  source: ServiceSource;
  detail?: string;
}

export interface RepoLink {
  host: 'github' | 'gitlab' | 'bitbucket' | 'other';
  url: string;
  owner?: string;
  name?: string;
  branch?: string;
  description?: string;
  language?: string;
  private?: boolean;
  topics?: string[];
}

export interface MetadataEntry {
  label: string;
  value: string;
  /** Render as monospace (ids, commit shas). */
  code?: boolean;
}

export interface Deployment {
  /** Globally unique: `${provider}:${providerId}`. */
  id: string;
  provider: ProviderId;
  providerId: string;
  name: string;
  /** Canonical live URL (https). */
  url: string;
  /** Hostname of `url`, for display. */
  host: string;
  customDomains: string[];
  createdAt: string;
  updatedAt: string;
  lastDeployedAt?: string;
  framework?: string;
  team?: string;
  repo?: RepoLink;
  dashboardUrl?: string;
  /** Path under the site root, e.g. `/screenshots/netlify-abc.webp`. */
  screenshot?: string;
  services: Service[];
  metadata: MetadataEntry[];
  /** True for this very site. */
  isSelf?: boolean;
  /** Build-time only: provider-hosted preview used if screenshotting fails. Stripped from output. */
  fallbackScreenshotUrl?: string;
}

export interface DeploymentSnapshot {
  collectedAt: string;
  /** True when built from fixtures because no provider credentials were configured. */
  sample: boolean;
  warnings: string[];
  deployments: Deployment[];
}
