#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { loadHelp } from '../help.ts';
import { loadSelectedPackages, resolveInitDialects } from '../init-select.ts';

const HELP_TEXT = await loadHelp('migrate-init');

const takeFlag = (
  rest: string[],
  i: number,
  arg: string,
  flag: string,
): { value: string; next: number } | undefined => {
  const eq = `${flag}=`;
  if (arg === flag) {
    const value = rest[i + 1];
    if (value === undefined) return undefined;
    return { value, next: i + 1 };
  }
  if (arg.startsWith(eq)) return { value: arg.slice(eq.length), next: i };
  return undefined;
};

const parseArgs = (argv: string[]) => {
  const dialects: string[] = [];
  let all = false;
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === '-h' || a === '--help') {
      process.stderr.write(HELP_TEXT);
      process.exit(0);
    }
    if (a === '--all') {
      all = true;
      continue;
    }
    const taken = takeFlag(rest, i, a, '--dialect');
    if (taken) {
      dialects.push(taken.value);
      i = taken.next;
      continue;
    }
    process.stderr.write(`unknown arg: ${a}\n`);
    process.exit(2);
  }
  return { dialects, all };
};

const npmFlags = ['--no-audit', '--no-fund', '--loglevel=error'];

const npm = (args: string[]): void => {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: process.cwd() });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const main = async () => {
  const args = parseArgs(process.argv);
  let names: string[];
  try {
    names = resolveInitDialects(args.dialects, args.all);
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  const selected = await loadSelectedPackages(names);
  const specs = selected.packages.map((p) => `${p.name}@${p.version}`);
  if (specs.length > 0) {
    npm(['install', ...npmFlags, ...specs]);
  }
  const remove = selected.allDriverPackages.filter(
    (name) => !selected.packages.some((p) => p.name === name),
  );
  if (remove.length > 0) {
    npm(['uninstall', ...npmFlags, ...remove]);
  }
  process.stdout.write(`Enabled dialects: ${selected.names.join(', ')}\n`);
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
