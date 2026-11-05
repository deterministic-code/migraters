import { describe, expect, it } from 'vitest';
import { SqlDialectFactory } from '../abstractions/sql-dialect-factory.ts';
import {
  defaultDialectFactory,
  loadDialectModule,
  loadInstalledProviders,
} from './default-factory.ts';
import { parseProviders } from './migraters-config.ts';
import { SqliteProvider } from '../../providers/sqlite/src/sqlite-provider.ts';

describe('defaultDialectFactory', () => {
  it('registers every dialect name and alias', () => {
    const names = defaultDialectFactory.all().map((d) => d.name);
    for (const name of names) {
      expect(['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle']).toContain(name);
    }
    if (names.includes('sqlite')) {
      expect(defaultDialectFactory.get('sqlite3').name).toBe('sqlite');
    }
    if (names.includes('postgres')) {
      expect(defaultDialectFactory.get('postgresql').name).toBe('postgres');
    }
    if (names.includes('mysql')) {
      expect(defaultDialectFactory.get('mariadb').name).toBe('mysql');
    }
    if (names.includes('sqlserver')) {
      expect(defaultDialectFactory.get('mssql').name).toBe('sqlserver');
      expect(defaultDialectFactory.get('mssqlserver').name).toBe('sqlserver');
      expect(defaultDialectFactory.get('ms-sql-server').name).toBe('sqlserver');
    }
    if (names.includes('oracle')) {
      expect(defaultDialectFactory.get('ora').name).toBe('oracle');
    }
    expect(defaultDialectFactory.tryGet('nope')).toBeUndefined();
    expect(() => defaultDialectFactory.get('nope')).toThrow(/Unknown SQL dialect/);
    expect(new SqlDialectFactory([]).tryGet('sqlite')).toBeUndefined();
  });

  it('reads the providers list migrate-init writes', () => {
    expect(
      parseProviders(
        `language: typescript
providers:
  - name: sqlite
  - name: postgres
    location: typescript/providers/postgres/src/index.ts
binDir: typescript/dist/src/bin
`,
      ).map((p) => p.name),
    ).toEqual(['sqlite', 'postgres']);
    expect(parseProviders('language: rust\nproviders: []\nbinDir: rust/target/debug\n')).toEqual([]);
  });

  it('loads a dialect package through provider or createProvider', async () => {
    const viaProvider = await loadDialectModule('sqlite', async () => ({
      provider: () => new SqliteProvider(),
    }));
    expect(viaProvider.name).toBe('sqlite');
    const viaCreate = await loadDialectModule('sqlite', async () => ({
      createProvider: () => new SqliteProvider(),
    }));
    expect(viaCreate.name).toBe('sqlite');
    await expect(loadDialectModule('ghost', async () => ({}))).rejects.toThrow('ghost');
    await expect(loadDialectModule('sqlite')).resolves.toMatchObject({ name: 'sqlite' });
  });

  it('wraps unexpected load errors with the dialect name', async () => {
    await expect(
      loadInstalledProviders(async () => {
        throw new Error('network');
      }),
    ).rejects.toThrow('sqlite');
    await expect(
      loadInstalledProviders(async () => {
        throw 'boom';
      }),
    ).rejects.toThrow('sqlite');
    await expect(loadInstalledProviders(async () => ({}))).rejects.toThrow('sqlite');
  });
});
