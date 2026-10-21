import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { cliSpec } from '../src/cli-spec.ts';
import { defaultDialectFactory } from '../src/infrastructure/default-factory.ts';
import { normalizeDialect } from '../src/sql.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

type ApiSpec = { interface: string; methods: string[]; providers: string[] };
type DriverSpec = { interface: string; methods: string[] };

const api = parse(await readFile(join(ROOT, 'api.yaml'), 'utf8')) as ApiSpec;
const driver = parse(await readFile(join(ROOT, 'driver.yaml'), 'utf8')) as DriverSpec;

describe('provider registry matches cli.yaml and api.yaml', () => {
  it('registers every api.yaml provider', () => {
    expect(cliSpec.providers).toEqual(api.providers);
    for (const name of defaultDialectFactory.all().map((d) => d.name)) {
      expect(api.providers).toContain(name);
    }
  });

  it('resolves every provider alias', () => {
    for (const [alias, canonical] of Object.entries(cliSpec.provider_aliases)) {
      expect(normalizeDialect(alias)).toBe(canonical);
      if (defaultDialectFactory.tryGet(canonical)) {
        expect(defaultDialectFactory.get(alias).name).toBe(canonical);
      }
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

  it('names IMigrater and its methods', () => {
    expect(api.interface).toBe('IMigrater');
    expect(api.methods).toEqual(['setup', 'up', 'down', 'create']);
  });

  it('names MigrationDriver and its methods', () => {
    expect(driver.interface).toBe('MigrationDriver');
    expect(driver.methods).toEqual([
      'setup',
      'applied',
      'migrateUp',
      'migrateDown',
      'logStarted',
      'logFinished',
      'close',
    ]);
  });
});
