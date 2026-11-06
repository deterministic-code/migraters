import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

import * as fs from 'node:fs';
import { bundleYamlPath, loadSelectedPackages, resolveInitDialects } from './init-select.ts';

describe('init dialect selection', () => {
  it('accepts aliases and keeps cli.yaml order', () => {
    expect(resolveInitDialects(['sqlite', 'ora', 'pg'], false)).toEqual([
      'sqlite',
      'postgres',
      'oracle',
    ]);
  });

  it('restores every provider for --all', () => {
    expect(resolveInitDialects([], true)).toEqual([
      'sqlite',
      'postgres',
      'mysql',
      'sqlserver',
      'oracle',
    ]);
  });

  it('reads typescript packages from bundle.yaml', async () => {
    const selected = await loadSelectedPackages(['sqlite', 'postgres']);
    expect(selected.packages.map((p) => p.name).sort()).toEqual(['better-sqlite3', 'pg']);
    expect(selected.allDriverPackages).toEqual(
      expect.arrayContaining(['better-sqlite3', 'pg', 'mysql2', 'mssql', 'oracledb']),
    );
  });

  it('reads csharp packages and versions from bundle.yaml', async () => {
    const selected = await loadSelectedPackages(['sqlite', 'sqlserver'], 'csharp');
    expect(selected.packages).toEqual([
      { name: 'Microsoft.Data.Sqlite', version: '10.0.14' },
      { name: 'Microsoft.Data.SqlClient', version: '6.0.2' },
    ]);
  });

  it('rejects an empty dialect list and an unknown provider', () => {
    expect(() => resolveInitDialects([], false)).toThrow(/pass --dialect/);
    expect(() => resolveInitDialects(['dbase'], false)).toThrow(/unsupported provider: dbase/);
  });

  it('returns an empty package list for rust dialects and unknown languages', async () => {
    const rust = await loadSelectedPackages(['sqlite'], 'rust');
    expect(rust.names).toEqual(['sqlite']);
    expect(rust.packages).toEqual([]);
    expect(rust.allDriverPackages).toEqual([]);
    const selected = await loadSelectedPackages(['sqlite'], 'nope');
    expect(selected.packages).toEqual([]);
    expect(selected.allDriverPackages).toEqual([]);
  });
});

describe('bundleYamlPath', () => {
  afterEach(() => {
    vi.mocked(fs.existsSync).mockRestore();
  });

  it('finds bundle.yaml in the repo and throws when every candidate is missing', () => {
    expect(fs.existsSync(bundleYamlPath())).toBe(true);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => bundleYamlPath()).toThrow(/bundle.yaml not found/);
  });
});
