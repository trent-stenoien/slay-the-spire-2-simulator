import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from './rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('next() stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int(min, max) is inclusive and hits every value', () => {
    const r = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const x = r.int(42, 46);
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(42);
      expect(x).toBeLessThanOrEqual(46);
      seen.add(x);
    }
    expect([...seen].sort()).toEqual([42, 43, 44, 45, 46]);
    expect(r.int(5, 5)).toBe(5);
  });

  it('int rejects an inverted range', () => {
    expect(() => createRng(1).int(3, 2)).toThrow(RangeError);
  });

  it('shuffle is an in-place permutation and deterministic', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const arr = [...items];
    const out = createRng(5).shuffle(arr);
    expect(out).toBe(arr);
    expect([...out].sort((a, b) => a - b)).toEqual(items);
    expect(out).not.toEqual(items);
    expect(createRng(5).shuffle([...items])).toEqual(out);
  });

  it('shuffle handles empty and single-element arrays', () => {
    expect(createRng(1).shuffle([])).toEqual([]);
    expect(createRng(1).shuffle(['x'])).toEqual(['x']);
  });
});

describe('engine randomness', () => {
  it('no engine source file calls Math.random (all randomness goes through the seeded Rng)', () => {
    const sources = import.meta.glob<string>(['./*.ts', '!./*.test.ts'], {
      query: '?raw',
      import: 'default',
      eager: true,
    });
    const files = Object.keys(sources);
    expect(files).toEqual(expect.arrayContaining(['./combat.ts', './rng.ts', './strategies.ts', './montecarlo.ts']));
    for (const file of files) {
      // Comments may mention Math.random (rng.ts warns against it); code may not.
      const code = sources[file]!.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code, file).not.toMatch(/Math\s*\.\s*random/);
    }
  });
});

describe('deriveSeed', () => {
  it('is stable', () => {
    expect(deriveSeed(42, 0)).toBe(deriveSeed(42, 0));
    expect(deriveSeed(42, 999)).toBe(deriveSeed(42, 999));
  });

  it('differs across combat indices', () => {
    const seeds = new Set(Array.from({ length: 1000 }, (_, i) => deriveSeed(42, i)));
    expect(seeds.size).toBe(1000);
  });

  it('differs across run seeds', () => {
    expect(deriveSeed(1, 0)).not.toBe(deriveSeed(2, 0));
  });

  it('returns an unsigned 32-bit integer', () => {
    for (let i = 0; i < 100; i++) {
      const s = deriveSeed(-7, i);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });
});
