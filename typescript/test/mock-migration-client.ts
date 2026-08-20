import type { MigrationClient } from '../src/datasource-migrate.ts';
import type { SqlDialect } from '../src/sql.ts';

type MigrationRow = Record<string, string | number | null>;

export type MockMigrationClient = MigrationClient & {
  execs: string[];
  runs: { sql: string; params: unknown[] }[];
  applied: Map<string, string | null>;
  failExec?: Error;
};

export const mockMigrationClient = (
  init: {
    dialect?: SqlDialect;
    applied?: Record<string, string | null>;
    failExec?: Error;
  } = {},
): MockMigrationClient => {
  const applied = new Map(Object.entries(init.applied ?? {}));
  let nextLogId = 1;
  const logs: { id: number; name: string; direction: string; status: string }[] = [];
  const client: MockMigrationClient = {
    dialect: init.dialect ?? 'sqlite',
    execs: [],
    runs: [],
    applied,
    failExec: init.failExec,
    async exec(sql) {
      if (client.failExec) throw client.failExec;
      client.execs.push(sql);
    },
    async query(sql, params = []) {
      if (/FROM\s+"?migrates"?/i.test(sql) && /SELECT/i.test(sql) && /checksum/i.test(sql)) {
        return [...applied.entries()].map(([name, checksum]) => ({
          name,
          checksum,
        }));
      }
      if (/FROM\s+"?migrate_logs"?/i.test(sql)) {
        const name = String(params[0] ?? '');
        const direction = String(params[1] ?? '');
        const match = logs.filter((l) => l.name === name && l.direction === direction).at(-1);
        return match ? [{ id: match.id }] : [];
      }
      return [];
    },
    async run(sql, params = []) {
      client.runs.push({ sql, params: [...params] });
      if (/INSERT INTO\s+"?migrates"?/i.test(sql)) {
        applied.set(String(params[0]), (params[1] as string | null) ?? null);
        return;
      }
      if (/DELETE FROM\s+"?migrates"?/i.test(sql)) {
        applied.delete(String(params[0]));
        return;
      }
      if (/INSERT INTO\s+"?migrate_logs"?/i.test(sql)) {
        logs.push({
          id: nextLogId++,
          name: String(params[0]),
          direction: String(params[1]),
          status: 'started',
        });
        return;
      }
      if (/UPDATE\s+"?migrate_logs"?/i.test(sql)) {
        const status = String(params[0]);
        const id = Number(params[params.length - 1]);
        const row = logs.find((l) => l.id === id);
        if (row) row.status = status;
      }
    },
    async transaction(fn) {
      return fn();
    },
    async close() {},
  };
  return client;
};
