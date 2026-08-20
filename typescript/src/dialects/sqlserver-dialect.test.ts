import { afterEach, describe, expect, it, vi } from 'vitest';

const mssql = vi.hoisted(() => {
  const state = {
    failRollback: false,
    closed: false,
    batches: [] as string[],
    queries: [] as string[],
    inputs: [] as { name: string; value: unknown }[],
  };
  const request = () => ({
    input(name: string, value: unknown) {
      state.inputs.push({ name, value });
    },
    async query(sql: string) {
      state.queries.push(sql);
      if (sql.includes('empty')) return {};
      return { recordset: [{ n: 1 }] };
    },
    async batch(sql: string) {
      state.batches.push(sql);
    },
  });
  const transaction = () => ({
    async begin() {},
    async commit() {},
    async rollback() {
      if (state.failRollback) throw new Error('rollback failed');
    },
  });
  const pool = {
    request,
    transaction,
    async close() {
      state.closed = true;
    },
  };
  return {
    state,
    connect: async () => pool,
  };
});

vi.mock('mssql', () => ({ default: { connect: mssql.connect } }));

import { SqlServerDialect } from './sqlserver-dialect.ts';

const dialect = new SqlServerDialect();

describe('SqlServerDialect', () => {
  afterEach(() => {
    mssql.state.failRollback = false;
    mssql.state.closed = false;
    mssql.state.batches = [];
    mssql.state.queries = [];
    mssql.state.inputs = [];
  });

  it('registers as sqlserver with bracket quotes, SYSUTCDATETIME, and OFFSET/FETCH', async () => {
    expect(dialect.name).toBe('sqlserver');
    expect([...dialect.connectionEnvironmentVariables]).toEqual(['MSSQL_URL', 'DATABASE_URL']);
    expect(dialect.quoteIdent('t')).toBe('[t]');
    expect(dialect.nowExpr()).toBe('SYSUTCDATETIME()');
    expect(dialect.limitClause(4)).toBe('OFFSET 0 ROWS FETCH NEXT 4 ROWS ONLY');
    expect(dialect.migratesDdl).toMatch(/migrates/i);
    expect(dialect.migrateLogsDdl).toMatch(/migrate_logs/i);
    expect(await dialect.prerequisiteError('mssql://x')).toBeNull();
    await dialect.prepareSetup('mssql://x');
  });

  it('createClient binds ? as @pN and handles empty recordsets', async () => {
    const client = await dialect.createClient('Server=localhost');
    expect(client.dialect).toBe('sqlserver');
    await client.exec('CREATE TABLE t (id INT)');
    expect(mssql.state.batches).toContain('CREATE TABLE t (id INT)');
    expect(await client.query('SELECT ?', [7])).toEqual([{ n: 1 }]);
    expect(mssql.state.queries).toContain('SELECT @p0');
    expect(mssql.state.inputs).toContainEqual({ name: 'p0', value: 7 });
    expect(await client.query('empty')).toEqual([]);
    await client.run('UPDATE t SET x = ?', [8]);
    expect(await client.transaction(async () => 'ok')).toBe('ok');
    await expect(
      client.transaction(async () => {
        throw new Error('tx');
      }),
    ).rejects.toThrow('tx');
    mssql.state.failRollback = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      client.transaction(async () => {
        throw new Error('tx2');
      }),
    ).rejects.toThrow('tx2');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    await client.close();
    expect(mssql.state.closed).toBe(true);
  });
});
