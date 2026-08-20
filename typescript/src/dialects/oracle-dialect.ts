import type { MigrationClient, MigrationRow } from '../migration-client.ts';
import { interopDefault } from '../infrastructure/interop-default.ts';
import { readSqlTemplate } from '../infrastructure/sql-templates.ts';
import { SqlDialectBase } from '../abstractions/sql-dialect-base.ts';

const [migratesDdl, migrateLogsDdl] = await Promise.all([
  readSqlTemplate('oracle', 'migrates'),
  readSqlTemplate('oracle', 'migrate_logs'),
]);

interface OracleConnectionConfig {
  user: string;
  password: string;
  connectString: string;
}

export const parseOracleConnection = (
  connection: string | OracleConnectionConfig,
): OracleConnectionConfig => {
  if (typeof connection === 'object' && connection) return connection;
  const m = /^([^/]+)\/([^@]+)@(.+)$/.exec(String(connection));
  if (!m) {
    throw new Error(`Oracle connection must look like user/password@connectString`);
  }
  return { user: m[1] as string, password: m[2] as string, connectString: m[3] as string };
};

const lowercaseKeys = (row: MigrationRow): MigrationRow => {
  const out: MigrationRow = {};
  for (const [k, v] of Object.entries(row)) out[k.toLowerCase()] = v;
  return out;
};

export class OracleDialect extends SqlDialectBase {
  readonly name = 'oracle' as const;
  readonly connectionEnvironmentVariables = ['ORACLE_CONNECT_STRING', 'DATABASE_URL'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;

  translatePlaceholders(sql: string): string {
    let n = 0;
    return sql.replace(/\?/g, () => `:${++n}`);
  }

  limitClause(n: number): string {
    return `FETCH FIRST ${n} ROWS ONLY`;
  }

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
}
