import type { MigrationDriver } from './migration-driver.ts';
import type { SqlDialect } from '../sql.ts';

export interface IDialect {
  readonly name: SqlDialect;
  readonly connectionEnvironmentVariables: readonly string[];
  prerequisiteError(connection: string): Promise<string | null>;
  prepareSetup(connection: string): Promise<void>;
  createDatabaseIfMissing(connection: string): Promise<void>;
  createDriver(connection: string): Promise<MigrationDriver>;
}

/** @deprecated Use IDialect. */
export type ISqlDialect = IDialect;
