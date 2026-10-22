import type { ProviderLogId } from '../../src/abstractions/datasource-provider.ts';
import type { MigrationClient, MigrationRowValue } from '../../src/migration-client.ts';
import { splitOnGo } from './split-on-go.ts';

const catalogName = (stored: string): string =>
  stored.endsWith('_up.sql') ? stored.slice(0, -'_up.sql'.length) : stored;

export type SqlRunSurface = {
  migratesDdl: string;
  migrateLogsDdl: string;
  usesLastInsertRowid?: boolean;
  quoteIdent?: (ident: string) => string;
  nowExpr?: () => string;
  limitClause?: (n: number) => string;
  prerequisiteError?: (connection: string) => Promise<string | null>;
  createClient: (connection: string) => Promise<MigrationClient>;
};

const quoteIdent = (surface: SqlRunSurface, ident: string): string =>
  surface.quoteIdent?.(ident) ?? `"${ident}"`;

const nowExpr = (surface: SqlRunSurface): string => surface.nowExpr?.() ?? 'CURRENT_TIMESTAMP';

const limitClause = (surface: SqlRunSurface, n: number): string =>
  surface.limitClause?.(n) ?? `LIMIT ${n}`;

const openExisting = async (surface: SqlRunSurface, connection: string): Promise<MigrationClient> => {
  const error = (await surface.prerequisiteError?.(connection)) ?? null;
  if (error) throw new Error(error);
  return surface.createClient(connection);
};

export const sqlRun = {
  async setup(surface: SqlRunSurface, connection: string): Promise<void> {
    const client = await surface.createClient(connection);
    try {
      await client.exec(surface.migratesDdl);
      await client.exec(surface.migrateLogsDdl);
    } finally {
      await client.close();
    }
  },

  async applied(surface: SqlRunSurface, connection: string): Promise<Map<string, string | null>> {
    const client = await openExisting(surface, connection);
    try {
      const q = (ident: string) => quoteIdent(surface, ident);
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
    } finally {
      await client.close();
    }
  },

  async migrateUp(
    surface: SqlRunSurface,
    connection: string,
    name: string,
    body: string,
    checksum: string,
  ): Promise<void> {
    const client = await openExisting(surface, connection);
    try {
      const q = (ident: string) => quoteIdent(surface, ident);
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
    } finally {
      await client.close();
    }
  },

  async migrateDown(
    surface: SqlRunSurface,
    connection: string,
    name: string,
    body: string,
  ): Promise<void> {
    const client = await openExisting(surface, connection);
    try {
      const q = (ident: string) => quoteIdent(surface, ident);
      await client.transaction(async () => {
        for (const stmt of splitOnGo(body)) {
          await client.exec(stmt);
        }
        const t = q('migrates');
        await client.run(`DELETE FROM ${t} WHERE ${q('name')} = ?`, [name]);
      });
    } finally {
      await client.close();
    }
  },

  async log(
    surface: SqlRunSurface,
    connection: string,
    id: ProviderLogId | null,
    name: string,
    direction: string,
    status: string | null,
    durationMs: number,
    error: string | null,
  ): Promise<ProviderLogId> {
    const client = await surface.createClient(connection);
    try {
      const q = (ident: string) => quoteIdent(surface, ident);
      const t = q('migrate_logs');
      if (id == null) {
        if (surface.usesLastInsertRowid) {
          const stmt = `INSERT INTO ${t} (${q('migrate_name')}, ${q('direction')}, ${q('status')}) VALUES (?, ?, 'started')`;
          const db = client._raw;
          if (db) return db.prepare(stmt).run(name, direction).lastInsertRowid;
          await client.run(stmt, [name, direction]);
        } else {
          await client.run(
            `INSERT INTO ${t} (${q('migrate_name')}, ${q('direction')}, ${q('status')}) VALUES (?, ?, 'started')`,
            [name, direction],
          );
        }
        const rows = await client.query(
          `SELECT ${q('id')} AS id FROM ${t} WHERE ${q('migrate_name')} = ? AND ${q('direction')} = ? ORDER BY ${q('id')} DESC ${limitClause(surface, 1)}`,
          [name, direction],
        );
        return (rows[0]?.id ?? rows[0]?.ID) as MigrationRowValue as ProviderLogId;
      }
      const setNow = nowExpr(surface);
      await client.run(
        `UPDATE ${t} SET ${q('status')} = ?, ${q('finished_at')} = ${setNow}, ${q('duration_ms')} = ?, ${q('error_message')} = ?, ${q('updated')} = ${setNow} WHERE ${q('id')} = ?`,
        [status, durationMs, error, id],
      );
      return id;
    } finally {
      await client.close();
    }
  },
};
