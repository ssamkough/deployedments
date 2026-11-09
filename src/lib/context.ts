import { GithubClient } from './github.ts';

export interface CollectContext {
  warn(message: string): void;
  warnOnce(key: string, message: string): void;
  github: GithubClient;
  warnings: string[];
}

export function createContext(env: NodeJS.ProcessEnv = process.env): CollectContext {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const warn = (message: string) => {
    warnings.push(message);
    console.warn(`  ! ${message}`);
  };
  return {
    warnings,
    warn,
    warnOnce(key, message) {
      if (seen.has(key)) return;
      seen.add(key);
      warn(message);
    },
    github: new GithubClient(env.GITHUB_TOKEN || undefined, warn),
  };
}
