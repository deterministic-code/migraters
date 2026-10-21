import type { BundlePackage } from '../init-select.ts';

const DIALECT_PROPERTIES: [string, string][] = [
  ['sqlite', 'DialectSqlite'],
  ['postgres', 'DialectPostgres'],
  ['mysql', 'DialectMysql'],
  ['sqlserver', 'DialectSqlserver'],
  ['oracle', 'DialectOracle'],
];

export const cargoDefaultFeaturesLine = (dialects: string[]): string =>
  `default = [${dialects.map((name) => `"${name}"`).join(', ')}]`;

export const setCargoDefaultFeatures = (cargoToml: string, dialects: string[]): string => {
  const replacement = cargoDefaultFeaturesLine(dialects);
  const lines = cargoToml.split('\n');
  let replaced = false;
  const out = lines.map((line) => {
    if (!replaced && line.trimStart().startsWith('default = [')) {
      replaced = true;
      const indent = line.slice(0, line.length - line.trimStart().length);
      return `${indent}${replacement}`;
    }
    return line;
  });
  if (!replaced) {
    throw new Error('Cargo.toml is missing a features default = [...] line');
  }
  return cargoToml.endsWith('\n') ? `${out.join('\n')}` : out.join('\n');
};

export const renderDialectsProps = (dialects: string[], packages: BundlePackage[]): string => {
  const set = new Set(dialects);
  const flags = DIALECT_PROPERTIES.map(([name, property]) => {
    const value = set.has(name) ? 'true' : 'false';
    return `    <${property}>${value}</${property}>`;
  });
  const refs = packages
    .filter((pkg) => pkg.version)
    .map((pkg) => `    <PackageReference Include="${pkg.name}" Version="${pkg.version}" />`);
  return [
    '<Project>',
    '  <PropertyGroup>',
    ...flags,
    '  </PropertyGroup>',
    '  <ItemGroup>',
    ...refs,
    '  </ItemGroup>',
    '</Project>',
    '',
  ].join('\n');
};
