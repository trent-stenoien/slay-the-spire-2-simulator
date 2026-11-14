/** #272: The Insatiable (Act 2 boss) and Frantic Escape's cost increase. Sandpit waits for its contract type. */
import { describe, expect, it } from 'vitest';
import { gameData } from '../data/index';
import { simulateCombat } from './combat';
import { cfg, deckOf, events, logged } from './combatTestHelpers';
import { makeGameData } from './testFixtures';
import type { GameData, Strategy } from './types';

const insatiableData = (): GameData => {
  const base = makeGameData();
  return {
    ...base,
    cards: { ...base.cards, frantic_escape: gameData.cards.frantic_escape! },
    enemies: { ...base.enemies, the_insatiable: gameData.enemies.the_insatiable! },
  };
};

const endTurn: Strategy = { decide: () => ({ kind: 'endTurn' }) };

describe('#272 The Insatiable data', () => {
  it('is an Act 2 (Hive) boss with 321 HP (A8 341)', () => {
    const d = gameData.enemies.the_insatiable!;
    expect(d).toMatchObject({ act: 2, zone: 'hive', difficulty: 'boss', hp: { min: 321, max: 321 } });
    expect(d.ascension['8']?.hp).toEqual({ min: 341, max: 341 });
  });

  it('opens with Liquify Ground, then cycles Thrash, Lunging Bite, Salivate, Thrash', () => {
    const r = logged(insatiableData(), endTurn, {
      enemyId: 'the_insatiable',
      playerStart: { powers: { intangible: 999 } },
    });
    const moves = events(r.log, 'enemyMove')
      .slice(0, 9)
      .map((e) => e.moveId);
    const cyc = ['thrash', 'lungingBite', 'salivate', 'thrash'];
    expect(moves).toEqual(['liquifyGround', ...cyc, ...cyc]);
  });

  it('base and A9 move numbers: Thrash 8x2 (9x2), Lunging Bite 28 (31), Salivate +2 (3) Strength', () => {
    const d = gameData.enemies.the_insatiable!;
    expect(d.moves.thrash!.effects).toEqual([{ type: 'attack', damage: 8, hits: 2 }]);
    expect(d.moves.lungingBite!.effects).toEqual([{ type: 'attack', damage: 28, hits: 1 }]);
    expect(d.moves.salivate!.effects).toEqual([{ type: 'gainStrength', amount: 2 }]);
    const a9 = d.ascension['9']!.moves!;
    expect(a9.thrash!.effects).toEqual([{ type: 'attack', damage: 9, hits: 2 }]);
    expect(a9.lungingBite!.effects).toEqual([{ type: 'attack', damage: 31, hits: 1 }]);
    expect(a9.salivate!.effects).toEqual([{ type: 'gainStrength', amount: 3 }]);
  });

  it('Liquify Ground shuffles 3 Frantic Escape into the draw pile and 3 into the discard pile', () => {
    let seen: { draw: number; discard: number; hand: number } | undefined;
    const strategy: Strategy = {
      decide(view) {
        if (view.state.turn === 2 && !seen) {
          const fe = (pile: readonly { cardId: string }[]) => pile.filter((c) => c.cardId === 'frantic_escape').length;
          const p = view.state.player;
          seen = { draw: fe(p.drawPile), discard: fe(p.discardPile), hand: fe(p.hand) };
        }
        return { kind: 'endTurn' };
      },
    };
    simulateCombat(
      insatiableData(),
      cfg({ enemyId: 'the_insatiable', deck: deckOf(['strike', 20]), playerStart: { powers: { intangible: 999 } } }),
      strategy,
    );
    // Turn 2 drew 5 from the draw pile, which may include some of the 3 shuffled in there.
    expect(seen!.draw + seen!.hand).toBe(3);
    expect(seen!.discard).toBe(3);
  });
});

describe('#272 Frantic Escape cost increase', () => {
  it('each play raises that copy’s cost by 1 for the rest of combat, through discard and reshuffle', () => {
    const costs: number[] = [];
    const strategy: Strategy = {
      decide(view) {
        const c = view.playable.find((p) => p.cardId === 'frantic_escape');
        if (c) {
          costs.push(c.cost!);
          return { kind: 'play', uid: c.uid };
        }
        return { kind: 'endTurn' };
      },
    };
    const r = simulateCombat(
      insatiableData(),
      cfg({ deck: deckOf(['frantic_escape', 1]), playerStart: { powers: { intangible: 999 } } }),
      strategy,
      { log: true },
    );
    // One copy, drawn every turn (reshuffled each time): cost 1, 2, 3, then 4 is above the 3 energy.
    expect(costs).toEqual([1, 2, 3]);
    expect(events(r.log, 'costChanged').map((e) => e.cost)).toEqual([2, 3, 4]);
  });
});
