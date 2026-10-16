import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { cliSpec } from '../src/cli-spec.ts';
import { migrateCommand, type MigrateVerb } from '../src/cli-contract.ts';
import { checksum } from '../src/datasource-migrate.ts';
import { defaultDialectFactory } from '../src/infrastructure/default-factory.ts';

const MIGRATERS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROOF_YAML = join(MIGRATERS, 'proof.yaml');

type Lang = 'typescript' | 'rust' | 'csharp';

type Proc = { lang: Lang; file: string; prefix: string[] };

type ExpectedColumn = { name: string; type: string };

type ProviderSpec = {
  admin_connection?: string;
  connection: string;
  database?: string;
  prepare?: string[];
  up: string;
  down: string;
  schema_query: string;
  catalog_query: string;
  expected: ExpectedColumn[];
};

type ProofSpec = {
  migration: string;
  languages: Lang[];
  providers: Record<string, ProviderSpec>;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const hostPath = async (dir: string, name: string): Promise<string | undefined> => {
  const win = join(dir, `${name}.exe`);
  if (await exists(win)) return win;
  const unix = join(dir, name);
  if (await exists(unix)) return unix;
  return undefined;
};

const discover = async (): Promise<Proc[]> => {
  const out: Proc[] = [];
  const ts = join(MIGRATERS, 'typescript', 'dist', 'bin', 'migrate-setup.js');
  if (await exists(ts)) {
    out.push({
      lang: 'typescript',
      file: process.execPath,
      prefix: [join(MIGRATERS, 'typescript', 'dist', 'bin')],
    });
  }
  const rustDirs = [join(MIGRATERS, 'rust', 'target', 'debug')];
  if (process.env.CARGO_TARGET_DIR) {
    rustDirs.unshift(join(process.env.CARGO_TARGET_DIR, 'debug'));
  }
  for (const dir of rustDirs) {
    const rust = await hostPath(dir, 'migrate-setup');
    if (rust) {
      out.push({ lang: 'rust', file: dir, prefix: [] });
      break;
    }
  }
  const cs = await hostPath(join(MIGRATERS, 'csharp', 'bin', 'Debug', 'net9.0'), 'migrate-setup');
  if (cs) {
    out.push({
      lang: 'csharp',
      file: join(MIGRATERS, 'csharp', 'bin', 'Debug', 'net9.0'),
      prefix: [],
    });
  }
  return out;
};

const binFor = (proc: Proc, verb: MigrateVerb): { cmd: string; argv0: string[] } => {
  const name = migrateCommand(verb);
  if (proc.lang === 'typescript') {
    return { cmd: proc.file, argv0: [join(proc.prefix[0] as string, `${name}.js`)] };
  }
  return { cmd: join(proc.file, name), argv0: [] };
};

const isolatedEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  for (const name of [
    'SQLITE_PATH',
    'DB_PATH',
    'DATABASE_URL',
    'PG_CONNECTION_STRING',
    'MYSQL_URL',
    'MSSQL_URL',
    'ORACLE_CONNECT_STRING',
    'MIGRATE_ALLOW_CHECKSUM_DRIFT',
  ]) {
    delete env[name];
  }
  const instant = join(MIGRATERS, 'proof', '.instantclient');
  if (existsSync(instant)) {
    const key = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
    env[key] = env[key] ? `${instant}:${env[key]}` : instant;
  }
  return env;
};

const run = async (
  proc: Proc,
  verb: MigrateVerb,
  args: string[],
): Promise<{ code: number; stderr: string; stdout: string }> => {
  const { cmd, argv0 } = binFor(proc, verb);
  const child = spawn(cmd, [...argv0, ...args], {
    env: isolatedEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  const [code] = (await once(child, 'exit')) as [number | null];
  return { code: code ?? 1, stderr, stdout };
};

const fill = (template: string, vars: Record<string, string>): string =>
  template.replace(/\{([a-z]+)\}/g, (all, key: string) => vars[key] ?? all);

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isTransient = (e: unknown): boolean => {
  const m = e instanceof Error ? `${e.message}\n${e.cause ?? ''}` : String(e);
  return /ECONNREFUSED|ETIMEDOUT|ECONNRESET|EPIPE|connect ECONN|timeout|not ready|is starting/i.test(
    m,
  );
};

const withRetry = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  let last: unknown;
  for (let i = 0; i < 8; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === 7) break;
      await sleep(250);
    }
  }
  throw new Error(`${label}: ${last instanceof Error ? last.message : String(last)}`);
};

const column = (row: Record<string, unknown>): ExpectedColumn => ({
  name: String(row.name ?? row.NAME),
  type: String(row.type ?? row.TYPE),
});

const catalog = (row: Record<string, unknown>): { name: string; checksum: string } => ({
  name: String(row.name ?? row.NAME),
  checksum: String(row.checksum ?? row.CHECKSUM),
});

const spec = parse(await readFile(PROOF_YAML, 'utf8')) as ProofSpec;
const procs = await discover();

describe('proof e2e', () => {
  it('requires every language CLI and every provider', () => {
    expect(procs.map((p) => p.lang).sort()).toEqual([...spec.languages].sort());
    expect(Object.keys(spec.providers).sort()).toEqual([...cliSpec.providers].sort());
  });

  for (const proc of procs) {
    for (const [provider, raw] of Object.entries(spec.providers)) {
      it(`${proc.lang} ${provider}`, async () => {
        const workdir = await mkdtemp(join(tmpdir(), `migraters-proof-${proc.lang}-${provider}-`));
        const vars: Record<string, string> = { language: proc.lang, workdir };
        if (raw.database) vars.database = fill(raw.database, vars);
        const connection = fill(raw.connection, vars);
        const migrations = join(workdir, 'migrations');
        await mkdir(migrations, { recursive: true });
        await writeFile(join(migrations, `${spec.migration}_up.sql`), raw.up);
        await writeFile(join(migrations, `${spec.migration}_down.sql`), raw.down);

        if (raw.admin_connection && raw.prepare) {
          const admin = fill(raw.admin_connection, vars);
          const dialect = defaultDialectFactory.get(provider);
          await withRetry(`${proc.lang} ${provider} admin`, async () => {
            const client = await dialect.createClient(admin);
            try {
              for (const sql of raw.prepare ?? []) {
                await client.exec(fill(sql, vars));
              }
            } finally {
              await client.close();
            }
          });
        }

        const flags = [
          '--provider',
          provider,
          '--connection',
          connection,
          '--migrations-path',
          migrations,
        ];
        const setup = await run(proc, 'setup', flags);
        expect(setup.code, `${proc.lang} ${provider} setup\n${setup.stderr}`).toBe(0);
        const up = await run(proc, 'up', flags);
        expect(up.code, `${proc.lang} ${provider} up\n${up.stderr}`).toBe(0);

        const dialect = defaultDialectFactory.get(provider);
        const client = await dialect.createClient(connection);
        try {
          const schema = (await client.query(raw.schema_query)).map((row) =>
            column(row as Record<string, unknown>),
          );
          expect(schema, `${proc.lang} ${provider} schema`).toEqual(raw.expected);
          const applied = (await client.query(raw.catalog_query)).map((row) =>
            catalog(row as Record<string, unknown>),
          );
          expect(applied, `${proc.lang} ${provider} migrates`).toEqual([
            { name: spec.migration, checksum: checksum(raw.up) },
          ]);
        } finally {
          await client.close();
        }
      });
    }
  }
});
