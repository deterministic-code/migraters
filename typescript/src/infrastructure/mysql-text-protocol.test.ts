import { describe, expect, it } from 'vitest';
import { applyMysqlDdlViaTextProtocol } from './mysql-text-protocol.ts';

describe('applyMysqlDdlViaTextProtocol', () => {
  it('forwards SQL to conn.query', async () => {
    const seen: string[] = [];
    await applyMysqlDdlViaTextProtocol(
      {
        query: async (sql) => {
          seen.push(sql);
        },
      },
      'CREATE TABLE t (id INT)',
    );
    expect(seen).toEqual(['CREATE TABLE t (id INT)']);
  });
});
