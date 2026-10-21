import type { MigrationClient, MigrationRow } from '../../../src/migration-client.ts';
import { applyMysqlDdlViaTextProtocol } from '../../../src/infrastructure/mysql-text-protocol.ts';
import { readSqlTemplate } from '../../../src/infrastructure/sql-templates.ts';
import { SqlDialectBase } from '../../../src/abstractions/sql-dialect-base.ts';

export { applyMysqlDdlViaTextProtocol };

const [migratesDdl, migrateLogsDdl] = await Promise.all([
  readSqlTemplate('mysql', 'migrates'),
  readSqlTemplate('mysql', 'migrate_logs'),
]);

export class MysqlDialect extends SqlDialectBase {
  readonly name = 'mysql' as const;
  readonly connectionEnvironmentVariables = ['MYSQL_URL', 'DATABASE_URL'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;

  quoteIdent(ident: string): string {
    return `\`${ident}\``;
  }

  async createDatabaseIfMissing(connection: string): Promise<void> {
    const url = new URL(connection);
    const name = url.pathname.replace(/^\//, '');
    if (!name) return;
    url.pathname = '/';
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection(url.toString());
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${name.replaceAll('`', '``')}\``);
    } finally {
      await conn.end();
    }
  }

  async createClient(connection: string): Promise<MigrationClient> {
    const mysql = await import('mysql2/promise');
    const conn = await mysql.createConnection(connection);
    return {
      dialect: 'mysql',
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
              'mysql rollback failed after transaction error; original error rethrown',
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
