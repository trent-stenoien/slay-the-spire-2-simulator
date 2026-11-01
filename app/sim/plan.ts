/**
 * Pure chunk planning and merging for the worker runner. Kept free of Worker
 * APIs so it can be tested in Node against runSimulationSync.
 */
import { summarize } from '../../engine/montecarlo';
import type { CombatResult, GameVersion, RunConfig, RunResult } from '../../engine/types';

export const CHUNK_SIZE = 100;
export const MAX_WORKERS = 8;

/** One unit of work: combats [from, to) for one strategy. */
export interface Chunk {
  id: number;
  strategyIndex: number;
  from: number;
  to: number;
}

export interface ChunkResult {
  chunk: Chunk;
  results: CombatResult[];
}

/** Split `combats` combats for each strategy into chunks of at most `chunkSize`. */
export function planChunks(strategyCount: number, combats: number, chunkSize: number = CHUNK_SIZE): Chunk[] {
  if (!(chunkSize >= 1)) throw new RangeError('planChunks: chunkSize must be >= 1');
  const chunks: Chunk[] = [];
  for (let s = 0; s < strategyCount; s++) {
    for (let from = 0; from < combats; from += chunkSize) {
      chunks.push({ id: chunks.length, strategyIndex: s, from, to: Math.min(from + chunkSize, combats) });
    }
  }
  return chunks;
}

/** Worker count: hardwareConcurrency capped at MAX_WORKERS, at least 1, never more than chunks. */
export function workerCount(hardwareConcurrency: number | undefined, chunkCount: number): number {
  const hc =
    Number.isFinite(hardwareConcurrency) && (hardwareConcurrency ?? 0) > 0 ? Math.floor(hardwareConcurrency!) : 1;
  return Math.max(1, Math.min(hc, MAX_WORKERS, chunkCount));
}

/**
 * Combine chunk results (in any arrival order) into a RunResult. Each strategy's
 * results are assembled in combat-index order, then summarized, so the output
 * equals runSimulationSync for the same config.
 */
export function mergeChunkResults(
  gameVersion: GameVersion,
  config: RunConfig,
  chunkResults: readonly ChunkResult[],
): RunResult {
  const sorted = [...chunkResults].sort(
    (a, b) => a.chunk.strategyIndex - b.chunk.strategyIndex || a.chunk.from - b.chunk.from,
  );
  const summaries = config.strategies.map((rs, index) => {
    const results: CombatResult[] = [];
    for (const cr of sorted) {
      if (cr.chunk.strategyIndex !== index) continue;
      if (cr.results.length !== cr.chunk.to - cr.chunk.from) {
        throw new Error(
          `Chunk ${cr.chunk.id} returned ${cr.results.length} results, expected ${cr.chunk.to - cr.chunk.from}`,
        );
      }
      results.push(...cr.results);
    }
    return summarize(rs.strategy.id, results);
  });
  return { gameVersion, config, summaries };
}
