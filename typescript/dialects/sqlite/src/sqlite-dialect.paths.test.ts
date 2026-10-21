import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteDialect } from './sqlite-dialect.ts';

const dialect = new SqliteDialect();

describe('SqliteDialect file paths', () => {
  it('prerequisiteError is null for existing files and reports missing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-dialect-'));
    const file = join(dir, 'exists.sqlite');
    await writeFile(file, '');
    expect(await dialect.prerequisiteError(file)).toBeNull();
    const missing = join(dir, 'missing.sqlite');
    const err = await dialect.prerequisiteError(missing);
    expect(err).toContain(missing);
    expect(err).toMatch(/migrate-setup --provider sqlite/);
  });

  it('prepareSetup creates parent directories for file connections', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-setup-'));
    const file = join(dir, 'nested', 'db', 'app.sqlite');
    await dialect.prepareSetup(file);
    const { pathExists } = await import('../../../src/path-exists.ts');
    expect(await pathExists(join(dir, 'nested', 'db'))).toBe(true);
  });
});
