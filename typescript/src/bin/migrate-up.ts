#!/usr/bin/env node
// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

import { resolve } from "node:path";
import { requireConnection, requireDialect, takeFlag } from "../cli.ts";
import { discoverMigrations, loadHelp, runUp } from "../index.ts";

const HELP_TEXT = await loadHelp("migrate-up");

const parseArgs = (argv: string[]) => {
  const args: {
    provider: string | null;
    migratePath: string | null;
    migrateRoot: string | null;
    connection: string | null;
    one: boolean;
  } = {
    provider: null,
    migratePath: null,
    migrateRoot: null,
    connection: null,
    one: false,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (a === "-h" || a === "--help") {
      process.stderr.write(HELP_TEXT);
      process.exit(0);
    }
    if (a === "--one") {
      args.one = true;
      continue;
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

  const migratePath = resolve(resolveMigratePath(args, dialect.name));
  const client = await dialect.createClient(connection);
  try {
    const migrations = await discoverMigrations({
      migratePath,
      dialect: dialect.name,
    });
    let appliedCount = 0;
    for (;;) {
      const r = await runUp({ client, migrations });
      if (!r.applied) {
        if (appliedCount === 0)
          process.stdout.write("No pending migrations.\n");
        else process.stdout.write(`No more pending migrations.\n`);
        break;
      }
      process.stdout.write(`Applied: ${r.name}\n`);
      appliedCount++;
      if (args.one) break;
    }
  } finally {
    await client.close();
  }
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
