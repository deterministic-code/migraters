import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateCommand, usageLine, type MigrateVerb } from './cli-spec.ts';
import { packageRootFromModule } from './repo.ts';

const fillTemplate = (text: string, vars: Record<string, string>): string => {
  let out = text;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  return out;
};

const verbFromCommand = (command: string): MigrateVerb => {
  const verb = command.replace(/^migrate-/, '');
  if (
    verb !== 'init' &&
    verb !== 'setup' &&
    verb !== 'up' &&
    verb !== 'down' &&
    verb !== 'create'
  ) {
    throw new Error(`Unknown migrate command "${command}"`);
  }
  return verb;
};

const templatesRoot = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  const normalized = here.replaceAll('\\', '/');
  if (normalized.endsWith('/orchestrator/dist')) {
    return join(packageRootFromModule(import.meta.url), 'shared', 'templates');
  }
  return join(here, '..', '..', 'shared', 'templates');
};

export const loadHelp = async (command: string): Promise<string> => {
  const verb = verbFromCommand(command);
  const text = await readFile(join(templatesRoot(), 'help', `${verb}.txt`), 'utf8');
  return fillTemplate(text, { command: migrateCommand(verb), usage: usageLine(verb) });
};
