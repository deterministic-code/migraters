import { afterEach, describe, expect, it, vi } from 'vitest';

const mysql = vi.hoisted(() => {
  const state = {
    failRollback: false,
    ended: false,
    queries: [] as string[],
    executes: [] as { sql: string; params?: unknown[] }[],
  };
  const conn = {
    async query(sql: string) {
      state.queries.push(sql);
    },
    async execute(sql: string, params?: unknown[]) {
      state.executes.push({ sql, params });
      return [[{ n: 1 }]];
    },
    async beginTransaction() {},
    async commit() {},
    async rollback() {
      if (state.failRollback) throw new Error('rollback failed');
    },
    async end() {
      state.ended = true;
    },
  };
  return {
    state,
    createConnection: async () => conn,
  };
});

vi.mock('mysql2/promise', () => ({
  createConnection: mysql.createConnection,
}));

import { applyMysqlDdlViaTextProtocol, MysqlDialect } from './mysql-dialect.ts';

const dialect = new MysqlDialect();

describe('MysqlDialect', () => {
  afterEach(() => {
    mysql.state.failRollback = false;
    mysql.state.ended = false;
    mysql.state.queries = [];
    mysql.state.executes = [];
  });

  it('registers as mysql with backtick identifiers', async () => {
    expect(dialect.name).toBe('mysql');
    expect([...dialect.connectionEnvironmentVariables]).toEqual(['MYSQL_URL', 'DATABASE_URL']);
    expect(dialect.quoteIdent('t')).toBe('`t`');
    expect(dialect.nowExpr()).toBe('CURRENT_TIMESTAMP');
    expect(dialect.limitClause(2)).toBe('LIMIT 2');
    expect(dialect.translatePlaceholders('?')).toBe('?');
    expect(dialect.migratesDdl).toMatch(/migrates/i);
    expect(dialect.migrateLogsDdl).toMatch(/migrate_logs/i);
    expect(await dialect.prerequisiteError('mysql://x')).toBeNull();
    await dialect.prepareSetup('mysql://x');
  });

  it('applyMysqlDdlViaTextProtocol uses query, not execute', async () => {
    const seen: string[] = [];
    await applyMysqlDdlViaTextProtocol({ query: async (sql: string) => { seen.push(sql); } }, 'CREATE TABLE t (id INT)');
    expect(seen).toEqual(['CREATE TABLE t (id INT)']);
  });

  it('createClient uses text-protocol exec and execute for query/run', async () => {
    const client = await dialect.createClient('mysql://localhost/db');
    expect(client.dialect).toBe('mysql');
    await client.exec('DROP PROCEDURE p');
    expect(mysql.state.queries).toContain('DROP PROCEDURE p');
    expect(await client.query('SELECT ?', [1])).toEqual([{ n: 1 }]);
    await client.run('UPDATE t SET x = ?', [2]);
    expect(await client.transaction(async () => 9)).toBe(9);
    await expect(
      client.transaction(async () => {
        throw new Error('tx');
      }),
    ).rejects.toThrow('tx');
    mysql.state.failRollback = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      client.transaction(async () => {
        throw new Error('tx2');
      }),
    ).rejects.toThrow('tx2');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await client.close();
    expect(mysql.state.ended).toBe(true);
  });
});
