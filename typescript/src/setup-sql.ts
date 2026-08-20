import { defaultDialectFactory } from './infrastructure/default-factory.ts';

export function setupSql(dialect: string): string[] {
  const d = defaultDialectFactory.get(dialect);
  return [d.migratesDdl, d.migrateLogsDdl];
}
