import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqlDialect } from "../sql.ts";
import type { SetupDdl } from "./sql-dialect.ts";

const SQL_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
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

const loadPair = async (dialect: SqlDialect): Promise<SetupDdl> => {
  const [migrates, migrateLogs] = await Promise.all([
    readFile(join(SQL_ROOT, dialect, "migrates.sql"), "utf8"),
    readFile(join(SQL_ROOT, dialect, "migrate_logs.sql"), "utf8"),
  ]);
  return { migrates: migrates.trim(), migrateLogs: migrateLogs.trim() };
};

export const SETUP_DDL = Object.fromEntries(
  await Promise.all(DIALECTS.map(async (d) => [d, await loadPair(d)] as const)),
) as Record<SqlDialect, SetupDdl>;
