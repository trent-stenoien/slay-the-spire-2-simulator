/** Joins a RunResult's summaries with the run's strategies and formats stats. */
import type { GameData, RunResult, StrategyColor, StrategySummary } from '../../engine/types';

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

/**
 * Rows ordered by average HP lost, lowest first. Ties break by death rate (lowest first),
 * then by average combat turn length (`avgTurns`, lowest first), then by run (selection) order.
 * Returns a new array; colors travel with each row, so they are unchanged.
 */
export function sortResultRows(rows: readonly ResultRow[]): ResultRow[] {
  const num = (n: number | null) => (n === null || !Number.isFinite(n) ? Infinity : n);
  return [...rows].sort(
    (a, b) =>
      num(a.summary.avgHpLost) - num(b.summary.avgHpLost) ||
      num(a.summary.deathRate) - num(b.summary.deathRate) ||
      num(a.summary.avgTurns) - num(b.summary.avgTurns) ||
      a.strategyIndex - b.strategyIndex,
  );
}

/** resultRows in display order (see sortResultRows). */
export function sortedResultRows(result: RunResult): ResultRow[] {
  return sortResultRows(resultRows(result));
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

/** The note on the character's starting relic, which the simulator does not model. */
export function relicNote(data: GameData, characterId: string): string {
  return characterId === 'ironclad'
    ? "Burning Blood's 6 HP heal is not simulated."
    : `${data.characters[characterId]?.startingRelic ?? 'The starting relic'} (starting relic) is not simulated.`;
}
