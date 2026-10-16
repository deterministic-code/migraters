import { describe, expect, it } from 'vitest';
import { loadSelectedPackages, resolveInitDialects } from './init-select.ts';

describe('init dialect selection', () => {
  it('accepts aliases and keeps cli.yaml order', () => {
    expect(resolveInitDialects(['ora', 'pg'], false)).toEqual(['postgres', 'oracle']);
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
});
