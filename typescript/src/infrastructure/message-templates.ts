import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { templatesRoot } from './templates-root.ts';

export const fillTemplate = (text: string, vars: Record<string, string>): string => {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
};

export const loadMessage = async (
  relativePath: string,
  vars: Record<string, string> = {},
): Promise<string> => {
  const text = await readFile(
    join(templatesRoot(), 'messages', `${relativePath}.txt`),
    'utf8',
  );
  return fillTemplate(text, vars);
};

export const loadScaffold = async (
  name: 'up' | 'down',
  vars: Record<string, string>,
): Promise<string> => {
  const text = await readFile(join(templatesRoot(), 'scaffold', `${name}.sql`), 'utf8');
  return fillTemplate(text, vars);
};

export const supportedProviders = (names: readonly string[]): string => names.join('|');
