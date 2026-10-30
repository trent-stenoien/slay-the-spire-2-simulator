/**
 * Monte Carlo layer. STUB: signatures are fixed; the stats agent implements them.
 * The UI agent codes against these signatures.
 */
import type { CombatResult, GameData, RunConfig, RunResult, StrategySummary } from './types';

/**
 * Run combats [from, to) for one strategy of a run. Combat i uses
 * deriveSeed(config.runSeed, i), so every strategy faces identical combats.
 * Logs are not kept.
 */
export function runCombatRange(
  _data: GameData,
  _config: RunConfig,
  _strategyIndex: number,
  _from: number,
  _to: number,
): CombatResult[] {
  throw new Error('not implemented');
}

/** Summary stats for one strategy from its combat results. */
export function summarize(_strategyId: string, _results: readonly CombatResult[]): StrategySummary {
  throw new Error('not implemented');
}

/** Single-threaded full run (tests, and fallback when Workers are unavailable). */
export function runSimulationSync(_data: GameData, _config: RunConfig, _combats?: number): RunResult {
  throw new Error('not implemented');
}
