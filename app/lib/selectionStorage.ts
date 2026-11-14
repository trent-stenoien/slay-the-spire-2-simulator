/**
 * Persistence for the per-run strategy selection (which strategies are ticked
 * and their colors). Stored separately from the strategy library. All storage
 * access is wrapped so the app works without it.
 */
import { MAX_STRATEGIES_PER_RUN, type SavedStrategy, type StrategyColor } from '../../engine/types';
import { COLORS, selectStrategy, type Selection } from './colors';
import { DEFAULT_STRATEGIES, type StorageLike } from './strategyLibrary';

export const SELECTION_STORAGE_KEY = 'sts2sim.selection.v1';

/** Every built-in strategy, colored in order. */
export function defaultSelection(): Selection[] {
  return DEFAULT_STRATEGIES.reduce<Selection[]>((sel, s) => selectStrategy(sel, s.id), []);
}

function isColor(c: unknown): c is StrategyColor {
  return typeof c === 'string' && (COLORS as readonly string[]).includes(c);
}

/**
 * Validate a stored selection against the library: unknown or repeated ids are
 * dropped, the list is capped at MAX_STRATEGIES_PER_RUN, and invalid or
 * duplicate colors are replaced with the first free one.
 */
export function sanitizeSelection(raw: unknown, library: readonly SavedStrategy[]): Selection[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(library.map((s) => s.id));
  const kept: { strategyId: string; color: StrategyColor | null; optionChoices?: Record<string, number> }[] = [];
  const usedColors = new Set<StrategyColor>();
  for (const x of raw) {
    if (kept.length >= MAX_STRATEGIES_PER_RUN) break;
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    const id = o.strategyId;
    if (typeof id !== 'string' || !ids.has(id) || kept.some((k) => k.strategyId === id)) continue;
    const color = isColor(o.color) && !usedColors.has(o.color) ? o.color : null;
    if (color) usedColors.add(color);
    const optionChoices = storedChoices(o.optionChoices);
    kept.push({ strategyId: id, color, ...(optionChoices ? { optionChoices } : {}) });
  }
  return kept.map((k) => {
    const extra = k.optionChoices ? { optionChoices: k.optionChoices } : {};
    if (k.color) return { strategyId: k.strategyId, color: k.color, ...extra };
    // Cap ≤ number of colors, so a free one always exists.
    const free = COLORS.find((c) => !usedColors.has(c)) as StrategyColor;
    usedColors.add(free);
    return { strategyId: k.strategyId, color: free, ...extra };
  });
}

/** #271: stored option picks: whole numbers 1–9 by id; anything else dropped. Undefined when none are left. */
function storedChoices(raw: unknown): Record<string, number> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(raw)) {
    if (/^[A-Za-z][A-Za-z0-9_]*$/.test(id) && typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 9)
      out[id] = n;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The stored selection, validated; the default selection when nothing valid is stored. */
export function loadSelection(storage: StorageLike | null, library: readonly SavedStrategy[]): Selection[] {
  let raw: string | null = null;
  try {
    raw = storage ? storage.getItem(SELECTION_STORAGE_KEY) : null;
  } catch {
    raw = null;
  }
  if (raw) {
    try {
      const sel = sanitizeSelection(JSON.parse(raw), library);
      if (sel.length > 0) return sel;
    } catch {
      /* garbage JSON: fall back to defaults */
    }
  }
  return sanitizeSelection(defaultSelection(), library);
}

/** Returns false if storage is missing or the write failed. */
export function saveSelection(storage: StorageLike | null, sel: readonly Selection[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      SELECTION_STORAGE_KEY,
      JSON.stringify(
        sel.map((s) => ({
          strategyId: s.strategyId,
          color: s.color,
          ...(s.optionChoices ? { optionChoices: s.optionChoices } : {}),
        })),
      ),
    );
    return true;
  } catch {
    return false;
  }
}
