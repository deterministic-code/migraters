import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import type { IDatasourceProvider } from '../abstractions/datasource-provider.ts';
import { ConnectionResolver } from './connection-resolver.ts';
import { enabledProviders } from './migraters-config.ts';

const dialectPackage = (name: string): string => `@deterministic-code/migraters-${name}`;

type DialectModule = {
  provider?: () => IDatasourceProvider;
  createProvider?: () => IDatasourceProvider;
};

type DialectImporter = (spec: string) => Promise<DialectModule>;

export const loadDialectModule = async (
  name: string,
  importer: DialectImporter = (spec) => import(spec) as Promise<DialectModule>,
): Promise<IDatasourceProvider> => {
  const mod = await importer(dialectPackage(name));
  const create = mod.provider ?? mod.createProvider;
  if (typeof create !== 'function') throw new Error(name);
  return create();
};

export const loadInstalledProviders = async (
  importer?: DialectImporter,
): Promise<IDatasourceProvider[]> => {
  const { entries } = enabledProviders();
  const loaded: IDatasourceProvider[] = [];
  for (const entry of entries) {
    try {
      loaded.push(await loadDialectModule(entry.name, importer));
    } catch (err) {
      if (err instanceof Error && err.message === entry.name) throw err;
      throw new Error(entry.name, { cause: err });
    }
  }
  return loaded;
};

export const defaultDialectFactory = new SqlDialectFactory(await loadInstalledProviders());

export const connectionResolver = new ConnectionResolver();
