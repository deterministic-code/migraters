import type { IDatasourceProvider, ProviderLogId } from '../../../src/abstractions/datasource-provider.ts';
import type { MigrationClient, MigrationRow } from '../../../src/migration-client.ts';
import { applyMysqlDdlViaTextProtocol } from '../../../src/infrastructure/mysql-text-protocol.ts';
import { readSqlTemplate } from '../../../src/infrastructure/sql-templates.ts';
import { sqlRun } from '../../sql/sql-run.ts';

export { applyMysqlDdlViaTextProtocol };

const [migratesDdl, migrateLogsDdl] = await Promise.all([
  readSqlTemplate('mysql', 'migrates'),
  readSqlTemplate('mysql', 'migrate_logs'),
]);

export class MysqlProvider implements IDatasourceProvider {
  readonly name = 'mysql' as const;
  readonly connectionEnvironmentVariables = ['MYSQL_URL', 'DATABASE_URL'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;

  quoteIdent(ident: string): string {
    return `\`${ident}\``;
  }

  nowExpr(): string {
    return 'CURRENT_TIMESTAMP';
  }

  limitClause(n: number): string {
    return `LIMIT ${n}`;
  }

  translatePlaceholders(sql: string): string {
    return sql;
  }

  async prerequisiteError(_connection: string): Promise<string | null> {
    return null;
  }

  async prepareSetup(_connection: string): Promise<void> {}

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

  setup(connection: string): Promise<void> {
    return sqlRun.setup(this, connection);
  }

  applied(connection: string): Promise<Map<string, string | null>> {
    return sqlRun.applied(this, connection);
  }

  migrateUp(connection: string, name: string, body: string, checksum: string): Promise<void> {
    return sqlRun.migrateUp(this, connection, name, body, checksum);
  }

  migrateDown(connection: string, name: string, body: string): Promise<void> {
    return sqlRun.migrateDown(this, connection, name, body);
  }

  log(
    connection: string,
    id: ProviderLogId | null,
    name: string,
    direction: string,
    status: string | null,
    durationMs: number,
    error: string | null,
  ): Promise<ProviderLogId> {
    return sqlRun.log(this, connection, id, name, direction, status, durationMs, error);
  }
}
