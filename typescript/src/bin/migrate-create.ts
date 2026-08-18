#!/usr/bin/env node
// Scaffolds a new <NNNN>_<name>_{up,down}.sql pair in the migrations directory. Numbering is max(1-4-digit prefix in dir)+1; legacy timestamp prefixes are ignored.

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { takeFlag } from "../cli.ts";
import { loadHelp, normalizeDialect } from "../index.ts";

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const SEQ_RE = /^(\d{1,4})_.*_up\.sql$/;

const HELP_TEXT = await loadHelp("migrate-create");

const parseArgs = (argv: string[]) => {
  const args: {
    provider: string | null;
    name: string | null;
    migrationsPath: string | null;
  } = { provider: null, name: null, migrationsPath: null };
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
    } else if ((taken = takeFlag(rest, i, a, "--name"))) {
      args.name = taken.value;
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

const nextSequence = async (dir: string): Promise<number> => {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      return 1;
    }
    throw err;
  }
  let max = 0;
  for (const name of entries) {
    const m = SEQ_RE.exec(name);
    if (!m) continue;
    const n = Number.parseInt(m[1] as string, 10);
    if (n > max) max = n;
  }
  return max + 1;
};

const pad4 = (n: number): string => String(n).padStart(4, "0");

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
  if (!args.name) {
    process.stderr.write("missing --name\n");
    process.exit(2);
  }
  if (!NAME_RE.test(args.name)) {
    process.stderr.write(
      `--name must be snake_case: lowercase letter then [a-z0-9_] (got "${args.name}")\n`,
    );
    process.exit(2);
  }

  const migrationsPath = args.migrationsPath ?? `./sql/${dialect}/migrations`;
  await mkdir(migrationsPath, { recursive: true });

  const seq = pad4(await nextSequence(migrationsPath));
  const upName = `${seq}_${args.name}_up.sql`;
  const downName = `${seq}_${args.name}_down.sql`;
  await writeFile(
    `${migrationsPath}/${upName}`,
    `-- TODO: write the up migration for "${args.name}"\n`,
  );
  await writeFile(
    `${migrationsPath}/${downName}`,
    `-- TODO: write the down migration for "${args.name}"\n`,
  );
  process.stdout.write(`Created: ${upName}\n`);
  process.stdout.write(`Created: ${downName}\n`);
};

main().catch((e: unknown) => {
  const err = e as Error;
  process.stderr.write(`${err?.stack ?? err?.message ?? String(e)}\n`);
  process.exit(1);
});
