import { describe, expect, it } from 'vitest';
import { silvermanBandwidth } from '../../engine/stats';
import {
  BANDWIDTH_FACTOR,
  bandwidthFactorLabel,
  clampBandwidthFactor,
  kdeBandwidth,
  toggleHidden,
  areaPath,
  curvesMaxY, linePath, linearScale, niceMax, niceStep, niceTicks, percentLabel } from './chart';

describe('chart scaling', () => {
  it('linearScale maps and inverts direction', () => {
    const s = linearScale([0, 10], [100, 0]);
    expect(s(0)).toBe(100);
    expect(s(5)).toBe(50);
    expect(s(10)).toBe(0);
    expect(linearScale([3, 3], [0, 10])(3)).toBe(5);
  });

  it.each([
    [10, 5, 2],
    [100, 5, 20],
    [7, 5, 2],
    [0.9, 5, 0.2],
    [0, 5, 1],
  ])('niceStep(%d, %d) = %d', (span, target, step) => {
    expect(niceStep(span, target)).toBeCloseTo(step);
  });

  it('niceTicks covers the range on step multiples', () => {
    expect(niceTicks(0, 10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(3, 27)).toEqual([5, 10, 15, 20, 25]);
    expect(niceTicks(0, 0.5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(niceTicks(4, 4)).toEqual([4]);
    expect(niceTicks(10, 0)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it('niceTicks with integer steps never goes below 1', () => {
    expect(niceTicks(0, 3, 10, true)).toEqual([0, 1, 2, 3]);
  });

  it('niceMax rounds up to a nice value with a floor', () => {
    expect(niceMax(13)).toBe(15);
    expect(niceMax(37)).toBe(40);
    expect(niceMax(0)).toBe(1);
    expect(niceMax(100)).toBe(100);
  });

  it('curvesMaxY', () => {
    expect(curvesMaxY([])).toBe(0);
    expect(curvesMaxY([[{ x: 0, y: 2 }], [{ x: 1, y: 7 }, { x: 2, y: 3 }]])).toBe(7);
  });

  it('builds line, step and area paths', () => {
    const id = (v: number) => v;
    const pts = [{ x: 0, y: 1 }, { x: 2, y: 3 }];
    expect(linePath([], id, id)).toBe('');
    expect(linePath(pts, id, id)).toBe('M0,1L2,3');
    expect(linePath(pts, id, id, 'step')).toBe('M-0.5,1L0.5,1L1.5,3L2.5,3');
    expect(areaPath(pts, id, id, 10)).toBe('M0,1L2,3L2,10L0,10Z');
    expect(areaPath(pts, id, id, 10, 'step')).toBe('M-0.5,1L0.5,1L1.5,3L2.5,3L2.5,10L-0.5,10Z');
  });

  it('percentLabel', () => {
    expect(percentLabel(12)).toBe('12%');
    expect(percentLabel(2.5)).toBe('2.5%');
  });
});

describe('legend toggle', () => {
  it('hides a visible strategy and shows a hidden one, without mutating the input', () => {
    const none = new Set<string>();
    const hidA = toggleHidden(none, 'a');
    expect([...hidA]).toEqual(['a']);
    expect(none.size).toBe(0);
    const hidAB = toggleHidden(hidA, 'b');
    expect([...hidAB].sort()).toEqual(['a', 'b']);
    const hidB = toggleHidden(hidAB, 'a');
    expect([...hidB]).toEqual(['b']);
    expect(hidAB.has('a')).toBe(true);
    expect(toggleHidden(hidB, 'b').size).toBe(0);
  });
});

describe('KDE smoothing slider', () => {
  const counts = [0, 2, 5, 9, 4, 1, 0, 3, 6, 2];

  it('defaults to ×1 = the Silverman bandwidth, over a ×0.25 to ×3 range', () => {
    expect(BANDWIDTH_FACTOR).toMatchObject({ min: 0.25, max: 3, default: 1 });
    expect(kdeBandwidth(counts, BANDWIDTH_FACTOR.default)).toBe(silvermanBandwidth(counts));
  });

  it('scales the Silverman bandwidth by the factor', () => {
    const base = silvermanBandwidth(counts);
    expect(kdeBandwidth(counts, 0.5)).toBeCloseTo(base * 0.5);
    expect(kdeBandwidth(counts, 2.5)).toBeCloseTo(base * 2.5);
  });

  it('clamps the factor into range; non-finite gives ×1', () => {
    expect(clampBandwidthFactor(0.1)).toBe(0.25);
    expect(clampBandwidthFactor(10)).toBe(3);
    expect(clampBandwidthFactor(Number.NaN)).toBe(1);
    expect(kdeBandwidth(counts, 99)).toBeCloseTo(silvermanBandwidth(counts) * 3);
  });

  it('labels the factor', () => {
    expect(bandwidthFactorLabel(1)).toBe('×1.00');
    expect(bandwidthFactorLabel(0.25)).toBe('×0.25');
  });
});
