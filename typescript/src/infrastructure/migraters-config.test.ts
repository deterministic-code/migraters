import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONFIG_NAME,
  enabledProviders,
  findConfigPath,
  parseProviders,
} from './migraters-config.ts';

describe('migraters-config', () => {
  it('finds a config in the start directory only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    expect(findConfigPath(dir)).toBeUndefined();
    writeFileSync(join(dir, CONFIG_NAME), 'providers:\n');
    expect(findConfigPath(dir)).toBe(join(dir, CONFIG_NAME));
    expect(enabledProviders(dir).entries).toEqual([]);
  });

  it('parses names, skips location and empty rows, and stops at the next key', () => {
    expect(
      parseProviders(`
language: typescript
providers:
  - name: sqlite
    location: typescript/providers/sqlite/src/index.ts

  - name:

  - extra
  - name: postgres
binDir: typescript/dist/src/bin
  - name: ignored
`),
    ).toEqual([{ name: 'sqlite' }, { name: 'postgres' }]);
  });

  it('returns the start dir when no config exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-cfg-'));
    mkdirSync(join(dir, 'child'), { recursive: true });
    const found = enabledProviders(join(dir, 'child'));
    expect(found.configDir).toBe(join(dir, 'child'));
    expect(found.entries).toEqual([]);
  });
});
