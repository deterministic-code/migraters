export type SqlDialect = 'sqlite' | 'mysql' | 'postgres' | 'sqlserver' | 'oracle';

const DIALECT_ALIASES: Record<string, SqlDialect> = {
  sqlite: 'sqlite',
  sqlite3: 'sqlite',
  mysql: 'mysql',
  mariadb: 'mysql',
  postgres: 'postgres',
  postgresql: 'postgres',
  pg: 'postgres',
  sqlserver: 'sqlserver',
  mssql: 'sqlserver',
  'ms-sql-server': 'sqlserver',
  oracle: 'oracle',
  ora: 'oracle',
};

export const normalizeDialect = (raw: string | null | undefined): SqlDialect | null => {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s_\-]/g, '');
  return DIALECT_ALIASES[key] ?? null;
};

export { pathExists } from './path-exists.ts';
