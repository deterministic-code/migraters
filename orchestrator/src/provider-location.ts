import type { Language } from './languages.ts';

export type ProviderEntry = {
  name: string;
  location: string;
};

const csharpType: Record<string, { dll: string; type: string }> = {
  sqlite: { dll: 'MigrateSqlite.dll', type: 'Deterministic.MigrateRunner.SqliteProvider' },
  postgres: { dll: 'MigratePostgres.dll', type: 'Deterministic.MigrateRunner.PostgresProvider' },
  mysql: { dll: 'MigrateMysql.dll', type: 'Deterministic.MigrateRunner.MysqlProvider' },
  sqlserver: { dll: 'MigrateSqlServer.dll', type: 'Deterministic.MigrateRunner.SqlServerProvider' },
  oracle: { dll: 'MigrateOracle.dll', type: 'Deterministic.MigrateRunner.OracleProvider' },
};

export const providerLocation = (language: Language, name: string): string => {
  if (language === 'csharp') {
    const entry = csharpType[name];
    if (!entry) throw new Error(name);
    return `${entry.dll}!${entry.type}`;
  }
  if (language === 'typescript') return `typescript/dialects/${name}/src/index.ts`;
  return `dialects/${name}`;
};

export const providerEntries = (language: Language, names: string[]): ProviderEntry[] =>
  names.map((name) => ({ name, location: providerLocation(language, name) }));
