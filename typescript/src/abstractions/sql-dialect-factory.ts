import { normalizeDialect, type SqlDialect } from '../sql.ts';
import type { IDatasourceProvider } from './datasource-provider.ts';

const VALID = 'sqlite, mysql, postgres, sqlserver, oracle';

export class SqlDialectFactory {
  private readonly byName: Map<SqlDialect, IDatasourceProvider>;

  constructor(providers: readonly IDatasourceProvider[]) {
    this.byName = new Map(providers.map((d) => [d.name, d]));
  }

  tryGet(raw: string): IDatasourceProvider | undefined {
    const key = normalizeDialect(raw);
    return key ? this.byName.get(key) : undefined;
  }

  get(raw: string): IDatasourceProvider {
    const dialect = this.tryGet(raw);
    if (!dialect) {
      throw new Error(`Unknown SQL dialect "${raw}". Valid: ${VALID}.`);
    }
    return dialect;
  }

  all(): readonly IDatasourceProvider[] {
    return [...this.byName.values()];
  }
}
