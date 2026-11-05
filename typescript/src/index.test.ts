import { describe, expect, it } from 'vitest';
import { fillHelpTemplate, fillTemplate, normalizeDialect, pathExists } from './index.ts';

describe('library barrel', () => {
  it('re-exports the public helpers', async () => {
    expect(normalizeDialect('pg')).toBe('postgres');
    expect(normalizeDialect(null)).toBeNull();
    expect(normalizeDialect(undefined)).toBeNull();
    expect(normalizeDialect('')).toBeNull();
    expect(normalizeDialect('sqlite')).toBe('sqlite');
    expect(normalizeDialect('dbase')).toBeNull();
    expect(fillTemplate('{{x}}', { x: 'y' })).toBe('y');
    expect(fillHelpTemplate('{{usage}}', 'migrate-up')).toContain('Usage: migrate-up');
    expect(await pathExists('.')).toBe(true);
  });
});
