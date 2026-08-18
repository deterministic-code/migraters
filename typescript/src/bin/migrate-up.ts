#!/usr/bin/env node
// Default: applies ALL pending migrations in sequence, each in its own transaction. Pass --one to apply only the next pending migration (legacy one-shot behavior; useful when wrapping in an external loop or when you want to inspect state between steps).

import { resolve } from "node:path";
import { ENV_VARS_BY_DIALECT, resolveConn, sqliteFilesystemPath, takeFlag } from "../cli.ts";
import {
  createClient,
  discoverMigrations,
  loadHelp,
  normalizeDialect,
  pathExists,
  runUp,
} from "../index.ts";

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

  const migratePath = resolve(resolveMigratePath(args, dialect));
  const client = await createClient({ provider: dialect, connection });
  try {
    const migrations = await discoverMigrations({ migratePath, dialect });
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
