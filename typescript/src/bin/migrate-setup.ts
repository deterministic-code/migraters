#!/usr/bin/env node
// Idempotent migrate-setup — creates the migrates + migrate_logs tracking tables per dialect.

import { missingProviderMsg, requireConnection, requireDialect, takeFlag } from '../cli.ts';
import { fillTemplate, loadMessage } from '../infrastructure/message-templates.ts';
import { loadHelp, Migrater } from '../index.ts';

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
  const migrater = new Migrater(dialect);
  await migrater.setup({ connection, migrationsPath });
  process.stdout.write(
    fillTemplate(setupCompleteTpl, {
      dialect: dialect.name,
      migrationsPath,
      createExample: `  migrate-create --provider ${dialect.name} --name add_users`,
      upExample: `  migrate-up --provider ${dialect.name} --connection ${connection}`,
    }),
  );

  if (args.andUp) {
    const names = await migrater.up({ connection, migrationsPath });
    const [noPendingMsg, noMorePendingMsg, appliedTpl] = await Promise.all([
      loadMessage('status/no-pending'),
      loadMessage('status/no-more-pending'),
      loadMessage('status/applied'),
    ]);
    if (names.length === 0) process.stdout.write(noPendingMsg);
    else {
      for (const name of names) process.stdout.write(fillTemplate(appliedTpl, { name }));
      process.stdout.write(noMorePendingMsg);
    }
  }
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
