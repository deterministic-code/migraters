#!/usr/bin/env node
// Rolls back the most recently applied migration (one step). DESTRUCTIVE: prints a random 4-letter uppercase confirmation token and refuses to proceed unless the user types it back on stdin. Pass --confirm <TOKEN> matching the printed token to bypass the interactive prompt (CI / scripted use).

import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { ENV_VARS_BY_DIALECT, resolveConn, sqliteFilesystemPath, takeFlag } from "../cli.ts";
import {
  createClient,
  discoverMigrations,
  loadHelp,
  normalizeDialect,
  pathExists,
  runDown,
} from "../index.ts";

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
  const dialect = normalizeDialect(args.provider);
  if (!dialect) {
    process.stderr.write(`unknown provider: ${args.provider}\n`);
    process.exit(2);
  }
  const connection = resolveConn(dialect, args.connection);
  if (!connection) {
    process.stderr.write(
      `missing --connection — pass --connection <url> (e.g. ./app.sqlite for sqlite) or set ${(ENV_VARS_BY_DIALECT[dialect] ?? []).join(" / ")}. Run with --help for examples.\n`,
    );
    process.exit(2);
  }

  if (dialect === "sqlite") {
    const path = sqliteFilesystemPath(connection);
    if (path !== null && !(await pathExists(path))) {
      process.stderr.write(
        `sqlite file: ${path} does not exist — run 'migrate-setup --provider sqlite --connection ${path}' to create it\n`,
      );
      process.exit(2);
    }
  }

  const token = randomToken();
  process.stderr.write(
    `\n⚠ DESTRUCTIVE: this rolls back the most recently applied migration on ${dialect}.\n` +
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

  const migratePath = resolve(resolveMigratePath(args, dialect));
  const client = await createClient({ provider: dialect, connection });
  try {
    const migrations = await discoverMigrations({ migratePath, dialect });
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
