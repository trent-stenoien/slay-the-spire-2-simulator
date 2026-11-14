/** #273: Aeonglass (Act 3 boss) data and its cycle. Withering Presence and Wither+X wait for contract additions. */
import { describe, expect, it } from 'vitest';
import { gameData } from '../data/index';
import { simulateCombat } from './combat';
import { cfg, deckOf, events, logged } from './combatTestHelpers';
import { makeGameData } from './testFixtures';
import type { GameData } from './types';

const glassData = (): GameData => {
  const base = makeGameData();
  return {
    ...base,
    cards: { ...base.cards, wither: gameData.cards.wither! },
    enemies: { aeonglass: gameData.enemies.aeonglass! },
  };
};

describe('#273 Aeonglass data', () => {
  it('is an Act 3 (Glory) boss with 512 HP (A8 535) and 3 Artifact', () => {
    const d = gameData.enemies.aeonglass!;
    expect(d).toMatchObject({ act: 3, zone: 'glory', difficulty: 'boss', hp: { min: 512, max: 512 } });
    expect(d.ascension['8']?.hp).toEqual({ min: 535, max: 535 });
    expect(d.startPowers).toEqual({ artifact: 3 });
  });

  it('base and A9 moves: Ebb 22 (26) + 33 Block, Eye Lasers 11x2 (12x2), Increasing Intensity 1 (2) Wither + 2 (3) Strength', () => {
    const d = gameData.enemies.aeonglass!;
    const wither = (count: number) => ({
      type: 'addCards',
      source: { kind: 'card', cardId: 'wither' },
      count,
      to: 'discard',
    });
    expect(d.moves.ebb!.effects).toEqual([
      { type: 'attack', damage: 22, hits: 1 },
      { type: 'gainBlock', amount: 33 },
    ]);
    expect(d.moves.eyeLasers!.effects).toEqual([{ type: 'attack', damage: 11, hits: 2 }]);
    expect(d.moves.increasingIntensity!.effects).toEqual([wither(1), { type: 'enemyGainStrength', amount: 2 }]);
    const a9 = d.ascension['9']!.moves!;
    expect(a9.ebb!.effects).toEqual([
      { type: 'attack', damage: 26, hits: 1 },
      { type: 'gainBlock', amount: 33 },
    ]);
    expect(a9.eyeLasers!.effects).toEqual([{ type: 'attack', damage: 12, hits: 2 }]);
    expect(a9.increasingIntensity!.effects).toEqual([wither(2), { type: 'enemyGainStrength', amount: 3 }]);
  });
});

describe('#273 Aeonglass in combat', () => {
  it('cycles Ebb, Eye Lasers, Increasing Intensity from turn 1', () => {
    const r = logged(
      glassData(),
      { decide: () => ({ kind: 'endTurn' }) },
      {
        enemyId: 'aeonglass',
        playerStart: { powers: { intangible: 999 } },
      },
    );
    const moves = events(r.log, 'enemyMove')
      .slice(0, 7)
      .map((e) => e.moveId);
    expect(moves).toEqual([
      'ebb',
      'eyeLasers',
      'increasingIntensity',
      'ebb',
      'eyeLasers',
      'increasingIntensity',
      'ebb',
    ]);
  });

  it('starts with 3 Artifact; Increasing Intensity shuffles a Wither into the discard pile and adds 2 Strength', () => {
    const seen: { turn: number; artifact?: number; strength: number; withers: number }[] = [];
    simulateCombat(
      glassData(),
      cfg({ enemyId: 'aeonglass', deck: deckOf(['defend', 10]), playerStart: { powers: { intangible: 999 } } }),
      {
        decide(view) {
          const s = view.state;
          if (!seen.some((x) => x.turn === s.turn)) {
            const all = [...s.player.drawPile, ...s.player.hand, ...s.player.discardPile];
            seen.push({
              turn: s.turn,
              artifact: s.enemy.powers?.artifact,
              strength: s.enemy.strength,
              withers: all.filter((c) => c.cardId === 'wither').length,
            });
          }
          return { kind: 'endTurn' };
        },
      },
    );
    expect(seen.slice(0, 7)).toEqual([
      { turn: 1, artifact: 3, strength: 0, withers: 0 },
      { turn: 2, artifact: 3, strength: 0, withers: 0 },
      { turn: 3, artifact: 3, strength: 0, withers: 0 },
      { turn: 4, artifact: 3, strength: 2, withers: 1 },
      { turn: 5, artifact: 3, strength: 2, withers: 1 },
      { turn: 6, artifact: 3, strength: 2, withers: 1 },
      { turn: 7, artifact: 3, strength: 4, withers: 2 },
    ]);
  });

  it('A9 Increasing Intensity shuffles 2 Withers and adds 3 Strength', () => {
    const r = logged(
      glassData(),
      { decide: () => ({ kind: 'endTurn' }) },
      {
        enemyId: 'aeonglass',
        ascension: 9,
        playerStart: { powers: { intangible: 999 } },
      },
    );
    const gen = events(r.log, 'generated').filter((e) => e.cardId === 'wither');
    expect(gen.slice(0, 2).map((e) => e.to)).toEqual(['discard', 'discard']);
    expect(gen.length % 2).toBe(0);
  });
});
