import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDialect, type SqlDialect } from "./sql.ts";

const SQL_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "sql",
);

const DIALECTS = [
  "sqlite",
  "postgres",
  "mysql",
  "sqlserver",
  "oracle",
] as const satisfies readonly SqlDialect[];

const loadPair = async (dialect: SqlDialect): Promise<[string, string]> => {
  const [migrates, logs] = await Promise.all([
    readFile(join(SQL_ROOT, dialect, "migrates.sql"), "utf8"),
    readFile(join(SQL_ROOT, dialect, "migrate_logs.sql"), "utf8"),
  ]);
  return [migrates.trim(), logs.trim()];
};

const SETUP_SQL = Object.fromEntries(
  await Promise.all(DIALECTS.map(async (d) => [d, await loadPair(d)] as const)),
) as Record<SqlDialect, [string, string]>;

export function setupSql(dialect: string): string[] {
  const key = normalizeDialect(dialect);
  if (!key) {
    throw new Error(
      `Unknown SQL dialect "${dialect}". Valid: sqlite, mysql, postgres, sqlserver, oracle.`,
    );
  }
  return SETUP_SQL[key];
}
