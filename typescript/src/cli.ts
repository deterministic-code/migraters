import { connectionResolver, defaultDialectFactory } from './infrastructure/default-factory.ts';
import type { IDatasourceProvider } from './abstractions/datasource-provider.ts';
import { cliSpec } from './cli-spec.ts';
import { fillTemplate, loadMessage } from './infrastructure/message-templates.ts';

const missingProviderMsg = await loadMessage('errors/missing-provider');
const unsupportedProviderTpl = await loadMessage('errors/unsupported-provider');
const missingConnectionTpl = await loadMessage('errors/missing-connection');

export { missingProviderMsg };

export const requireDialect = (provider: string | null): IDatasourceProvider => {
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

export const requireConnection = (dialect: IDatasourceProvider, fromFlag: string | null): string => {
  const connection = connectionResolver.resolve(dialect.name, fromFlag);
  if (!connection) {
    process.stderr.write(
      fillTemplate(missingConnectionTpl, {
        envVars: (cliSpec.connection_environment[dialect.name] ?? []).join(
          cliSpec.env_var_list_separator,
        ),
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
