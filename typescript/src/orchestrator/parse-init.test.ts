import { describe, expect, it } from 'vitest';
import { parseInitArgv, resolveInitSelection } from './parse-init.ts';

describe('orchestrator init argv', () => {
  it('requires --language and keeps dialect order from cli.yaml', () => {
    const parsed = parseInitArgv([
      '--language',
      'CSharp',
      '--dialect',
      'ora',
      '--dialect',
      'pg',
    ]);
    expect(resolveInitSelection(parsed)).toEqual({
      language: 'csharp',
      dialects: ['postgres', 'oracle'],
    });
  });

  it('accepts --language=rust and --all', () => {
    expect(resolveInitSelection(parseInitArgv(['--language=rust', '--all']))).toEqual({
      language: 'rust',
      dialects: ['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle'],
    });
  });

  it('rejects an unknown language', () => {
    expect(() => parseInitArgv(['--language', 'go'])).toThrow(/unsupported language: go/);
  });

  it('rejects a missing language', () => {
    expect(() => resolveInitSelection(parseInitArgv(['--dialect', 'sqlite']))).toThrow(
      /pass --language/,
    );
  });
});
