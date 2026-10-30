import type { CombatResult, RunConfig } from '../../engine/types';
import type { Chunk } from './plan';

export interface WorkerRequest {
  config: RunConfig;
  chunk: Chunk;
}

export type WorkerResponse =
  | { ok: true; chunkId: number; results: CombatResult[] }
  | { ok: false; chunkId: number; error: string };
