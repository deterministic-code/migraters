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

import { SqliteProvider } from './sqlite-provider.ts';

describe('SqliteProvider rollback failure', () => {
  it('warns when ROLLBACK itself fails and still rethrows the original error', async () => {
    const client = await new SqliteProvider().createClient(':memory:');
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
