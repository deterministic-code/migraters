import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BUILD = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'build');
const USAGE = 'Usage: ./build rust|csharp|typescript';

const runBuild = (args: string[]) =>
  spawnSync(BUILD, args, { encoding: 'utf8', env: process.env });

describe('./build helper', () => {
  it('prints usage and exits 0 with no args', () => {
    const result = runBuild([]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain(USAGE);
  });

  it('prints usage and exits 2 for an unknown language', () => {
    const result = runBuild(['java']);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(USAGE);
  });
});
