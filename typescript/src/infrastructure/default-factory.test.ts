import { describe, expect, it } from 'vitest';
import { defaultDialectFactory } from './default-factory.ts';
import { parseProviders } from './migraters-config.ts';

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

  it('reads the providers list migrate-init writes', () => {
    expect(
      parseProviders(
        `language: typescript
providers:
  - name: sqlite
    location: typescript/providers/sqlite/src/index.ts
  - name: postgres
    location: typescript/providers/postgres/src/index.ts
binDir: typescript/dist/src/bin
`,
      ).map((p) => p.name),
    ).toEqual(['sqlite', 'postgres']);
    expect(parseProviders('language: rust\nproviders: []\nbinDir: rust/target/debug\n')).toEqual([]);
  });
});
