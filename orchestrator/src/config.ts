import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stringify, parse } from 'yaml';
import { binDirFor, normalizeLanguage, type Language } from './languages.ts';
import { providerEntries, type ProviderEntry } from './provider-location.ts';

export const CONFIG_NAME = '.migraters.yaml';

export type MigratersConfig = {
  language: Language;
  providers: ProviderEntry[];
  binDir: string;
};

export const configPath = (dir: string): string => join(dir, CONFIG_NAME);

export const renderConfig = (language: Language, dialects: string[]): string =>
  stringify({
    language,
    providers: providerEntries(language, dialects),
    binDir: binDirFor(language),
  });

export const writeConfig = async (
  dir: string,
  language: Language,
  dialects: string[],
): Promise<string> => {
  const path = configPath(dir);
  await writeFile(path, renderConfig(language, dialects));
  return path;
};

export const parseConfig = (raw: string): MigratersConfig => {
  const doc = parse(raw) as {
    language?: string;
    providers?: unknown;
    dialects?: unknown;
    binDir?: string;
  } | null;
  if (!doc || typeof doc.language !== 'string') {
    throw new Error(`${CONFIG_NAME} is missing a valid language`);
  }
  const language = normalizeLanguage(doc.language);
  if (!language) {
    throw new Error(`${CONFIG_NAME} is missing a valid language`);
  }
  const providers = parseProviders(doc);
  const binDir = typeof doc.binDir === 'string' && doc.binDir.length > 0 ? doc.binDir : binDirFor(language);
  return { language, providers, binDir };
};

const parseProviders = (doc: {
  providers?: unknown;
  dialects?: unknown;
}): ProviderEntry[] => {
  if (Array.isArray(doc.providers)) {
    return doc.providers.map((item) => {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as ProviderEntry).name === 'string' &&
        typeof (item as ProviderEntry).location === 'string'
      ) {
        return { name: (item as ProviderEntry).name, location: (item as ProviderEntry).location };
      }
      throw new Error(`${CONFIG_NAME} is missing a providers list`);
    });
  }
  throw new Error(`${CONFIG_NAME} is missing a providers list`);
};

export const findConfigPath = (start: string, fallbackRoot?: string): string | undefined => {
  let dir = start;
  while (true) {
    const candidate = join(dir, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (fallbackRoot) {
    const candidate = join(fallbackRoot, CONFIG_NAME);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
};

export const loadConfigFile = async (path: string): Promise<MigratersConfig> =>
  parseConfig(await readFile(path, 'utf8'));
