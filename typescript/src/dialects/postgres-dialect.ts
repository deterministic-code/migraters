import type { MigrationClient } from '../migration-client.ts';
import { readSqlTemplate } from '../infrastructure/sql-templates.ts';
import { SqlDialectBase } from '../abstractions/sql-dialect-base.ts';

const [migratesDdl, migrateLogsDdl] = await Promise.all([
  readSqlTemplate('postgres', 'migrates'),
  readSqlTemplate('postgres', 'migrate_logs'),
]);

export class PostgresDialect extends SqlDialectBase {
  readonly name = 'postgres' as const;
  readonly connectionEnvironmentVariables = ['PG_CONNECTION_STRING', 'DATABASE_URL'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;

  nowExpr(): string {
    return 'NOW()';
  }

  translatePlaceholders(sql: string): string {
    let n = 0;
    return sql.replace(/\?/g, () => `$${++n}`);
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
}
