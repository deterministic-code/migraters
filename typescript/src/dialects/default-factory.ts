import { ConnectionResolver } from "./connection-resolver.ts";
import { MysqlDialect } from "./mysql-dialect.ts";
import { OracleDialect } from "./oracle-dialect.ts";
import { PostgresDialect } from "./postgres-dialect.ts";
import { SETUP_DDL } from "./setup-ddl.ts";
import { SqlDialectFactory } from "./sql-dialect-factory.ts";
import { SqliteDialect } from "./sqlite-dialect.ts";
import { SqlServerDialect } from "./sqlserver-dialect.ts";

export const defaultDialectFactory = new SqlDialectFactory([
  new SqliteDialect(SETUP_DDL.sqlite),
  new PostgresDialect(SETUP_DDL.postgres),
  new MysqlDialect(SETUP_DDL.mysql),
  new SqlServerDialect(SETUP_DDL.sqlserver),
  new OracleDialect(SETUP_DDL.oracle),
]);

export const connectionResolver = new ConnectionResolver();
