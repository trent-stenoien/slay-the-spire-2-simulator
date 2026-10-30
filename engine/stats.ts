/**
 * Chart math. STUB: signatures are fixed; the stats agent implements them.
 * All y values are percentages of combats (0–100).
 */
import type { StrategySummary } from './types';

export interface CurvePoint {
  x: number;
  y: number;
}

/** X-axis range for overlaid strategies: [min observed HP lost − 2, max + 2], min clamped at 0. */
export function hpLostRange(_summaries: readonly StrategySummary[]): [number, number] {
  throw new Error('not implemented');
}

/** Raw distribution: one point per integer HP-lost value in range, y = % of combats. */
export function rawCurve(_hpLostCounts: readonly number[], _range: [number, number]): CurvePoint[] {
  throw new Error('not implemented');
}

/**
 * Gaussian kernel density estimate over HP lost, sampled at `step` across range.
 * Bandwidth defaults to Silverman's rule. y is scaled so it is comparable to the
 * raw view (% of combats per 1 HP).
 */
export function kdeCurve(
  _hpLostCounts: readonly number[],
  _range: [number, number],
  _options?: { bandwidth?: number; step?: number },
): CurvePoint[] {
  throw new Error('not implemented');
}

/** Cumulative: y = % of combats that lost ≤ x HP, at each integer x in range. */
export function cumulativeCurve(_hpLostCounts: readonly number[], _range: [number, number]): CurvePoint[] {
  throw new Error('not implemented');
}
