import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathExists } from './path-exists.ts';

describe('pathExists', () => {
  it('is true for an existing path and false otherwise', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'path-exists-'));
    expect(await pathExists(dir)).toBe(true);
    expect(await pathExists(join(dir, 'missing'))).toBe(false);
  });
});
