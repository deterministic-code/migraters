import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { cliSpec } from '../src/cli-spec.ts';
import { migrateCommand, type MigrateVerb } from '../src/cli-contract.ts';
import { checksum } from '../src/datasource-migrate.ts';
import { defaultDialectFactory } from '../src/infrastructure/default-factory.ts';

const MIGRATERS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROOF_YAML = join(MIGRATERS, 'proof.yaml');
const REPORT_PATH = join(MIGRATERS, 'proof', 'report.md');
const DRIVER_PACKAGES = ['better-sqlite3', 'pg', 'mysql2', 'mssql', 'oracledb'] as const;
const SKIP_COPY_NAMES = new Set([
  'node_modules',
  'target',
  '.git',
  'obj',
  'coverage',
  '.instantclient',
  '.worktrees',
]);
const LAYOUTS = ['default', 'path', 'root'] as const;

type Lang = 'typescript' | 'rust' | 'csharp';
type Layout = (typeof LAYOUTS)[number];
type MigrateVerbOrInit = MigrateVerb;

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

type CommandRecord = {
  title: string;
  cwd: string;
  display: string;
  code: number;
  stdout: string;
  stderr: string;
};

type ProviderReport = {
  provider: string;
  layout: Layout;
  workdir: string;
  commands: CommandRecord[];
  schema?: ExpectedColumn[];
  catalog?: { name: string; checksum: string }[];
  error?: string;
};

