/** Cards and piles: drawing, discarding, exhausting, Ascender's Bane. */
import { describe, expect, it } from 'vitest';
import { simulateCombat } from './combat';
import { cards, makeGameData } from './testFixtures';
import { cfg, deckOf, passive, scripted, dummyData, logged, events } from './combatTestHelpers';
import type { Strategy } from './types';

describe('cards and piles', () => {
  it("Ascender's Bane is added only at A5+ and exhausts from hand at end of turn", () => {
    const data = dummyData();
    const deck = deckOf(['defend', 4]);
    const a4 = logged(data, passive, { enemyId: 'dummy', deck, ascension: 4 });
    expect(events(a4.log, 'shuffle')[0]!.count).toBe(4);
    expect(events(a4.log, 'draw').some((d) => d.cardId === 'ascenders_bane')).toBe(false);

    const a5 = logged(data, passive, { enemyId: 'dummy', deck, ascension: 5 });
    expect(events(a5.log, 'shuffle')[0]!.count).toBe(5);
    const bane = events(a5.log, 'draw').find((d) => d.cardId === 'ascenders_bane')!;
    expect(bane.uid).toBe(4); // appended after the config deck
    const ex = events(a5.log, 'exhaust');
    expect(ex).toEqual([{ t: 'exhaust', uid: 4, cardId: 'ascenders_bane', reason: 'ethereal' }]);
    // Exhausted, so it is never drawn again.
    expect(events(a5.log, 'draw').filter((d) => d.cardId === 'ascenders_bane')).toHaveLength(1);
  });

  it("Ascender's Bane is never offered as playable", () => {
    const data = dummyData();
    const strat: Strategy = {
      decide(view) {
        expect(view.playable.some((c) => c.cardId === 'ascenders_bane')).toBe(false);
        return { kind: 'endTurn' };
      },
    };
    simulateCombat(data, cfg({ enemyId: 'dummy', deck: [], ascension: 20 }), strat);
  });

  it('exhaust keyword sends a played card to the exhaust pile', () => {
    const data = dummyData();
    data.cards.slash = { ...cards.strike!, id: 'slash', code: 'Sl', keywords: ['exhaust'] };
    const strat = scripted((turn) => (turn === 1 ? ['slash'] : []));
    const r = logged(data, strat, { enemyId: 'dummy', deck: deckOf(['slash', 1]) });
    expect(events(r.log, 'exhaust')).toEqual([{ t: 'exhaust', uid: 0, cardId: 'slash', reason: 'keyword' }]);
    // Nothing left to draw on turn 2.
    expect(events(r.log, 'draw')).toHaveLength(1);
  });

  it('reshuffles the discard pile mid-draw', () => {
    const data = dummyData();
    const r = logged(data, passive, { enemyId: 'dummy', deck: deckOf(['strike', 7]) });
    const log = r.log!;
    const t2 = log.findIndex((e) => e.t === 'turnStart' && e.turn === 2 && e.side === 'player');
    const turn2 = log
      .slice(t2)
      .filter((e) => e.t === 'draw' || e.t === 'shuffle')
      .slice(0, 6);
    expect(turn2.map((e) => e.t)).toEqual(['draw', 'draw', 'shuffle', 'draw', 'draw', 'draw']);
    expect(turn2[2]).toEqual({ t: 'shuffle', reason: 'reshuffle', count: 5 });
  });

  it('stops drawing when both piles are empty', () => {
    const data = dummyData();
    const strat = scripted((turn) => (turn === 1 ? ['defend'] : []));
    const r = logged(data, strat, { enemyId: 'dummy', deck: deckOf(['defend', 2]) });
    const t1 = r.log!.findIndex((e) => e.t === 'turnStart' && e.turn === 1);
    const t2 = r.log!.findIndex((e) => e.t === 'turnStart' && e.turn === 2);
    expect(r.log!.slice(t1, t2).filter((e) => e.t === 'draw')).toHaveLength(2);
  });

  it('a card drawn at the hand limit goes to the discard pile', () => {
    const data = dummyData();
    data.characters.ironclad!.drawPerTurn = 12;
    const r = logged(data, passive, { enemyId: 'dummy', deck: deckOf(['strike', 12]) });
    const t1End = r.log!.findIndex((e) => e.t === 'turnEnd');
    const turn1 = r.log!.slice(0, t1End);
    expect(turn1.filter((e) => e.t === 'draw')).toHaveLength(12);
    // During the draw phase (up to the last draw): exactly the 11th and 12th cards are discarded.
    const lastDraw = turn1.map((e) => e.t).lastIndexOf('draw');
    const drawPhase = turn1.slice(0, lastDraw + 2);
    expect(drawPhase.filter((e) => e.t === 'discard')).toHaveLength(2);
    // The other 10 were in hand and get discarded at end of turn: 12 discards total.
    expect(turn1.filter((e) => e.t === 'discard')).toHaveLength(12);
  });

  it('a strategy playing an illegal uid throws', () => {
    const bad: Strategy = { decide: () => ({ kind: 'play', uid: 9999 }) };
    expect(() => simulateCombat(makeGameData(), cfg(), bad)).toThrow(/illegal/);
    const unaffordable: Strategy = {
      decide: (v) => ({
        kind: 'play',
        uid: v.state.player.hand.find((c) => c.cost !== null && c.cost > v.state.player.energy)?.uid ?? -1,
      }),
    };
    expect(() => simulateCombat(makeGameData(), cfg(), unaffordable)).toThrow(/illegal/);
  });

  it('energy refills to energyPerTurn each turn', () => {
    const energies: number[] = [];
    const strat: Strategy = {
      decide(v) {
        if (v.state.player.energy === 3) energies.push(v.state.turn);
        const c = v.playable[0];
        return c ? { kind: 'play', uid: c.uid } : { kind: 'endTurn' };
      },
    };
    simulateCombat(dummyData(), cfg({ enemyId: 'dummy', deck: deckOf(['defend', 10]) }), strat);
    expect(energies.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
