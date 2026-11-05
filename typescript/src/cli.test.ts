import { afterEach, describe, expect, it, vi } from 'vitest';
import { SqliteProvider } from '../providers/sqlite/src/sqlite-provider.ts';
import {
  DEFAULT_BATCH_SEPARATOR,
  requireBatchSeparator,
  requireConnection,
  requireDialect,
  takeFlag,
} from './cli.ts';

const stubExit = () =>
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`exit:${code}`);
  }) as never);

describe('cli helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses GO as the default batch separator', () => {
    expect(DEFAULT_BATCH_SEPARATOR).toBe('GO');
    expect(requireBatchSeparator(' ;; ')).toBe(';;');
  });

  it('exits when the dialect is missing or unknown', () => {
    const exit = stubExit();
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => requireDialect(null)).toThrow('exit:2');
    expect(() => requireDialect('dbase')).toThrow('exit:2');
    expect(exit).toHaveBeenCalledWith(2);
    expect(stderr).toHaveBeenCalled();
  });

  it('returns the installed dialect', () => {
    expect(requireDialect('sqlite').name).toBe('sqlite');
  });

  it('prefers --connection and exits when nothing resolves', () => {
    stubExit();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const dialect = new SqliteProvider();
    expect(requireConnection(dialect, 'file:x.db')).toBe('file:x.db');
    expect(() => requireConnection(dialect, null)).toThrow('exit:2');
    expect(() =>
      requireConnection({ ...dialect, name: 'dbase' as typeof dialect.name }, null),
    ).toThrow('exit:2');
  });

  it('exits on a blank batch separator', () => {
    stubExit();
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => requireBatchSeparator('   ')).toThrow('exit:2');
  });

  it('reads --flag, --flag=value, and missing values', () => {
    expect(takeFlag(['--provider', 'sqlite'], 0, '--provider', '--provider')).toEqual({
      value: 'sqlite',
      next: 1,
    });
    expect(takeFlag(['--provider=sqlite'], 0, '--provider=sqlite', '--provider')).toEqual({
      value: 'sqlite',
      next: 0,
    });
    expect(takeFlag(['--provider'], 0, '--provider', '--provider')).toBeUndefined();
    expect(takeFlag(['--other', 'x'], 0, '--other', '--provider')).toBeUndefined();
  });
});
