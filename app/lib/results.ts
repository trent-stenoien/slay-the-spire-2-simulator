/** Joins a RunResult's summaries with the run's strategies and formats stats. */
import type { RunResult, StrategyColor, StrategySummary } from '../../engine/types';

export interface ResultRow {
  strategyId: string;
  name: string;
  color: StrategyColor;
  summary: StrategySummary;
  /** Index into result.config.strategies. */
  strategyIndex: number;
}

/**
 * One row per summary that matches a run strategy by id
 * (summary.strategyId === runStrategy.strategy.id), in run order.
 */
export function resultRows(result: RunResult): ResultRow[] {
  const rows: ResultRow[] = [];
  result.config.strategies.forEach((rs, strategyIndex) => {
    const summary = result.summaries.find((s) => s.strategyId === rs.strategy.id);
    if (summary) rows.push({ strategyId: rs.strategy.id, name: rs.strategy.name, color: rs.color, summary, strategyIndex });
  });
  return rows;
}

export function fmtNumber(n: number | null, digits = 1): string {
  return n === null || !Number.isFinite(n) ? '—' : n.toFixed(digits);
}

/** Fraction 0–1 → "12.3%". */
export function fmtRate(fraction: number): string {
  return Number.isFinite(fraction) ? `${(fraction * 100).toFixed(1)}%` : '—';
}

/** A random 32-bit run seed. `random` is injectable for tests. */
export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 0x100000000) >>> 0;
}

/** Seed field text → seed, or null for blank (random) / undefined for invalid. */
export function parseSeedInput(text: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n <= 0xffffffff ? n : undefined;
}
