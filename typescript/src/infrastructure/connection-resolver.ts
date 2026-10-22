import { cliSpec } from '../cli-spec.ts';

export class ConnectionResolver {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  fromEnvironment(provider: string): string | null {
    for (const name of cliSpec.connection_environment[provider] ?? []) {
      const value = this.env[name];
      if (value) return value;
    }
    return null;
  }

  resolve(provider: string, fromFlag: string | null): string | null {
    if (fromFlag) return fromFlag;
    return this.fromEnvironment(provider);
  }
}
