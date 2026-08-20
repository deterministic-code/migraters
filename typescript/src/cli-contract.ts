export type { MigrateVerb } from './cli-spec.ts';
export { migrateCommand, usageLine, programUsageText } from './cli-spec.ts';
import { usageLine, type MigrateVerb } from './cli-spec.ts';
import { fillTemplate } from './infrastructure/message-templates.ts';

export const MIGRATE_VERBS = ['setup', 'up', 'down', 'create'] as const;

export const verbFromCommand = (command: string): MigrateVerb => {
  const verb = command.replace(/^migrate-/, '');
  if (verb !== 'setup' && verb !== 'up' && verb !== 'down' && verb !== 'create') {
    throw new Error(`Unknown migrate command "${command}"`);
  }
  return verb;
};

export const fillHelpTemplate = (text: string, command: string): string => {
  const usage = usageLine(verbFromCommand(command));
  return fillTemplate(text, { command, usage });
};
