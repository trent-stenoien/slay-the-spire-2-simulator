import { describe, expect, it } from 'vitest';
import { areaPath, curvesMaxY, linePath, linearScale, niceMax, niceStep, niceTicks, percentLabel } from './chart';

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
