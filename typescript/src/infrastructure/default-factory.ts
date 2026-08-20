import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import { MysqlDialect } from '../dialects/mysql-dialect.ts';
import { OracleDialect } from '../dialects/oracle-dialect.ts';
import { PostgresDialect } from '../dialects/postgres-dialect.ts';
import { SqliteDialect } from '../dialects/sqlite-dialect.ts';
import { SqlServerDialect } from '../dialects/sqlserver-dialect.ts';
import { ConnectionResolver } from './connection-resolver.ts';

export const defaultDialectFactory = new SqlDialectFactory([
  new SqliteDialect(),
  new PostgresDialect(),
  new MysqlDialect(),
  new SqlServerDialect(),
  new OracleDialect(),
]);

export const connectionResolver = new ConnectionResolver();
