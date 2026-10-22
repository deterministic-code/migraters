import type { IDatasourceProvider, ProviderLogId } from '../../../src/abstractions/datasource-provider.ts';
import type { MigrationClient } from '../../../src/migration-client.ts';
import { readSqlTemplate } from '../../../src/infrastructure/sql-templates.ts';
import { sqlRun } from '../../sql/sql-run.ts';

const [migratesDdl, migrateLogsDdl] = await Promise.all([
  readSqlTemplate('postgres', 'migrates'),
  readSqlTemplate('postgres', 'migrate_logs'),
]);

export class PostgresProvider implements IDatasourceProvider {
  readonly name = 'postgres' as const;
  readonly connectionEnvironmentVariables = ['PG_CONNECTION_STRING', 'DATABASE_URL'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;
  readonly usesLastInsertRowid = false;

  nowExpr(): string {
    return 'NOW()';
  }

  translatePlaceholders(sql: string): string {
    let n = 0;
    return sql.replace(/\?/g, () => `$${++n}`);
  }

  async prerequisiteError(_connection: string): Promise<string | null> {
    return null;
  }

  async prepareSetup(_connection: string): Promise<void> {}

  async createDatabaseIfMissing(connection: string): Promise<void> {
    const url = new URL(connection);
    const name = url.pathname.replace(/^\//, '');
    if (!name || name === 'postgres') return;
    url.pathname = '/postgres';
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
    } catch (e) {
      if (!/already exists/i.test(String(e))) throw e;
    } finally {
      await client.end();
    }
  }

  async createClient(connection: string): Promise<MigrationClient> {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: connection });
    await client.connect();
    const translate = (sql: string) => this.translatePlaceholders(sql);
    return {
      dialect: 'postgres',
      async exec(sql) {
        await client.query(sql);
      },
      async query(sql, params = []) {
        const r = await client.query(translate(sql), params);
        return r.rows;
      },
      async run(sql, params = []) {
        await client.query(translate(sql), params);
      },
      async transaction(fn) {
        await client.query('BEGIN');
        try {
          const r = await fn();
          await client.query('COMMIT');
          return r;
        } catch (e) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackErr) {
            console.warn(
              'postgres ROLLBACK failed after transaction error; original error rethrown',
              rollbackErr,
            );
          }
          throw e;
        }
      },
      async close() {
        await client.end();
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
