import { describe, expect, it } from 'vitest';
import {
  fillHelpTemplate,
  migrateCommand,
  verbFromCommand,
  type MigrateVerb,
} from './cli-contract.ts';
import { loadHelp, loadProgramUsage } from './help.ts';

const VERBS: MigrateVerb[] = ['setup', 'up', 'down', 'create'];

describe('unified help loader', () => {
  it('maps migrate-<verb> onto the shared template file', () => {
    expect(verbFromCommand('migrate-create')).toBe('create');
    expect(migrateCommand('create')).toBe('migrate-create');
    expect(() => verbFromCommand('MigrateRunner')).toThrow(/Unknown migrate command/);
  });

  it('fills {{command}} and {{usage}} from cli.yaml', () => {
    const filled = fillHelpTemplate('{{usage}}\n  {{command}} --name x\n', 'migrate-create');
    expect(filled.startsWith('Usage: migrate-create --provider')).toBe(true);
    expect(filled).toContain('migrate-create --name x');
    expect(filled).not.toContain('{{');
  });

  it('loads program usage with the same migrate-<verb> Usage lines', async () => {
    const text = await loadProgramUsage();
    for (const verb of VERBS) {
      expect(text).toContain(`Usage: ${migrateCommand(verb)} --provider`);
    }
    expect(text).not.toContain('{{command}}');
    expect(text).not.toContain('MigrateRunner');
    expect(text).not.toMatch(/^Usage: (create|up|down|setup) /m);
  });

  it('loads the same filled help the rust and csharp runners produce', async () => {
    for (const verb of VERBS) {
      const command = migrateCommand(verb);
      const text = await loadHelp(command);
      expect(text.startsWith(`Usage: ${command} --provider`)).toBe(true);
      expect(text).toContain(`${command} --provider sqlite`);
      expect(text).not.toContain('{{command}}');
      expect(text).not.toMatch(/^Usage: (create|up|down|setup) /m);
      expect(text).not.toMatch(/^\s+(create|up|down|setup) --provider/m);
    }
  });
});
