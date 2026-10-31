import { useCallback, useMemo, useState } from 'react';
import type { SavedStrategy, StrategyColor } from '../engine/types';
import { deselectStrategy, pruneSelection, selectStrategy, setColor, type Selection } from './lib/colors';
import {
  blockStrategyProblem,
  DEFAULT_STRATEGIES,
  addUserStrategy,
  browserStorage,
  deleteUserStrategy,
  fullLibrary,
  loadUserStrategies,
  renameUserStrategy,
  saveUserStrategies,
  setAllowThrough,
} from './lib/strategyLibrary';

function newId(): string {
  try {
    return `u-${crypto.randomUUID()}`;
  } catch {
    return `u-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

/** Strategy library + per-run selection state, persisted to localStorage when possible. */
export function useStrategies() {
  const storage = useMemo(browserStorage, []);
  const [user, setUser] = useState<SavedStrategy[]>(() => loadUserStrategies(storage));
  const [storageOk, setStorageOk] = useState(storage !== null);
  const [selection, setSelection] = useState<Selection[]>(() =>
    DEFAULT_STRATEGIES.reduce<Selection[]>((sel, s) => selectStrategy(sel, s.id), []),
  );

  const library = useMemo(() => fullLibrary(user), [user]);

  const commit = useCallback(
    (next: SavedStrategy[]) => {
      setUser(next);
      setStorageOk(saveUserStrategies(storage, next));
      setSelection((sel) => pruneSelection(sel, fullLibrary(next).map((s) => s.id)));
    },
    [storage],
  );

  return {
    library,
    selection,
    storageOk,
    toggle: (id: string) => setSelection((sel) => (sel.some((s) => s.strategyId === id) ? deselectStrategy(sel, id) : selectStrategy(sel, id))),
    color: (id: string, c: StrategyColor) => setSelection((sel) => setColor(sel, id, c)),
    add: (name: string, allow: number) => {
      if (blockStrategyProblem(library, allow) !== null) return;
      const next = addUserStrategy(user, name, allow, newId);
      commit(next);
      const added = next[next.length - 1];
      if (added) setSelection((sel) => selectStrategy(sel, added.id));
    },
    rename: (id: string, name: string) => commit(renameUserStrategy(user, id, name)),
    allowThrough: (id: string, n: number) => {
      if (blockStrategyProblem(library, n, id) === null) commit(setAllowThrough(user, id, n));
    },
    remove: (id: string) => commit(deleteUserStrategy(user, id)),
  };
}
