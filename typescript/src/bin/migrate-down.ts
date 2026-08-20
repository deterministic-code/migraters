#!/usr/bin/env node
// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase confirmation token and refuses to proceed unless the user types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the interactive prompt (CI / scripted use).

import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { missingProviderMsg, requireConnection, requireDialect, takeFlag } from '../cli.ts';
import { fillTemplate, loadMessage } from '../infrastructure/message-templates.ts';
import { discoverMigrations, loadHelp, runDown } from '../index.ts';

const [
  HELP_TEXT,
  unknownArgTpl,
  destructiveHeaderTpl,
  confirmMismatchTpl,
  confirmTtyRequiredTpl,
  confirmPromptTpl,
  confirmTokenMismatchMsg,
  noRollbackMsg,
  rolledBackTpl,
] = await Promise.all([
  loadHelp('migrate-down'),
  loadMessage('errors/unknown-arg'),
  loadMessage('down/destructive-header'),
  loadMessage('down/confirm-mismatch'),
  loadMessage('down/confirm-tty-required'),
  loadMessage('down/confirm-prompt'),
  loadMessage('down/confirm-token-mismatch'),
  loadMessage('status/no-rollback'),
  loadMessage('status/rolled-back'),
]);

const parseArgs = (argv: string[]) => {
  const args: {
    provider: string | null;
    migratePath: string | null;
    migrateRoot: string | null;
    connection: string | null;
    confirm: string | null;
  } = {
    provider: null,
    migratePath: null,
    migrateRoot: null,
    connection: null,
    confirm: null,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === '-h' || a === '--help') {
      process.stderr.write(HELP_TEXT);
      process.exit(0);
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
    } else if ((taken = takeFlag(rest, i, a, '--confirm'))) {
      args.confirm = taken.value;
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

const randomToken = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const buf = new Uint8Array(4);
  globalThis.crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[(buf[i] as number) % alphabet.length];
  return out;
};

const promptConfirmation = async (token: string): Promise<boolean> => {
  if (!process.stdin.isTTY) {
    process.stderr.write(fillTemplate(confirmTtyRequiredTpl, { token }));
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(fillTemplate(confirmPromptTpl, { token }));
    return answer.trim() === token;
  } finally {
    rl.close();
  }
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

  const token = randomToken();
  process.stderr.write(
    fillTemplate(destructiveHeaderTpl, { dialect: dialect.name, token }),
  );

  if (args.confirm !== null) {
    if (args.confirm !== token) {
      process.stderr.write(
        fillTemplate(confirmMismatchTpl, { supplied: args.confirm, token }),
      );
      process.exit(2);
    }
  } else {
    const ok = await promptConfirmation(token);
    if (!ok) {
      process.stderr.write(confirmTokenMismatchMsg);
      process.exit(2);
    }
  }

  const migratePath = resolve(resolveMigratePath(args, dialect.name));
  const client = await dialect.createClient(connection);
  try {
    const migrations = await discoverMigrations({
      migratePath,
      dialect: dialect.name,
    });
    const r = await runDown({ client, migrations });
    if (!r.rolledBack) process.stdout.write(noRollbackMsg);
    else process.stdout.write(fillTemplate(rolledBackTpl, { name: r.name ?? '' }));
  } finally {
    await client.close();
  }
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
