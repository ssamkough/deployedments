import raw from './generated/deployments.json';
import type { DeploymentSnapshot } from '../lib/types.ts';

/** Written by `npm run collect` (scripts/collect.ts) before every dev/build. */
export const snapshot = raw as DeploymentSnapshot;
