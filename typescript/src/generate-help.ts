import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';

type HelpArg = {
  flag: string;
  placeholder?: string;
  required: boolean;
  help: string;
};

type HelpCommand = {
  verb: string;
  summary: string;
  examples: string;
  show_connection_env?: boolean;
  args: HelpArg[];
};

type HelpSpec = {
  providers: string[];
  connection_environment: Record<string, string[]>;
  commands: HelpCommand[];
};

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI_YAML = join(REPO_ROOT, 'cli.yaml');
const HELP_DIR = join(REPO_ROOT, 'shared', 'templates', 'help');

const requireString = (value: unknown, path: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`cli.yaml: ${path} must be a non-empty string`);
  }
  return value;
};

const parseHelpSpec = (raw: unknown): HelpSpec => {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('cli.yaml: root must be a mapping');
  }
  const doc = raw as Record<string, unknown>;
  if (!Array.isArray(doc.providers) || doc.providers.some((p) => typeof p !== 'string')) {
    throw new Error('cli.yaml: providers must be a string list');
  }
  const envRaw = doc.connection_environment;
  if (envRaw === null || typeof envRaw !== 'object' || Array.isArray(envRaw)) {
    throw new Error('cli.yaml: connection_environment must be a mapping');
  }
  const connection_environment: Record<string, string[]> = {};
  for (const [dialect, vars] of Object.entries(envRaw)) {
    if (!Array.isArray(vars) || vars.some((v) => typeof v !== 'string')) {
      throw new Error(`cli.yaml: connection_environment.${dialect} must be a string list`);
    }
    connection_environment[dialect] = vars;
  }
  if (!Array.isArray(doc.commands)) {
    throw new Error('cli.yaml: commands must be a list');
  }
  const commands = doc.commands.map((item, i) => {
    if (item === null || typeof item !== 'object') {
      throw new Error(`cli.yaml: commands[${i}] must be a mapping`);
    }
    const row = item as Record<string, unknown>;
    const verb = requireString(row.verb, `commands[${i}].verb`);
    if (!Array.isArray(row.args)) {
      throw new Error(`cli.yaml: commands.${verb}.args must be a list`);
    }
    return {
      verb,
      summary: requireString(row.summary, `commands.${verb}.summary`),
      examples: requireString(row.examples, `commands.${verb}.examples`),
      show_connection_env: row.show_connection_env === true,
      args: row.args.map((arg, j) => {
        if (arg === null || typeof arg !== 'object') {
          throw new Error(`cli.yaml: commands.${verb}.args[${j}] must be a mapping`);
        }
        const a = arg as Record<string, unknown>;
        return {
          flag: requireString(a.flag, `commands.${verb}.args[${j}].flag`),
          placeholder: typeof a.placeholder === 'string' ? a.placeholder : undefined,
          required: a.required === true,
          help: requireString(a.help, `commands.${verb}.args[${j}].help`),
        };
      }),
    };
  });
  return {
    providers: doc.providers as string[],
    connection_environment,
    commands,
  };
};

const wrapArgHelp = (flag: string, help: string, flagWidth: number): string => {
  const lines = help.replace(/\s+$/, '').split('\n');
  const indent = `  ${flag.padEnd(flagWidth)}  `;
  const cont = ' '.repeat(indent.length);
  return [indent + lines[0], ...lines.slice(1).map((line) => cont + line.trimStart())].join('\n');
};

const renderFlags = (args: HelpArg[]): string => {
  const flagWidth = Math.max(...args.map((a) => a.flag.length));
  return args.map((a) => wrapArgHelp(a.flag, a.help, flagWidth)).join('\n');
};

const renderConnectionEnv = (spec: HelpSpec): string => {
  const nameWidth = Math.max(...spec.providers.map((p) => p.length));
  const lines = spec.providers.map((name) => {
    const vars = spec.connection_environment[name];
    if (!vars) {
      throw new Error(`cli.yaml: connection_environment missing ${name}`);
    }
    return `  ${name.padEnd(nameWidth)}  ${vars.join(', ')}`;
  });
  return [
    'Per-dialect env vars consulted when --connection is omitted:',
    ...lines,
  ].join('\n');
};

const indentBlock = (text: string): string =>
  text
    .split('\n')
    .map((line) => (line.length === 0 ? '' : `  ${line}`))
    .join('\n');

export const renderHelpTemplate = (spec: HelpSpec, command: HelpCommand): string => {
  const parts = [
    '{{usage}}',
    '',
    command.summary.replace(/\s+$/, ''),
    '',
    renderFlags(command.args),
    '',
    'Examples:',
    indentBlock(command.examples.replace(/\s+$/, '')),
  ];
  if (command.show_connection_env) {
    parts.push('', renderConnectionEnv(spec));
  }
  return `${parts.join('\n')}\n`;
};

export const renderHelpTemplates = (raw: unknown): Record<string, string> => {
  const spec = parseHelpSpec(raw);
  return Object.fromEntries(spec.commands.map((c) => [c.verb, renderHelpTemplate(spec, c)]));
};

export const generateHelpFiles = async (): Promise<string[]> => {
  const files = renderHelpTemplates(parse(await readFile(CLI_YAML, 'utf8')));
  const written: string[] = [];
  for (const [verb, text] of Object.entries(files)) {
    const path = join(HELP_DIR, `${verb}.txt`);
    await writeFile(path, text);
    written.push(path);
  }
  return written;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const written = await generateHelpFiles();
  for (const path of written) {
    console.log(path);
  }
}
