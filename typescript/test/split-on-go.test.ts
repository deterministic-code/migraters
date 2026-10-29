import { describe, expect, it } from 'vitest';
import { splitOnGo } from '../providers/sql/split-on-go.ts';

describe('splitOnGo', () => {
  it('splits on whole-line GO and keeps semicolons inside a batch', () => {
    expect(splitOnGo('CREATE TABLE a (id INT);\nGO\nCREATE TABLE b (id INT)')).toEqual([
      'CREATE TABLE a (id INT);',
      'CREATE TABLE b (id INT)',
    ]);
    expect(splitOnGo('BEGIN\n  SELECT 1;\nEND;')).toEqual(['BEGIN\n  SELECT 1;\nEND;']);
  });

  it('splits on a custom token', () => {
    expect(splitOnGo('SELECT 1;\n;;\nSELECT 2;', ';;')).toEqual(['SELECT 1;', 'SELECT 2;']);
  });

  it('accepts a trailing -- comment and ISO date', () => {
    expect(
      splitOnGo('SELECT 1;\nGO -- rebuild\nSELECT 2;\nGO 2026-10-29 -- note\nSELECT 3;'),
    ).toEqual(['SELECT 1;', 'SELECT 2;', 'SELECT 3;']);
  });

  it('does not split on a GO prefix token', () => {
    expect(splitOnGo('SELECT GOING;\nGOING\nSELECT 2;')).toEqual(['SELECT GOING;\nGOING\nSELECT 2;']);
  });
});
