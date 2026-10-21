import { splitOnGo } from './infrastructure/split-on-go.ts';
import type { MigrationClient, MigrationRowValue } from './migration-client.ts';
import type { MigrationDriver, MigrationDriverId } from './abstractions/migration-driver.ts';

export interface SqlDriverKnobs {
  readonly migratesDdl: string;
  readonly migrateLogsDdl: string;
  readonly usesLastInsertRowid: boolean;
  quoteIdent(ident: string): string;
  nowExpr(): string;
  limitClause(n: number): string;
}

const catalogName = (stored: string): string =>
  stored.endsWith('_up.sql') ? stored.slice(0, -'_up.sql'.length) : stored;

export function sqlMigrationDriver(client: MigrationClient, d: SqlDriverKnobs): MigrationDriver {
  const q = (ident: string) => d.quoteIdent(ident);

  return {
    async setup() {
      await client.exec(d.migratesDdl);
      await client.exec(d.migrateLogsDdl);
    },
    async applied() {
      const rows = await client.query(
        `SELECT ${q('name')} AS name, ${q('checksum')} AS checksum FROM ${q('migrates')}`,
      );
      return new Map(
        rows.map(
          (r) =>
            [
              catalogName(String(r.name ?? r.NAME ?? '')),
              (r.checksum ?? r.CHECKSUM ?? null) as string | null,
            ] as [string, string | null],
        ),
      );
    },
    async migrateUp(name, body, checksum) {
      await client.transaction(async () => {
        for (const stmt of splitOnGo(body)) {
          await client.exec(stmt);
        }
        const t = q('migrates');
        await client.run(`INSERT INTO ${t} (${q('name')}, ${q('checksum')}) VALUES (?, ?)`, [
          name,
          checksum,
        ]);
      });
    },
    async migrateDown(name, body) {
      await client.transaction(async () => {
        for (const stmt of splitOnGo(body)) {
          await client.exec(stmt);
        }
        const t = q('migrates');
        await client.run(`DELETE FROM ${t} WHERE ${q('name')} = ?`, [name]);
      });
    },
    async logStarted(name, direction) {
      const t = q('migrate_logs');
      if (d.usesLastInsertRowid) {
        const stmt = `INSERT INTO ${t} (${q('migrate_name')}, ${q('direction')}, ${q('status')}) VALUES (?, ?, 'started')`;
        const db = client._raw;
        if (db) {
          return db.prepare(stmt).run(name, direction).lastInsertRowid;
        }
        await client.run(stmt, [name, direction]);
      } else {
        await client.run(
          `INSERT INTO ${t} (${q('migrate_name')}, ${q('direction')}, ${q('status')}) VALUES (?, ?, 'started')`,
          [name, direction],
        );
      }
      const rows = await client.query(
        `SELECT ${q('id')} AS id FROM ${t} WHERE ${q('migrate_name')} = ? AND ${q('direction')} = ? ORDER BY ${q('id')} DESC ${d.limitClause(1)}`,
        [name, direction],
      );
      return (rows[0]?.id ?? rows[0]?.ID) as MigrationRowValue as MigrationDriverId;
    },
    async logFinished(id, status, durationMs, error) {
      const t = q('migrate_logs');
      const setNow = d.nowExpr();
      await client.run(
        `UPDATE ${t} SET ${q('status')} = ?, ${q('finished_at')} = ${setNow}, ${q('duration_ms')} = ?, ${q('error_message')} = ?, ${q('updated')} = ${setNow} WHERE ${q('id')} = ?`,
        [status, durationMs, error, id],
      );
    },
    close() {
      return client.close();
    },
  };
}
