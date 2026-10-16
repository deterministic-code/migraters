import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverMigrations } from '../src/datasource-migrate.ts';

describe('discoverMigrations', () => {
  it('pairs <name>_up.sql with <name>_down.sql and sorts by name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'discover-'));
    await writeFile(join(dir, '0002_later_up.sql'), '-- up 2\n');
    await writeFile(join(dir, '0002_later_down.sql'), '-- down 2\n');
    await writeFile(join(dir, '0001_init_up.sql'), '-- up 1\n');
    await writeFile(join(dir, '0001_init_down.sql'), '-- down 1\n');
    const found = await discoverMigrations({ migratePath: dir, dialect: 'sqlite' });
    expect(found.map((m) => m.name)).toEqual(['0001_init', '0002_later']);
    expect(found[0]?.downPath?.endsWith('0001_init_down.sql')).toBe(true);
  });

  it('fails with the shared missing-directory error', async () => {
    const migratePath = join(tmpdir(), 'does-not-exist-migrate');
    await expect(discoverMigrations({ migratePath, dialect: 'postgres' })).rejects.toThrow(
      `migrate-path is not a directory: ${migratePath}`,
    );
  });

  it('ignores nested files and legacy dialect filenames', async () => {
    const root = await mkdtemp(join(tmpdir(), 'discover-nested-'));
    const nested = join(root, '0003_nested');
    await mkdir(nested);
    await writeFile(join(nested, 'migration.sqlite.sql'), '-- nested up\n');
    await writeFile(join(root, 'rollback_0001_init.sql'), '-- leftover\n');
    const found = await discoverMigrations({
      migratePath: root,
      dialect: 'sqlite',
    });
    expect(found).toEqual([]);
  });
});
