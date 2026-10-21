import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, appendFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cliSpec } from '../src/cli-spec.ts';
import { MIGRATE_VERBS, migrateCommand, type MigrateVerb } from '../src/cli-contract.ts';
import { loadHelp } from '../src/help.ts';
import { loadMessage } from '../src/infrastructure/message-templates.ts';

const MIGRATERS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UNKNOWN_FLAG = '--not-a-cli-flag';

type Lang = 'typescript' | 'rust' | 'csharp';

type Proc = { lang: Lang; file: string; prefix: string[] };

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
  const ts = join(MIGRATERS, 'typescript', 'dist', 'src', 'bin', 'migrate-setup.js');
  if (await exists(ts)) {
    out.push({
      lang: 'typescript',
      file: process.execPath,
      prefix: [join(MIGRATERS, 'typescript', 'dist', 'src', 'bin')],
    });
  }
  const rust = await hostPath(join(MIGRATERS, 'rust', 'target', 'debug'), 'migrate-setup');
  if (rust) {
    out.push({ lang: 'rust', file: join(MIGRATERS, 'rust', 'target', 'debug'), prefix: [] });
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
    return { cmd: proc.file, argv0: [join(proc.prefix[0], `${name}.js`)] };
  }
  return { cmd: join(proc.file, name), argv0: [] };
};

const canon = (text: string): string => `${text.replaceAll('\r\n', '\n').replace(/\n+$/, '')}\n`;

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
  return env;
};

