/** Strategy selection for a run and its color assignment rules. */
import { MAX_STRATEGIES_PER_RUN, type StrategyColor } from '../../engine/types';

export const COLORS: readonly StrategyColor[] = ['blue', 'green', 'yellow', 'red', 'pink'];

export const COLOR_HEX: Record<StrategyColor, string> = {
  blue: '#2f6fdf',
  green: '#2e9e5b',
  yellow: '#d9a400',
  red: '#d6453d',
  pink: '#d94f9c',
};

export interface Selection {
  strategyId: string;
  color: StrategyColor;
}

export function firstFreeColor(sel: readonly Selection[]): StrategyColor | null {
  return COLORS.find((c) => !sel.some((s) => s.color === c)) ?? null;
}

/** Select a strategy with the first free color. No-op if already selected or the run is full. */
export function selectStrategy(sel: readonly Selection[], strategyId: string): Selection[] {
  if (sel.some((s) => s.strategyId === strategyId)) return [...sel];
  if (sel.length >= MAX_STRATEGIES_PER_RUN) return [...sel];
  const color = firstFreeColor(sel);
  if (!color) return [...sel];
  return [...sel, { strategyId, color }];
}

export function deselectStrategy(sel: readonly Selection[], strategyId: string): Selection[] {
  return sel.filter((s) => s.strategyId !== strategyId);
}

/** Change a selected strategy's color. No-op if another selected strategy already has it. */
export function setColor(sel: readonly Selection[], strategyId: string, color: StrategyColor): Selection[] {
  if (sel.some((s) => s.color === color && s.strategyId !== strategyId)) return [...sel];
  return sel.map((s) => (s.strategyId === strategyId ? { ...s, color } : s));
}

/** Whether `color` is taken by a strategy other than `strategyId`. */
export function isColorTaken(sel: readonly Selection[], strategyId: string, color: StrategyColor): boolean {
  return sel.some((s) => s.color === color && s.strategyId !== strategyId);
}

/** Drop selections whose strategy no longer exists. */
export function pruneSelection(sel: readonly Selection[], existingIds: readonly string[]): Selection[] {
  return sel.filter((s) => existingIds.includes(s.strategyId));
}
