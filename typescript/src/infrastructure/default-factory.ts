import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import type { ISqlDialect } from '../abstractions/sql-dialect.ts';
import { ConnectionResolver } from './connection-resolver.ts';

const DIALECT_PACKAGES = [
  'sqlite',
  'postgres',
  'mysql',
  'sqlserver',
  'oracle',
] as const;

const dialectEntry = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  return join(here, '..', '..', 'dialects', name, 'src', `index${ext}`);
};

const loadInstalledDialects = async (): Promise<ISqlDialect[]> => {
  const loaded: ISqlDialect[] = [];
  for (const name of DIALECT_PACKAGES) {
    const file = dialectEntry(name);
    if (!existsSync(file)) continue;
    try {
      const mod = (await import(pathToFileURL(file).href)) as { createDialect?: () => ISqlDialect };
      if (typeof mod.createDialect === 'function') {
        loaded.push(mod.createDialect());
      }
    } catch {
      // Dialect is compiled and drivers are installed by migrate-init.
    }
  }
  return loaded;
};

export const defaultDialectFactory = new SqlDialectFactory(await loadInstalledDialects());

export const connectionResolver = new ConnectionResolver();
