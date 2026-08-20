import { connectionResolver, defaultDialectFactory } from './infrastructure/default-factory.ts';
import type { ISqlDialect } from './abstractions/sql-dialect.ts';
import { sqliteFilesystemPath } from './dialects/sqlite-dialect.ts';
import { fillTemplate, loadMessage } from './infrastructure/message-templates.ts';

export { sqliteFilesystemPath };

export const ENV_VARS_BY_DIALECT: Record<string, string[]> = Object.fromEntries(
  defaultDialectFactory.all().map((d) => [d.name, [...d.connectionEnvironmentVariables]]),
);

const missingProviderMsg = await loadMessage('errors/missing-provider');
const unsupportedProviderTpl = await loadMessage('errors/unsupported-provider');
const missingConnectionTpl = await loadMessage('errors/missing-connection');

export { missingProviderMsg };

export const resolveConn = (dialect: string, fromFlag: string | null): string | null => {
  const d = defaultDialectFactory.tryGet(dialect);
  if (!d) return fromFlag;
  return connectionResolver.resolve(d, fromFlag);
};

export const requireDialect = (provider: string | null): ISqlDialect => {
  if (!provider) {
    process.stderr.write(missingProviderMsg);
    process.exit(2);
  }
  const dialect = defaultDialectFactory.tryGet(provider);
  if (!dialect) {
    process.stderr.write(fillTemplate(unsupportedProviderTpl, { provider }));
    process.exit(2);
  }
  return dialect;
};

export const requireConnection = (dialect: ISqlDialect, fromFlag: string | null): string => {
  const connection = connectionResolver.resolve(dialect, fromFlag);
  if (!connection) {
    process.stderr.write(
      fillTemplate(missingConnectionTpl, {
        envVars: dialect.connectionEnvironmentVariables.join(' / '),
      }),
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
