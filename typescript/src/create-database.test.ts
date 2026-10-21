import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from './create-database.ts';
import { defaultDialectFactory } from './infrastructure/default-factory.ts';

describe('createDatabase', () => {
  it('no-ops when the provider is not registered', async () => {
    await createDatabase('dbase', 'x');
  });

  it('delegates to the dialect when it is installed', async () => {
    const dialect = defaultDialectFactory.tryGet('sqlite') ?? defaultDialectFactory.all()[0];
    if (!dialect) return;
    const spy = vi.spyOn(dialect, 'createDatabaseIfMissing').mockResolvedValue();
    await createDatabase(dialect.name, 'conn');
    expect(spy).toHaveBeenCalledWith('conn');
    spy.mockRestore();
  });
});
