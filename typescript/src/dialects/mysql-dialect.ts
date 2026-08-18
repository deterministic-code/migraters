import type { Connection as MysqlConnection } from "mysql2/promise";
import type { MigrationClient, MigrationRow } from "../migration-client.ts";
import { SqlDialectBase } from "./sql-dialect-base.ts";

export async function applyMysqlDdlViaTextProtocol(
  conn: Pick<MysqlConnection, "query">,
  sql: string,
): Promise<void> {
  // why: DDL statements (DROP/CREATE PROCEDURE) reject prepared-statement protocol (MySQL 1295)
  await conn.query(sql);
}

export class MysqlDialect extends SqlDialectBase {
  readonly name = "mysql" as const;
  readonly connectionEnvironmentVariables = ["MYSQL_URL", "DATABASE_URL"] as const;

  quoteIdent(ident: string): string {
    return `\`${ident}\``;
  }

  async createClient(connection: string): Promise<MigrationClient> {
    const mysql = await import("mysql2/promise");
    const conn = await mysql.createConnection(connection);
    return {
      dialect: "mysql",
      async exec(sql) {
        await applyMysqlDdlViaTextProtocol(conn, sql);
      },
      async query(sql, params = []) {
        const [rows] = await conn.execute(sql, params);
        return rows as MigrationRow[];
      },
      async run(sql, params = []) {
        await conn.execute(sql, params);
      },
      async transaction(fn) {
        await conn.beginTransaction();
        try {
          const r = await fn();
          await conn.commit();
          return r;
        } catch (e) {
          try {
            await conn.rollback();
          } catch (rollbackErr) {
            console.warn(
              "mysql rollback failed after transaction error; original error rethrown",
              rollbackErr,
            );
          }
          throw e;
        }
      },
      async close() {
        await conn.end();
      },
    };
  }
}
