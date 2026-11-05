import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import type { IDatasourceProvider } from '../abstractions/datasource-provider.ts';
import { ConnectionResolver } from './connection-resolver.ts';
import { enabledProviders } from './migraters-config.ts';

const dialectPackage = (name: string): string => `@deterministic-code/migraters-${name}`;

const loadModule = async (name: string): Promise<IDatasourceProvider> => {
  const mod = (await import(dialectPackage(name))) as {
    provider?: () => IDatasourceProvider;
    createProvider?: () => IDatasourceProvider;
  };
  const create = mod.provider ?? mod.createProvider;
  if (typeof create !== 'function') throw new Error(name);
  return create();
};

const loadInstalledProviders = async (): Promise<IDatasourceProvider[]> => {
  const { entries } = enabledProviders();
  const loaded: IDatasourceProvider[] = [];
  for (const entry of entries) {
    try {
      loaded.push(await loadModule(entry.name));
    } catch (err) {
      if (err instanceof Error && err.message === entry.name) throw err;
      throw new Error(entry.name, { cause: err });
    }
  }
  return loaded;
};

export const defaultDialectFactory = new SqlDialectFactory(await loadInstalledProviders());

export const connectionResolver = new ConnectionResolver();
