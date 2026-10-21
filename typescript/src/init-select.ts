import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { cliSpec } from './cli-spec.ts';

export type SelectedDialects = {
  names: string[];
  packages: { name: string }[];
  allDriverPackages: string[];
};

const stripKey = (raw: string): string => raw.replace(/[\s_-]/g, '').toLowerCase();

export const normalizeInitProvider = (raw: string): string | undefined => {
  const key = stripKey(raw);
  const direct = cliSpec.providers.find((p) => stripKey(p) === key);
  if (direct) return direct;
  return cliSpec.provider_aliases[key];
};

export const resolveInitDialects = (raw: string[], all: boolean): string[] => {
  if (all) return [...cliSpec.providers];
  if (raw.length === 0) {
    throw new Error('pass --dialect <provider> at least once, or --all');
  }
  const selected = new Set<string>();
  for (const value of raw) {
    const name = normalizeInitProvider(value);
    if (!name) {
      throw new Error(`unsupported provider: ${value}`);
    }
    selected.add(name);
  }
  return cliSpec.providers.filter((name) => selected.has(name));
};

export type BundlePackage = {
  name: string;
  version?: string;
};

type BundleDialect = {
  packages?: BundlePackage[];
};

type BundleDoc = {
  languages?: Record<string, { dialects?: Record<string, BundleDialect> }>;
};

export const bundleYamlPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'bundle.yaml'),
    join(here, '..', '..', 'bundle.yaml'),
    join(process.cwd(), 'bundle.yaml'),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('bundle.yaml not found');
  }
  return found;
};

export const loadSelectedPackages = async (
  dialects: string[],
  language = 'typescript',
): Promise<SelectedDialects> => {
  const raw = parse(await readFile(bundleYamlPath(), 'utf8')) as BundleDoc;
  const byName = raw.languages?.[language]?.dialects ?? {};
  const allDriverPackages = [
    ...new Set(Object.values(byName).flatMap((d) => (d.packages ?? []).map((p) => p.name))),
  ];
  const packages = dialects.flatMap((name) => byName[name]?.packages ?? []);
  return { names: dialects, packages, allDriverPackages };
};
