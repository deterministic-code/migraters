import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATE_VERBS, migrateCommand } from '../src/cli-contract.ts';

const BIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'bin');

describe('bin help wiring', () => {
  it('each CLI loads unified help via loadHelp(migrate-<verb>)', async () => {
    for (const verb of MIGRATE_VERBS) {
      const command = migrateCommand(verb);
      const src = await readFile(join(BIN_DIR, `${command}.ts`), 'utf8');
      expect(src).toMatch(new RegExp(`loadHelp\\(['"]${command}['"]\\)`));
      expect(src).not.toContain('const HELP_TEXT = `Usage:');
    }
  });
});
