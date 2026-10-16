import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksum } from '../src/datasource-migrate.ts';
import { getMigrater } from '../src/migrater.ts';
import { SqliteDialect } from '../src/dialects/sqlite-dialect.ts';

describe('sqlite IMigrater', () => {
  it('setup, up, down', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migraters-api-'));
    const connection = join(dir, 'app.sqlite');
    const migrationsPath = join(dir, 'migrations');
    const migrater = getMigrater('sqlite');
    expect(migrater.name).toBe(new SqliteDialect().name);
    await migrater.setup({ connection, migrationsPath });
    const upSql = 'CREATE TABLE t (id INTEGER);\n';
    await writeFile(join(migrationsPath, '0001_init_up.sql'), upSql);
    await writeFile(join(migrationsPath, '0001_init_down.sql'), 'DROP TABLE t;\n');
    expect(await migrater.up({ connection, migrationsPath })).toEqual(['0001_init']);
    const client = await new SqliteDialect().createClient(connection);
    try {
      const applied = await client.query('SELECT name, checksum FROM migrates');
      expect(applied).toEqual([{ name: '0001_init', checksum: checksum(upSql) }]);
    } finally {
      await client.close();
    }
    expect(await migrater.down({ connection, migrationsPath })).toBe('0001_init');
    const after = await new SqliteDialect().createClient(connection);
    try {
      expect(await after.query('SELECT name FROM migrates')).toEqual([]);
    } finally {
      await after.close();
    }
  });
});
