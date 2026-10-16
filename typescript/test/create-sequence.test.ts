import { describe, expect, it } from 'vitest';
import { isMigrationName, nextSequence, pad4 } from '../src/create-sequence.ts';

describe('create naming', () => {
  it('accepts snake_case slugs and rejects the rest', () => {
    expect(isMigrationName('add_users')).toBe(true);
    expect(isMigrationName('AddUsers')).toBe(false);
    expect(isMigrationName('1bad')).toBe(false);
  });

  it('numbers from 0001 and ignores timestamp prefixes', () => {
    expect(pad4(nextSequence([]))).toBe('0001');
    expect(pad4(nextSequence(['0001_init_up.sql']))).toBe('0002');
    expect(pad4(nextSequence(['20240101120000_legacy_up.sql', '0003_later_up.sql']))).toBe('0004');
  });
});
