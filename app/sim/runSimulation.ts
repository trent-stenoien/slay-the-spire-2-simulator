/**
 * Runs a full simulation across module Web Workers, falling back to the
 * single-threaded runner when Workers are unavailable. The result is identical
 * to runSimulationSync for the same config.
 */
import { gameData } from '../../data/index';
import { runSimulationSync } from '../../engine/montecarlo';
import { COMBATS_PER_RUN } from '../../engine/types';
import type { RunConfig, RunResult } from '../../engine/types';
import { mergeChunkResults, planChunks, workerCount } from './plan';
import type { ChunkResult } from './plan';
import type { WorkerRequest, WorkerResponse } from './protocol';

export interface SimulationProgress {
  /** Combats finished so far, across all strategies. */
  done: number;
  total: number;
}

export function runSimulation(
  config: RunConfig,
  onProgress?: (progress: SimulationProgress) => void,
): Promise<RunResult> {
  const combats = COMBATS_PER_RUN;
  const total = combats * config.strategies.length;

  if (typeof Worker === 'undefined') {
    return new Promise((resolve, reject) => {
      try {
        const result = runSimulationSync(gameData, config, combats);
        onProgress?.({ done: total, total });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  }

  const chunks = planChunks(config.strategies.length, combats);
  if (chunks.length === 0) {
    return Promise.resolve(mergeChunkResults(gameData.manifest.gameVersion, config, []));
  }
  const hc = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  const count = workerCount(hc, chunks.length);

  return new Promise<RunResult>((resolve, reject) => {
    const workers: Worker[] = [];
    const collected: ChunkResult[] = [];
    let next = 0;
    let done = 0;
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      for (const w of workers) w.terminate();
      fn();
    };

    const dispatch = (worker: Worker) => {
      const chunk = chunks[next++];
      if (!chunk) return;
      const msg: WorkerRequest = { config, chunk };
      worker.postMessage(msg);
    };

    for (let i = 0; i < count; i++) {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      } catch (err) {
        finish(() => reject(err));
        return;
      }
      workers.push(worker);
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (settled) return;
        const res = event.data;
        const chunk = chunks[res.chunkId];
        if (!res.ok || !chunk) {
          finish(() => reject(new Error(res.ok ? `Unknown chunk ${res.chunkId}` : res.error)));
          return;
        }
        collected.push({ chunk, results: res.results });
        done += chunk.to - chunk.from;
        onProgress?.({ done, total });
        if (collected.length === chunks.length) {
          finish(() => {
            try {
              resolve(mergeChunkResults(gameData.manifest.gameVersion, config, collected));
            } catch (err) {
              reject(err);
            }
          });
        } else {
          dispatch(worker);
        }
      };
      worker.onerror = (event: ErrorEvent) => {
        event.preventDefault();
        finish(() => reject(new Error(`Simulation worker failed: ${event.message || 'unknown error'}`)));
      };
      worker.onmessageerror = () => {
        finish(() => reject(new Error('Simulation worker sent an unreadable message')));
      };
    }
    for (const w of workers) dispatch(w);
  });
}
