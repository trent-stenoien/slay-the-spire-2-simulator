/**
 * Saved-strategy library. Built-in defaults are always present and read-only;
 * user strategies (block strategies with a custom allowance) live in
 * localStorage. All storage access is wrapped so the app works without it.
 */
import { type SavedStrategy, type StrategyConfig } from '../../engine/types';

export const STORAGE_KEY = 'sts2sim.strategies.v1';
/** parseStrategyCode accepts at most 4 digits, so URLs stay valid. */
export const MAX_ALLOW_THROUGH = 9999;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const DEFAULT_STRATEGIES: readonly SavedStrategy[] = [
  { id: 'default-greedy', name: 'Greedy Damage', config: { kind: 'greedyDamage' } },
  { id: 'default-scared', name: 'Scared Block', config: { kind: 'block', allowThrough: 0 } },
];

export function isBuiltIn(id: string): boolean {
  return DEFAULT_STRATEGIES.some((s) => s.id === id);
}

/** The browser's localStorage, or null if it is missing or throws. */
export function browserStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function isValidConfig(c: unknown): c is StrategyConfig {
  if (typeof c !== 'object' || c === null) return false;
  const o = c as Record<string, unknown>;
  if (o.kind === 'greedyDamage') return true;
  return o.kind === 'block' && parseAllowThrough(String(o.allowThrough)) === o.allowThrough;
}

function isValidSaved(x: unknown): x is SavedStrategy {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.id === 'string' && o.id !== '' && typeof o.name === 'string' && isValidConfig(o.config);
}

/** User strategies from storage. Invalid, built-in-id or duplicate entries are dropped. */
export function loadUserStrategies(storage: StorageLike | null): SavedStrategy[] {
  if (!storage) return [];
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: SavedStrategy[] = [];
  for (const x of parsed) {
    if (!isValidSaved(x) || isBuiltIn(x.id) || seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({ id: x.id, name: x.name, config: { ...x.config } });
  }
  return out;
}

/** Returns false if storage is missing or the write failed. */
export function saveUserStrategies(storage: StorageLike | null, list: readonly SavedStrategy[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list.filter((s) => !isBuiltIn(s.id))));
    return true;
  } catch {
    return false;
  }
}

/** Removes the stored user strategies. Returns false if storage is missing or removal failed. */
export function clearUserStrategies(storage: StorageLike | null): boolean {
  if (!storage?.removeItem) return false;
  try {
    storage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Defaults followed by user strategies. */
export function fullLibrary(user: readonly SavedStrategy[]): SavedStrategy[] {
  return [...DEFAULT_STRATEGIES, ...user];
}

/** "4" → 4; anything other than a whole number 0–MAX_ALLOW_THROUGH → null. */
export function parseAllowThrough(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n <= MAX_ALLOW_THROUGH ? n : null;
}

export function defaultName(allowThrough: number): string {
  return `Block, allow ${allowThrough}`;
}

export function addUserStrategy(
  user: readonly SavedStrategy[],
  name: string,
  allowThrough: number,
  newId: () => string,
): SavedStrategy[] {
  const trimmed = name.trim();
  return [
    ...user,
    { id: newId(), name: trimmed || defaultName(allowThrough), config: { kind: 'block', allowThrough } },
  ];
}

export function renameUserStrategy(user: readonly SavedStrategy[], id: string, name: string): SavedStrategy[] {
  const trimmed = name.trim();
  if (!trimmed) return [...user];
  return user.map((s) => (s.id === id ? { ...s, name: trimmed } : s));
}

export function setAllowThrough(user: readonly SavedStrategy[], id: string, allowThrough: number): SavedStrategy[] {
  return user.map((s) =>
    s.id === id && s.config.kind === 'block' ? { ...s, config: { kind: 'block', allowThrough } } : s,
  );
}

export function deleteUserStrategy(user: readonly SavedStrategy[], id: string): SavedStrategy[] {
  return user.filter((s) => s.id !== id);
}

export function describeConfig(config: StrategyConfig): string {
  return config.kind === 'greedyDamage'
    ? 'Attack first, block with leftover energy'
    : config.allowThrough === 0
      ? 'Try to block all incoming damage, then attack'
      : `Block until at most ${config.allowThrough} damage gets through each turn, then attack`;
}

/** The library holds at most this many strategies, defaults included. */
/** (Only MAX_STRATEGIES_PER_RUN of them can be selected for one run.) */
export const MAX_LIBRARY_SIZE = 10;

/**
 * Why a block strategy allowing `allowThrough` can't be added (or another one
 * changed to it), or null if it can. `exceptId` is the strategy being edited.
 */
export function blockStrategyProblem(
  library: readonly SavedStrategy[],
  allowThrough: number,
  exceptId?: string,
): string | null {
  const twin = library.find(
    (s) => s.id !== exceptId && s.config.kind === 'block' && s.config.allowThrough === allowThrough,
  );
  if (twin) return `"${twin.name}" already allows ${allowThrough} damage per turn.`;
  if (exceptId === undefined && library.length >= MAX_LIBRARY_SIZE) {
    return `You can have at most ${MAX_LIBRARY_SIZE} strategies. Delete one to add another.`;
  }
  return null;
}
