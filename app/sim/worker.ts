/// <reference lib="webworker" />
/** Module Web Worker: runs one chunk of combats per message. */
import { gameData } from '../../data/index';
import { runCombatRange } from '../../engine/montecarlo';
import type { WorkerRequest, WorkerResponse } from './protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { config, chunk } = event.data;
  let response: WorkerResponse;
  try {
    const results = runCombatRange(gameData, config, chunk.strategyIndex, chunk.from, chunk.to);
    response = { ok: true, chunkId: chunk.id, results };
  } catch (err) {
    response = { ok: false, chunkId: chunk.id, error: err instanceof Error ? err.message : String(err) };
  }
  ctx.postMessage(response);
};
