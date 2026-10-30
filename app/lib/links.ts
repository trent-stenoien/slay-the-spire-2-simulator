/** App-relative links. The app lives under import.meta.env.BASE_URL. */
import type { GameData, StrategyConfig } from '../../engine/types';
import { buildQuery, type SetupState } from './url';

export function appBase(): string {
  return import.meta.env.BASE_URL ?? '/';
}

export function setupHref(data: GameData, setup: SetupState): string {
  return `${appBase()}?${buildQuery(data, setup)}`;
}

export function logHref(data: GameData, setup: SetupState, seed: number, strategy: StrategyConfig): string {
  return `${appBase()}?${buildQuery(data, setup, { seed, strategy })}`;
}
