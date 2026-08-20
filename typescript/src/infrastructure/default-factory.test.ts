import { describe, expect, it } from 'vitest';
import { defaultDialectFactory } from './default-factory.ts';

describe('defaultDialectFactory', () => {
  it('registers every dialect name and alias', () => {
    const names = defaultDialectFactory.all().map((d) => d.name);
    expect(names).toEqual(['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle']);
    expect(defaultDialectFactory.get('sqlite3').name).toBe('sqlite');
    expect(defaultDialectFactory.get('postgresql').name).toBe('postgres');
    expect(defaultDialectFactory.get('mariadb').name).toBe('mysql');
    expect(defaultDialectFactory.get('mssql').name).toBe('sqlserver');
    expect(defaultDialectFactory.get('ora').name).toBe('oracle');
    expect(defaultDialectFactory.tryGet('nope')).toBeUndefined();
    expect(() => defaultDialectFactory.get('nope')).toThrow(/Unknown SQL dialect/);
  });
});
