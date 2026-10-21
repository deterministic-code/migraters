import { cliSpec } from './cli-spec.ts';

const stripKey = (raw: string): string => raw.replace(/[\s_-]/g, '').toLowerCase();

export const normalizeInitProvider = (raw: string): string | undefined => {
  const key = stripKey(raw);
  const direct = cliSpec.providers.find((p) => stripKey(p) === key);
  if (direct) return direct;
  return cliSpec.provider_aliases[key];
};

export const resolveInitDialects = (raw: string[], all: boolean): string[] => {
  if (all) return [...cliSpec.providers];
  if (raw.length === 0) {
    throw new Error('pass --dialect <provider> at least once, or --all');
  }
  const selected = new Set<string>();
  for (const value of raw) {
    const name = normalizeInitProvider(value);
    if (!name) {
      throw new Error(`unsupported provider: ${value}`);
    }
    selected.add(name);
  }
  return cliSpec.providers.filter((name) => selected.has(name));
};
