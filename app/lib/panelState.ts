/** Per-panel collapsed state in localStorage. Every access is guarded: storage may be missing or throw. */
const key = (id: string) => `sts2.panel.${id}.collapsed`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function store(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** True when the panel was saved as collapsed. Defaults to false (expanded). */
export function readCollapsed(id: string, storage: StorageLike | null = store()): boolean {
  try {
    return storage?.getItem(key(id)) === '1';
  } catch {
    return false;
  }
}

export function writeCollapsed(id: string, collapsed: boolean, storage: StorageLike | null = store()): void {
  try {
    storage?.setItem(key(id), collapsed ? '1' : '0');
  } catch {
    /* storage unavailable: the state just won't persist */
  }
}
