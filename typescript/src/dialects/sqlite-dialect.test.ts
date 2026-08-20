import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SqliteDialect, sqliteFilesystemPath } from './sqlite-dialect.ts';

const dialect = new SqliteDialect();

describe('SqliteDialect', () => {
  it('registers as sqlite with SQLITE_PATH / DB_PATH and last_insert_rowid', () => {
    expect(dialect.name).toBe('sqlite');
    expect([...dialect.connectionEnvironmentVariables]).toEqual(['SQLITE_PATH', 'DB_PATH']);
    expect(dialect.usesLastInsertRowid).toBe(true);
    expect(dialect.migratesDdl).toMatch(/migrates/i);
    expect(dialect.migrateLogsDdl).toMatch(/migrate_logs/i);
    expect(dialect.quoteIdent('t')).toBe('"t"');
    expect(dialect.nowExpr()).toBe('CURRENT_TIMESTAMP');
    expect(dialect.limitClause(3)).toBe('LIMIT 3');
    expect(dialect.translatePlaceholders('? ?')).toBe('? ?');
  });

  it('parses filesystem paths from every supported connection form', () => {
    expect(sqliteFilesystemPath(':memory:')).toBeNull();
    expect(sqliteFilesystemPath('')).toBeNull();
    expect(sqliteFilesystemPath('  :memory:  ')).toBeNull();
    expect(sqliteFilesystemPath('./app.sqlite')).toBe('./app.sqlite');
    expect(sqliteFilesystemPath('sqlite:///abs/app.sqlite')).toBe('/abs/app.sqlite');
    expect(sqliteFilesystemPath('sqlite://rel.sqlite')).toBe('rel.sqlite');
    expect(sqliteFilesystemPath('sqlite:foo.db')).toBe('foo.db');
    expect(sqliteFilesystemPath('file:bar.db')).toBe('bar.db');
    expect(sqliteFilesystemPath('Data Source=./from-ado.sqlite')).toBe('./from-ado.sqlite');
    expect(sqliteFilesystemPath('data source = /tmp/x.sqlite')).toBe('/tmp/x.sqlite');
    expect(sqliteFilesystemPath('sqlite://')).toBeNull();
    expect(sqliteFilesystemPath('file:')).toBeNull();
    expect(sqliteFilesystemPath('other=value.sqlite')).toBe('other=value.sqlite');
  });

  it('prerequisiteError is null for memory, existing files, and missing-path-null', async () => {
    expect(await dialect.prerequisiteError(':memory:')).toBeNull();
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-dialect-'));
    const file = join(dir, 'exists.sqlite');
    await writeFile(file, '');
    expect(await dialect.prerequisiteError(file)).toBeNull();
    const missing = join(dir, 'missing.sqlite');
    const err = await dialect.prerequisiteError(missing);
    expect(err).toContain(missing);
    expect(err).toMatch(/migrate-setup --provider sqlite/);
  });

  it('prepareSetup creates parent directories for file connections and no-ops memory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sqlite-setup-'));
    const file = join(dir, 'nested', 'db', 'app.sqlite');
    await dialect.prepareSetup(file);
    const { pathExists } = await import('../path-exists.ts');
    expect(await pathExists(join(dir, 'nested', 'db'))).toBe(true);
    await dialect.prepareSetup(':memory:');
  });

  it('createClient rejects an empty path and runs exec/query/run/transaction on :memory:', async () => {
    await expect(dialect.createClient('')).rejects.toThrow(/sqlite requires a database file path/);
    const client = await dialect.createClient(':memory:');
    expect(client.dialect).toBe('sqlite');
    await client.exec('CREATE TABLE t (id INTEGER)');
    await client.run('INSERT INTO t (id) VALUES (?)', [1]);
    const viaQueryWrite = await client.query('INSERT INTO t (id) VALUES (?)', [2]);
    expect(viaQueryWrite).toEqual([]);
    expect(await client.query('SELECT id FROM t ORDER BY id')).toEqual([{ id: 1 }, { id: 2 }]);
    const tx = await client.transaction(async () => 7);
    expect(tx).toBe(7);
    await expect(
      client.transaction(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await client.close();
  });
});
