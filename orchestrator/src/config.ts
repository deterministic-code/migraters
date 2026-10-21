import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stringify, parse } from 'yaml';
import { binDirFor, normalizeLanguage, type Language } from './languages.ts';

export const CONFIG_NAME = '.migraters.yaml';

export type MigratersConfig = {
  language: Language;
  dialects: string[];
  binDir: string;
};

export const configPath = (dir: string): string => join(dir, CONFIG_NAME);

export const renderConfig = (language: Language, dialects: string[]): string =>
  stringify({
    language,
    dialects,
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
  const doc = parse(raw) as Partial<MigratersConfig> | null;
  const language = typeof doc?.language === 'string' ? normalizeLanguage(doc.language) : undefined;
  if (!language) {
    throw new Error(`${CONFIG_NAME} is missing a valid language`);
  }
  if (!Array.isArray(doc?.dialects) || doc.dialects.some((d) => typeof d !== 'string')) {
    throw new Error(`${CONFIG_NAME} is missing a dialects list`);
  }
  const binDir = typeof doc.binDir === 'string' && doc.binDir.length > 0 ? doc.binDir : binDirFor(language);
  return { language, dialects: doc.dialects, binDir };
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
