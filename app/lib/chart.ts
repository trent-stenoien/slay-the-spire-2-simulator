/** Pure scaling helpers for the hand-built SVG distribution chart. */
import { hpLostRange, silvermanBandwidth } from '../../engine/stats';
import type { StrategySummary } from '../../engine/types';

export interface Point {
  x: number;
  y: number;
}

/** Linear map from [d0, d1] to [r0, r1]. A zero-width domain maps to the range midpoint. */
export function linearScale(domain: [number, number], range: [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  if (d1 === d0) return () => (r0 + r1) / 2;
  const k = (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** A "nice" step (1, 2, 5 × 10^n) so that span / step is about `target`. */
export function niceStep(span: number, target: number): number {
  if (!(span > 0) || !(target > 0)) return 1;
  const raw = span / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * pow;
}

/**
 * Tick values on multiples of a nice step inside [min, max] (inclusive).
 * `integer` forces steps ≥ 1 (HP-lost axis).
 */
export function niceTicks(min: number, max: number, target = 5, integer = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max < min) [min, max] = [max, min];
  if (max === min) return [min];
  let step = niceStep(max - min, target);
  if (integer) step = Math.max(1, Math.round(step));
  const first = Math.ceil(min / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = first; v <= max + step * 1e-9; v += step) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

/** Upper bound for the Y axis: the smallest nice tick at or above the data max (at least `floor`). */
export function niceMax(dataMax: number, target = 5, floor = 1): number {
  const m = Math.max(dataMax, floor);
  const step = niceStep(m, target);
  return Math.ceil(m / step - 1e-9) * step;
}

/** Max y across all curves (0 for none). */
export function curvesMaxY(curves: readonly (readonly Point[])[]): number {
  let m = 0;
  for (const c of curves) for (const p of c) if (p.y > m) m = p.y;
  return m;
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export type CurveShape = 'smooth' | 'step';

/**
 * SVG path for a curve. 'smooth' joins points with straight segments (the KDE
 * is sampled finely); 'step' draws a histogram-like step centered on each x.
 */
export function linePath(points: readonly Point[], sx: (v: number) => number, sy: (v: number) => number, shape: CurveShape = 'smooth'): string {
  if (points.length === 0) return '';
  if (shape === 'smooth') {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(sx(p.x))},${fmt(sy(p.y))}`).join('');
  }
  const out: string[] = [];
  points.forEach((p, i) => {
    const left = sx(p.x - 0.5);
    const right = sx(p.x + 0.5);
    const y = sy(p.y);
    out.push(`${i === 0 ? 'M' : 'L'}${fmt(left)},${fmt(y)}`, `L${fmt(right)},${fmt(y)}`);
  });
  return out.join('');
}

/** Closed area path: the line, then down to the baseline and back. */
export function areaPath(points: readonly Point[], sx: (v: number) => number, sy: (v: number) => number, baselineY: number, shape: CurveShape = 'smooth'): string {
  const line = linePath(points, sx, sy, shape);
  if (!line) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const x0 = shape === 'step' ? sx(first.x - 0.5) : sx(first.x);
  const x1 = shape === 'step' ? sx(last.x + 0.5) : sx(last.x);
  return `${line}L${fmt(x1)},${fmt(baselineY)}L${fmt(x0)},${fmt(baselineY)}Z`;
}

/** Percent label for an axis tick: "12%", "2.5%". */
export function percentLabel(v: number): string {
  return `${fmt(v)}%`;
}

/**
 * Legend toggle: returns a new set of hidden strategy ids with `id` flipped
 * (visible -> hidden, hidden -> visible). The input set is not modified.
 */
export function toggleHidden(hidden: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(hidden);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** KDE smoothing slider: a multiplier on each strategy's Silverman bandwidth. */
export const BANDWIDTH_FACTOR = { min: 0.25, max: 3, step: 0.05, default: 1 } as const;

/** Clamp a slider value into [min, max]; non-finite values give the default (×1). */
export function clampBandwidthFactor(factor: number): number {
  if (!Number.isFinite(factor)) return BANDWIDTH_FACTOR.default;
  return Math.min(BANDWIDTH_FACTOR.max, Math.max(BANDWIDTH_FACTOR.min, factor));
}

/** KDE bandwidth for one strategy: Silverman's rule × the (clamped) slider factor. */
export function kdeBandwidth(hpLostCounts: readonly number[], factor: number): number {
  return silvermanBandwidth(hpLostCounts) * clampBandwidthFactor(factor);
}

/** Slider label: "×1.00". */
export function bandwidthFactorLabel(factor: number): string {
  return `×${clampBandwidthFactor(factor).toFixed(2)}`;
}

/** X range shown when every strategy is hidden. */
export const EMPTY_X_RANGE: [number, number] = [0, 10];

/**
 * X-axis range fitted to the strategies not in `hidden`: min/max observed HP lost
 * padded by 2 (min clamped at 0). With none visible, a default range.
 */
export function visibleHpLostRange(
  rows: readonly { strategyId: string; summary: StrategySummary }[],
  hidden: ReadonlySet<string>,
): [number, number] {
  const shown = rows.filter((r) => !hidden.has(r.strategyId)).map((r) => r.summary);
  return shown.length === 0 ? [...EMPTY_X_RANGE] : hpLostRange(shown);
}
