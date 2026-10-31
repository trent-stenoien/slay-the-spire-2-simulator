/** Pure helpers for the "View a combat" picker and the combat log header. */

/** The internal (0-based) combat index shown to humans as a 1-based number. */
export function toDisplayCombat(index: number): number {
  return index + 1;
}

/** Parse the picker's 1-based text into the internal 0-based index, or null when not a whole number in 1..combats. */
export function fromDisplayCombat(text: string, combats: number): number | null {
  if (!/^[1-9]\d*$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n <= combats ? n - 1 : null;
}

/** Picker label, e.g. "Combat # (1-10000)". */
export function combatRangeLabel(combats: number): string {
  return `Combat # (1-${Math.max(1, combats)})`;
}

/**
 * The strategy the picker should have selected: the current one while it is visible on the
 * chart, otherwise the first visible one (in picker order), or null when all are hidden.
 */
export function effectiveStrategyId(orderedIds: readonly string[], hidden: ReadonlySet<string>, selectedId: string): string | null {
  const visible = orderedIds.filter((id) => !hidden.has(id));
  if (visible.includes(selectedId)) return selectedId;
  return visible[0] ?? null;
}
