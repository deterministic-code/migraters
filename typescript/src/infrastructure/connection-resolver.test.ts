import { describe, expect, it } from 'vitest';
import { ConnectionResolver } from './connection-resolver.ts';

describe('ConnectionResolver', () => {
  it('uses the flag first, then the first set env var', () => {
    const resolver = new ConnectionResolver({
      SQLITE_PATH: '',
      DB_PATH: './app.sqlite',
    });
    expect(resolver.resolve('sqlite', 'flag.db')).toBe('flag.db');
    expect(resolver.fromEnvironment('sqlite')).toBe('./app.sqlite');
    expect(resolver.resolve('sqlite', null)).toBe('./app.sqlite');
  });

  it('returns null when the provider has no env and no flag', () => {
    const resolver = new ConnectionResolver({});
    expect(resolver.fromEnvironment('sqlite')).toBeNull();
    expect(resolver.fromEnvironment('dbase')).toBeNull();
    expect(resolver.resolve('sqlite', null)).toBeNull();
  });
});
