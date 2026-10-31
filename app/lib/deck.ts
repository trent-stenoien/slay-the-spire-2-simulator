/** Deck-builder logic: the card pool and immutable deck edits. */
import type { CardDef, CharacterDef, Deck, GameData } from '../../engine/types';

/** True when every card in the character's starting deck can be simulated. */
export function isCharacterSimulated(data: GameData, ch: CharacterDef): boolean {
  return ch.startingDeck.every((e) => data.cards[e.cardId]?.simulated === true);
}

/**
 * Cards the deck builder offers for a character: its own cards plus
 * colorless ones, minus unplayable curses (Ascender's Bane is added by the
 * engine at A5+, never by hand) and cards the engine can't simulate yet
 * (or multiplayer-only cards). Sorted by name.
 */
export function deckPool(data: GameData, characterId: string): CardDef[] {
  const code = data.characters[characterId]?.code;
  if (!code) return [];
  return Object.values(data.cards)
    .filter((c) => c.character === code || c.character === 'colorless' || c.character === 'shared')
    .filter((c) => !(c.type === 'curse' && c.keywords.includes('unplayable')))
    .filter((c) => c.simulated && !c.multiplayerOnly)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deckSize(deck: Deck): number {
  return deck.reduce((n, e) => n + e.count, 0);
}

export function copiesOf(deck: Deck, cardId: string, upgraded: boolean): number {
  return deck.find((e) => e.cardId === cardId && e.upgraded === upgraded)?.count ?? 0;
}

/** Add `delta` copies (may be negative). Entries reaching 0 are removed; new entries are appended. */
export function changeCount(deck: Deck, cardId: string, upgraded: boolean, delta: number): Deck {
  const idx = deck.findIndex((e) => e.cardId === cardId && e.upgraded === upgraded);
  if (idx < 0) {
    return delta > 0 ? [...deck, { cardId, upgraded, count: delta }] : deck;
  }
  const count = Math.max(0, (deck[idx]?.count ?? 0) + delta);
  if (count === 0) return deck.filter((_, i) => i !== idx);
  return deck.map((e, i) => (i === idx ? { ...e, count } : e));
}

/**
 * Flip the upgraded flag of a whole copy group, merging into the other
 * group if it already exists (the merged entry keeps the other group's position).
 */
export function toggleUpgrade(deck: Deck, cardId: string, upgraded: boolean): Deck {
  const idx = deck.findIndex((e) => e.cardId === cardId && e.upgraded === upgraded);
  const from = deck[idx];
  if (!from) return deck;
  const otherIdx = deck.findIndex((e) => e.cardId === cardId && e.upgraded === !upgraded);
  if (otherIdx < 0) return deck.map((e, i) => (i === idx ? { ...e, upgraded: !upgraded } : e));
  return deck
    .map((e, i) => (i === otherIdx ? { ...e, count: e.count + from.count } : e))
    .filter((_, i) => i !== idx);
}
