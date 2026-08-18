import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  MigrationClient,
  MigrationRow,
  MigrationSqlParam,
} from "../migration-client.ts";
import { pathExists } from "../path-exists.ts";
import { SqlDialectBase } from "./sql-dialect-base.ts";

export const sqliteFilesystemPath = (connection: string): string | null => {
  let s = connection.trim();
  const eq = s.indexOf("=");
  if (eq >= 0 && /data\s*source/i.test(s.slice(0, eq))) {
    s = s.slice(eq + 1).trim();
  } else if (/^sqlite:\/\//i.test(s)) {
    s = s.slice("sqlite://".length);
  } else if (/^sqlite:/i.test(s)) {
    s = s.slice("sqlite:".length);
  } else if (/^file:/i.test(s)) {
    s = s.slice("file:".length);
  }
  if (s === ":memory:" || s === "") return null;
  return s;
};

export class SqliteDialect extends SqlDialectBase {
  readonly name = "sqlite" as const;
  readonly connectionEnvironmentVariables = ["SQLITE_PATH", "DB_PATH"] as const;
  override readonly usesLastInsertRowid = true;

  async prerequisiteError(connection: string): Promise<string | null> {
    const path = sqliteFilesystemPath(connection);
    if (path === null) return null;
    if (await pathExists(path)) return null;
    return `sqlite file: ${path} does not exist — run 'migrate-setup --provider sqlite --connection ${path}' to create it`;
  }

  async prepareSetup(connection: string): Promise<void> {
    const filePath = sqliteFilesystemPath(connection);
    if (filePath !== null) {
      await mkdir(dirname(filePath), { recursive: true });
    }
  }

  async createClient(connection: string): Promise<MigrationClient> {
    if (!connection) throw new Error("sqlite requires a database file path");
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(connection);
    return {
      dialect: "sqlite",
      async exec(sql) {
        db.exec(sql);
      },
      async query(sql, params = []) {
        const stmt = db.prepare<MigrationSqlParam[], MigrationRow>(sql);
        try {
          return stmt.all(...params);
        } catch {
          stmt.run(...params);
          return [];
        }
      },
      async run(sql, params = []) {
        db.prepare(sql).run(...params);
      },
      async transaction(fn) {
        db.exec("BEGIN");
        try {
          const r = await fn();
          db.exec("COMMIT");
          return r;
        } catch (e) {
          try {
            db.exec("ROLLBACK");
          } catch (rollbackErr) {
            console.warn(
              "sqlite ROLLBACK failed after transaction error; original error rethrown",
              rollbackErr,
            );
          }
          throw e;
        }
      },
      async close() {
        db.close();
      },
    };
  }
}
