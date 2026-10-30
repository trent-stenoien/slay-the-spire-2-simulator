/**
 * Chart math. All y values are percentages of combats (0–100).
 */
import type { StrategySummary } from './types';

export interface CurvePoint {
  x: number;
  y: number;
}

function total(counts: readonly number[]): number {
  let t = 0;
  for (const c of counts) t += c;
  return t;
}

function integerXs(range: [number, number]): number[] {
  const lo = Math.ceil(range[0]);
  const hi = Math.floor(range[1]);
  const xs: number[] = [];
  for (let x = lo; x <= hi; x++) xs.push(x);
  return xs;
}

/** X-axis range for overlaid strategies: [min observed HP lost − 2, max + 2], min clamped at 0. */
export function hpLostRange(summaries: readonly StrategySummary[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const s of summaries) {
    s.hpLostCounts.forEach((c, n) => {
      if (c > 0) {
        if (n < min) min = n;
        if (n > max) max = n;
      }
    });
  }
  if (min === Infinity) return [0, 2]; // nothing observed
  return [Math.max(0, min - 2), max + 2];
}

/** Raw distribution: one point per integer HP-lost value in range, y = % of combats. */
export function rawCurve(hpLostCounts: readonly number[], range: [number, number]): CurvePoint[] {
  const t = total(hpLostCounts);
  return integerXs(range).map((x) => ({ x, y: t > 0 ? (100 * (hpLostCounts[x] ?? 0)) / t : 0 }));
}

/** Weighted quantile (type 7 linear interpolation) over a counts histogram. */
function quantile(counts: readonly number[], n: number, p: number): number {
  const h = (n - 1) * p;
  const lo = Math.floor(h);
  const valueAt = (rank: number): number => {
    let seen = 0;
    for (let v = 0; v < counts.length; v++) {
      seen += counts[v] ?? 0;
      if (rank < seen) return v;
    }
    return counts.length - 1;
  };
  const a = valueAt(lo);
  const b = valueAt(Math.min(lo + 1, n - 1));
  return a + (h - lo) * (b - a);
}

/**
 * Silverman's rule of thumb: 0.9 × min(sd, IQR/1.34) × n^(−1/5).
 * If IQR is 0 but sd isn't, sd is used; if the spread is 0, returns 1.
 */
export function silvermanBandwidth(hpLostCounts: readonly number[]): number {
  const n = total(hpLostCounts);
  if (n < 2) return 1;
  let mean = 0;
  hpLostCounts.forEach((c, v) => (mean += c * v));
  mean /= n;
  let ss = 0;
  hpLostCounts.forEach((c, v) => (ss += c * (v - mean) ** 2));
  const sd = Math.sqrt(ss / (n - 1));
  const iqr = quantile(hpLostCounts, n, 0.75) - quantile(hpLostCounts, n, 0.25);
  const spreads = [sd, iqr / 1.34].filter((s) => s > 0);
  if (spreads.length === 0) return 1;
  return 0.9 * Math.min(...spreads) * n ** -0.2;
}

/**
 * Gaussian kernel density estimate over HP lost, sampled at `step` across range.
 * Bandwidth defaults to Silverman's rule. y = 100 × density, so the area under
 * the curve is ≈ 100 and heights are comparable to the raw view (% of combats per 1 HP).
 */
export function kdeCurve(
  hpLostCounts: readonly number[],
  range: [number, number],
  options: { bandwidth?: number; step?: number } = {},
): CurvePoint[] {
  const step = options.step ?? 0.25;
  if (!(step > 0)) throw new RangeError('kdeCurve: step must be > 0');
  const n = total(hpLostCounts);
  const bw = options.bandwidth ?? silvermanBandwidth(hpLostCounts);
  const h = bw > 0 ? bw : 1;
  const norm = n > 0 ? 100 / (n * h * Math.sqrt(2 * Math.PI)) : 0;
  const points: CurvePoint[] = [];
  const count = Math.floor((range[1] - range[0]) / step + 1e-9);
  for (let i = 0; i <= count; i++) {
    const x = range[0] + i * step;
    let sum = 0;
    for (let v = 0; v < hpLostCounts.length; v++) {
      const c = hpLostCounts[v] ?? 0;
      if (c === 0) continue;
      const z = (x - v) / h;
      sum += c * Math.exp(-0.5 * z * z);
    }
    points.push({ x, y: sum * norm });
  }
  return points;
}

/** Cumulative: y = % of combats that lost ≤ x HP, at each integer x in range. */
export function cumulativeCurve(hpLostCounts: readonly number[], range: [number, number]): CurvePoint[] {
  const t = total(hpLostCounts);
  const prefix: number[] = [];
  let run = 0;
  for (const c of hpLostCounts) prefix.push((run += c));
  return integerXs(range).map((x) => {
    const upTo = x < 0 ? 0 : (prefix[Math.min(x, prefix.length - 1)] ?? 0);
    return { x, y: t > 0 ? (100 * upTo) / t : 0 };
  });
}
