import type { Rng } from './types';

/**
 * Seeded PRNG: mulberry32 (32-bit state, period 2^32). Small, fast and
 * well-distributed enough for shuffles and HP rolls. Never use Math.random()
 * in the engine; every random choice goes through one of these.
 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`rng.int: invalid range [${min}, ${max}]`);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  const shuffle = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
    return items;
  };

  return { next, int, shuffle };
}

/** splitmix32 finalizer: a bijective 32-bit hash mix. */
function splitmix32(x: number): number {
  let z = (x + 0x9e3779b9) | 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * Deterministic per-combat seed. Because splitmix32 is a bijection on 32-bit
 * integers, different combat indices (below 2^32) always give different seeds
 * for the same run seed. Every strategy in a run uses the same derived seeds,
 * so they all face identical combats.
 */
export function deriveSeed(runSeed: number, combatIndex: number): number {
  return splitmix32((splitmix32(runSeed >>> 0) + (combatIndex >>> 0)) >>> 0);
}
