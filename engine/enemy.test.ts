import { describe, expect, it } from 'vitest';
import { resolveEnemy } from './enemy';
import { nibbit } from './testFixtures';

describe('resolveEnemy (Nibbit)', () => {
  it('A0 is the base definition', () => {
    const e = resolveEnemy(nibbit, 0);
    expect(e.hp).toEqual({ min: 42, max: 46 });
    expect(e.moves.butt!.effects).toEqual([{ type: 'attack', damage: 12, hits: 1 }]);
    expect(e.moves.hesitantSlice!.effects).toEqual([
      { type: 'attack', damage: 6, hits: 1 },
      { type: 'gainBlock', amount: 5 },
    ]);
    expect(e.moves.hiss!.effects).toEqual([{ type: 'gainStrength', amount: 2 }]);
  });

  it('A8 changes HP and Hesitant Slice block only', () => {
    const e = resolveEnemy(nibbit, 8);
    const a0 = resolveEnemy(nibbit, 0);
    expect(e.hp).toEqual({ min: 44, max: 48 });
    expect(e.moves.hesitantSlice!.effects).toEqual([
      { type: 'attack', damage: 6, hits: 1 },
      { type: 'gainBlock', amount: 6 },
    ]);
    expect(e.moves.butt).toEqual(a0.moves.butt);
    expect(e.moves.hiss).toEqual(a0.moves.hiss);
  });

  it('A9 applies A8 HP plus the A9 move overrides, keeping names', () => {
    const e = resolveEnemy(nibbit, 9);
    expect(e.hp).toEqual({ min: 44, max: 48 });
    expect(e.moves.butt).toEqual({ name: 'Butt', effects: [{ type: 'attack', damage: 13, hits: 1 }] });
    expect(e.moves.hesitantSlice).toEqual({
      name: 'Hesitant Slice',
      effects: [
        { type: 'attack', damage: 7, hits: 1 },
        { type: 'gainBlock', amount: 6 },
      ],
    });
    expect(e.moves.hiss).toEqual({ name: 'Hiss', effects: [{ type: 'gainStrength', amount: 3 }] });
  });

  it('A20 equals A9 when there are no higher overrides', () => {
    const a9 = resolveEnemy(nibbit, 9);
    const a20 = resolveEnemy(nibbit, 20);
    expect(a20.hp).toEqual(a9.hp);
    expect(a20.moves).toEqual(a9.moves);
    expect(a20.pattern).toEqual(a9.pattern);
  });

  it('A7 does not apply A8', () => {
    expect(resolveEnemy(nibbit, 7).hp).toEqual({ min: 42, max: 46 });
  });

  it('applies levels in numeric, not string, order', () => {
    const def = {
      ...nibbit,
      ascension: { '10': { hp: { min: 100, max: 100 } }, '2': { hp: { min: 1, max: 1 } } },
    };
    expect(resolveEnemy(def, 20).hp).toEqual({ min: 100, max: 100 });
    expect(resolveEnemy(def, 5).hp).toEqual({ min: 1, max: 1 });
  });

  it('pattern overrides replace the pattern', () => {
    const def = {
      ...nibbit,
      ascension: { '3': { pattern: { type: 'cycle' as const, order: ['hiss'], start: 'random' as const } } },
    };
    expect(resolveEnemy(def, 3).pattern).toEqual({ type: 'cycle', order: ['hiss'], start: 'random' });
  });

  it('does not mutate the input definition', () => {
    const before = structuredClone(nibbit);
    const e = resolveEnemy(nibbit, 20);
    e.moves.butt!.effects.push({ type: 'gainBlock', amount: 1 });
    expect(nibbit).toEqual(before);
  });

  it('throws on an override for an unknown move', () => {
    const def = { ...nibbit, ascension: { '1': { moves: { nope: { effects: [] } } } } };
    expect(() => resolveEnemy(def, 1)).toThrow(/unknown move/);
  });
});
