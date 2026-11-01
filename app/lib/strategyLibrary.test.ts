import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRATEGIES,
  STORAGE_KEY,
  clearUserStrategies,
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
  MAX_LIBRARY_SIZE,
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
    expect(loadUserStrategies(memStorage(raw))).toEqual([
      { id: 'a', name: 'A', config: { kind: 'block', allowThrough: 3 } },
    ]);
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

  it('caps the library at 10 strategies, defaults included', () => {
    const extra = Array.from({ length: 8 }, (_, i) => ({
      id: `u${i + 3}`,
      name: `b${i + 3}`,
      config: { kind: 'block' as const, allowThrough: i + 3 },
    }));
    const nine = fullLibrary(extra.slice(0, 7));
    expect(nine).toHaveLength(9);
    expect(blockStrategyProblem(nine, 20)).toBeNull();
    const full = fullLibrary(extra);
    expect(full).toHaveLength(MAX_LIBRARY_SIZE);
    expect(MAX_LIBRARY_SIZE).toBe(10);
    expect(blockStrategyProblem(full, 20)).toMatch(/at most 10/);
    expect(blockStrategyProblem(full, 5, 'u5')).toBeNull();
  });
});

describe('clearUserStrategies', () => {
  const withRemove = (initial?: string) => {
    const m = memStorage(initial);
    return Object.assign(m, { removeItem: (k: string) => void m.data.delete(k) });
  };

  it('removes the storage key and leaves no user strategies', () => {
    const s = withRemove(JSON.stringify([{ id: 'u1', name: 'A', config: { kind: 'block', allowThrough: 3 } }]));
    expect(clearUserStrategies(s)).toBe(true);
    expect(s.data.has(STORAGE_KEY)).toBe(false);
    expect(loadUserStrategies(s)).toEqual([]);
  });

  it('succeeds when nothing is stored', () => {
    expect(clearUserStrategies(withRemove())).toBe(true);
  });

  it('returns false for null storage or storage without removeItem', () => {
    expect(clearUserStrategies(null)).toBe(false);
    expect(clearUserStrategies(memStorage('[]'))).toBe(false);
  });

  it('tolerates storage that throws', () => {
    const bad: StorageLike = {
      ...throwing,
      removeItem: () => {
        throw new Error('denied');
      },
    };
    expect(clearUserStrategies(bad)).toBe(false);
    expect(fullLibrary([]).map((s) => s.name)).toEqual(['Greedy Damage', 'Scared Block']);
  });
});
