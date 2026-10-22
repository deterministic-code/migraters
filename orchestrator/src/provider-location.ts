import { basename } from 'node:path';
import type { Language } from './languages.ts';

export type ProviderEntry = {
  name: string;
  location: string;
};

const csharpType: Record<string, { dll: string; type: string }> = {
  sqlite: { dll: 'MigrateSqlite.dll', type: 'Deterministic.MigrateRunner.SqliteDialect' },
  postgres: { dll: 'MigratePostgres.dll', type: 'Deterministic.MigrateRunner.PostgresDialect' },
  mysql: { dll: 'MigrateMysql.dll', type: 'Deterministic.MigrateRunner.MysqlDialect' },
  sqlserver: { dll: 'MigrateSqlServer.dll', type: 'Deterministic.MigrateRunner.SqlServerDialect' },
  oracle: { dll: 'MigrateOracle.dll', type: 'Deterministic.MigrateRunner.OracleDialect' },
};

export const providerLocation = (
  language: Language,
  name: string,
  configDir = '',
): string => {
  if (language === 'csharp') {
    const entry = csharpType[name];
    if (!entry) throw new Error(name);
    return `${entry.dll}!${entry.type}`;
  }
  if (language === 'typescript') {
    return basename(configDir) === 'typescript'
      ? `dialects/${name}/src/index.ts`
      : `typescript/dialects/${name}/src/index.ts`;
  }
  return `dialects/${name}`;
};

export const providerEntries = (
  language: Language,
  names: string[],
  configDir = '',
): ProviderEntry[] =>
  names.map((name) => ({ name, location: providerLocation(language, name, configDir) }));
