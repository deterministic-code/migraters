import { access } from "node:fs/promises";

export type SqlDialect =
  | "sqlite"
  | "mysql"
  | "postgres"
  | "sqlserver"
  | "oracle";

const DIALECT_ALIASES: Record<string, SqlDialect> = {
  sqlite: "sqlite",
  sqlite3: "sqlite",
  mysql: "mysql",
  mariadb: "mysql",
  postgres: "postgres",
  postgresql: "postgres",
  pg: "postgres",
  sqlserver: "sqlserver",
  mssql: "sqlserver",
  "ms-sql-server": "sqlserver",
  oracle: "oracle",
  ora: "oracle",
};

export const normalizeDialect = (
  raw: string | null | undefined,
): SqlDialect | null => {
  if (!raw) return null;
  const key = raw.toLowerCase().replace(/[\s_\-]/g, "");
  return DIALECT_ALIASES[key] ?? null;
};

export const q = (dialect: string, ident: string): string => {
  if (dialect === "mysql") return `\`${ident}\``;
  if (dialect === "sqlserver") return `[${ident}]`;
  return `"${ident}"`;
};

export const pathExists = async (p: string): Promise<boolean> => {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
};
