import { afterEach, describe, expect, it, vi } from 'vitest';

const pg = vi.hoisted(() => {
  const state = {
    failRollback: false,
    ended: false,
    queries: [] as { sql: string; params?: unknown[] }[],
  };
  class Client {
    constructor(public readonly opts: { connectionString: string }) {}
    async connect() {}
    async query(sql: string, params?: unknown[]) {
      state.queries.push({ sql, params });
      if (sql === 'ROLLBACK' && state.failRollback) throw new Error('rollback failed');
      return { rows: [{ n: 1 }] };
    }
    async end() {
      state.ended = true;
    }
  }
  return { Client, state };
});

vi.mock('pg', () => ({ default: { Client: pg.Client } }));

import { PostgresDialect } from './postgres-dialect.ts';

const dialect = new PostgresDialect();

describe('PostgresDialect', () => {
  afterEach(() => {
    pg.state.failRollback = false;
    pg.state.ended = false;
    pg.state.queries = [];
  });

  it('registers as postgres with NOW() and $n placeholders', async () => {
    expect(dialect.name).toBe('postgres');
    expect([...dialect.connectionEnvironmentVariables]).toEqual([
      'PG_CONNECTION_STRING',
      'DATABASE_URL',
    ]);
    expect(dialect.usesLastInsertRowid).toBe(false);
    expect(dialect.nowExpr()).toBe('NOW()');
    expect(dialect.translatePlaceholders('WHERE a = ? AND b = ?')).toBe('WHERE a = $1 AND b = $2');
    expect(dialect.migratesDdl).toMatch(/migrates/i);
    expect(dialect.migrateLogsDdl).toMatch(/migrate_logs/i);
    expect(await dialect.prerequisiteError('pg://x')).toBeNull();
    await dialect.prepareSetup('pg://x');
  });

  it('createClient talks through pg.Client with translated placeholders', async () => {
    const client = await dialect.createClient('postgresql://localhost/db');
    expect(client.dialect).toBe('postgres');
    await client.exec('SELECT 1');
    expect(await client.query('SELECT ?', [1])).toEqual([{ n: 1 }]);
    expect(pg.state.queries.some((q) => q.sql === 'SELECT $1' && q.params?.[0] === 1)).toBe(true);
    await client.run('UPDATE t SET x = ?', [2]);
    expect(await client.transaction(async () => 'ok')).toBe('ok');
    expect(pg.state.queries.map((q) => q.sql)).toContain('BEGIN');
    expect(pg.state.queries.map((q) => q.sql)).toContain('COMMIT');
    await expect(
      client.transaction(async () => {
        throw new Error('tx');
      }),
    ).rejects.toThrow('tx');
    expect(pg.state.queries.map((q) => q.sql)).toContain('ROLLBACK');
    pg.state.failRollback = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      client.transaction(async () => {
        throw new Error('tx2');
      }),
    ).rejects.toThrow('tx2');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await client.close();
    expect(pg.state.ended).toBe(true);
  });
});
