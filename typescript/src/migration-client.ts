export type MigrationRowValue = string | number | bigint | boolean | Date | null;
export type MigrationRow = Record<string, MigrationRowValue>;
export type MigrationSqlParam = string | number | bigint | boolean | Date | null;

/** The subset of a better-sqlite3 Database that `insertLogStarted` reaches through `_raw` when a caller injects a synchronous handle. */
export interface SqliteRawDatabase {
  prepare(source: string): {
    run(...params: MigrationSqlParam[]): { lastInsertRowid: number | bigint };
  };
}

/** Provider-agnostic migration client used by IMigrater.up, IMigrater.down, and IMigrater.setup. */
export interface MigrationClient {
  dialect: import('./sql.ts').SqlDialect;
  exec(sql: string): Promise<void>;
  query(sql: string, params?: MigrationSqlParam[]): Promise<MigrationRow[]>;
  run(sql: string, params?: MigrationSqlParam[]): Promise<void>;
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
  _raw?: SqliteRawDatabase;
}
