import { describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import { changeCount, copiesOf, deckPool, deckSize, toggleUpgrade } from './deck';
import type { Deck } from '../../engine/types';

const deck: Deck = [
  { cardId: 'strike_ironclad', upgraded: false, count: 5 },
  { cardId: 'defend_ironclad', upgraded: false, count: 4 },
];

describe('deckPool', () => {
  it('has Ironclad and colorless cards but no unplayable curses', () => {
    const ids = deckPool(gameData, 'ironclad').map((c) => c.id);
    expect(ids).toContain('strike_ironclad');
    expect(ids).toContain('ultimate_strike');
    expect(ids).not.toContain('ascenders_bane');
  });

  it('is empty for an unknown character', () => {
    expect(deckPool(gameData, 'nobody')).toEqual([]);
  });
});

describe('deck edits', () => {
  it('counts', () => {
    expect(deckSize(deck)).toBe(9);
    expect(copiesOf(deck, 'strike_ironclad', false)).toBe(5);
    expect(copiesOf(deck, 'strike_ironclad', true)).toBe(0);
  });

  it('adds a new group at the end, keeping upgraded separate', () => {
    expect(changeCount(deck, 'strike_ironclad', true, 1)).toEqual([...deck, { cardId: 'strike_ironclad', upgraded: true, count: 1 }]);
  });

  it('removes a group at zero and ignores removing what is absent', () => {
    expect(changeCount(deck, 'defend_ironclad', false, -4)).toEqual([deck[0]]);
    expect(changeCount(deck, 'bash', false, -1)).toBe(deck);
  });

  it('toggles a group, merging into an existing one', () => {
    expect(toggleUpgrade(deck, 'defend_ironclad', false)[1]).toEqual({ cardId: 'defend_ironclad', upgraded: true, count: 4 });
    const mixed = changeCount(deck, 'strike_ironclad', true, 2);
    expect(toggleUpgrade(mixed, 'strike_ironclad', true)).toEqual([
      { cardId: 'strike_ironclad', upgraded: false, count: 7 },
      deck[1],
    ]);
    expect(deck[0]!.count).toBe(5); // input untouched
  });
});
