import { describe, expect, it } from 'vitest';
import { implementationScript, planDispatch } from './dispatch.ts';

describe('orchestrator dispatch', () => {
  it('runs TypeScript implementation bins with node and forwards argv', () => {
    expect(
      planDispatch(
        '/repo',
        {
          language: 'typescript',
          providers: [{ name: 'sqlite', location: 'typescript/dialects/sqlite/src/index.ts' }],
          binDir: 'typescript/dist/src/bin',
        },
        'up',
        ['--provider', 'sqlite', '--connection', './app.sqlite'],
        '/usr/bin/node',
      ),
    ).toEqual({
      command: '/usr/bin/node',
      args: [
        `/repo/typescript/dist/src/bin/${implementationScript('up')}`,
        '--provider',
        'sqlite',
        '--connection',
        './app.sqlite',
      ],
    });
  });

  it('runs the C# host binary with the original argv', () => {
    const plan = planDispatch(
      '/repo',
      {
        language: 'csharp',
        providers: [
          { name: 'sqlite', location: 'MigrateSqlite.dll!Deterministic.MigrateRunner.SqliteProvider' },
        ],
        binDir: 'csharp/bin/Debug/net9.0',
      },
      'setup',
      ['--provider', 'sqlite'],
    );
    expect(plan.args).toEqual(['--provider', 'sqlite']);
    expect(plan.command).toContain('csharp/bin/Debug/net9.0');
    expect(plan.command).toContain('migrate-setup');
  });
});
