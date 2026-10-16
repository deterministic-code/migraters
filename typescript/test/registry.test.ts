import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { cliSpec } from '../src/cli-spec.ts';
import { defaultDialectFactory } from '../src/infrastructure/default-factory.ts';
import { normalizeDialect } from '../src/sql.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

type ApiSpec = { operations: string[]; providers: string[] };

const api = parse(await readFile(join(ROOT, 'api.yaml'), 'utf8')) as ApiSpec;

describe('provider registry matches cli.yaml and api.yaml', () => {
  it('registers every api.yaml provider', () => {
    expect(defaultDialectFactory.all().map((d) => d.name)).toEqual(api.providers);
    expect(cliSpec.providers).toEqual(api.providers);
  });

  it('resolves every provider alias', () => {
    for (const [alias, canonical] of Object.entries(cliSpec.provider_aliases)) {
      expect(normalizeDialect(alias)).toBe(canonical);
      expect(defaultDialectFactory.get(alias).name).toBe(canonical);
    }
    expect(normalizeDialect('MS-SQL-Server')).toBe('sqlserver');
  });

  it('uses spec env-var order and separator', () => {
    for (const dialect of defaultDialectFactory.all()) {
      expect([...dialect.connectionEnvironmentVariables]).toEqual(
        cliSpec.connection_environment[dialect.name],
      );
      expect(dialect.connectionEnvironmentVariables.join(cliSpec.env_var_list_separator)).toBe(
        cliSpec.connection_environment[dialect.name].join(cliSpec.env_var_list_separator),
      );
    }
  });

  it('names the dialect operations', () => {
    expect(api.operations).toEqual([
      'name',
      'connectionEnvironment',
      'prerequisite',
      'prepareSetup',
      'open',
      'close',
      'setupBookkeeping',
      'applied',
      'apply',
      'rollback',
    ]);
  });
});
