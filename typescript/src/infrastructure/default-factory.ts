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

const loadInstalledDialects = async (): Promise<ISqlDialect[]> => {
  const loaded: ISqlDialect[] = [];
  for (const name of DIALECT_PACKAGES) {
    const spec = `@deterministic-code/migraters-${name}`;
    try {
      const mod = (await import(spec)) as { createDialect?: () => ISqlDialect };
      if (typeof mod.createDialect === 'function') {
        loaded.push(mod.createDialect());
      }
    } catch {
      // Dialect package is not installed until migrate-init.
    }
  }
  return loaded;
};

export const defaultDialectFactory = new SqlDialectFactory(await loadInstalledDialects());

export const connectionResolver = new ConnectionResolver();
