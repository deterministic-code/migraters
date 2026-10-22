import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CONFIG_NAME = '.migraters.yaml';

export type ProviderEntry = { name: string; location: string };

export const findConfigPath = (start: string): string | undefined => {
  let dir = resolve(start);
  while (true) {
    const candidate = join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
};

export const parseProviders = (raw: string): ProviderEntry[] => {
  const entries: ProviderEntry[] = [];
  let inProviders = false;
  let name: string | undefined;
  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (!inProviders) {
      if (trimmed.trim() === 'providers:') inProviders = true;
      continue;
    }
    const item = trimmed.trim();
    if (item.startsWith('- name:')) {
      name = item.slice('- name:'.length).trim();
      continue;
    }
    if (item.startsWith('location:') && name) {
      const location = item.slice('location:'.length).trim();
      if (name.length > 0 && location.length > 0) entries.push({ name, location });
      name = undefined;
      continue;
    }
    if (item.length === 0) continue;
    if (item.startsWith('- ')) continue;
    break;
  }
  return entries;
};

export const enabledProviders = (
  start = process.cwd(),
): { configDir: string; entries: ProviderEntry[] } => {
  const path = findConfigPath(start);
  if (!path) return { configDir: start, entries: [] };
  return { configDir: dirname(path), entries: parseProviders(readFileSync(path, 'utf8')) };
};
