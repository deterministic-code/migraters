import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

import * as fs from 'node:fs';
import { cliYamlPath, usageLine, type MigrateVerb } from './cli-spec.ts';

describe('cli spec paths', () => {
  afterEach(() => {
    vi.mocked(fs.existsSync).mockRestore();
  });

  it('finds cli.yaml and throws when every candidate is missing', () => {
    expect(fs.existsSync(cliYamlPath())).toBe(true);
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => cliYamlPath()).toThrow(/cli.yaml not found/);
  });

  it('throws when a verb is missing from cli.yaml', () => {
    expect(() => usageLine('missing' as MigrateVerb)).toThrow(/missing command missing/);
  });
});
