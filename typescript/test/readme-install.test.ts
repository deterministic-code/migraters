import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TYPESCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..');
const README = join(TYPESCRIPT, '..', 'README.md');
const INIT_LINE = /^npx migrate-init --dialect sqlite --dialect postgres$/m;
const BARE_CLI = /^(?:migrate-(?:init|setup|up|down|create))\b/;

const pathWithoutBins = (): string =>
  (process.env.PATH ?? '')
    .split(delimiter)
    .filter((entry) => !entry.includes(join('node_modules', '.bin')))
    .join(delimiter);

const run = async (
  cmd: string,
  args: string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const [code] = (await once(child, 'exit')) as [number | null];
  return { code: code ?? 1, stdout, stderr };
};

const packName = async (stdout: string): Promise<string> => {
  const lines = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const tarball = lines.find((line) => line.endsWith('.tgz'));
  if (!tarball) throw new Error(`npm pack printed no tarball:\n${stdout}`);
  return tarball;
};

describe('README install', () => {
  let work: string;
  let tarball: string;

  beforeAll(async () => {
    work = await mkdtemp(join(tmpdir(), 'migraters-readme-install-'));
    const packed = await run('npm', ['pack', '--pack-destination', work], TYPESCRIPT);
    expect(packed.code, packed.stderr).toBe(0);
    tarball = join(work, await packName(packed.stdout));
    const installed = await run('npm', ['install', tarball], work);
    expect(installed.code, installed.stderr).toBe(0);
  }, 180_000);

  afterAll(async () => {
    if (work) await rm(work, { recursive: true, force: true });
  });

  it('does not tell anyone to run a bare migrate-init after npm install', async () => {
    const readme = await readFile(README, 'utf8');
    expect(readme).toMatch(INIT_LINE);
    const blocks = [...readme.matchAll(/```shell\n([\s\S]*?)```/g)].map((m) => m[1] ?? '');
    const afterInstall = blocks.find((block) =>
      block.includes('npm install @deterministic-code/migraters'),
    );
    expect(afterInstall).toBeDefined();
    expect(afterInstall).toMatch(INIT_LINE);
    for (const block of blocks) {
      for (const line of (block ?? '').split('\n')) {
        expect(line, line).not.toMatch(BARE_CLI);
      }
    }
  });

  it('runs the README init command without node_modules/.bin on PATH', async () => {
    const readme = await readFile(README, 'utf8');
    const match = readme.match(INIT_LINE);
    expect(match?.[0]).toBe('npx migrate-init --dialect sqlite --dialect postgres');
    const result = await run('sh', ['-c', match?.[0] ?? ''], work, {
      PATH: pathWithoutBins(),
    });
    expect(result.code, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Enabled dialects: sqlite, postgres');
  }, 180_000);
});
