import { normalizeDialect, type SqlDialect } from '../sql.ts';
import type { ISqlDialect } from './sql-dialect.ts';

const VALID = 'sqlite, mysql, postgres, sqlserver, oracle';

export class SqlDialectFactory {
  private readonly byName: Map<SqlDialect, ISqlDialect>;

  constructor(dialects: readonly ISqlDialect[]) {
    this.byName = new Map(dialects.map((d) => [d.name, d]));
  }

  tryGet(raw: string): ISqlDialect | undefined {
    const key = normalizeDialect(raw);
    return key ? this.byName.get(key) : undefined;
  }

  get(raw: string): ISqlDialect {
    const dialect = this.tryGet(raw);
    if (!dialect) {
      throw new Error(`Unknown SQL dialect "${raw}". Valid: ${VALID}.`);
    }
    return dialect;
  }

  all(): readonly ISqlDialect[] {
    return [...this.byName.values()];
  }
}
