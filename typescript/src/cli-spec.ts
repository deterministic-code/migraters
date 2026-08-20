import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

export type MigrateVerb = 'setup' | 'up' | 'down' | 'create';

export type CliArg = {
  flag: string;
  placeholder?: string;
  required: boolean;
};

export type CliCommand = {
  verb: MigrateVerb;
  args: CliArg[];
};

export type CliSpec = {
  command: string;
  providers: string[];
  aliases: Record<string, string>;
  commands: CliCommand[];
};

const CLI_YAML = join(dirname(fileURLToPath(import.meta.url)), '..', 'cli.yaml');

export const cliSpec = parse(await readFile(CLI_YAML, 'utf8')) as CliSpec;

export const migrateCommand = (verb: MigrateVerb): string =>
  cliSpec.command.replace('{verb}', verb);

const providers = cliSpec.providers.join('|');

const argUsage = (arg: CliArg): string => {
  const ph = arg.placeholder === 'providers' ? providers : arg.placeholder;
  const body = ph ? `${arg.flag} <${ph}>` : arg.flag;
  return arg.required ? body : `[${body}]`;
};

export const usageLine = (verb: MigrateVerb): string => {
  const command = cliSpec.commands.find((c) => c.verb === verb);
  if (!command) throw new Error(`cli.yaml: missing command ${verb}`);
  return `Usage: ${migrateCommand(verb)} ${command.args.map(argUsage).join(' ')}`;
};

export const programUsageText = (): string =>
  `${cliSpec.commands.map((c) => usageLine(c.verb)).join('\n')}\n`;
