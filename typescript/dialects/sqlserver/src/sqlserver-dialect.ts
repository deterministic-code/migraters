import type { Request as MssqlRequest } from 'mssql';
import type { MigrationClient, MigrationSqlParam } from '../../../src/migration-client.ts';
import { interopDefault } from '../../../src/infrastructure/interop-default.ts';
import { readSqlTemplate } from '../../../src/infrastructure/sql-templates.ts';
import { SqlDialectBase } from '../../../src/abstractions/sql-dialect-base.ts';

const [migratesDdl, migrateLogsDdl] = await Promise.all([
  readSqlTemplate('sqlserver', 'migrates'),
  readSqlTemplate('sqlserver', 'migrate_logs'),
]);

const bindMssql = (
  req: Pick<MssqlRequest, 'input'>,
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
  readonly name = 'sqlserver' as const;
  readonly connectionEnvironmentVariables = ['MSSQL_URL', 'DATABASE_URL'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;

  quoteIdent(ident: string): string {
    return `[${ident}]`;
  }

  nowExpr(): string {
    return 'SYSUTCDATETIME()';
  }

  limitClause(n: number): string {
    return `OFFSET 0 ROWS FETCH NEXT ${n} ROWS ONLY`;
  }

  async createDatabaseIfMissing(connection: string): Promise<void> {
    const match = /(?:^|;)Database=([^;]+)/i.exec(connection);
    const name = match?.[1]?.trim();
    if (!name || /^master$/i.test(name)) return;
    const admin = connection.replace(/(^|;)Database=[^;]*/i, '$1Database=master');
    const { default: mssql } = await import('mssql');
    const pool = await mssql.connect(admin);
    try {
      await pool.request().batch(
        `IF DB_ID(N'${name.replaceAll("'", "''")}') IS NULL CREATE DATABASE [${name.replaceAll(']', ']]')}];`,
      );
    } finally {
      await pool.close();
    }
  }

  async createClient(connection: string): Promise<MigrationClient> {
    const mssql = interopDefault(await import('mssql'));
    const pool = await mssql.connect(connection);
    return {
      dialect: 'sqlserver',
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
              'sqlserver rollback failed after transaction error; original error rethrown',
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
