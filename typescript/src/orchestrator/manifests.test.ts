import { describe, expect, it } from 'vitest';
import { cargoDefaultFeaturesLine, renderDialectsProps, setCargoDefaultFeatures } from './manifests.ts';

describe('init manifests', () => {
  it('renders dialects.props with only selected PackageReferences', () => {
    const props = renderDialectsProps(
      ['sqlite', 'sqlserver'],
      [
        { name: 'Microsoft.Data.Sqlite', version: '9.0.0' },
        { name: 'Microsoft.Data.SqlClient', version: '6.0.2' },
      ],
    );
    expect(props).toContain('<DialectSqlite>true</DialectSqlite>');
    expect(props).toContain('<DialectPostgres>false</DialectPostgres>');
    expect(props).toContain('<PackageReference Include="Microsoft.Data.Sqlite" Version="9.0.0" />');
    expect(props).toContain(
      '<PackageReference Include="Microsoft.Data.SqlClient" Version="6.0.2" />',
    );
    expect(props).not.toContain('Npgsql');
  });

  it('rewrites Cargo.toml default features to the selected dialects', () => {
    const next = setCargoDefaultFeatures(
      '[features]\ndefault = ["sqlite", "postgres", "mysql"]\n',
      ['sqlite', 'sqlserver'],
    );
    expect(next).toBe(`[features]\n${cargoDefaultFeaturesLine(['sqlite', 'sqlserver'])}\n`);
  });
});
