import type { ISqlDialect } from '../abstractions/sql-dialect.ts';

export class ConnectionResolver {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  fromEnvironment(dialect: ISqlDialect): string | null {
    for (const name of dialect.connectionEnvironmentVariables) {
      const value = this.env[name];
      if (value) return value;
    }
    return null;
  }

  resolve(dialect: ISqlDialect, fromFlag: string | null): string | null {
    if (fromFlag) return fromFlag;
    return this.fromEnvironment(dialect);
  }
}
