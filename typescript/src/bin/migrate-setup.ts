#!/usr/bin/env node
// Idempotent migrate-setup — creates the migrates + migrate_logs tracking tables per dialect.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingProviderMsg, requireConnection, requireDialect, takeFlag } from '../cli.ts';
import { fillTemplate, loadMessage } from '../infrastructure/message-templates.ts';
import { loadHelp } from '../index.ts';

const [HELP_TEXT, unknownArgTpl, setupCompleteTpl] = await Promise.all([
  loadHelp('migrate-setup'),
  loadMessage('errors/unknown-arg'),
  loadMessage('setup-complete'),
]);

const parseArgs = (argv: string[]) => {
  const args: {
    provider: string | null;
    connection: string | null;
    migrationsPath: string | null;
    andUp: boolean;
  } = {
    provider: null,
    connection: null,
    migrationsPath: null,
    andUp: false,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === '-h' || a === '--help') {
      process.stderr.write(HELP_TEXT);
      process.exit(0);
    }
    if (a === '--and-up') {
      args.andUp = true;
      continue;
    }
    let taken;
    if ((taken = takeFlag(rest, i, a, '--provider'))) {
      args.provider = taken.value;
      i = taken.next;
    } else if ((taken = takeFlag(rest, i, a, '--connection'))) {
      args.connection = taken.value;
      i = taken.next;
    } else if (
      (taken = takeFlag(rest, i, a, '--migrations-path')) ||
      (taken = takeFlag(rest, i, a, '--migrate-path'))
    ) {
      args.migrationsPath = taken.value;
      i = taken.next;
    } else {
      process.stderr.write(fillTemplate(unknownArgTpl, { arg: a }));
      process.exit(2);
    }
  }
  return args;
};

const main = async () => {
  const args = parseArgs(process.argv);
  if (!args.provider) {
    process.stderr.write(missingProviderMsg);
    process.exit(2);
  }
  const dialect = requireDialect(args.provider);
  const connection = requireConnection(dialect, args.connection);

  const migrationsPath = args.migrationsPath ?? `./sql/${dialect.name}/migrations`;

  await dialect.prepareSetup(connection);

  const client = await dialect.createClient(connection);
  try {
    for (const stmt of [dialect.migratesDdl, dialect.migrateLogsDdl]) {
      await client.exec(stmt);
    }
    await mkdir(migrationsPath, { recursive: true });
    process.stdout.write(
      fillTemplate(setupCompleteTpl, {
        dialect: dialect.name,
        migrationsPath,
        createExample: `  migrate-create --provider ${dialect.name} --name add_users`,
        upExample: `  migrate-up --provider ${dialect.name} --connection ${connection}`,
      }),
    );
  } finally {
    await client.close();
  }

  if (args.andUp) {
    const upScript = pathResolve(dirname(fileURLToPath(import.meta.url)), 'migrate-up.js');
    const childArgs = [upScript, '--provider', dialect.name, '--connection', connection];
    if (args.migrationsPath) {
      childArgs.push('--migrations-path', args.migrationsPath);
    }
    const child = spawn(process.execPath, childArgs, { stdio: 'inherit' });
    const [code] = (await once(child, 'exit')) as [number | null];
    if (code !== 0) process.exit(code ?? 1);
  }
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