const run = async (
  proc: Proc,
  verb: MigrateVerb,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number; stderr: string; stdout: string }> => {
  const { cmd, argv0 } = binFor(proc, verb);
  const child = spawn(cmd, [...argv0, ...args], {
    cwd: opts.cwd,
    env: opts.env ?? isolatedEnv(),
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
  return {
    code: code ?? 1,
    stderr: canon(stderr),
    stdout: stdout.replaceAll('\r\n', '\n'),
  };
};

const initSqlite = async (lang: Lang): Promise<void> => {
  if (lang === 'typescript') return;
  const child = spawn(
    process.execPath,
    [
      join(MIGRATERS, 'orchestrator', 'dist', 'migrate-init.js'),
      '--language',
      lang,
      '--dialect',
      'sqlite',
    ],
    { cwd: MIGRATERS, env: isolatedEnv(), stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  const [code] = (await once(child, 'exit')) as [number | null];
  expect(code ?? 1, `${lang} migrate-init sqlite\n${stdout}\n${stderr}`).toBe(0);
};

const runnable = async (proc: Proc): Promise<boolean> => {
  const r = await run(proc, 'setup', ['--help']);
  if (r.code === 0) return true;
  if (r.stderr.includes('You must install or update .NET')) return false;
  throw new Error(`${proc.lang} migrate-setup --help exited ${r.code}: ${r.stderr}`);
};

const procs = await discover();
const langs = (
  await Promise.all(procs.map(async (p) => ({ p, ok: await runnable(p).catch(() => false) })))
)
  .filter((x) => x.ok)
  .map((x) => x.p);

describe('CLI e2e parity across languages', () => {
  it('runs every language whose binary is present and executable', () => {
    const names = langs.map((l) => l.lang);
    expect(names, 'build migraters/typescript (npm run build)').toContain('typescript');
    const haveRust = langs.some((l) => l.lang === 'rust') || procs.some((p) => p.lang === 'rust');
    if (procs.some((p) => p.lang === 'rust')) {
      expect(names, 'rust target/debug/migrate-* exists but --help failed').toContain('rust');
    }
    expect(names.length).toBeGreaterThanOrEqual(haveRust ? 2 : 1);
  });

  it('--help is identical for every language and matches cli.yaml-filled templates', async () => {
    for (const verb of MIGRATE_VERBS) {
      const expected = canon(await loadHelp(migrateCommand(verb)));
      const outputs: { lang: Lang; stderr: string }[] = [];
      for (const proc of langs) {
        const r = await run(proc, verb, ['--help']);
        expect(r.code, `${proc.lang} ${migrateCommand(verb)} --help`).toBe(0);
        expect(r.stdout, `${proc.lang} help should be on stderr`).toBe('');
        expect(r.stderr, `${proc.lang} ${verb}`).toBe(expected);
        outputs.push({ lang: proc.lang, stderr: r.stderr });
      }
      for (let i = 1; i < outputs.length; i++) {
        expect(outputs[i]?.stderr, `${outputs[i]?.lang} vs ${outputs[0]?.lang} ${verb}`).toBe(
          outputs[0]?.stderr,
        );
      }
    }
  });

  it('-h matches --help', async () => {
    for (const proc of langs) {
      for (const verb of MIGRATE_VERBS) {
        const [full, short] = await Promise.all([
          run(proc, verb, ['--help']),
          run(proc, verb, ['-h']),
        ]);
        expect(short.code, `${proc.lang} -h`).toBe(0);
        expect(short.stderr).toBe(full.stderr);
      }
    }
  });

  it('rejects an unknown flag with the shared unknown-arg message', async () => {
    const expectedLine = `unknown arg: ${UNKNOWN_FLAG}`;
    for (const proc of langs) {
      for (const verb of MIGRATE_VERBS) {
        const r = await run(proc, verb, [UNKNOWN_FLAG]);
        expect(r.code, `${proc.lang} ${verb} ${UNKNOWN_FLAG}`).toBe(2);
        expect(r.stderr, `${proc.lang} ${verb}`).toContain(expectedLine);
      }
    }
  });

  it('accepts every spec flag and alias without treating it as unknown', async () => {
    for (const proc of langs) {
      for (const command of cliSpec.commands.filter((c) => c.verb !== 'init')) {
        const argv: string[] = [];
        for (const arg of command.args) {
          if (arg.placeholder) argv.push(arg.flag, 'x');
          else argv.push(arg.flag);
        }
        argv.push('--help');
        const r = await run(proc, command.verb, argv);
        expect(r.code, `${proc.lang} ${command.verb} ${argv.join(' ')}`).toBe(0);
        expect(r.stderr).not.toContain('unknown arg:');
        expect(r.stderr.split('\n')[0]).toBe(
          (await loadHelp(migrateCommand(command.verb))).split('\n')[0],
        );
        for (const [alias, canonical] of Object.entries(cliSpec.aliases)) {
          if (!command.args.some((a) => a.flag === canonical)) continue;
          const aliased = await run(proc, command.verb, [alias, 'x', '--help']);
          expect(aliased.code, `${proc.lang} ${command.verb} ${alias}`).toBe(0);
          expect(aliased.stderr).not.toContain('unknown arg:');
        }
      }
    }
  });
});

describe('CLI sqlite lifecycle across languages', () => {
  it('setup, create, up, down, checksum drift, and usage errors', async () => {
    const missingProvider = await loadMessage('errors/missing-provider');
    const unsupported = await loadMessage('errors/unsupported-provider', { provider: 'nope' });
    const missingConnection = await loadMessage('errors/missing-connection', {
      envVars: cliSpec.connection_environment.sqlite.join(cliSpec.env_var_list_separator),
    });
    const invalidName = await loadMessage('errors/invalid-name', { name: 'AddUsers' });

    for (const proc of langs) {
      await initSqlite(proc.lang);
      const dir = await mkdtemp(join(tmpdir(), `migraters-e2e-${proc.lang}-`));
      const db = join(dir, 'app.sqlite');
      const migrations = join(dir, 'migrations');
      const conn = ['--provider', 'sqlite', '--connection', db, '--migrations-path', migrations];

      const setup1 = await run(proc, 'setup', conn);
      expect(setup1.code, `${proc.lang} setup\n${setup1.stdout}\n${setup1.stderr}`).toBe(0);
      const setup2 = await run(proc, 'setup', conn);
      expect(setup2.code, `${proc.lang} setup again`).toBe(0);

      const created = await run(proc, 'create', [
        '--provider',
        'sqlite',
        '--name',
        'add_users',
        '--migrations-path',
        migrations,
      ]);
      expect(created.code, `${proc.lang} create`).toBe(0);
      expect(created.stdout).toContain('0001_add_users_up.sql');
      expect(created.stdout).toContain('0001_add_users_down.sql');

      const up1 = await run(proc, 'up', conn);
      expect(up1.code, `${proc.lang} up`).toBe(0);
      expect(up1.stdout).toContain('Applied: 0001_add_users');
      const upAgain = await run(proc, 'up', conn);
      expect(upAgain.code, `${proc.lang} up again`).toBe(0);
      expect(upAgain.stdout).toContain('No pending migrations.');

      const created2 = await run(proc, 'create', [
        '--provider',
        'sqlite',
        '--name',
        'add_email',
        '--migrations-path',
        migrations,
      ]);
      expect(created2.code, `${proc.lang} create 2`).toBe(0);
      const one = await run(proc, 'up', [...conn, '--one']);
      expect(one.code, `${proc.lang} up --one`).toBe(0);
      expect(one.stdout).toContain('Applied: 0002_add_email');
      expect(one.stdout).not.toContain('No pending migrations.');

      const noTty = await run(proc, 'down', conn);
      expect(noTty.code, `${proc.lang} down no confirm`).toBe(2);
      expect(noTty.stderr).toContain('pass --confirm');
      const stillApplied = await run(proc, 'up', conn);
      expect(stillApplied.stdout).toContain('No pending migrations.');

      const okDown = await run(proc, 'down', [...conn, '--confirm']);
      expect(okDown.code, `${proc.lang} down --confirm`).toBe(0);
      expect(okDown.stdout).toContain('Rolled back');

      const upFile = join(migrations, '0001_add_users_up.sql');
      await appendFile(upFile, '-- changed\n');
      const drift = await run(proc, 'up', conn);
      expect(drift.code, `${proc.lang} checksum drift`).toBe(1);
      expect(drift.stderr).toContain('Migration checksum drift detected');
      expect(await readFile(upFile, 'utf8')).toContain('-- changed');

      const noProvider = await run(proc, 'up', ['--connection', db]);
      expect(noProvider.code, `${proc.lang} missing provider`).toBe(2);
      expect(noProvider.stderr).toContain(missingProvider.trim());

      const unknown = await run(proc, 'up', ['--provider', 'nope', '--connection', db]);
      expect(unknown.code, `${proc.lang} unknown provider`).toBe(2);
      expect(unknown.stderr).toContain(unsupported.trim());

      const noConn = await run(proc, 'up', ['--provider', 'sqlite']);
      expect(noConn.code, `${proc.lang} missing connection`).toBe(2);
      expect(noConn.stderr).toContain(missingConnection.trim());

      const badName = await run(proc, 'create', [
        '--provider',
        'sqlite',
        '--name',
        'AddUsers',
        '--migrations-path',
        migrations,
      ]);
      expect(badName.code, `${proc.lang} invalid name`).toBe(2);
      expect(badName.stderr).toContain(invalidName.trim());
    }
  }, 180_000);
});

