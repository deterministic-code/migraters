import type { IDatasourceProvider, ProviderLogId } from '../../../src/abstractions/datasource-provider.ts';
import type { MigrationClient, MigrationRow } from '../../../src/migration-client.ts';
import { interopDefault } from '../../../src/infrastructure/interop-default.ts';
import { readSqlTemplate } from '../../../src/infrastructure/sql-templates.ts';
import { parseOracleConnection } from '../../sql/connection-normalizer.ts';
import { sqlRun } from '../../sql/sql-run.ts';

export { parseOracleConnection };

const [migratesDdl, migrateLogsDdl] = await Promise.all([
  readSqlTemplate('oracle', 'migrates'),
  readSqlTemplate('oracle', 'migrate_logs'),
]);

const lowercaseKeys = (row: MigrationRow): MigrationRow => {
  const out: MigrationRow = {};
  for (const [k, v] of Object.entries(row)) out[k.toLowerCase()] = v;
  return out;
};

export class OracleProvider implements IDatasourceProvider {
  readonly name = 'oracle' as const;
  readonly connectionEnvironmentVariables = ['ORACLE_CONNECT_STRING', 'DATABASE_URL'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;

  translatePlaceholders(sql: string): string {
    let n = 0;
    return sql.replace(/\?/g, () => `:${++n}`);
  }

  quoteIdent(ident: string): string {
    return `"${ident}"`;
  }

  limitClause(n: number): string {
    return `FETCH FIRST ${n} ROWS ONLY`;
  }

  async prerequisiteError(_connection: string): Promise<string | null> {
    return null;
  }

  async prepareSetup(_connection: string): Promise<void> {}

  async createDatabaseIfMissing(_connection: string): Promise<void> {}

  async createClient(connection: string): Promise<MigrationClient> {
    const oracledb = interopDefault(await import('oracledb'));
    const conn = await oracledb.getConnection(parseOracleConnection(connection));
    const translate = (sql: string) => this.translatePlaceholders(sql);
    return {
      dialect: 'oracle',
      async exec(sql) {
        await conn.execute(sql, [], { autoCommit: true });
      },
      async query(sql, params = []) {
        const r = await conn.execute<MigrationRow>(translate(sql), params, {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        });
        return (r.rows ?? []).map(lowercaseKeys);
      },
      async run(sql, params = []) {
        await conn.execute(translate(sql), params, {
          autoCommit: false,
        });
      },
      async transaction(fn) {
        try {
          const r = await fn();
          await conn.commit();
          return r;
        } catch (e) {
          try {
            await conn.rollback();
          } catch (rollbackErr) {
            console.warn(
              'oracle rollback failed after transaction error; original error rethrown',
              rollbackErr,
            );
          }
          throw e;
        }
      },
      async close() {
        await conn.close();
      },
    };
  }

  setup(connection: string): Promise<void> {
    return sqlRun.setup(this, connection);
  }

  applied(connection: string): Promise<Map<string, string | null>> {
    return sqlRun.applied(this, connection);
  }

  migrateUp(
    connection: string,
    name: string,
    body: string,
    checksum: string,
    batchSeparator?: string,
  ): Promise<void> {
    return sqlRun.migrateUp(this, connection, name, body, checksum, batchSeparator);
  }

  migrateDown(connection: string, name: string, body: string, batchSeparator?: string): Promise<void> {
    return sqlRun.migrateDown(this, connection, name, body, batchSeparator);
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
