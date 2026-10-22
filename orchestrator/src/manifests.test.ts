import { describe, expect, it } from 'vitest';
import {
  renderAttachedDialects,
  renderDialectsProps,
  setCargoDefaultFeatures,
  setCargoDialectDeps,
} from './manifests.ts';

describe('init manifests', () => {
  it('renders dialects.props with only selected dialect projects', () => {
    const props = renderDialectsProps(['sqlite', 'sqlserver']);
    expect(props).toContain('$(MSBuildThisFileDirectory)Providers/Sqlite/MigrateSqlite.csproj');
    expect(props).toContain('Providers/SqlServer/MigrateSqlServer.csproj');
    expect(props).not.toContain('MigratePostgres');
    expect(props).not.toContain('PackageReference');
  });

  it('rewrites Cargo.toml default features to the selected dialects', () => {
    const next = setCargoDefaultFeatures(
      '[features]\ndefault = ["sqlite", "postgres"]\n',
      ['sqlite'],
    );
    expect(next).toContain('default = ["sqlite"]');
    expect(next).not.toContain('postgres');
  });

  it('rewrites Cargo.toml path deps for selected dialect crates', () => {
    const next = setCargoDialectDeps(
      '[dependencies]\n# migrate-init-dialects-start\nmigraters-postgres = { path = "providers/postgres" }\n# migrate-init-dialects-end\n',
      ['sqlite'],
    );
    expect(next).toContain('migraters-sqlite = { path = "providers/sqlite" }');
    expect(next).not.toContain('migraters-postgres');
  });

  it('writes attached_dialects.rs uses for selected crates', () => {
    expect(renderAttachedDialects(['sqlite', 'sqlserver'])).toContain(
      'use migraters_sqlite as _;',
    );
    expect(renderAttachedDialects(['sqlite', 'sqlserver'])).toContain(
      'use migraters_sqlserver as _;',
    );
    expect(renderAttachedDialects(['sqlite'])).not.toContain('postgres');
  });
});
