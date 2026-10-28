import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPESCRIPT_PREFIX = 'typescript/';

/** Walk from a module URL to the installed @deterministic-code/migraters root. */
export const packageRootFrom = (moduleUrl: string): string => {
  let dir = dirname(fileURLToPath(moduleUrl));
  while (true) {
    if (existsSync(join(dir, 'typescript', 'providers'))) return dir;
    // Source tree, not dist/providers (tsc emits index.js beside this walk).
    if (existsSync(join(dir, 'providers', 'sqlite', 'src', 'index.ts'))) return dirname(dir);
    const parent = dirname(dir);
    if (parent === dir) throw new Error('could not find migraters package root');
    dir = parent;
  }
};

const candidateFiles = (configDir: string, location: string, packageRoot: string): string[] => {
  const files = [resolve(configDir, location)];
  if (location.startsWith(TYPESCRIPT_PREFIX)) {
    files.push(resolve(configDir, location.slice(TYPESCRIPT_PREFIX.length)));
  }
  files.push(resolve(packageRoot, location));
  return files;
};

export const resolveProviderFile = (
  configDir: string,
  location: string,
  moduleUrl = import.meta.url,
): string => {
  const packageRoot = packageRootFrom(moduleUrl);
  for (const file of candidateFiles(configDir, location, packageRoot)) {
    if (existsSync(file)) return file;
  }
  throw new Error(`provider module not found: ${location}`);
};

const nodeModulesSegment = `${sep}node_modules${sep}`;
const sourceMarker = `${sep}typescript${sep}providers${sep}`;

/** Node refuses to strip TypeScript under a published package, so import dist/*.js there. */
export const importableProviderFile = (file: string): string => {
  if (!file.includes(nodeModulesSegment)) return file;
  const at = file.lastIndexOf(sourceMarker);
  if (at < 0 || !/\.ts$/.test(file)) return file;
  const rel = file.slice(at + `${sep}typescript${sep}`.length).replace(/\.ts$/, '.js');
  const compiled = join(file.slice(0, at), 'typescript', 'dist', rel);
  return existsSync(compiled) ? compiled : file;
};
