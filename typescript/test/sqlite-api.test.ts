import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checksum, runDown, runUp } from '../src/datasource-migrate.ts';
import { SqliteDialect } from '../src/dialects/sqlite-dialect.ts';

describe('sqlite dialect operations', () => {
  it('setup, apply, applied, rollback', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'migraters-api-'));
    const db = join(dir, 'app.sqlite');
    const dialect = new SqliteDialect();
    await dialect.prepareSetup(db);
    const client = await dialect.createClient(db);
    try {
      await client.exec(dialect.migratesDdl);
      await client.exec(dialect.migrateLogsDdl);
      await client.exec(dialect.migratesDdl);
      const upPath = join(dir, '0001_init_up.sql');
      const downPath = join(dir, '0001_init_down.sql');
      const upSql = 'CREATE TABLE t (id INTEGER);\n';
      await writeFile(upPath, upSql);
      await writeFile(downPath, 'DROP TABLE t;\n');
      const migrations = [{ name: '0001_init', upPath, downPath }];
      await runUp({ client, migrations, env: {} });
      const applied = await client.query('SELECT name, checksum FROM migrates');
      expect(applied).toEqual([{ name: '0001_init', checksum: checksum(upSql) }]);
      await runDown({ client, migrations, env: {} });
      expect(await client.query('SELECT name FROM migrates')).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
