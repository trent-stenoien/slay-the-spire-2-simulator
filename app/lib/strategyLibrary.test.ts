import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRATEGIES,
  STORAGE_KEY,
  addUserStrategy,
  deleteUserStrategy,
  fullLibrary,
  loadUserStrategies,
  parseAllowThrough,
  renameUserStrategy,
  saveUserStrategies,
  setAllowThrough,
  type StorageLike,
  blockStrategyProblem,
} from './strategyLibrary';

function memStorage(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

let n = 0;
const newId = () => `u${++n}`;

describe('strategy library storage', () => {
  it('seeds the two defaults', () => {
    expect(fullLibrary([]).map((s) => [s.name, s.config])).toEqual([
      ['Greedy Damage', { kind: 'greedyDamage' }],
      ['Scared Block', { kind: 'block', allowThrough: 0 }],
    ]);
  });

  it('works with no storage or throwing storage', () => {
    expect(loadUserStrategies(null)).toEqual([]);
    expect(loadUserStrategies(throwing)).toEqual([]);
    expect(saveUserStrategies(null, [])).toBe(false);
    expect(saveUserStrategies(throwing, [])).toBe(false);
  });

  it('ignores corrupt or wrong-shaped data', () => {
    expect(loadUserStrategies(memStorage('{not json'))).toEqual([]);
    expect(loadUserStrategies(memStorage('{"a":1}'))).toEqual([]);
  });

  it('drops invalid entries, built-in ids and duplicates', () => {
    const raw = JSON.stringify([
      { id: 'a', name: 'A', config: { kind: 'block', allowThrough: 3 } },
      { id: 'a', name: 'dup', config: { kind: 'block', allowThrough: 1 } },
      { id: 'b', name: 'B', config: { kind: 'block', allowThrough: -1 } },
      { id: 'c', name: 'C', config: { kind: 'block', allowThrough: 1.5 } },
      { id: 'd', name: 'D', config: { kind: 'magic' } },
      { id: DEFAULT_STRATEGIES[0]!.id, name: 'X', config: { kind: 'greedyDamage' } },
      null,
    ]);
    expect(loadUserStrategies(memStorage(raw))).toEqual([{ id: 'a', name: 'A', config: { kind: 'block', allowThrough: 3 } }]);
  });

  it('saves and loads round-trip, never persisting defaults', () => {
    const s = memStorage();
    const user = addUserStrategy([], 'Brave', 6, newId);
    expect(saveUserStrategies(s, [...DEFAULT_STRATEGIES, ...user])).toBe(true);
    expect(loadUserStrategies(s)).toEqual(user);
  });
});

describe('strategy library edits', () => {
  it('adds with a trimmed name or a default name', () => {
    const a = addUserStrategy([], '  Mine ', 2, () => 'x');
    expect(a).toEqual([{ id: 'x', name: 'Mine', config: { kind: 'block', allowThrough: 2 } }]);
    expect(addUserStrategy([], '  ', 7, () => 'y')[0]!.name).toBe('Block, allow 7');
  });

  it('renames, ignoring blank names', () => {
    const a = addUserStrategy([], 'A', 1, () => 'x');
    expect(renameUserStrategy(a, 'x', ' B ')[0]!.name).toBe('B');
    expect(renameUserStrategy(a, 'x', '   ')[0]!.name).toBe('A');
  });

  it('changes allowance and deletes', () => {
    const a = addUserStrategy([], 'A', 1, () => 'x');
    expect(setAllowThrough(a, 'x', 9)[0]!.config).toEqual({ kind: 'block', allowThrough: 9 });
    expect(deleteUserStrategy(a, 'x')).toEqual([]);
  });

  it.each([
    ['0', 0],
    ['12', 12],
    [' 4 ', 4],
    ['9999', 9999],
    ['10000', null],
    ['-1', null],
    ['1.5', null],
    ['', null],
    ['abc', null],
  ])('parseAllowThrough(%j) = %j', (t, v) => {
    expect(parseAllowThrough(t)).toBe(v);
  });
});

describe('blockStrategyProblem', () => {
  const lib = fullLibrary([{ id: 'u1', name: 'Block, allow 2', config: { kind: 'block', allowThrough: 2 } }]);

  it('rejects a duplicate allowance, including the built-in Scared Block (0)', () => {
    expect(blockStrategyProblem(lib, 2)).toMatch(/already allows 2/);
    expect(blockStrategyProblem(lib, 0)).toMatch(/already allows 0/);
    expect(blockStrategyProblem(lib, 3)).toBeNull();
  });

  it('lets a strategy keep its own allowance while editing', () => {
    expect(blockStrategyProblem(lib, 2, 'u1')).toBeNull();
  });

  it('caps the library at 5 strategies, defaults included', () => {
    const full = fullLibrary([3, 4, 5].map((n) => ({ id: `u${n}`, name: `b${n}`, config: { kind: 'block' as const, allowThrough: n } })));
    expect(full).toHaveLength(5);
    expect(blockStrategyProblem(full, 9)).toMatch(/at most 5/);
  });
});
