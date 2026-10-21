import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import type { ISqlDialect } from '../abstractions/sql-dialect.ts';
import { ConnectionResolver } from './connection-resolver.ts';
import { enabledDialects } from './migraters-config.ts';

const dialectEntry = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  const ext = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  return join(here, '..', '..', 'dialects', name, 'src', `index${ext}`);
};

const loadInstalledDialects = async (): Promise<ISqlDialect[]> => {
  const loaded: ISqlDialect[] = [];
  for (const name of enabledDialects()) {
    const file = dialectEntry(name);
    try {
      const mod = (await import(pathToFileURL(file).href)) as { createDialect?: () => ISqlDialect };
      if (typeof mod.createDialect !== 'function') {
        throw new Error(name);
      }
      loaded.push(mod.createDialect());
    } catch (err) {
      if (err instanceof Error && err.message === name) throw err;
      throw new Error(name, { cause: err });
    }
  }
  return loaded;
};

export const defaultDialectFactory = new SqlDialectFactory(await loadInstalledDialects());

export const connectionResolver = new ConnectionResolver();
