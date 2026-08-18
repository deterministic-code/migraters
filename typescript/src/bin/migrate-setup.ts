#!/usr/bin/env node
// Idempotent migrate-setup — creates the migrates + migrate_logs tracking tables per dialect.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ENV_VARS_BY_DIALECT, resolveConn, sqliteFilesystemPath, takeFlag } from "../cli.ts";
import { createClient, loadHelp, normalizeDialect, setupSql } from "../index.ts";

const HELP_TEXT = await loadHelp("migrate-setup");

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
    if (a === "-h" || a === "--help") {
      process.stderr.write(HELP_TEXT);
      process.exit(0);
    }
    if (a === "--and-up") {
      args.andUp = true;
      continue;
    }
    let taken;
    if ((taken = takeFlag(rest, i, a, "--provider"))) {
      args.provider = taken.value;
      i = taken.next;
    } else if ((taken = takeFlag(rest, i, a, "--connection"))) {
      args.connection = taken.value;
      i = taken.next;
    } else if (
      (taken = takeFlag(rest, i, a, "--migrations-path")) ||
      (taken = takeFlag(rest, i, a, "--migrate-path"))
    ) {
      args.migrationsPath = taken.value;
      i = taken.next;
    } else {
      process.stderr.write(`unknown arg: ${a}\n`);
      process.exit(2);
    }
  }
  return args;
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

  const migrationsPath = args.migrationsPath ?? `./sql/${dialect}/migrations`;

  if (dialect === "sqlite") {
    const filePath = sqliteFilesystemPath(connection);
    if (filePath !== null) {
      await mkdir(dirname(filePath), { recursive: true });
    }
  }

  const client = await createClient({ provider: dialect, connection });
  try {
    for (const stmt of setupSql(dialect)) {
      await client.exec(stmt);
    }
    await mkdir(migrationsPath, { recursive: true });
    process.stdout.write(
      `Setup complete: migrates and migrate_logs ready (${dialect}).\n` +
        `Migrations directory: ${migrationsPath}\n`,
    );
    if (!args.andUp) {
      process.stdout.write(
        `\n` +
          `Next steps:\n` +
          `  # create a new migration\n` +
          `  migrate-create --provider ${dialect} --name add_users\n` +
          `\n` +
          `  # apply pending migrations\n` +
          `  migrate-up --provider ${dialect} --connection ${connection}\n`,
      );
    }
  } finally {
    await client.close();
  }

  if (args.andUp) {
    const upScript = pathResolve(
      dirname(fileURLToPath(import.meta.url)),
      "migrate-up.js",
    );
    const childArgs = [
      upScript,
      "--provider",
      dialect,
      "--connection",
      connection,
    ];
    if (args.migrationsPath) {
      childArgs.push("--migrations-path", args.migrationsPath);
    }
    const child = spawn(process.execPath, childArgs, { stdio: "inherit" });
    const [code] = (await once(child, "exit")) as [number | null];
    if (code !== 0) process.exit(code ?? 1);
  }
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
