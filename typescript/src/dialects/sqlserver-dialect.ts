import type { Request as MssqlRequest } from "mssql";
import type {
  MigrationClient,
  MigrationSqlParam,
} from "../migration-client.ts";
import { SqlDialectBase } from "./sql-dialect-base.ts";

const bindMssql = (
  req: Pick<MssqlRequest, "input">,
  sql: string,
  params: MigrationSqlParam[],
): string => {
  let n = 0;
  return sql.replace(/\?/g, () => {
    const name = `p${n}`;
    req.input(name, params[n]);
    n++;
    return `@${name}`;
  });
};

export class SqlServerDialect extends SqlDialectBase {
  readonly name = "sqlserver" as const;
  readonly connectionEnvironmentVariables = ["MSSQL_URL", "DATABASE_URL"] as const;

  quoteIdent(ident: string): string {
    return `[${ident}]`;
  }

  nowExpr(): string {
    return "SYSUTCDATETIME()";
  }

  limitClause(n: number): string {
    return `OFFSET 0 ROWS FETCH NEXT ${n} ROWS ONLY`;
  }

  async createClient(connection: string): Promise<MigrationClient> {
    const mssql = (await import("mssql")).default ?? (await import("mssql"));
    const pool = await mssql.connect(connection);
    return {
      dialect: "sqlserver",
      async exec(sql) {
        await pool.request().batch(sql);
      },
      async query(sql, params = []) {
        const req = pool.request();
        const translated = bindMssql(req, sql, params);
        const r = await req.query(translated);
        return r.recordset ?? [];
      },
      async run(sql, params = []) {
        const req = pool.request();
        const translated = bindMssql(req, sql, params);
        await req.query(translated);
      },
      async transaction(fn) {
        const tx = pool.transaction();
        await tx.begin();
        try {
          const r = await fn();
          await tx.commit();
          return r;
        } catch (e) {
          try {
            await tx.rollback();
          } catch (rollbackErr) {
            console.warn(
              "sqlserver rollback failed after transaction error; original error rethrown",
              rollbackErr,
            );
          }
          throw e;
        }
      },
      async close() {
        await pool.close();
      },
    };
  }
}
