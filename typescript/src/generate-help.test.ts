import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { generateHelpFiles, renderHelpTemplates } from './generate-help.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI_YAML = join(REPO_ROOT, 'cli.yaml');
const HELP_DIR = join(REPO_ROOT, 'shared', 'templates', 'help');

describe('generate-help', () => {
  it('shared/templates/help matches cli.yaml', async () => {
    const generated = renderHelpTemplates(parse(await readFile(CLI_YAML, 'utf8')));
    for (const [verb, text] of Object.entries(generated)) {
      const onDisk = await readFile(join(HELP_DIR, `${verb}.txt`), 'utf8');
      expect(onDisk, verb).toBe(text);
    }
  });

  it('writes the four verb templates', async () => {
    const written = await generateHelpFiles();
    expect(written.map((p) => p.slice(p.lastIndexOf('/') + 1)).sort()).toEqual([
      'create.txt',
      'down.txt',
      'setup.txt',
      'up.txt',
    ]);
  });
});
