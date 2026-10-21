import { describe, expect, it } from 'vitest';
import { SqlDialectBase } from './abstractions/sql-dialect-base.ts';
import { getMigrater } from './migrater.ts';
import { defaultDialectFactory } from './infrastructure/default-factory.ts';

describe('IMigrater setup bookkeeping', () => {
  it('loads the shared DDL templates for every dialect', () => {
    for (const dialect of defaultDialectFactory.all()) {
      expect(dialect).toBeInstanceOf(SqlDialectBase);
      const sql = dialect as SqlDialectBase;
      expect(sql.migratesDdl).toMatch(/migrates/i);
      expect(sql.migrateLogsDdl).toMatch(/migrate_logs/i);
    }
  });

  it('rejects an unknown dialect', () => {
    expect(() => getMigrater('dbase')).toThrow(/Unknown SQL dialect/);
  });
});
