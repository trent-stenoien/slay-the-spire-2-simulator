import { describe, expect, it } from 'vitest';
import { cumulativeCurve, kdeCurve, rawCurve, silvermanBandwidth } from './stats';
import type { CurvePoint } from './stats';

const trapezoid = (pts: CurvePoint[]): number =>
  pts.slice(1).reduce((area, p, i) => area + ((p.y + pts[i]!.y) / 2) * (p.x - pts[i]!.x), 0);

// Symmetric around 10.
const symmetric = [0, 0, 0, 0, 0, 0, 1, 3, 8, 15, 20, 15, 8, 3, 1];

describe('rawCurve', () => {
  it('has one point per integer and sums to 100 over the full range', () => {
    const pts = rawCurve(symmetric, [0, 16]);
    expect(pts.map((p) => p.x)).toEqual(Array.from({ length: 17 }, (_, i) => i));
    expect(pts.reduce((a, p) => a + p.y, 0)).toBeCloseTo(100);
    expect(pts[10]!.y).toBeCloseTo((100 * 20) / 74);
  });
  it('returns zeros, not NaN, for no combats', () => {
    expect(rawCurve([0], [0, 2]).every((p) => p.y === 0)).toBe(true);
  });
});

describe('kdeCurve', () => {
  it('integrates to about 100 over a wide range', () => {
    const pts = kdeCurve(symmetric, [-20, 40]);
    expect(trapezoid(pts)).toBeCloseTo(100, 1);
  });
  it('samples at step 0.25 by default and includes both ends', () => {
    const pts = kdeCurve(symmetric, [0, 2]);
    expect(pts.map((p) => p.x)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  });
  it('peaks near the mode of a symmetric sample', () => {
    const pts = kdeCurve(symmetric, [0, 20]);
    const peak = pts.reduce((best, p) => (p.y > best.y ? p : best));
    expect(Math.abs(peak.x - 10)).toBeLessThanOrEqual(0.25);
  });
  it('is comparable in height to the raw curve', () => {
    const peak = Math.max(...kdeCurve(symmetric, [0, 20]).map((p) => p.y));
    const rawPeak = Math.max(...rawCurve(symmetric, [0, 20]).map((p) => p.y));
    expect(peak).toBeGreaterThan(rawPeak * 0.5);
    expect(peak).toBeLessThan(rawPeak * 1.5);
  });
  it('handles zero spread (bandwidth falls back to 1) without NaN', () => {
    const counts = [0, 0, 0, 0, 0, 50];
    expect(silvermanBandwidth(counts)).toBe(1);
    const pts = kdeCurve(counts, [3, 7]);
    expect(pts.every((p) => Number.isFinite(p.y))).toBe(true);
    const peak = pts.reduce((best, p) => (p.y > best.y ? p : best));
    expect(peak.x).toBe(5);
    expect(peak.y).toBeCloseTo(100 / Math.sqrt(2 * Math.PI));
    expect(trapezoid(kdeCurve(counts, [-10, 20]))).toBeCloseTo(100, 1);
  });
  it('returns zeros for no combats and honours an explicit bandwidth', () => {
    expect(kdeCurve([0], [0, 2]).every((p) => p.y === 0)).toBe(true);
    const narrow = kdeCurve(symmetric, [0, 20], { bandwidth: 0.5 });
    const wide = kdeCurve(symmetric, [0, 20], { bandwidth: 4 });
    expect(Math.max(...narrow.map((p) => p.y))).toBeGreaterThan(Math.max(...wide.map((p) => p.y)));
  });
  it('uses Silverman’s rule', () => {
    // 0..9 once each; quartiles by linear interpolation are 2.25 and 6.75.
    const counts = Array.from({ length: 10 }, () => 1);
    const n = 10;
    const mean = 4.5;
    const sd = Math.sqrt(counts.reduce((a, _, v) => a + (v - mean) ** 2, 0) / (n - 1));
    const iqr = 6.75 - 2.25;
    expect(silvermanBandwidth(counts)).toBeCloseTo(0.9 * Math.min(sd, iqr / 1.34) * n ** -0.2);
  });
});

describe('cumulativeCurve', () => {
  it('is non-decreasing and reaches 100', () => {
    const pts = cumulativeCurve(symmetric, [0, 20]);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.y).toBeGreaterThanOrEqual(pts[i - 1]!.y);
    expect(pts[pts.length - 1]!.y).toBeCloseTo(100);
    expect(pts[14]!.y).toBeCloseTo(100);
    expect(pts[5]!.y).toBe(0);
    expect(pts[10]!.y).toBeCloseTo((100 * 47) / 74);
  });
});
