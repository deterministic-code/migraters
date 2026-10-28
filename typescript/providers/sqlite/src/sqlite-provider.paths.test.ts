import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteProvider } from './sqlite-provider.ts';

const dialect = new SqliteProvider();

describe('SqliteProvider file paths', () => {
  it('prerequisiteError is null for existing files and reports missing files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-provider-'));
    const file = join(dir, 'exists.sqlite');
    await writeFile(file, '');
    expect(await dialect.prerequisiteError(file)).toBeNull();
    const missing = join(dir, 'missing.sqlite');
    const err = await dialect.prerequisiteError(missing);
    expect(err).toContain(missing);
    expect(err).toMatch(/migrate-setup --provider sqlite/);
  });

  it('createClient opens sqlite:///./app.sqlite as ./app.sqlite', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-rel-uri-'));
    const prev = process.cwd();
    process.chdir(dir);
    try {
      const client = await dialect.createClient('sqlite:///./app.sqlite');
      await client.exec('CREATE TABLE t (id INTEGER)');
      await client.close();
      const { pathExists } = await import('../../../src/path-exists.ts');
      expect(await pathExists(join(dir, 'app.sqlite'))).toBe(true);
    } finally {
      process.chdir(prev);
    }
  });

  it('prepareSetup creates parent directories for file connections', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-setup-'));
    const file = join(dir, 'nested', 'db', 'app.sqlite');
    await dialect.prepareSetup(file);
    const { pathExists } = await import('../../../src/path-exists.ts');
    expect(await pathExists(join(dir, 'nested', 'db'))).toBe(true);
  });
});
