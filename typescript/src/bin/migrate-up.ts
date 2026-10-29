#!/usr/bin/env node
// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

import { resolve } from 'node:path';
import {
  DEFAULT_BATCH_SEPARATOR,
  missingProviderMsg,
  requireBatchSeparator,
  requireConnection,
  requireDialect,
  takeFlag,
} from '../cli.ts';
import { fillTemplate, loadMessage } from '../infrastructure/message-templates.ts';
import { loadHelp, Migrater } from '../index.ts';

const [HELP_TEXT, unknownArgTpl, noPendingMsg, noMorePendingMsg, appliedTpl] = await Promise.all([
  loadHelp('migrate-up'),
  loadMessage('errors/unknown-arg'),
  loadMessage('status/no-pending'),
  loadMessage('status/no-more-pending'),
  loadMessage('status/applied'),
]);

const parseArgs = (argv: string[]) => {
  const args: {
    provider: string | null;
    migratePath: string | null;
    migrateRoot: string | null;
    connection: string | null;
    one: boolean;
    batchSeparator: string;
  } = {
    provider: null,
    migratePath: null,
    migrateRoot: null,
    connection: null,
    one: false,
    batchSeparator: DEFAULT_BATCH_SEPARATOR,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === '-h' || a === '--help') {
      process.stderr.write(HELP_TEXT);
      process.exit(0);
    }
    if (a === '--one') {
      args.one = true;
      continue;
    }
    let taken;
    if ((taken = takeFlag(rest, i, a, '--provider'))) {
      args.provider = taken.value;
      i = taken.next;
    } else if (
      (taken = takeFlag(rest, i, a, '--migrations-path')) ||
      (taken = takeFlag(rest, i, a, '--migrate-path'))
    ) {
      args.migratePath = taken.value;
      i = taken.next;
    } else if (
      (taken = takeFlag(rest, i, a, '--migrations-root')) ||
      (taken = takeFlag(rest, i, a, '--migrate-root'))
    ) {
      args.migrateRoot = taken.value;
      i = taken.next;
    } else if ((taken = takeFlag(rest, i, a, '--connection'))) {
      args.connection = taken.value;
      i = taken.next;
    } else if ((taken = takeFlag(rest, i, a, '--batch-separator'))) {
      args.batchSeparator = requireBatchSeparator(taken.value);
      i = taken.next;
    } else {
      process.stderr.write(fillTemplate(unknownArgTpl, { arg: a }));
      process.exit(2);
    }
  }
  return args;
};

const resolveMigratePath = (
  args: { migratePath: string | null; migrateRoot: string | null },
  dialect: string,
): string => {
  if (args.migratePath) return args.migratePath;
  const root = args.migrateRoot ?? 'sql';
  return `${root}/${dialect}/migrations`;
};

const main = async () => {
  const args = parseArgs(process.argv);
  if (!args.provider) {
    process.stderr.write(missingProviderMsg);
    process.exit(2);
  }
  const dialect = requireDialect(args.provider);
  const connection = requireConnection(dialect, args.connection);

  const missing = await dialect.prerequisiteError(connection);
  if (missing !== null) {
    process.stderr.write(`${missing}\n`);
    process.exit(2);
  }

  const migratePath = resolve(resolveMigratePath(args, dialect.name));
  const names = await new Migrater(dialect, args.batchSeparator).up({
    connection,
    migrationsPath: migratePath,
    one: args.one,
  });
  if (names.length === 0) {
    process.stdout.write(noPendingMsg);
    return;
  }
  for (const name of names) process.stdout.write(fillTemplate(appliedTpl, { name }));
  if (!args.one) process.stdout.write(noMorePendingMsg);
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
