import type { SqlDialect } from '../sql.ts';
import type { MigrationDriver } from './migration-driver.ts';
import type { IDialect } from './sql-dialect.ts';
import type { MigrationClient } from '../migration-client.ts';
import { sqlMigrationDriver } from '../sql-driver.ts';

export abstract class SqlDialectBase implements IDialect {
  abstract readonly name: SqlDialect;
  abstract readonly connectionEnvironmentVariables: readonly string[];
  abstract readonly migratesDdl: string;
  abstract readonly migrateLogsDdl: string;
  readonly usesLastInsertRowid: boolean = false;

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

  async prerequisiteError(_connection: string): Promise<string | null> {
    return null;
  }

  async prepareSetup(_connection: string): Promise<void> {}

  async createDatabaseIfMissing(_connection: string): Promise<void> {}

  abstract createClient(connection: string): Promise<MigrationClient>;

  async createDriver(connection: string): Promise<MigrationDriver> {
    return sqlMigrationDriver(await this.createClient(connection), this);
  }
}
