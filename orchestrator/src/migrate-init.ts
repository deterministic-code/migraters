#!/usr/bin/env node
import { loadHelp } from './help.ts';
import { parseInitArgv, resolveInitSelection } from './parse-init.ts';
import { packageRootFromModule } from './repo.ts';
import { runLanguageInit } from './run-init.ts';

const HELP_TEXT = await loadHelp('migrate-init');

const main = async () => {
  let parsed;
  try {
    parsed = parseInitArgv(process.argv.slice(2));
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  if (parsed.help) {
    process.stderr.write(HELP_TEXT);
    process.exit(0);
  }
  let selection;
  try {
    selection = resolveInitSelection(parsed);
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  const root = packageRootFromModule(import.meta.url);
  await runLanguageInit(root, selection.language, selection.dialects);
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
