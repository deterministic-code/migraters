import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { IDatasourceProvider } from './abstractions/datasource-provider.ts';
import {
  applyOneDown,
  applyOneUp,
  checksum,
  discoverMigrations,
} from './datasource-migrate.ts';

const fake = (overrides: Partial<IDatasourceProvider> = {}): IDatasourceProvider => ({
  name: 'sqlite',
  prepareSetup: async () => undefined,
  createDatabaseIfMissing: async () => undefined,
  setup: async () => undefined,
  applied: async () => new Map(),
  migrateUp: async () => undefined,
  migrateDown: async () => undefined,
  log: async (_c, id) => id ?? 1,
  ...overrides,
});

describe('datasource-migrate error and checksum paths', () => {
  it('strips a legacy hash header before checksumming', () => {
    const header =
      '-- deterministic-content-hash: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n';
    expect(checksum(`${header}CREATE TABLE t (id INT);\n`)).toBe(
      checksum('CREATE TABLE t (id INT);\n'),
    );
  });

  it('rejects a migrate path that is a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'not-dir-'));
    const file = join(dir, 'file.sql');
    await writeFile(file, 'x');
    await expect(discoverMigrations({ migratePath: file, dialect: 'sqlite' })).rejects.toThrow(
      `migrate-path is not a directory: ${file}`,
    );
  });

  it('applies, skips when done, and logs a failed up', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'up-err-'));
    await writeFile(join(dir, '0001_init_up.sql'), 'CREATE TABLE t (id INT);\n');
    const migrations = await discoverMigrations({ migratePath: dir, dialect: 'sqlite' });
    const logs: string[] = [];
    expect(
      await applyOneUp({
        provider: fake(),
        connection: 'c',
        migrations,
      }),
    ).toEqual({ applied: true, name: '0001_init' });
    expect(
      await applyOneUp({
        provider: fake({
          applied: async () => new Map([['0001_init', checksum('CREATE TABLE t (id INT);\n')]]),
        }),
        connection: 'c',
        migrations,
      }),
    ).toEqual({ applied: false, name: null });

    await expect(
      applyOneUp({
        provider: fake({
          migrateUp: async () => {
            throw new Error('bad sql');
          },
          log: async (_c, id, _n, _d, status) => {
            logs.push(status ?? 'start');
            return id ?? 1;
          },
        }),
        connection: 'c',
        migrations,
      }),
    ).rejects.toThrow('bad sql');
    expect(logs).toEqual(['start', 'error']);

    await expect(
      applyOneUp({
        provider: fake({
          migrateUp: async () => {
            throw 'plain';
          },
        }),
        connection: 'c',
        migrations,
      }),
    ).rejects.toBe('plain');
  });

  it('covers down: empty, missing in path, missing sibling, failure, and success', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'down-err-'));
    await writeFile(join(dir, '0001_init_up.sql'), 'CREATE TABLE t (id INT);\n');
    const withoutDown = await discoverMigrations({ migratePath: dir, dialect: 'sqlite' });
    await writeFile(join(dir, '0001_init_down.sql'), 'DROP TABLE t;\n');
    const withDown = await discoverMigrations({ migratePath: dir, dialect: 'sqlite' });

    expect(
      await applyOneDown({
        provider: fake(),
        connection: 'c',
        migrations: withDown,
      }),
    ).toEqual({ rolledBack: false, name: null });

    await expect(
      applyOneDown({
        provider: fake({ applied: async () => new Map([['0009_ghost', 'abc']]) }),
        connection: 'c',
        migrations: withDown,
      }),
    ).rejects.toThrow(/not present/);

    await expect(
      applyOneDown({
        provider: fake({
          applied: async () => new Map([['0001_init', checksum('CREATE TABLE t (id INT);\n')]]),
        }),
        connection: 'c',
        migrations: withoutDown,
      }),
    ).rejects.toThrow(/0001_init/);

    await expect(
      applyOneDown({
        provider: fake({
          applied: async () => new Map([['0001_init', checksum('CREATE TABLE t (id INT);\n')]]),
          migrateDown: async () => {
            throw new Error('down failed');
          },
        }),
        connection: 'c',
        migrations: withDown,
      }),
    ).rejects.toThrow('down failed');

    await expect(
      applyOneDown({
        provider: fake({
          applied: async () => new Map([['0001_init', checksum('CREATE TABLE t (id INT);\n')]]),
          migrateDown: async () => {
            throw 'plain';
          },
        }),
        connection: 'c',
        migrations: withDown,
      }),
    ).rejects.toBe('plain');

    expect(
      await applyOneDown({
        provider: fake({
          applied: async () => new Map([['0001_init', checksum('CREATE TABLE t (id INT);\n')]]),
        }),
        connection: 'c',
        migrations: withDown,
      }),
    ).toEqual({ rolledBack: true, name: '0001_init' });
  });

  it('skips checksum compare when the stored value is null', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'null-sum-'));
    await writeFile(join(dir, '0001_init_up.sql'), 'CREATE TABLE t (id INT);\n');
    const migrations = await discoverMigrations({ migratePath: dir, dialect: 'sqlite' });
    expect(
      await applyOneUp({
        provider: fake({ applied: async () => new Map([['0001_init', null]]) }),
        connection: 'c',
        migrations,
      }),
    ).toEqual({ applied: false, name: null });
  });
});
