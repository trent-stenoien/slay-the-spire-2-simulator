/**
 * Runs a full simulation across Web Workers. STUB: the stats agent implements it;
 * the UI agent calls it.
 */
import type { RunConfig, RunResult } from '../../engine/types';

export interface SimulationProgress {
  /** Combats finished so far, across all strategies. */
  done: number;
  total: number;
}

export function runSimulation(
  _config: RunConfig,
  _onProgress?: (progress: SimulationProgress) => void,
): Promise<RunResult> {
  return Promise.reject(new Error('not implemented'));
}
