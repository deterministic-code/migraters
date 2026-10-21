import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CONFIG_NAME = '.migraters.yaml';

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

export const parseDialects = (raw: string): string[] => {
  const names: string[] = [];
  let inDialects = false;
  for (const line of raw.split('\n')) {
    const trimmed = line.replace(/\r$/, '');
    if (!inDialects) {
      if (trimmed.trim() === 'dialects:') inDialects = true;
      continue;
    }
    const item = trimmed.trim();
    if (item.startsWith('- ')) {
      const name = item.slice(2).trim();
      if (name.length > 0) names.push(name);
      continue;
    }
    if (item.length === 0) continue;
    break;
  }
  return names;
};

export const enabledDialects = (start = process.cwd()): string[] => {
  const path = findConfigPath(start);
  return path ? parseDialects(readFileSync(path, 'utf8')) : [];
};
