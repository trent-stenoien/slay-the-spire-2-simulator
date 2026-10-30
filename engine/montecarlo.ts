/**
 * Monte Carlo layer: runs many seeded combats per strategy and summarizes them.
 * The UI agent codes against these signatures.
 */
import { runCombat } from './combat';
import { deriveSeed } from './rng';
import { COMBATS_PER_RUN } from './types';
import type { CombatResult, GameData, RunConfig, RunResult, StrategySummary } from './types';

/**
 * Run combats [from, to) for one strategy of a run. Combat i uses
 * deriveSeed(config.runSeed, i), so every strategy faces identical combats.
 * Logs are not kept.
 */
export function runCombatRange(
  data: GameData,
  config: RunConfig,
  strategyIndex: number,
  from: number,
  to: number,
): CombatResult[] {
  const runStrategy = config.strategies[strategyIndex];
  if (!runStrategy) throw new RangeError(`runCombatRange: no strategy at index ${strategyIndex}`);
  const strategy = runStrategy.strategy.config;
  const results: CombatResult[] = [];
  for (let i = from; i < to; i++) {
    results.push(
      runCombat(data, {
        characterId: config.characterId,
        deck: config.deck,
        enemyId: config.enemyId,
        ascension: config.ascension,
        strategy,
        seed: deriveSeed(config.runSeed, i),
      }),
    );
  }
  return results;
}

/**
 * Summary stats for one strategy from its combat results.
 *
 * - avgHpLost: mean over ALL combats (wins, losses and turn-cap draws).
 * - avgTurnsToKill: mean turns over wins only; null if there were no wins.
 * - deathRate, turnCapRate: FRACTIONS in [0, 1] (not percentages).
 * - hpLostCounts[n]: combats that lost exactly n HP; length = max hpLost + 1
 *   (at least 1, so an empty run gives [0]).
 * An empty result list gives zeros everywhere (no NaN).
 */
export function summarize(strategyId: string, results: readonly CombatResult[]): StrategySummary {
  const n = results.length;
  let hpSum = 0;
  let wins = 0;
  let winTurns = 0;
  let losses = 0;
  let caps = 0;
  let maxHp = 0;
  for (const r of results) {
    hpSum += r.hpLost;
    if (r.hpLost > maxHp) maxHp = r.hpLost;
    if (r.outcome === 'win') {
      wins++;
      winTurns += r.turns;
    } else if (r.outcome === 'loss') {
      losses++;
    } else {
      caps++;
    }
  }
  const hpLostCounts = new Array<number>(maxHp + 1).fill(0);
  for (const r of results) hpLostCounts[r.hpLost] = (hpLostCounts[r.hpLost] ?? 0) + 1;
  return {
    strategyId,
    combats: n,
    avgHpLost: n > 0 ? hpSum / n : 0,
    avgTurnsToKill: wins > 0 ? winTurns / wins : null,
    deathRate: n > 0 ? losses / n : 0,
    turnCapRate: n > 0 ? caps / n : 0,
    hpLostCounts,
  };
}

/** Single-threaded full run (tests, and fallback when Workers are unavailable). */
export function runSimulationSync(data: GameData, config: RunConfig, combats: number = COMBATS_PER_RUN): RunResult {
  return {
    gameVersion: data.manifest.gameVersion,
    config,
    summaries: config.strategies.map((rs, index) =>
      summarize(rs.strategy.id, runCombatRange(data, config, index, 0, combats)),
    ),
  };
}
