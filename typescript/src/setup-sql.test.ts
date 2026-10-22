import { describe, expect, it } from 'vitest';
import { getMigrater } from './migrater.ts';
import { defaultDialectFactory } from './infrastructure/default-factory.ts';

describe('IMigrater setup bookkeeping', () => {
  it('loads a provider that implements setup for every dialect', () => {
    for (const provider of defaultDialectFactory.all()) {
      expect(provider.name).toBeTruthy();
      expect(typeof provider.setup).toBe('function');
      expect(typeof provider.applied).toBe('function');
      expect(typeof provider.migrateUp).toBe('function');
    }
  });

  it('rejects an unknown dialect', () => {
    expect(() => getMigrater('dbase')).toThrow(/Unknown SQL dialect/);
  });
});
