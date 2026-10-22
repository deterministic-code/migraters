import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import type { IDatasourceProvider } from '../abstractions/datasource-provider.ts';
import { ConnectionResolver } from './connection-resolver.ts';
import { enabledProviders } from './migraters-config.ts';

const loadModule = async (
  location: string,
  configDir: string,
): Promise<IDatasourceProvider> => {
  const relative = isAbsolute(location) ? location : resolve(configDir, location);
  const stripped = location.startsWith('typescript/')
    ? resolve(configDir, location.slice('typescript/'.length))
    : relative;
  const file = existsSync(relative) ? relative : stripped;
  const specifier = existsSync(file) ? pathToFileURL(file).href : location;
  const mod = (await import(specifier)) as {
    provider?: () => IDatasourceProvider;
    createDialect?: () => IDatasourceProvider;
  };
  const create = mod.provider ?? mod.createDialect;
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
