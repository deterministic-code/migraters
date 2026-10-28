import { pathToFileURL } from 'node:url';
import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import type { IDatasourceProvider } from '../abstractions/datasource-provider.ts';
import { ConnectionResolver } from './connection-resolver.ts';
import { enabledProviders } from './migraters-config.ts';
import { importableProviderFile, resolveProviderFile } from './resolve-provider.ts';

const loadModule = async (location: string, configDir: string): Promise<IDatasourceProvider> => {
  const file = importableProviderFile(resolveProviderFile(configDir, location, import.meta.url));
  const mod = (await import(pathToFileURL(file).href)) as {
    provider?: () => IDatasourceProvider;
    createProvider?: () => IDatasourceProvider;
  };
  const create = mod.provider ?? mod.createProvider;
  if (typeof create !== 'function') throw new Error(location);
  return create();
};

const loadInstalledProviders = async (): Promise<IDatasourceProvider[]> => {
  const { configDir, entries } = enabledProviders();
  const loaded: IDatasourceProvider[] = [];
  for (const entry of entries) {
    try {
      loaded.push(await loadModule(entry.location, configDir));
    } catch (err) {
      if (err instanceof Error && err.message === entry.name) throw err;
      throw new Error(entry.name, { cause: err });
    }
  }
  return loaded;
};

export const defaultDialectFactory = new SqlDialectFactory(await loadInstalledProviders());

export const connectionResolver = new ConnectionResolver();
