import type { SqlDialect } from '../sql.ts';
import type { IDatasourceProvider, ProviderLogId } from './datasource-provider.ts';
import type { MigrationClient, MigrationRowValue } from '../migration-client.ts';
import { splitOnGo } from '../infrastructure/split-on-go.ts';

const catalogName = (stored: string): string =>
  stored.endsWith('_up.sql') ? stored.slice(0, -'_up.sql'.length) : stored;

export abstract class SqlDialectBase implements IDatasourceProvider {
  abstract readonly name: SqlDialect;
  abstract readonly migratesDdl: string;
  abstract readonly migrateLogsDdl: string;
  readonly usesLastInsertRowid: boolean = false;

  quoteIdent(ident: string): string {
    return `"${ident}"`;
  }

  nowExpr(): string {
    return 'CURRENT_TIMESTAMP';
  }

  limitClause(n: number): string {
    return `LIMIT ${n}`;
  }

  translatePlaceholders(sql: string): string {
    return sql;
  }

  async prerequisiteError(_connection: string): Promise<string | null> {
    return null;
  }

  async prepareSetup(_connection: string): Promise<void> {}

  async createDatabaseIfMissing(_connection: string): Promise<void> {}

  abstract createClient(connection: string): Promise<MigrationClient>;

  async setup(connection: string): Promise<void> {
    const client = await this.createClient(connection);
    try {
      await client.exec(this.migratesDdl);
      await client.exec(this.migrateLogsDdl);
    } finally {
      await client.close();
    }
  }

  async applied(connection: string): Promise<Map<string, string | null>> {
    const client = await this.openExisting(connection);
    try {
      const q = (ident: string) => this.quoteIdent(ident);
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
  }

  async migrateUp(connection: string, name: string, body: string, checksum: string): Promise<void> {
    const client = await this.openExisting(connection);
    try {
      const q = (ident: string) => this.quoteIdent(ident);
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
  }

  async migrateDown(connection: string, name: string, body: string): Promise<void> {
    const client = await this.openExisting(connection);
    try {
      const q = (ident: string) => this.quoteIdent(ident);
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
  }

  async log(
    connection: string,
    id: ProviderLogId | null,
    name: string,
    direction: string,
    status: string | null,
    durationMs: number,
    error: string | null,
  ): Promise<ProviderLogId> {
    const client = await this.createClient(connection);
    try {
      const q = (ident: string) => this.quoteIdent(ident);
      const t = q('migrate_logs');
      if (id == null) {
        if (this.usesLastInsertRowid) {
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
          `SELECT ${q('id')} AS id FROM ${t} WHERE ${q('migrate_name')} = ? AND ${q('direction')} = ? ORDER BY ${q('id')} DESC ${this.limitClause(1)}`,
          [name, direction],
        );
        return (rows[0]?.id ?? rows[0]?.ID) as MigrationRowValue as ProviderLogId;
      }
      const setNow = this.nowExpr();
      await client.run(
        `UPDATE ${t} SET ${q('status')} = ?, ${q('finished_at')} = ${setNow}, ${q('duration_ms')} = ?, ${q('error_message')} = ?, ${q('updated')} = ${setNow} WHERE ${q('id')} = ?`,
        [status, durationMs, error, id],
      );
      return id;
    } finally {
      await client.close();
    }
  }

  private async openExisting(connection: string): Promise<MigrationClient> {
    const error = await this.prerequisiteError(connection);
    if (error) throw new Error(error);
    return this.createClient(connection);
  }
}
