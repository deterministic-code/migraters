import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { migrateCommand, type MigrateVerb } from '../src/cli-contract.ts';
import { loadHelp, loadProgramUsage } from '../src/help.ts';

const SPEC_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cli.yaml');
const HELP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'shared', 'templates', 'help');

type CliArg = { flag: string; placeholder?: string; required: boolean };
type CliSpec = {
  command: string;
  providers: string[];
  commands: { verb: MigrateVerb; args: CliArg[] }[];
};

const spec = parse(await readFile(SPEC_PATH, 'utf8')) as CliSpec;
const providers = spec.providers.join('|');

const usageLine = (verb: MigrateVerb): string => {
  const command = spec.commands.find((c) => c.verb === verb);
  if (!command) throw new Error(`missing ${verb}`);
  const args = command.args.map((arg) => {
    const ph = arg.placeholder === 'providers' ? providers : arg.placeholder;
    const body = ph ? `${arg.flag} <${ph}>` : arg.flag;
    return arg.required ? body : `[${body}]`;
  });
  return `Usage: ${spec.command.replace('{verb}', verb)} ${args.join(' ')}`;
};

describe('cli.yaml is the argv source of truth', () => {
  it('uses migrate-{verb} as the command token', () => {
    expect(spec.command).toBe('migrate-{verb}');
    for (const { verb } of spec.commands) {
      expect(migrateCommand(verb)).toBe(`migrate-${verb}`);
    }
  });

  it('fills help {{usage}} from cli.yaml', async () => {
    const usage = await loadProgramUsage();
    for (const { verb } of spec.commands) {
      const line = usageLine(verb);
      expect(usage).toContain(line);
      const help = await loadHelp(migrateCommand(verb));
      expect(help.split('\n')[0]).toBe(line);
      const raw = await readFile(join(HELP_ROOT, `${verb}.txt`), 'utf8');
      expect(raw.startsWith('{{usage}}\n')).toBe(true);
    }
  });
});
