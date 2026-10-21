import { afterEach, describe, expect, it, vi } from 'vitest';

const pg = vi.hoisted(() => {
  const state = { queries: [] as string[], fail: false };
  return {
    state,
    Client: class {
      async connect() {}
      async query(sql: string) {
        state.queries.push(sql);
        if (state.fail) throw new Error('database "proof" already exists');
      }
      async end() {}
    },
  };
});

const mysql = vi.hoisted(() => {
  const state = { queries: [] as string[] };
  return {
    state,
    createConnection: async () => ({
      async query(sql: string) {
        state.queries.push(sql);
      },
      async end() {},
    }),
  };
});

const mssql = vi.hoisted(() => {
  const state = { batches: [] as string[] };
  return {
    state,
    connect: async () => ({
      request: () => ({
        async batch(sql: string) {
          state.batches.push(sql);
        },
      }),
      async close() {},
    }),
  };
});

vi.mock('pg', () => ({ default: { Client: pg.Client } }));
vi.mock('mysql2/promise', () => mysql);
vi.mock('mssql', () => ({ default: mssql }));

import { createDatabase } from './create-database.ts';

describe('createDatabase', () => {
  afterEach(() => {
    pg.state.queries = [];
    pg.state.fail = false;
    mysql.state.queries = [];
    mssql.state.batches = [];
  });

  it('no-ops sqlite and oracle', async () => {
    await createDatabase('sqlite', './app.sqlite');
    await createDatabase('oracle', 'system/proof@localhost/FREEPDB1');
    expect(pg.state.queries).toEqual([]);
  });

  it('creates a postgres database and ignores already exists', async () => {
    await createDatabase('postgres', 'postgresql://proof:proof@postgres:5432/proof');
    expect(pg.state.queries[0]).toContain('CREATE DATABASE "proof"');
    pg.state.fail = true;
    await createDatabase('postgres', 'postgresql://proof:proof@postgres:5432/proof');
    await createDatabase('postgres', 'postgresql://proof:proof@postgres:5432/postgres');
  });

  it('creates a mysql database', async () => {
    await createDatabase('mysql', 'mysql://root:proof@mysql:3306/proof');
    expect(mysql.state.queries[0]).toContain('CREATE DATABASE IF NOT EXISTS `proof`');
    await createDatabase('mysql', 'mysql://root:proof@mysql:3306/');
  });

  it('creates a sqlserver database', async () => {
    await createDatabase(
      'sqlserver',
      'Server=sqlserver,1433;User Id=sa;Password=x;Database=proof',
    );
    expect(mssql.state.batches[0]).toContain('CREATE DATABASE [proof]');
    await createDatabase(
      'sqlserver',
      'Server=sqlserver,1433;User Id=sa;Password=x;Database=master',
    );
  });
});
