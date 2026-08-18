import { connectionResolver, defaultDialectFactory } from "./dialects/default-factory.ts";
import type { ISqlDialect } from "./dialects/sql-dialect.ts";
import { sqliteFilesystemPath } from "./dialects/sqlite-dialect.ts";

export { sqliteFilesystemPath };

export const ENV_VARS_BY_DIALECT: Record<string, string[]> = Object.fromEntries(
  defaultDialectFactory.all().map((d) => [
    d.name,
    [...d.connectionEnvironmentVariables],
  ]),
);

export const resolveConn = (
  dialect: string,
  fromFlag: string | null,
): string | null => {
  const d = defaultDialectFactory.tryGet(dialect);
  if (!d) return fromFlag;
  return connectionResolver.resolve(d, fromFlag);
};

export const requireDialect = (provider: string | null): ISqlDialect => {
  if (!provider) {
    process.stderr.write("missing --provider\n");
    process.exit(2);
  }
  const dialect = defaultDialectFactory.tryGet(provider);
  if (!dialect) {
    process.stderr.write(`unknown provider: ${provider}\n`);
    process.exit(2);
  }
  return dialect;
};

export const requireConnection = (
  dialect: ISqlDialect,
  fromFlag: string | null,
): string => {
  const connection = connectionResolver.resolve(dialect, fromFlag);
  if (!connection) {
    process.stderr.write(
      `missing --connection — pass --connection <url> (e.g. ./app.sqlite for sqlite) or set ${dialect.connectionEnvironmentVariables.join(" / ")}. Run with --help for examples.\n`,
    );
    process.exit(2);
  }
  return connection;
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
