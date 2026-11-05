import { mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});

import * as fs from 'node:fs/promises';
import { SqliteProvider } from '../providers/sqlite/src/sqlite-provider.ts';
import { Migrater } from './migrater.ts';

describe('Migrater.create', () => {
  afterEach(() => {
    vi.mocked(fs.readdir).mockRestore();
  });

  it('rejects an invalid name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'create-invalid-'));
    await expect(
      new Migrater(new SqliteProvider()).create({ name: 'BadName', migrationsPath: dir }),
    ).rejects.toThrow(/BadName/);
  });

  it('writes the next pair', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'create-ok-'));
    const migrationsPath = join(dir, 'nested');
    const migrater = new Migrater(new SqliteProvider());
    const created = await migrater.create({ name: 'add_users', migrationsPath });
    expect(created).toEqual({ upName: '0001_add_users_up.sql', downName: '0001_add_users_down.sql' });
    expect(await readdir(migrationsPath)).toEqual(
      expect.arrayContaining(['0001_add_users_up.sql', '0001_add_users_down.sql']),
    );
    const second = await migrater.create({ name: 'add_orders', migrationsPath });
    expect(second.upName).toBe('0002_add_orders_up.sql');
  });

  it('rethrows a non-ENOENT readdir failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'create-eacces-'));
    await mkdir(dir, { recursive: true });
    vi.mocked(fs.readdir).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(
      new Migrater(new SqliteProvider()).create({ name: 'add_users', migrationsPath: dir }),
    ).rejects.toThrow(/denied/);
  });

  it('treats ENOENT from readdir as an empty folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'create-enoent-'));
    vi.mocked(fs.readdir).mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'ENOENT' }));
    const created = await new Migrater(new SqliteProvider()).create({
      name: 'add_users',
      migrationsPath: dir,
    });
    expect(created.upName).toBe('0001_add_users_up.sql');
  });
});
