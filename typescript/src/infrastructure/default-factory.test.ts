import { describe, expect, it } from 'vitest';
import { defaultDialectFactory } from './default-factory.ts';
import { parseDialects } from './migraters-config.ts';

describe('defaultDialectFactory', () => {
  it('registers every dialect name and alias', () => {
    const names = defaultDialectFactory.all().map((d) => d.name);
    for (const name of names) {
      expect(['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle']).toContain(name);
    }
    if (names.includes('sqlite')) {
      expect(defaultDialectFactory.get('sqlite3').name).toBe('sqlite');
    }
    if (names.includes('postgres')) {
      expect(defaultDialectFactory.get('postgresql').name).toBe('postgres');
    }
    if (names.includes('mysql')) {
      expect(defaultDialectFactory.get('mariadb').name).toBe('mysql');
    }
    if (names.includes('sqlserver')) {
      expect(defaultDialectFactory.get('mssql').name).toBe('sqlserver');
      expect(defaultDialectFactory.get('mssqlserver').name).toBe('sqlserver');
      expect(defaultDialectFactory.get('ms-sql-server').name).toBe('sqlserver');
    }
    if (names.includes('oracle')) {
      expect(defaultDialectFactory.get('ora').name).toBe('oracle');
    }
    expect(defaultDialectFactory.tryGet('nope')).toBeUndefined();
    expect(() => defaultDialectFactory.get('nope')).toThrow(/Unknown SQL dialect/);
  });

  it('reads the dialects list migrate-init writes', () => {
    expect(
      parseDialects(
        'language: typescript\ndialects:\n  - sqlite\n  - postgres\nbinDir: typescript/dist/src/bin\n',
      ),
    ).toEqual(['sqlite', 'postgres']);
    expect(parseDialects('language: rust\ndialects: []\nbinDir: rust/target/debug\n')).toEqual([]);
  });
});
