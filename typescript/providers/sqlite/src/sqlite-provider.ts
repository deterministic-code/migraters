import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { IDatasourceProvider, ProviderLogId } from '../../../src/abstractions/datasource-provider.ts';
import type { MigrationClient, MigrationRow, MigrationSqlParam } from '../../../src/migration-client.ts';
import { pathExists } from '../../../src/path-exists.ts';
import { readSqlTemplate } from '../../../src/infrastructure/sql-templates.ts';
import { fillTemplate, loadMessage } from '../../../src/infrastructure/message-templates.ts';
import { sqliteFilesystemPath } from '../../sql/connection-normalizer.ts';
import { sqlRun } from '../../sql/sql-run.ts';

export { sqliteFilesystemPath };

const [migratesDdl, migrateLogsDdl, sqlitePrerequisiteTpl] = await Promise.all([
  readSqlTemplate('sqlite', 'migrates'),
  readSqlTemplate('sqlite', 'migrate_logs'),
  loadMessage('errors/sqlite-prerequisite'),
]);

export class SqliteProvider implements IDatasourceProvider {
  readonly name = 'sqlite' as const;
  readonly connectionEnvironmentVariables = ['SQLITE_PATH', 'DB_PATH'] as const;
  readonly migratesDdl = migratesDdl;
  readonly migrateLogsDdl = migrateLogsDdl;
  readonly usesLastInsertRowid = true;

  quoteIdent(ident: string): string {
    return `"${ident}"`;
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

  async prerequisiteError(connection: string): Promise<string | null> {
    const path = sqliteFilesystemPath(connection);
    if (path === null) return null;
    if (await pathExists(path)) return null;
    return fillTemplate(sqlitePrerequisiteTpl, { path });
  }

  async prepareSetup(connection: string): Promise<void> {
    const filePath = sqliteFilesystemPath(connection);
    if (filePath !== null) {
      await mkdir(dirname(filePath), { recursive: true });
    }
  }

  async createDatabaseIfMissing(_connection: string): Promise<void> {}

  async createClient(connection: string): Promise<MigrationClient> {
    if (!connection) throw new Error('sqlite requires a database file path');
    const { default: Database } = await import('better-sqlite3');
    const filePath = sqliteFilesystemPath(connection);
    const db = new Database(filePath ?? connection);
    return {
      dialect: 'sqlite',
      async exec(sql) {
        db.exec(sql);
      },
      async query(sql, params = []) {
        const stmt = db.prepare<MigrationSqlParam[], MigrationRow>(sql);
        try {
          return stmt.all(...params);
        } catch {
          stmt.run(...params);
          return [];
        }
      },
      async run(sql, params = []) {
        db.prepare(sql).run(...params);
      },
      async transaction(fn) {
        db.exec('BEGIN');
        try {
          const r = await fn();
          db.exec('COMMIT');
          return r;
        } catch (e) {
          try {
            db.exec('ROLLBACK');
          } catch (rollbackErr) {
            console.warn(
              'sqlite ROLLBACK failed after transaction error; original error rethrown',
              rollbackErr,
            );
          }
          throw e;
        }
      },
      async close() {
        db.close();
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
