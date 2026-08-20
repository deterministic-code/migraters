import type { MigrationClient } from '../migration-client.ts';
import type { SqlDialect } from '../sql.ts';

export interface ISqlDialect {
  readonly name: SqlDialect;
  readonly connectionEnvironmentVariables: readonly string[];
  readonly migratesDdl: string;
  readonly migrateLogsDdl: string;
  readonly usesLastInsertRowid: boolean;
  quoteIdent(ident: string): string;
  nowExpr(): string;
  limitClause(n: number): string;
  translatePlaceholders(sql: string): string;
  prerequisiteError(connection: string): Promise<string | null>;
  prepareSetup(connection: string): Promise<void>;
  createClient(connection: string): Promise<MigrationClient>;
}
