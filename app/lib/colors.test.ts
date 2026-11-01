import { describe, expect, it } from 'vitest';
import {
  COLORS,
  deselectStrategy,
  firstFreeColor,
  isColorTaken,
  pruneSelection,
  selectStrategy,
  setColor,
  type Selection,
} from './colors';

function selectAll(ids: string[]): Selection[] {
  return ids.reduce<Selection[]>((sel, id) => selectStrategy(sel, id), []);
}

describe('color assignment', () => {
  it('auto-assigns colors in order', () => {
    expect(selectAll(['a', 'b', 'c']).map((s) => s.color)).toEqual(['blue', 'green', 'yellow']);
  });

  it('reuses the first freed color', () => {
    const sel = selectStrategy(deselectStrategy(selectAll(['a', 'b', 'c']), 'a'), 'd');
    expect(sel.find((s) => s.strategyId === 'd')?.color).toBe('blue');
  });

  it('caps at 5 strategies', () => {
    const sel = selectAll(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(sel).toHaveLength(5);
    expect(sel.map((s) => s.color)).toEqual([...COLORS]);
    expect(firstFreeColor(sel)).toBeNull();
  });

  it('does not select twice', () => {
    expect(selectAll(['a', 'a'])).toHaveLength(1);
  });

  it('refuses a color taken by another strategy', () => {
    const sel = selectAll(['a', 'b']);
    expect(isColorTaken(sel, 'a', 'green')).toBe(true);
    expect(isColorTaken(sel, 'b', 'green')).toBe(false);
    expect(setColor(sel, 'a', 'green')).toEqual(sel);
    expect(setColor(sel, 'a', 'purple').find((s) => s.strategyId === 'a')?.color).toBe('purple');
  });

  it('prunes deleted strategies', () => {
    expect(pruneSelection(selectAll(['a', 'b']), ['b']).map((s) => s.strategyId)).toEqual(['b']);
  });
});
