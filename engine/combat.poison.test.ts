/** Poison on the enemy. */
import { describe, expect, it } from 'vitest';
import { runCombat, simulateCombat } from './combat';
import { cards, makeEnemy, makeGameData } from './testFixtures';
import { cfg, deckOf, passive, scripted, withEnemy, dummy, logged, events } from './combatTestHelpers';
import type { Strategy } from './types';

describe('Poison', () => {
  const withVenom = (...extraEnemies: ReturnType<typeof makeEnemy>[]) => {
    const data = withEnemy(makeGameData(), dummy(), ...extraEnemies);
    data.cards.venom = {
      ...cards.defend!,
      id: 'venom',
      code: 'Vn',
      cost: 0,
      effects: [{ type: 'applyPoison', amount: 3 }],
      upgraded: null,
    };
    data.cards.expose = {
      ...cards.defend!,
      id: 'expose',
      code: 'Ex',
      cost: 0,
      effects: [
        { type: 'applyVulnerable', amount: 5 },
        { type: 'applyWeak', amount: 5 },
      ],
      upgraded: null,
    };
    return data;
  };

  it('ticks at the start of the enemy turn after block reset, before the move; then decreases by 1', () => {
    const data = withVenom();
    const strat = scripted((turn) => (turn === 1 ? ['venom'] : []));
    const r = logged(data, strat, { enemyId: 'dummy', deck: deckOf(['venom', 1], ['defend', 9]) });
    const log = r.log!;
    expect(events(log, 'poison')).toEqual([{ t: 'poison', amount: 3, total: 3 }]);
    expect(events(log, 'poisonDamage')).toEqual([
      { t: 'poisonDamage', amount: 3, hpAfter: 996 },
      { t: 'poisonDamage', amount: 2, hpAfter: 994 },
      { t: 'poisonDamage', amount: 1, hpAfter: 993 },
    ]);
    // Order within enemy turn 1: turnStart enemy → blockReset → poisonDamage → enemyMove.
    const enemyStart = log.findIndex((e) => e.t === 'turnStart' && e.side === 'enemy');
    expect(log.slice(enemyStart, enemyStart + 4).map((e) => e.t)).toEqual([
      'turnStart',
      'blockReset',
      'poisonDamage',
      'enemyMove',
    ]);
    // Poison does not tick at the end of the player's turn (no debuffTick for it, and still 3 at the enemy turn).
    expect(events(log, 'debuffTick')).toHaveLength(0);
    expect(r.enemyHpRemaining).toBe(993);
  });

  it('stacks additively', () => {
    const data = withVenom();
    const strat = scripted((turn) => (turn === 1 ? ['venom', 'venom'] : turn === 2 ? ['venom'] : []));
    const r = logged(data, strat, { enemyId: 'dummy', deck: deckOf(['venom', 3], ['defend', 2]) });
    expect(events(r.log, 'poison').map((p) => p.total)).toEqual([3, 6, 8]);
    // 6 → hits 6 (→5); +3 = 8 → hits 8 (→7) ...
    expect(
      events(r.log, 'poisonDamage')
        .slice(0, 3)
        .map((p) => p.amount),
    ).toEqual([6, 8, 7]);
  });

  it('is HP loss: ignores enemy Block and is not changed by Strength, Weak or Vulnerable', () => {
    const blocker = makeEnemy('blocker', 999, {
      fortify: {
        name: 'Fortify',
        effects: [
          { type: 'gainBlock', amount: 50 },
          { type: 'gainStrength', amount: 5 },
        ],
      },
    });
    const data = withVenom(blocker);
    data.characters.ironclad!.drawPerTurn = 3;
    const strat = scripted((turn) => (turn === 1 ? ['expose', 'venom'] : []));
    const r = logged(data, strat, { enemyId: 'blocker', deck: deckOf(['expose', 1], ['venom', 1], ['defend', 1]) });
    const pd = events(r.log, 'poisonDamage');
    expect(pd.map((p) => p.amount)).toEqual([3, 2, 1]);
    expect(pd.map((p) => p.hpAfter)).toEqual([996, 994, 993]);
    expect(events(r.log, 'damage')).toHaveLength(0);
  });

  it('a Poison kill ends combat as a win before the enemy moves', () => {
    const brute = makeEnemy('brute', 5, {
      smash: { name: 'Smash', effects: [{ type: 'attack', damage: 99, hits: 1 }] },
    });
    const data = withVenom(brute);
    const strat = scripted((turn) => (turn === 1 ? ['venom', 'venom'] : []));
    const r = logged(data, strat, { enemyId: 'brute', deck: deckOf(['venom', 2], ['defend', 3]) });
    expect(r).toMatchObject({ outcome: 'win', turns: 1, hpLost: 0, enemyHpRemaining: 0 });
    expect(events(r.log, 'enemyMove')).toHaveLength(0);
    expect(events(r.log, 'poisonDamage')).toEqual([{ t: 'poisonDamage', amount: 6, hpAfter: 0 }]);
    expect(r.log!.at(-1)).toEqual({ t: 'combatEnd', outcome: 'win', turns: 1, hpLost: 0 });
  });

  it('an enemy move that applies Poison is rejected (no Poison on the player in v1)', () => {
    const e = makeEnemy('spitter', 999, { spit: { name: 'Spit', effects: [{ type: 'applyPoison', amount: 2 }] } });
    const data = withEnemy(makeGameData(), e);
    expect(() => simulateCombat(data, cfg({ enemyId: 'spitter', deck: [] }), passive)).toThrow(/Poison/);
  });

  it('computeIntent ignores Poison', () => {
    const data = withVenom();
    const intents: number[] = [];
    const strat: Strategy = {
      decide(v) {
        intents.push(v.intent.totalIncoming);
        const c = v.playable.find((p) => p.cardId === 'venom');
        return c ? { kind: 'play', uid: c.uid } : { kind: 'endTurn' };
      },
    };
    simulateCombat(data, cfg({ deck: deckOf(['venom', 5]) }), strat);
    expect(intents[0]).toBe(12);
  });

  it('Poison is deterministic and identical with or without a log', () => {
    const data = withVenom();
    data.cards.stab = {
      ...cards.strike!,
      id: 'stab',
      code: 'Sb',
      effects: [
        { type: 'attack', damage: 6, hits: 1 },
        { type: 'applyPoison', amount: 3 },
      ],
      upgraded: null,
    };
    for (let s = 0; s < 10; s++) {
      const config = cfg({ seed: s, deck: deckOf(['stab', 5], ['defend', 5]) });
      const a = runCombat(data, config, { log: true });
      expect(runCombat(data, config, { log: true })).toEqual(a);
      const { log: _l, ...noLog } = a;
      expect(runCombat(data, config)).toEqual(noLog);
      expect(events(a.log, 'poisonDamage').length).toBeGreaterThan(0);
    }
  });
});
