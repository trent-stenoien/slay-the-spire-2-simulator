import { describe, expect, it } from 'vitest';
import { combatRangeLabel, effectiveStrategyId, fromDisplayCombat, toDisplayCombat } from './combatPicker';

describe('combat number conversion (display is 1-based, internal 0-based)', () => {
  it('internal to display', () => {
    expect(toDisplayCombat(0)).toBe(1);
    expect(toDisplayCombat(9999)).toBe(10000);
  });
  it('display to internal', () => {
    expect(fromDisplayCombat('1', 10000)).toBe(0);
    expect(fromDisplayCombat('10000', 10000)).toBe(9999);
    expect(fromDisplayCombat('42', 10000)).toBe(41);
  });
  it('round-trips every boundary', () => {
    for (const i of [0, 1, 4999, 9998, 9999]) expect(fromDisplayCombat(String(toDisplayCombat(i)), 10000)).toBe(i);
  });
  it('rejects out-of-range and non-integer input', () => {
    for (const t of ['0', '10001', '-1', '1.5', '', 'abc', '01']) expect(fromDisplayCombat(t, 10000)).toBeNull();
  });
  it('labels the range 1-N', () => {
    expect(combatRangeLabel(10000)).toBe('Combat # (1-10000)');
  });
});

describe('effectiveStrategyId', () => {
  const ids = ['a', 'b', 'c'];
  it('keeps the selection while visible', () => {
    expect(effectiveStrategyId(ids, new Set(['a']), 'b')).toBe('b');
  });
  it('moves to the first visible strategy when the selection is hidden', () => {
    expect(effectiveStrategyId(ids, new Set(['a', 'b']), 'a')).toBe('c');
    expect(effectiveStrategyId(ids, new Set(['b']), 'b')).toBe('a');
  });
  it('is null when every strategy is hidden', () => {
    expect(effectiveStrategyId(ids, new Set(ids), 'a')).toBeNull();
  });
});
