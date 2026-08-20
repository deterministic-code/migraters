import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fillHelpTemplate, programUsageText, verbFromCommand } from './cli-contract.ts';
import { templatesRoot } from './infrastructure/templates-root.ts';

export const loadHelp = async (command: string): Promise<string> => {
  const verb = verbFromCommand(command);
  const text = await readFile(join(templatesRoot(), 'help', `${verb}.txt`), 'utf8');
  return fillHelpTemplate(text, command);
};

export const loadProgramUsage = async (): Promise<string> => programUsageText();
