import { describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import { cardFolder, changeCount, copiesOf, costColorKey, deckPool, deckSize, groupedPool, isCharacterSimulated, matchesSearch, startingDeckFor, toggleUpgrade, unsimulatedStarters } from './deck';
import type { CardDef, Deck } from '../../engine/types';

const deck: Deck = [
  { cardId: 'strike', upgraded: false, count: 5 },
  { cardId: 'defend', upgraded: false, count: 4 },
];

describe('deckPool', () => {
  it('has Ironclad and colorless cards but no unplayable curses', () => {
    const ids = deckPool(gameData, 'ironclad').map((c) => c.id);
    expect(ids).toContain('strike');
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
    expect(copiesOf(deck, 'strike', false)).toBe(5);
    expect(copiesOf(deck, 'strike', true)).toBe(0);
  });

  it('adds a new group at the end, keeping upgraded separate', () => {
    expect(changeCount(deck, 'strike', true, 1)).toEqual([...deck, { cardId: 'strike', upgraded: true, count: 1 }]);
  });

  it('removes a group at zero and ignores removing what is absent', () => {
    expect(changeCount(deck, 'defend', false, -4)).toEqual([deck[0]]);
    expect(changeCount(deck, 'bash', false, -1)).toBe(deck);
  });

  it('toggles a group, merging into an existing one', () => {
    expect(toggleUpgrade(deck, 'defend', false)[1]).toEqual({ cardId: 'defend', upgraded: true, count: 4 });
    const mixed = changeCount(deck, 'strike', true, 2);
    expect(toggleUpgrade(mixed, 'strike', true)).toEqual([
      { cardId: 'strike', upgraded: false, count: 7 },
      deck[1],
    ]);
    expect(deck[0]!.count).toBe(5); // input untouched
  });
});

describe('isCharacterSimulated', () => {
  it('is true for Ironclad and false for a starter deck with unsupported cards', () => {
    expect(isCharacterSimulated(gameData, gameData.characters.ironclad!)).toBe(true);
    expect(isCharacterSimulated(gameData, gameData.characters.defect!)).toBe(false);
  });
});

describe('deck builder grouping and search', () => {
  it('groups by data folder in a fixed order', () => {
    const labels = groupedPool(gameData, 'ironclad', '').map((g) => g.label);
    expect(labels.slice(0, 3)).toEqual(['Shared', 'Ironclad', 'Colorless']);
    expect(cardFolder(gameData.cards.ascenders_bane!)).toBe('Curses');
  });

  it('filters by name or text, case-insensitively', () => {
    const ids = groupedPool(gameData, 'ironclad', 'BASH').flatMap((g) => g.cards.map((c) => c.id));
    expect(ids).toContain('bash');
    expect(ids).not.toContain('strike');
    expect(matchesSearch(gameData.cards.bash!, 'vulnerable')).toBe(true);
  });

  it('leaves unsimulated starters out of the starting deck', () => {
    expect(startingDeckFor(gameData, 'ironclad')).toEqual(gameData.characters.ironclad!.startingDeck);
    expect(startingDeckFor(gameData, 'silent').map((e) => e.cardId)).toEqual(['strike', 'defend', 'neutralize']);
    expect(unsimulatedStarters(gameData, 'silent')).toEqual(['Survivor']);
  });
});

describe('costColorKey', () => {
  const card = (character: string, type = 'skill') => ({ character, type }) as unknown as CardDef;
  const cases: [string, string][] = [
    ['I', 'ironclad'],
    ['S', 'silent'],
    ['R', 'regent'],
    ['N', 'necrobinder'],
    ['D', 'defect'],
  ];

  it.each(cases)('character %s cards are %s', (code, key) => {
    expect(costColorKey(card(code), 'ironclad', gameData)).toBe(key);
  });

  it('shared cards take the selected character color', () => {
    expect(costColorKey(card('shared', 'attack'), 'ironclad', gameData)).toBe('ironclad');
    expect(costColorKey(card('shared', 'skill'), 'silent', gameData)).toBe('silent');
  });

  it('shared cards fall back to colorless for an unknown character', () => {
    expect(costColorKey(card('shared'), 'nobody', gameData)).toBe('colorless');
  });

  it('colorless and status cards are colorless', () => {
    expect(costColorKey(card('colorless'), 'silent', gameData)).toBe('colorless');
    expect(costColorKey(card('colorless', 'status'), 'silent', gameData)).toBe('colorless');
    expect(costColorKey(card('I', 'status'), 'ironclad', gameData)).toBe('colorless');
  });

  it('curses and quests are curse', () => {
    expect(costColorKey(card('colorless', 'curse'), 'ironclad', gameData)).toBe('curse');
    expect(costColorKey(card('I', 'curse'), 'ironclad', gameData)).toBe('curse');
    expect(costColorKey(card('colorless', 'quest'), 'ironclad', gameData)).toBe('curse');
  });
});
