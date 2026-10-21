import { afterEach, describe, expect, it, vi } from 'vitest';

const oracle = vi.hoisted(() => {
  const state = {
    failRollback: false,
    closed: false,
    executes: [] as { sql: string; params: unknown[]; opts?: object }[],
    lastConfig: undefined as unknown,
  };
  const conn = {
    async execute(sql: string, params: unknown[] = [], opts?: object) {
      state.executes.push({ sql, params, opts });
      if (sql.includes('NOROWS')) return {};
      return { rows: [{ N: 1, Name: 'x' }] };
    },
    async commit() {},
    async rollback() {
      if (state.failRollback) throw new Error('rollback failed');
    },
    async close() {
      state.closed = true;
    },
  };
  return {
    state,
    OUT_FORMAT_OBJECT: 4002,
    getConnection: async (cfg: unknown) => {
      state.lastConfig = cfg;
      return conn;
    },
  };
});

vi.mock('oracledb', () => ({
  default: {
    getConnection: oracle.getConnection,
    OUT_FORMAT_OBJECT: oracle.OUT_FORMAT_OBJECT,
  },
}));

import { OracleDialect, parseOracleConnection } from './oracle-dialect.ts';

const dialect = new OracleDialect();

describe('parseOracleConnection', () => {
  it('accepts a config object or user/password@connectString', () => {
    const obj = { user: 'u', password: 'p', connectString: 'c' };
    expect(parseOracleConnection(obj)).toBe(obj);
    expect(parseOracleConnection('scott/tiger@localhost/orcl')).toEqual({
      user: 'scott',
      password: 'tiger',
      connectString: 'localhost/orcl',
    });
    expect(() => parseOracleConnection('not-a-dsn')).toThrow(
      /Oracle connection must look like user\/password@connectString/,
    );
  });
});

describe('OracleDialect', () => {
  afterEach(() => {
    oracle.state.failRollback = false;
    oracle.state.closed = false;
    oracle.state.executes = [];
    oracle.state.lastConfig = undefined;
  });

  it('registers as oracle with :n placeholders and FETCH FIRST', async () => {
    expect(dialect.name).toBe('oracle');
    expect([...dialect.connectionEnvironmentVariables]).toEqual([
      'ORACLE_CONNECT_STRING',
      'DATABASE_URL',
    ]);
    expect(dialect.quoteIdent('t')).toBe('"t"');
    expect(dialect.translatePlaceholders('WHERE a = ? AND b = ?')).toBe('WHERE a = :1 AND b = :2');
    expect(dialect.limitClause(5)).toBe('FETCH FIRST 5 ROWS ONLY');
    expect(dialect.migratesDdl).toMatch(/migrates/i);
    expect(dialect.migrateLogsDdl).toMatch(/migrate_logs/i);
    expect(await dialect.prerequisiteError('u/p@c')).toBeNull();
    await dialect.prepareSetup('u/p@c');
  });

  it('createClient parses the DSN, lowercases row keys, and commits or rolls back', async () => {
    const client = await dialect.createClient('scott/tiger@localhost/orcl');
    expect(client.dialect).toBe('oracle');
    expect(oracle.state.lastConfig).toEqual({
      user: 'scott',
      password: 'tiger',
      connectString: 'localhost/orcl',
    });
    await client.exec('ALTER SESSION SET NLS_DATE_FORMAT = "YYYY"');
    expect(oracle.state.executes[0]?.opts).toEqual({ autoCommit: true });
    expect(await client.query('SELECT ?', [1])).toEqual([{ n: 1, name: 'x' }]);
    expect(await client.query('NOROWS')).toEqual([]);
    expect(oracle.state.executes.some((e) => e.sql === 'SELECT :1')).toBe(true);
    await client.run('UPDATE t SET x = ?', [2]);
    expect(
      oracle.state.executes.some((e) => e.sql === 'UPDATE t SET x = :1' && e.opts && 'autoCommit' in e.opts && e.opts.autoCommit === false),
    ).toBe(true);
    expect(await client.transaction(async () => 'ok')).toBe('ok');
    await expect(
      client.transaction(async () => {
        throw new Error('tx');
      }),
    ).rejects.toThrow('tx');
    oracle.state.failRollback = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      client.transaction(async () => {
        throw new Error('tx2');
      }),
    ).rejects.toThrow('tx2');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await client.close();
    expect(oracle.state.closed).toBe(true);
  });
});
