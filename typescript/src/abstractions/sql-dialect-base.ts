import type { SqlDialect } from '../sql.ts';
import type { ISqlDialect } from './sql-dialect.ts';

export abstract class SqlDialectBase implements ISqlDialect {
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

  abstract createClient(
    connection: string,
  ): Promise<import('../migration-client.ts').MigrationClient>;
}
