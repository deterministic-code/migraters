import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cliSpec } from '../src/cli-spec.ts';
import { MIGRATE_VERBS, migrateCommand, type MigrateVerb } from '../src/cli-contract.ts';
import { loadHelp } from '../src/help.ts';

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
  const ts = join(MIGRATERS, 'typescript', 'dist', 'bin', 'migrate-setup.js');
  if (await exists(ts)) {
    out.push({
      lang: 'typescript',
      file: process.execPath,
      prefix: [join(MIGRATERS, 'typescript', 'dist', 'bin')],
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

const run = async (
  proc: Proc,
  verb: MigrateVerb,
  args: string[],
): Promise<{ code: number; stderr: string; stdout: string }> => {
  const { cmd, argv0 } = binFor(proc, verb);
  const child = spawn(cmd, [...argv0, ...args], {
    env: { ...process.env },
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
      for (const command of cliSpec.commands) {
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
