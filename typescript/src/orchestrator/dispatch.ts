import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { MigratersConfig } from './config.ts';
import { findConfigPath, loadConfigFile } from './config.ts';
import { repoRootFromModule } from './repo.ts';
import { runCommand } from './run.ts';

export type DispatchPlan = {
  command: string;
  args: string[];
};

const missingConfigMessage =
  'run migrate-init --language <typescript|csharp|rust> before migrate-setup, migrate-up, migrate-down, or migrate-create\n';

export const hostName = (verb: string, win32 = process.platform === 'win32'): string =>
  win32 ? `migrate-${verb}.exe` : `migrate-${verb}`;

export const implementationScript = (verb: string): string => `migrate-${verb}.js`;

export const planDispatch = (
  root: string,
  config: MigratersConfig,
  verb: string,
  argv: string[],
  execPath = process.execPath,
): DispatchPlan => {
  const binDir = join(root, config.binDir);
  if (config.language === 'typescript') {
    return {
      command: execPath,
      args: [join(binDir, implementationScript(verb)), ...argv],
    };
  }
  return {
    command: join(binDir, hostName(verb)),
    args: argv,
  };
};

export const runDispatch = async (verb: string, argv: string[], moduleUrl: string): Promise<void> => {
  const root = repoRootFromModule(moduleUrl);
  const path = findConfigPath(process.cwd(), root);
  if (!path) {
    process.stderr.write(missingConfigMessage);
    process.exit(2);
  }
  const config = await loadConfigFile(path);
  const plan = planDispatch(root, config, verb, argv);
  if (!existsSync(config.language === 'typescript' ? plan.args[0] : plan.command)) {
    process.stderr.write(missingConfigMessage);
    process.exit(2);
  }
  process.exit(runCommand(plan.command, plan.args, { cwd: process.cwd() }));
};
