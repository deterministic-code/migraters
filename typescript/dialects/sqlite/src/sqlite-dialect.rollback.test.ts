import { describe, expect, it, vi } from 'vitest';

vi.mock('better-sqlite3', () => ({
  default: class {
    exec(sql: string) {
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
    }
    prepare() {
      return { all() { return []; }, run() {} };
    }
    close() {}
  },
}));

import { SqliteDialect } from './sqlite-dialect.ts';

describe('SqliteDialect rollback failure', () => {
  it('warns when ROLLBACK itself fails and still rethrows the original error', async () => {
    const client = await new SqliteDialect().createClient(':memory:');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      client.transaction(async () => {
        throw new Error('tx');
      }),
    ).rejects.toThrow('tx');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await client.close();
  });
});
