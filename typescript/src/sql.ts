import { cliSpec } from './cli-spec.ts';

export type SqlDialect = 'sqlite' | 'mysql' | 'postgres' | 'sqlserver' | 'oracle';

const stripKey = (raw: string): string => raw.toLowerCase().replace(/[\s_\-]/g, '');

export const normalizeDialect = (raw: string | null | undefined): SqlDialect | null => {
  if (!raw) return null;
  const key = stripKey(raw);
  if ((cliSpec.providers as string[]).includes(key)) return key as SqlDialect;
  for (const [alias, canonical] of Object.entries(cliSpec.provider_aliases ?? {})) {
    if (stripKey(alias) === key) return canonical as SqlDialect;
  }
  return null;
};

export { pathExists } from './path-exists.ts';
