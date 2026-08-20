import { describe, expect, it } from 'vitest';
import { interopDefault } from './interop-default.ts';

describe('interopDefault', () => {
  it('prefers default when present and falls back to the module namespace', () => {
    expect(interopDefault({ default: { connect: 1 } })).toEqual({ connect: 1 });
    expect(interopDefault({ connect: 2 })).toEqual({ connect: 2 });
  });
});
