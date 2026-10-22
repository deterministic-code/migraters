import type { SqlDialect } from '../sql.ts';

export type ProviderLogId = string | number | bigint;

export interface IDatasourceProvider {
  readonly name: SqlDialect;
  prepareSetup(connection: string): Promise<void>;
  createDatabaseIfMissing(connection: string): Promise<void>;
  setup(connection: string): Promise<void>;
  applied(connection: string): Promise<Map<string, string | null>>;
  migrateUp(connection: string, name: string, body: string, checksum: string): Promise<void>;
  migrateDown(connection: string, name: string, body: string): Promise<void>;
  log(
    connection: string,
    id: ProviderLogId | null,
    name: string,
    direction: string,
    status: string | null,
    durationMs: number,
    error: string | null,
  ): Promise<ProviderLogId>;
}

/** @deprecated Use IDatasourceProvider. */
export type IDialect = IDatasourceProvider;
export type ISqlDialect = IDatasourceProvider;
