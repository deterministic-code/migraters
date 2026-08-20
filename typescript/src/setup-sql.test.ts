import { describe, expect, it } from 'vitest';
import { setupSql } from './setup-sql.ts';

describe('setupSql', () => {
  it('loads the shared DDL templates for every dialect', () => {
    for (const dialect of ['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle']) {
      const stmts = setupSql(dialect);
      expect(stmts).toHaveLength(2);
      expect(stmts[0]).toMatch(/migrates/i);
      expect(stmts[1]).toMatch(/migrate_logs/i);
    }
  });

  it('rejects an unknown dialect', () => {
    expect(() => setupSql('dbase')).toThrow(/Unknown SQL dialect/);
  });
});
