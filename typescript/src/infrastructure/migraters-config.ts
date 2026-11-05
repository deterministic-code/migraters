import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CONFIG_NAME = '.migraters.yaml';

export type ProviderEntry = { name: string };

export const findConfigPath = (start: string): string | undefined => {
  const candidate = join(resolve(start), CONFIG_NAME);
  if (existsSync(candidate)) return candidate;
  return undefined;
};

export const parseProviders = (raw: string): ProviderEntry[] => {
  const entries: ProviderEntry[] = [];
  let inProviders = false;
  let name: string | undefined;
  const take = () => {
    if (name && name.length > 0) entries.push({ name });
    name = undefined;
  };
  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (!inProviders) {
      if (trimmed.trim() === 'providers:') inProviders = true;
      continue;
    }
    const item = trimmed.trim();
    if (item.startsWith('- name:')) {
      take();
      name = item.slice('- name:'.length).trim();
      continue;
    }
    if (item.startsWith('location:')) continue;
    if (item.length === 0) continue;
    if (item.startsWith('- ')) continue;
    break;
  }
  take();
  return entries;
};

export const enabledProviders = (
  start = process.cwd(),
): { configDir: string; entries: ProviderEntry[] } => {
  const path = findConfigPath(start);
  if (!path) return { configDir: start, entries: [] };
  return { configDir: dirname(path), entries: parseProviders(readFileSync(path, 'utf8')) };
};
