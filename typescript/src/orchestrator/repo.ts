import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const isRepoRoot = (dir: string): boolean =>
  existsSync(join(dir, 'bundle.yaml')) &&
  existsSync(join(dir, 'rust', 'Cargo.toml')) &&
  existsSync(join(dir, 'csharp', 'MigrateRunner.csproj'));

export const findRepoRoot = (start: string): string => {
  let dir = start;
  while (true) {
    if (isRepoRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('could not find migraters repo root');
    }
    dir = parent;
  }
};

export const repoRootFromModule = (moduleUrl: string): string =>
  findRepoRoot(dirname(fileURLToPath(moduleUrl)));