type LanguageReport = {
  lang: Lang;
  project: string;
  commands: CommandRecord[];
  projectChecks: string[];
  providers: ProviderReport[];
  error?: string;
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
    'CARGO_TARGET_DIR',
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

const printConsole = (rec: CommandRecord): void => {
  process.stdout.write(`\n$ ${rec.display}\n`);
  process.stdout.write(`cwd: ${rec.cwd}\n`);
  if (rec.stdout.length > 0)
    process.stdout.write(rec.stdout.endsWith('\n') ? rec.stdout : `${rec.stdout}\n`);
  if (rec.stderr.length > 0)
    process.stdout.write(rec.stderr.endsWith('\n') ? rec.stderr : `${rec.stderr}\n`);
  process.stdout.write(`[exit ${rec.code}]\n`);
};

const run = async (
  cmd: string,
  args: string[],
  cwd: string,
  title: string,
): Promise<CommandRecord> => {
  const child = spawn(cmd, args, {
    cwd,
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
  const rec: CommandRecord = {
    title,
    cwd,
    display: [cmd, ...args].join(' '),
    code: code ?? 1,
    stdout,
    stderr,
  };
  printConsole(rec);
  return rec;
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

const shouldCopy = (src: string): boolean => {
  const rel = relative(MIGRATERS, src);
  if (rel === 'proof/report.md') return false;
  const parts = rel.split(sep);
  if (parts.some((part) => SKIP_COPY_NAMES.has(part))) return false;
  if (parts.includes('csharp') && parts.includes('bin')) return false;
  return true;
};

const copyProject = async (lang: Lang): Promise<string> => {
  const dest = await mkdtemp(join(tmpdir(), `migraters-e2e-${lang}-`));
  await cp(MIGRATERS, dest, { recursive: true, filter: shouldCopy });
  return dest;
};

const layoutFor = (index: number): Layout => LAYOUTS[index % LAYOUTS.length] as Layout;

const migrationsDir = (layout: Layout, provider: string): string => {
  if (layout === 'default') return `sql/${provider}/migrations`;
  if (layout === 'path') return `db/changes/${provider}`;
  return `db/changes/${provider}/migrations`;
};

const pathFlags = (layout: Layout, provider: string, verb: 'setup' | 'create' | 'up'): string[] => {
  if (layout === 'default') return [];
  if (layout === 'path') return ['--migrations-path', `db/changes/${provider}`];
  if (verb === 'up') return ['--migrations-root', 'db/changes'];
  return ['--migrations-path', `db/changes/${provider}/migrations`];
};

const binFor = (
  lang: Lang,
  project: string,
  verb: MigrateVerbOrInit,
): { cmd: string; argv0: string[] } => {
  const name = migrateCommand(verb);
  if (lang === 'typescript') {
    return {
      cmd: process.execPath,
      argv0: [join(project, 'typescript', 'dist', 'bin', `${name}.js`)],
    };
  }
  if (lang === 'rust') {
    const dir =
      verb === 'init'
        ? join(project, 'rust', 'init', 'target', 'debug')
        : join(project, 'rust', 'target', 'debug');
    return { cmd: join(dir, name), argv0: [] };
  }
  const dir =
    verb === 'init'
      ? join(project, 'csharp', 'MigrateInit', 'bin', 'Debug', 'net9.0')
      : join(project, 'csharp', 'bin', 'Debug', 'net9.0');
  return { cmd: join(dir, name), argv0: [] };
};

const runMigrate = async (
  lang: Lang,
  project: string,
  verb: MigrateVerbOrInit,
  args: string[],
  cwd: string,
): Promise<CommandRecord> => {
  const { cmd, argv0 } = binFor(lang, project, verb);
  return run(cmd, [...argv0, ...args], cwd, migrateCommand(verb));
};

const fence = (text: string): string => {
  const body = text.length === 0 ? '(empty)\n' : text.endsWith('\n') ? text : `${text}\n`;
  return `\`\`\`console\n${body}\`\`\``;
};

const renderCommand = (rec: CommandRecord): string =>
  [
    `#### ${rec.title}`,
    '',
    `- cwd: \`${rec.cwd}\``,
    `- command: \`${rec.display}\``,
    `- exit: ${rec.code}`,
    '',
    'stdout:',
    '',
    fence(rec.stdout),
    '',
    'stderr:',
    '',
    fence(rec.stderr),
    '',
  ].join('\n');

const renderReport = (languages: LanguageReport[]): string => {
  const parts = ['# Proof e2e', '', `Generated: ${new Date().toISOString()}`, ''];
  for (const lang of languages) {
    parts.push(`## ${lang.lang}`, '', `- project: \`${lang.project}\``, '');
    if (lang.error) parts.push(`Error: ${lang.error}`, '');
    for (const rec of lang.commands) parts.push(renderCommand(rec));
    parts.push('### Project created', '');
    for (const check of lang.projectChecks) parts.push(`- ${check}`);
    if (lang.projectChecks.length === 0) parts.push('- (none)');
    parts.push('');
    for (const provider of lang.providers) {
      parts.push(
        `### ${provider.provider} (${provider.layout})`,
        '',
        `- work directory: \`${provider.workdir}\``,
        `- path layout: ${provider.layout}`,
        '',
      );
      if (provider.error) parts.push(`Error: ${provider.error}`, '');
      for (const rec of provider.commands) parts.push(renderCommand(rec));
      if (provider.schema) {
        parts.push('#### schema', '', fence(JSON.stringify(provider.schema, null, 2)), '');
      }
      if (provider.catalog) {
        parts.push('#### catalog', '', fence(JSON.stringify(provider.catalog, null, 2)), '');
      }
    }
  }
  return parts.join('\n');
};

const checkProject = async (lang: Lang, project: string): Promise<string[]> => {
  if (lang === 'typescript') {
    const checks: string[] = [];
    for (const name of DRIVER_PACKAGES) {
      const present = await exists(join(project, 'node_modules', name));
      checks.push(`${name}: ${present ? 'present' : 'missing'} in project node_modules`);
    }
    return checks;
  }
  if (lang === 'rust') {
    const cargo = await readFile(join(project, 'rust', 'Cargo.toml'), 'utf8');
    const line = cargo.split('\n').find((row) => row.trim().startsWith('default = [')) ?? '';
    return [`Cargo.toml ${line.trim()}`];
  }
  const props = join(project, 'csharp', 'dialects.props');
  return [`dialects.props ${existsSync(props) ? 'present' : 'absent'}`];
};

const prepareLanguage = async (lang: Lang, section: LanguageReport): Promise<void> => {
  section.project = await copyProject(lang);
  if (lang === 'typescript') {
    const ts = join(section.project, 'typescript');
    section.commands.push(await run('npm', ['ci'], ts, 'npm ci'));
    expect(section.commands.at(-1)?.code, `${lang} npm ci`).toBe(0);
    section.commands.push(await run('npm', ['run', 'build'], ts, 'npm run build'));
    expect(section.commands.at(-1)?.code, `${lang} npm run build`).toBe(0);
    section.commands.push(
      await runMigrate(lang, section.project, 'init', ['--all'], section.project),
    );
    expect(section.commands.at(-1)?.code, `${lang} migrate-init --all`).toBe(0);
    for (const name of DRIVER_PACKAGES) {
      await rm(join(ts, 'node_modules', name), { recursive: true, force: true });
    }
    section.commands.push(
      await run(join(section.project, 'build'), [lang], section.project, `./build ${lang}`),
    );
    expect(section.commands.at(-1)?.code, `${lang} ./build`).toBe(0);
    return;
  }
  if (lang === 'rust') {
    section.commands.push(
      await run(
        'cargo',
        ['build', '--manifest-path', join(section.project, 'rust', 'init', 'Cargo.toml')],
        section.project,
        'cargo build migrate-init',
      ),
    );
    expect(section.commands.at(-1)?.code, `${lang} cargo build migrate-init`).toBe(0);
    section.commands.push(
      await runMigrate(lang, section.project, 'init', ['--all'], section.project),
    );
    expect(section.commands.at(-1)?.code, `${lang} migrate-init --all`).toBe(0);
    section.commands.push(
      await run(join(section.project, 'build'), [lang], section.project, `./build ${lang}`),
    );
    expect(section.commands.at(-1)?.code, `${lang} ./build`).toBe(0);
    return;
  }
  section.commands.push(
    await run(
      'dotnet',
      ['build', join(section.project, 'csharp', 'MigrateInit', 'MigrateInit.csproj')],
      section.project,
      'dotnet build migrate-init',
    ),
  );
  expect(section.commands.at(-1)?.code, `${lang} dotnet build migrate-init`).toBe(0);
  section.commands.push(
    await runMigrate(lang, section.project, 'init', ['--all'], section.project),
  );
  expect(section.commands.at(-1)?.code, `${lang} migrate-init --all`).toBe(0);
  section.commands.push(
    await run(join(section.project, 'build'), [lang], section.project, `./build ${lang}`),
  );
  expect(section.commands.at(-1)?.code, `${lang} ./build`).toBe(0);
};

const spec = parse(await readFile(PROOF_YAML, 'utf8')) as ProofSpec;
const reports: LanguageReport[] = [];
const providers = Object.keys(spec.providers);

describe('proof e2e', () => {
  afterAll(async () => {
    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, renderReport(reports));
  });

  it('requires every language and every provider', () => {
    expect([...spec.languages].sort()).toEqual(['csharp', 'rust', 'typescript']);
    expect(Object.keys(spec.providers).sort()).toEqual([...cliSpec.providers].sort());
  });

  for (const lang of spec.languages) {
    describe(lang, () => {
      const section: LanguageReport = {
        lang,
        project: '',
        commands: [],
        projectChecks: [],
        providers: [],
      };
      reports.push(section);

      beforeAll(async () => {
        try {
          await prepareLanguage(lang, section);
          const initBin = binFor(lang, section.project, 'init');
          const setupBin = binFor(lang, section.project, 'setup');
          if (lang === 'typescript') {
            expect(existsSync(initBin.argv0[0] as string)).toBe(true);
            expect(existsSync(setupBin.argv0[0] as string)).toBe(true);
          } else {
            expect(await hostPath(dirname(initBin.cmd), 'migrate-init')).toBeTruthy();
            expect(await hostPath(dirname(setupBin.cmd), 'migrate-setup')).toBeTruthy();
          }
          section.projectChecks = await checkProject(lang, section.project);
          if (lang === 'typescript') {
            for (const name of DRIVER_PACKAGES) {
              expect(await exists(join(section.project, 'node_modules', name)), name).toBe(true);
            }
          } else if (lang === 'rust') {
            expect(section.projectChecks[0]).toMatch(
              /default = \["sqlite", "postgres", "mysql", "sqlserver", "oracle"\]/,
            );
          } else {
            expect(section.projectChecks[0]).toContain('absent');
          }
        } catch (e) {
          section.error = e instanceof Error ? e.message : String(e);
          throw e;
        }
      }, 1_200_000);

      for (const [index, provider] of providers.entries()) {
        it(`${lang} ${provider}`, async () => {
          const raw = spec.providers[provider] as ProviderSpec;
          const layout = layoutFor(index);
          const workdir = await mkdtemp(join(tmpdir(), `migraters-e2e-work-${lang}-${provider}-`));
          const providerReport: ProviderReport = {
            provider,
            layout,
            workdir,
            commands: [],
          };
          section.providers.push(providerReport);
          try {
            const vars: Record<string, string> = { language: lang, workdir };
            if (raw.database) vars.database = fill(raw.database, vars);
            const connection = provider === 'sqlite' ? 'app.sqlite' : fill(raw.connection, vars);

            if (raw.admin_connection && raw.prepare) {
              const admin = fill(raw.admin_connection, vars);
              const dialect = defaultDialectFactory.get(provider);
              await withRetry(`${lang} ${provider} admin`, async () => {
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

            const common = ['--provider', provider, '--connection', connection];
            const setup = await runMigrate(
              lang,
              section.project,
              'setup',
              [...common, ...pathFlags(layout, provider, 'setup')],
              workdir,
            );
            providerReport.commands.push(setup);
            expect(setup.code, `${lang} ${provider} setup\n${setup.stderr}`).toBe(0);

            const created = await runMigrate(
              lang,
              section.project,
              'create',
              ['--provider', provider, '--name', 'proof', ...pathFlags(layout, provider, 'create')],
              workdir,
            );
            providerReport.commands.push(created);
            expect(created.code, `${lang} ${provider} create\n${created.stderr}`).toBe(0);

            const dir = join(workdir, migrationsDir(layout, provider));
            await writeFile(join(dir, `${spec.migration}_up.sql`), raw.up);
            await writeFile(join(dir, `${spec.migration}_down.sql`), raw.down);

            const up = await runMigrate(
              lang,
              section.project,
              'up',
              [...common, ...pathFlags(layout, provider, 'up')],
              workdir,
            );
            providerReport.commands.push(up);
            expect(up.code, `${lang} ${provider} up\n${up.stderr}`).toBe(0);

            const dialect = defaultDialectFactory.get(provider);
            const verifyConnection =
              provider === 'sqlite' ? join(workdir, 'app.sqlite') : fill(raw.connection, vars);
            const client = await dialect.createClient(verifyConnection);
            try {
              const schema = (await client.query(raw.schema_query)).map((row) =>
                column(row as Record<string, unknown>),
              );
              providerReport.schema = schema;
              expect(schema, `${lang} ${provider} schema`).toEqual(raw.expected);
              const applied = (await client.query(raw.catalog_query)).map((row) =>
                catalog(row as Record<string, unknown>),
              );
              providerReport.catalog = applied;
              expect(applied, `${lang} ${provider} migrates`).toEqual([
                { name: spec.migration, checksum: checksum(raw.up) },
              ]);
            } finally {
              await client.close();
            }
          } catch (e) {
            providerReport.error = e instanceof Error ? e.message : String(e);
            throw e;
          }
        }, 600_000);
      }
    });
  }
});
