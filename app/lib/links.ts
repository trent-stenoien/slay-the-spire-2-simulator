/** App-relative links. The app lives under import.meta.env.BASE_URL. */
import type { GameData } from '../../engine/types';
import { buildQuery, type LogTarget, type SetupState } from './url';

export function appBase(): string {
  return import.meta.env.BASE_URL ?? '/';
}

export function setupHref(data: GameData, setup: SetupState): string {
  return `${appBase()}?${buildQuery(data, setup)}`;
}

/** A combat log (one strategy) or compare view (2–5 strategies) link. */
export function logHref(data: GameData, setup: SetupState, target: LogTarget): string {
  return `${appBase()}?${buildQuery(data, setup, target)}`;
}
