export const ENV_VARS_BY_DIALECT: Record<string, string[]> = {
  sqlite: ["SQLITE_PATH", "DB_PATH"],
  postgres: ["PG_CONNECTION_STRING", "DATABASE_URL"],
  mysql: ["MYSQL_URL", "DATABASE_URL"],
  sqlserver: ["MSSQL_URL", "DATABASE_URL"],
  oracle: ["ORACLE_CONNECT_STRING", "DATABASE_URL"],
};

export const resolveConn = (
  dialect: string,
  fromFlag: string | null,
): string | null => {
  if (fromFlag) return fromFlag;
  for (const name of ENV_VARS_BY_DIALECT[dialect] ?? []) {
    if (process.env[name]) return process.env[name] ?? null;
  }
  return null;
};

/** Filesystem path for a sqlite connection, or null for :memory: (skip existence checks). */
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

export const takeFlag = (
  rest: string[],
  i: number,
  arg: string,
  flag: string,
): { value: string; next: number } | undefined => {
  const eq = `${flag}=`;
  if (arg === flag) {
    const value = rest[i + 1];
    if (value === undefined) return undefined;
    return { value, next: i + 1 };
  }
  if (arg.startsWith(eq)) return { value: arg.slice(eq.length), next: i };
  return undefined;
};
