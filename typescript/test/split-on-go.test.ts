import { describe, expect, it } from 'vitest';
import { splitOnGo } from '../src/infrastructure/split-on-go.ts';

describe('splitOnGo', () => {
  it('splits on whole-line GO and keeps semicolons inside a batch', () => {
    expect(splitOnGo('CREATE TABLE a (id INT);\nGO\nCREATE TABLE b (id INT)')).toEqual([
      'CREATE TABLE a (id INT);',
      'CREATE TABLE b (id INT)',
    ]);
    expect(splitOnGo('BEGIN\n  SELECT 1;\nEND;')).toEqual(['BEGIN\n  SELECT 1;\nEND;']);
  });
});
