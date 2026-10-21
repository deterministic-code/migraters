import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const isPackageRoot = (dir: string): boolean =>
  existsSync(join(dir, 'bundle.yaml')) &&
  existsSync(join(dir, 'rust', 'Cargo.toml')) &&
  existsSync(join(dir, 'csharp', 'MigrateRunner.csproj'));

export const findPackageRoot = (start: string): string => {
  let dir = start;
  while (true) {
    if (isPackageRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('could not find migraters package root');
    }
    dir = parent;
  }
};

export const packageRootFromModule = (moduleUrl: string): string =>
  findPackageRoot(dirname(fileURLToPath(moduleUrl)));
