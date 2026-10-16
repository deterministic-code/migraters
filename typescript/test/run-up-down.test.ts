import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMigrater } from '../src/migrater.ts';

const pair = async (migrationsPath: string, name: string, upSql: string, downSql: string) => {
  await writeFile(join(migrationsPath, `${name}_up.sql`), upSql);
  await writeFile(join(migrationsPath, `${name}_down.sql`), downSql);
};

describe('IMigrater.up / IMigrater.down against sqlite', () => {
  afterEach(() => {
    delete process.env.MIGRATE_ALLOW_CHECKSUM_DRIFT;
  });

  it('applies pending migrations and is a no-op when they are already applied', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migrate-up-'));
    const connection = join(dir, 'app.sqlite');
    const migrationsPath = join(dir, 'migrations');
    const migrater = getMigrater('sqlite');
    await migrater.setup({ connection, migrationsPath });
    await pair(migrationsPath, '0001_init', 'CREATE TABLE t (id INTEGER);\n', 'DROP TABLE t;\n');
    expect(await migrater.up({ connection, migrationsPath })).toEqual(['0001_init']);
    expect(await migrater.up({ connection, migrationsPath })).toEqual([]);
  });

  it('refuses checksum drift unless the env escape hatch is set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migrate-drift-'));
    const connection = join(dir, 'app.sqlite');
    const migrationsPath = join(dir, 'migrations');
    const migrater = getMigrater('sqlite');
    await migrater.setup({ connection, migrationsPath });
    await pair(migrationsPath, '0001_init', 'CREATE TABLE t (id INTEGER);\n', 'DROP TABLE t;\n');
    await migrater.up({ connection, migrationsPath });
    await writeFile(join(migrationsPath, '0001_init_up.sql'), 'CREATE TABLE t (id INTEGER, n INTEGER);\n');
    await expect(migrater.up({ connection, migrationsPath })).rejects.toThrow(/checksum drift/i);
    process.env.MIGRATE_ALLOW_CHECKSUM_DRIFT = '1';
    expect(await migrater.up({ connection, migrationsPath })).toEqual([]);
  });

  it('rolls back the last applied migration via the down sibling', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migrate-down-'));
    const connection = join(dir, 'app.sqlite');
    const migrationsPath = join(dir, 'migrations');
    const migrater = getMigrater('sqlite');
    await migrater.setup({ connection, migrationsPath });
    await pair(migrationsPath, '0001_init', 'CREATE TABLE t (id INTEGER);\n', 'DROP TABLE t;\n');
    await migrater.up({ connection, migrationsPath });
    expect(await migrater.down({ connection, migrationsPath })).toBe('0001_init');
    expect(await migrater.down({ connection, migrationsPath })).toBeNull();
  });

  it('rethrows when the migration SQL fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migrate-fail-'));
    const connection = join(dir, 'app.sqlite');
    const migrationsPath = join(dir, 'migrations');
    const migrater = getMigrater('sqlite');
    await migrater.setup({ connection, migrationsPath });
    await pair(migrationsPath, '0001_init', 'NOT VALID SQL;\n', 'SELECT 1;\n');
    await expect(migrater.up({ connection, migrationsPath })).rejects.toThrow();
  });
});
