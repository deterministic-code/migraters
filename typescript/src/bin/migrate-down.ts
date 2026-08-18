#!/usr/bin/env node
// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase confirmation token and refuses to proceed unless the user types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the interactive prompt (CI / scripted use).

import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { requireConnection, requireDialect, takeFlag } from "../cli.ts";
import { discoverMigrations, loadHelp, runDown } from "../index.ts";

const HELP_TEXT = await loadHelp("migrate-down");

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
    if (a === "-h" || a === "--help") {
      process.stderr.write(HELP_TEXT);
      process.exit(0);
    }
    let taken;
    if ((taken = takeFlag(rest, i, a, "--provider"))) {
      args.provider = taken.value;
      i = taken.next;
    } else if (
      (taken = takeFlag(rest, i, a, "--migrations-path")) ||
      (taken = takeFlag(rest, i, a, "--migrate-path"))
    ) {
      args.migratePath = taken.value;
      i = taken.next;
    } else if (
      (taken = takeFlag(rest, i, a, "--migrations-root")) ||
      (taken = takeFlag(rest, i, a, "--migrate-root"))
    ) {
      args.migrateRoot = taken.value;
      i = taken.next;
    } else if ((taken = takeFlag(rest, i, a, "--connection"))) {
      args.connection = taken.value;
      i = taken.next;
    } else if ((taken = takeFlag(rest, i, a, "--confirm"))) {
      args.confirm = taken.value;
      i = taken.next;
    } else {
      process.stderr.write(`unknown arg: ${a}\n`);
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
  const root = args.migrateRoot ?? "sql";
  return `${root}/${dialect}/migrations`;
};

const randomToken = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const buf = new Uint8Array(4);
  globalThis.crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[(buf[i] as number) % alphabet.length];
  return out;
};

const promptConfirmation = async (token: string): Promise<boolean> => {
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `migrate-down requires interactive confirmation when stdin is not a TTY — pass --confirm ${token} (this exact token, printed above) to proceed.\n`,
    );
    process.exit(2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`Type ${token} to confirm rollback: `);
    return answer.trim() === token;
  } finally {
    rl.close();
  }
};

const main = async () => {
  const args = parseArgs(process.argv);
  if (!args.provider) {
    process.stderr.write("missing --provider\n");
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
    `\n⚠ DESTRUCTIVE: this rolls back the most recently applied migration on ${dialect.name}.\n` +
      `  Confirmation token: ${token}\n\n`,
  );

  if (args.confirm !== null) {
    if (args.confirm !== token) {
      process.stderr.write(
        `--confirm value (${args.confirm}) does not match the token printed above (${token}). Aborting.\n`,
      );
      process.exit(2);
    }
  } else {
    const ok = await promptConfirmation(token);
    if (!ok) {
      process.stderr.write("Confirmation token did not match — aborting.\n");
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
    if (!r.rolledBack)
      process.stdout.write("No applied migrations to roll back.\n");
    else process.stdout.write(`Rolled back: ${r.name}\n`);
  } finally {
    await client.close();
  }
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
