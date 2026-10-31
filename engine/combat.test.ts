import { describe, expect, it } from 'vitest';
import { attackDamage, blockGain, computeIntent, makeCardInstance, runCombat, simulateCombat } from './combat';
import { cards, makeEnemy, makeGameData } from './testFixtures';
import type {
  CardDef,
  CombatConfig,
  Deck,
  GameData,
  GameEvent,
  Strategy,
  StrategyView,
} from './types';

function cfg(overrides: Partial<CombatConfig> = {}): CombatConfig {
  return {
    characterId: 'ironclad',
    deck: [
      { cardId: 'strike', upgraded: false, count: 5 },
      { cardId: 'defend', upgraded: false, count: 4 },
      { cardId: 'bash', upgraded: false, count: 1 },
    ],
    enemyId: 'nibbit',
    ascension: 0,
    strategy: { kind: 'greedyDamage' },
    seed: 1,
    ...overrides,
  };
}

const deckOf = (...entries: [string, number][]): Deck =>
  entries.map(([cardId, count]) => ({ cardId, upgraded: false, count }));

/** Strategy that ends every turn immediately. */
const passive: Strategy = { decide: () => ({ kind: 'endTurn' }) };

/** Plays the first playable card of `cardId`, up to `perTurn(turn)` plays in a turn. */
function scripted(plan: (turn: number) => string[]): Strategy {
  let turn = -1;
  let queue: string[] = [];
  return {
    decide(view: StrategyView) {
      if (view.state.turn !== turn) {
        turn = view.state.turn;
        queue = [...plan(turn)];
      }
      const want = queue.shift();
      if (want === undefined) return { kind: 'endTurn' };
      const c = view.playable.find((p) => p.cardId === want);
      if (!c) throw new Error(`scripted: ${want} not playable on turn ${turn}`);
      return { kind: 'play', uid: c.uid };
    },
  };
}

const withEnemy = (data: GameData, ...enemies: ReturnType<typeof makeEnemy>[]) => {
  for (const e of enemies) data.enemies[e.id] = e;
  return data;
};

const dummy = () => makeEnemy('dummy', 999, { wait: { name: 'Wait', effects: [] } });

type Ev<T extends GameEvent['t']> = Extract<GameEvent, { t: T }>;
const events = <T extends GameEvent['t']>(log: GameEvent[] | undefined, t: T): Ev<T>[] =>
  (log ?? []).filter((e): e is Ev<T> => e.t === t);

// ---------------------------------------------------------------------------

describe('rule helpers', () => {
  it('attackDamage: Strength, Weak, Vulnerable, floor once, min 0', () => {
    expect(attackDamage(6, 0, 0, 0)).toBe(6);
    expect(attackDamage(6, 2, 0, 0)).toBe(8);
    expect(attackDamage(6, 0, 0, 1)).toBe(9);
    expect(attackDamage(6, 0, 1, 0)).toBe(4); // 4.5 → 4
    expect(attackDamage(7, 0, 1, 1)).toBe(7); // 7 × 0.75 × 1.5 = 7.875 → 7 (single floor)
    expect(attackDamage(2, -5, 0, 0)).toBe(0);
  });

  it('blockGain: Frail ×0.75 floored', () => {
    expect(blockGain(5, 0)).toBe(5);
    expect(blockGain(5, 1)).toBe(3);
    expect(blockGain(8, 2)).toBe(6);
  });

  it('computeIntent: non-attack move is 0/0/0', () => {
    const i = computeIntent('hiss', { name: 'Hiss', effects: [{ type: 'gainStrength', amount: 2 }] },
      { strength: 0, debuffs: { vulnerable: 0, weak: 0, frail: 0 } },
      { debuffs: { vulnerable: 0, weak: 0, frail: 0 } });
    expect(i).toEqual({ moveId: 'hiss', name: 'Hiss', attacks: [], totalIncoming: 0 });
  });

  it('computeIntent: multi-hit with Strength and player Vulnerable', () => {
    const i = computeIntent('x', { name: 'X', effects: [{ type: 'attack', damage: 2, hits: 2 }] },
      { strength: 2, debuffs: { vulnerable: 0, weak: 0, frail: 0 } },
      { debuffs: { vulnerable: 1, weak: 0, frail: 0 } });
    expect(i).toMatchObject({ attacks: [{ damagePerHit: 6, hits: 2 }], totalIncoming: 12 });
  });

  it('computeIntent: sums across several attack effects', () => {
    const i = computeIntent('x', {
      name: 'X',
      effects: [{ type: 'attack', damage: 5, hits: 1 }, { type: 'gainBlock', amount: 3 }, { type: 'attack', damage: 3, hits: 2 }],
    }, { strength: 1, debuffs: { vulnerable: 0, weak: 0, frail: 0 } }, { debuffs: { vulnerable: 0, weak: 0, frail: 0 } });
    expect(i).toMatchObject({ attacks: [{ damagePerHit: 6, hits: 1 }, { damagePerHit: 4, hits: 2 }], totalIncoming: 6 + 4 * 2 });
  });

  it('makeCardInstance applies upgrades and nulls cost for unplayable', () => {
    const s = makeCardInstance(cards.strike!, true, 3);
    expect(s).toMatchObject({ uid: 3, upgraded: true, cost: 1, effects: [{ type: 'attack', damage: 9, hits: 1 }] });
    const def: CardDef = { ...cards.strike!, upgraded: { cost: 0, keywords: ['exhaust'] } };
    expect(makeCardInstance(def, true, 0)).toMatchObject({ cost: 0, keywords: ['exhaust'], effects: [{ damage: 6 }] });
    expect(makeCardInstance({ ...cards.strike!, keywords: ['unplayable'] }, false, 0).cost).toBeNull();
    expect(() => makeCardInstance(cards.ascenders_bane!, true, 0)).toThrow();
  });
});

describe('runCombat setup', () => {
  it('is deterministic: same config + seed → identical log and result', () => {
    const data = makeGameData();
    const a = runCombat(data, cfg({ seed: 777 }), { log: true });
    const b = runCombat(data, cfg({ seed: 777 }), { log: true });
    expect(a).toEqual(b);
    expect(a.log!.length).toBeGreaterThan(10);
  });

  it('different seeds generally differ', () => {
    const data = makeGameData();
    const logs = new Set(
      Array.from({ length: 10 }, (_, s) => JSON.stringify(runCombat(data, cfg({ seed: s }), { log: true }).log)),
    );
    expect(logs.size).toBeGreaterThan(1);
  });

  it('omits the log unless requested', () => {
    const r = runCombat(makeGameData(), cfg());
    expect(r.log).toBeUndefined();
    expect('log' in r).toBe(false);
  });

  it('rolls enemy HP in range and starts the player at max HP', () => {
    const data = makeGameData();
    const hps = new Set<number>();
    for (let s = 0; s < 200; s++) {
      const start = events(runCombat(data, cfg({ seed: s }), { log: true }).log, 'combatStart')[0]!;
      expect(start.playerHp).toBe(80);
      hps.add(start.enemyHp);
    }
    expect([...hps].sort()).toEqual([42, 43, 44, 45, 46]);
  });

  it('A8 Nibbit rolls 44–48 HP', () => {
    const data = makeGameData();
    for (let s = 0; s < 100; s++) {
      const hp = events(runCombat(data, cfg({ seed: s, ascension: 8 }), { log: true }).log, 'combatStart')[0]!.enemyHp;
      expect(hp).toBeGreaterThanOrEqual(44);
      expect(hp).toBeLessThanOrEqual(48);
    }
  });

  it('assigns uids 0..n-1 and logs the start shuffle', () => {
    const r = simulateCombat(makeGameData(), cfg({ deck: deckOf(['defend', 10]) }), passive, { log: true });
    expect(events(r.log, 'shuffle')[0]).toEqual({ t: 'shuffle', reason: 'start', count: 10 });
    const firstTen = events(r.log, 'draw').slice(0, 10).map((d) => d.uid);
    expect([...firstTen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('throws on unknown ids', () => {
    const data = makeGameData();
    expect(() => runCombat(data, cfg({ characterId: 'nope' }))).toThrow();
    expect(() => runCombat(data, cfg({ enemyId: 'nope' }))).toThrow();
    expect(() => runCombat(data, cfg({ deck: deckOf(['nope', 1]) }))).toThrow();
  });

  it('random pattern start is seeded and within the cycle', () => {
    const e = makeEnemy('rnd', 999, {
      a: { name: 'A', effects: [] }, b: { name: 'B', effects: [] }, c: { name: 'C', effects: [] },
    });
    e.pattern.start = 'random';
    const data = withEnemy(makeGameData(), e);
    const starts = new Set<string>();
    for (let s = 0; s < 50; s++) {
      const log = simulateCombat(data, cfg({ enemyId: 'rnd', seed: s, deck: [] }), passive, { log: true }).log;
      const first = events(log, 'enemyMove')[0]!.moveId;
      const again = events(simulateCombat(data, cfg({ enemyId: 'rnd', seed: s, deck: [] }), passive, { log: true }).log, 'enemyMove')[0]!.moveId;
      expect(again).toBe(first);
      starts.add(first);
    }
    expect([...starts].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('damage rules in combat', () => {
  it('Vulnerable: Bash then Strike = 8 + 9; Vulnerable 2 lasts two player turns', () => {
    const data = withEnemy(makeGameData(), dummy());
    const config = cfg({ enemyId: 'dummy', deck: deckOf(['bash', 1], ['strike', 4]) });
    const strat = scripted((turn) => (turn === 1 ? ['bash', 'strike'] : turn <= 3 ? ['strike'] : []));
    const r = simulateCombat(data, config, strat, { log: true });
    const log = r.log!;
    expect(events(log, 'damage').slice(0, 4).map((d) => d.amount)).toEqual([8, 9, 9, 6]);
    const ticks = events(log, 'debuffTick').filter((e) => e.side === 'enemy' && e.kind === 'vulnerable');
    expect(ticks.slice(0, 2).map((t) => t.total)).toEqual([1, 0]);
    expect(ticks).toHaveLength(2);
    expect(events(log, 'debuff')[0]).toEqual({ t: 'debuff', side: 'enemy', kind: 'vulnerable', amount: 2, total: 2 });
  });

  it('multi-hit + Strength: intent 8 and block absorbs across hits', () => {
    const e = makeEnemy('twin', 999, {
      hiss: { name: 'Hiss', effects: [{ type: 'gainStrength', amount: 2 }] },
      double: { name: 'Double', effects: [{ type: 'attack', damage: 2, hits: 2 }] },
    });
    const data = withEnemy(makeGameData(), e);
    const intents: number[] = [];
    const strat: Strategy = {
      decide(view) {
        intents.push(view.intent.totalIncoming);
        // Play one Defend on turn 2 only.
        const d = view.playable.find((c) => c.cardId === 'defend');
        if (view.state.turn === 2 && view.state.player.block === 0 && d) return { kind: 'play', uid: d.uid };
        return { kind: 'endTurn' };
      },
    };
    const r = simulateCombat(data, cfg({ enemyId: 'twin', deck: deckOf(['defend', 5]) }), strat, { log: true });
    expect(intents.slice(0, 2)).toEqual([0, 8]);
    const dmg = events(r.log, 'damage').slice(0, 2);
    expect(dmg).toEqual([
      { t: 'damage', source: 'enemy', target: 'player', amount: 4, blocked: 4, hpLoss: 0 },
      { t: 'damage', source: 'enemy', target: 'player', amount: 4, blocked: 1, hpLoss: 3 },
    ]);
  });

  it('enemy Strength persists: Nibbit second Butt hits 14 at A0', () => {
    const r = simulateCombat(makeGameData(), cfg({ deck: [] }), passive, { log: true });
    expect(events(r.log, 'enemyMove').slice(0, 4).map((m) => m.moveId)).toEqual(['butt', 'hesitantStrike', 'hiss', 'butt']);
    expect(events(r.log, 'damage').slice(0, 3).map((d) => d.amount)).toEqual([12, 6, 14]);
  });

  it('A9 Nibbit uses the A9 numbers', () => {
    const r = simulateCombat(makeGameData(), cfg({ deck: [], ascension: 9 }), passive, { log: true });
    expect(events(r.log, 'damage').slice(0, 3).map((d) => d.amount)).toEqual([13, 7, 16]);
  });

  it('enemy block protects it during the next player turn only', () => {
    const strat = scripted((turn) => (turn <= 4 ? ['strike'] : []));
    const r = simulateCombat(makeGameData(), cfg({ deck: deckOf(['strike', 10]) }), strat, { log: true });
    const playerHits = events(r.log, 'damage').filter((d) => d.source === 'player');
    // Turn 1, 2: no enemy block. Hesitant Strike (enemy turn 2) gives 5 block.
    // Turn 3: Strike 6 → 5 blocked, 1 HP. Enemy block resets on its turn 3.
    // Turn 4: full damage again.
    expect(playerHits.map((d) => [d.blocked, d.hpLoss])).toEqual([[0, 6], [0, 6], [5, 1], [0, 6]]);
    const resets = events(r.log, 'blockReset').filter((b) => b.side === 'enemy');
    expect(resets.length).toBeGreaterThanOrEqual(3);
  });

  it('player block resets at the start of each player turn', () => {
    const strat = scripted((turn) => (turn === 1 ? ['defend', 'defend', 'defend'] : []));
    const data = withEnemy(makeGameData(), makeEnemy('late', 999, {
      wait: { name: 'Wait', effects: [] },
      hit: { name: 'Hit', effects: [{ type: 'attack', damage: 10, hits: 1 }] },
    }));
    const r = simulateCombat(data, cfg({ enemyId: 'late', deck: deckOf(['defend', 10]) }), strat, { log: true });
    // 15 block on turn 1 is gone by the enemy's turn-2 hit.
    expect(events(r.log, 'damage')[0]).toMatchObject({ amount: 10, blocked: 0, hpLoss: 10 });
  });

  it('enemy debuffs target the player, Weak reduces the enemy\'s hits, Frail reduces block, and each side ticks on its own turn end', () => {
    const e = makeEnemy('hexer', 999, {
      hex: { name: 'Hex', effects: [{ type: 'applyFrail', amount: 2 }, { type: 'applyVulnerable', amount: 1 }] },
      hit: { name: 'Hit', effects: [{ type: 'attack', damage: 10, hits: 1 }] },
    });
    const weakener: CardDef = {
      ...cards.defend!, id: 'weakener', code: 'Wk', cost: 0,
      effects: [{ type: 'applyWeak', amount: 1 }, { type: 'gainBlock', amount: 8 }], upgraded: null,
    };
    const data = withEnemy(makeGameData(), e);
    data.cards.weakener = weakener;
    const strat = scripted((turn) => (turn === 2 ? ['weakener'] : []));
    const r = simulateCombat(data, cfg({ enemyId: 'hexer', deck: deckOf(['weakener', 5]) }), strat, { log: true });
    const log = r.log!;
    expect(events(log, 'debuff').slice(0, 3)).toEqual([
      { t: 'debuff', side: 'player', kind: 'frail', amount: 2, total: 2 },
      { t: 'debuff', side: 'player', kind: 'vulnerable', amount: 1, total: 1 },
      { t: 'debuff', side: 'enemy', kind: 'weak', amount: 1, total: 1 },
    ]);
    // Frail 2 → block 8 × 0.75 = 6.
    expect(events(log, 'block')[0]).toMatchObject({ side: 'player', amount: 6, total: 6 });
    // End of player turn 2: player Frail 2→1, Vulnerable 1→0. Enemy Weak 1→0 only after its move.
    const turn2Ticks = events(log, 'debuffTick').slice(0, 3);
    expect(turn2Ticks).toEqual([
      { t: 'debuffTick', side: 'player', kind: 'vulnerable', total: 0 },
      { t: 'debuffTick', side: 'player', kind: 'frail', total: 1 },
      { t: 'debuffTick', side: 'enemy', kind: 'weak', total: 0 },
    ]);
    // Player Vulnerable expired, enemy Weak still active on its hit: 10 × 0.75 = 7, 6 blocked.
    expect(events(log, 'damage')[0]).toMatchObject({ amount: 7, blocked: 6, hpLoss: 1 });
    const hitIdx = log.findIndex((e) => e.t === 'damage');
    const weakTickIdx = log.findIndex((e) => e.t === 'debuffTick' && e.side === 'enemy');
    expect(weakTickIdx).toBeGreaterThan(hitIdx);
  });

  it('1 Vulnerable on the enemy boosts that player turn and is gone by the next one', () => {
    const data = withEnemy(makeGameData(), dummy());
    data.cards.tap = {
      ...cards.strike!, id: 'tap', code: 'Tp', cost: 0,
      effects: [{ type: 'applyVulnerable', amount: 1 }], upgraded: null,
    };
    const config = cfg({ enemyId: 'dummy', deck: deckOf(['tap', 1], ['strike', 9]) });
    const strat = scripted((turn) => (turn === 1 ? ['tap', 'strike', 'strike'] : turn === 2 ? ['strike'] : []));
    const r = simulateCombat(data, config, strat, { log: true });
    const log = r.log!;
    expect(events(log, 'damage').slice(0, 3).map((d) => d.amount)).toEqual([9, 9, 6]);
    // The tick happens at the end of the enemy turn, after its move, not at the end of the player turn.
    const tickIdx = log.findIndex((e) => e.t === 'debuffTick' && e.side === 'enemy' && e.kind === 'vulnerable');
    const moveIdx = log.findIndex((e) => e.t === 'enemyMove');
    const playerEndIdx = log.findIndex((e) => e.t === 'turnEnd' && e.side === 'player');
    const enemyEndIdx = log.findIndex((e) => e.t === 'turnEnd' && e.side === 'enemy');
    expect(tickIdx).toBeGreaterThan(playerEndIdx);
    expect(tickIdx).toBeGreaterThan(moveIdx);
    expect(tickIdx).toBeLessThan(enemyEndIdx);
    expect(log[tickIdx]).toEqual({ t: 'debuffTick', side: 'enemy', kind: 'vulnerable', total: 0 });
  });

  it('Weak applied to the enemy reduces its very next attack', () => {
    const e = makeEnemy('brute', 999, { hit: { name: 'Hit', effects: [{ type: 'attack', damage: 12, hits: 1 }] } });
    const data = withEnemy(makeGameData(), e);
    data.cards.sap = {
      ...cards.strike!, id: 'sap', code: 'Sp', cost: 0,
      effects: [{ type: 'applyWeak', amount: 1 }], upgraded: null,
    };
    const intents: number[] = [];
    const strat: Strategy = {
      decide(view) {
        if (view.state.turn === 1) {
          const c = view.playable.find((p) => p.cardId === 'sap');
          if (c) return { kind: 'play', uid: c.uid };
          intents.push(view.intent.totalIncoming);
        }
        return { kind: 'endTurn' };
      },
    };
    const r = simulateCombat(data, cfg({ enemyId: 'brute', deck: deckOf(['sap', 1], ['defend', 9]) }), strat, { log: true });
    expect(intents).toEqual([9]); // intent already reflects Weak
    expect(events(r.log, 'damage').slice(0, 2).map((d) => d.amount)).toEqual([9, 12]);
  });

  it('player debuffs still tick at the end of the player turn', () => {
    const e = makeEnemy('hexer2', 999, {
      hex: { name: 'Hex', effects: [{ type: 'applyWeak', amount: 1 }] },
      wait: { name: 'Wait', effects: [] },
    });
    const data = withEnemy(makeGameData(), e);
    const r = simulateCombat(data, cfg({ enemyId: 'hexer2', deck: deckOf(['defend', 5]) }), passive, { log: true });
    const log = r.log!;
    const tickIdx = log.findIndex((ev) => ev.t === 'debuffTick' && ev.side === 'player');
    const t2End = log.findIndex((ev) => ev.t === 'turnEnd' && ev.turn === 2 && ev.side === 'player');
    const t2EnemyStart = log.findIndex((ev) => ev.t === 'turnStart' && ev.turn === 2 && ev.side === 'enemy');
    expect(tickIdx).toBeLessThan(t2End);
    expect(t2End).toBeLessThan(t2EnemyStart);
  });

  it('debuff timing is deterministic', () => {
    const data = makeGameData();
    const a = runCombat(data, cfg({ seed: 4242 }), { log: true });
    const b = runCombat(data, cfg({ seed: 4242 }), { log: true });
    expect(a).toEqual(b);
    expect(events(a.log, 'debuffTick').every((t) => t.side === 'enemy')).toBe(true);
  });
});

describe('cards and piles', () => {
  it("Ascender's Bane is added only at A5+ and exhausts from hand at end of turn", () => {
    const data = withEnemy(makeGameData(), dummy());
    const deck = deckOf(['defend', 4]);
    const a4 = simulateCombat(data, cfg({ enemyId: 'dummy', deck, ascension: 4 }), passive, { log: true });
    expect(events(a4.log, 'shuffle')[0]!.count).toBe(4);
    expect(events(a4.log, 'draw').some((d) => d.cardId === 'ascenders_bane')).toBe(false);

    const a5 = simulateCombat(data, cfg({ enemyId: 'dummy', deck, ascension: 5 }), passive, { log: true });
    expect(events(a5.log, 'shuffle')[0]!.count).toBe(5);
    const bane = events(a5.log, 'draw').find((d) => d.cardId === 'ascenders_bane')!;
    expect(bane.uid).toBe(4); // appended after the config deck
    const ex = events(a5.log, 'exhaust');
    expect(ex).toEqual([{ t: 'exhaust', uid: 4, cardId: 'ascenders_bane', reason: 'ethereal' }]);
    // Exhausted, so it is never drawn again.
    expect(events(a5.log, 'draw').filter((d) => d.cardId === 'ascenders_bane')).toHaveLength(1);
  });

  it("Ascender's Bane is never offered as playable", () => {
    const data = withEnemy(makeGameData(), dummy());
    const strat: Strategy = {
      decide(view) {
        expect(view.playable.some((c) => c.cardId === 'ascenders_bane')).toBe(false);
        return { kind: 'endTurn' };
      },
    };
    simulateCombat(data, cfg({ enemyId: 'dummy', deck: [], ascension: 20 }), strat);
  });

  it('exhaust keyword sends a played card to the exhaust pile', () => {
    const data = withEnemy(makeGameData(), dummy());
    data.cards.slash = { ...cards.strike!, id: 'slash', code: 'Sl', keywords: ['exhaust'] };
    const strat = scripted((turn) => (turn === 1 ? ['slash'] : []));
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['slash', 1]) }), strat, { log: true });
    expect(events(r.log, 'exhaust')).toEqual([{ t: 'exhaust', uid: 0, cardId: 'slash', reason: 'keyword' }]);
    // Nothing left to draw on turn 2.
    expect(events(r.log, 'draw')).toHaveLength(1);
  });

  it('reshuffles the discard pile mid-draw', () => {
    const data = withEnemy(makeGameData(), dummy());
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['strike', 7]) }), passive, { log: true });
    const log = r.log!;
    const t2 = log.findIndex((e) => e.t === 'turnStart' && e.turn === 2 && e.side === 'player');
    const turn2 = log.slice(t2).filter((e) => e.t === 'draw' || e.t === 'shuffle').slice(0, 6);
    expect(turn2.map((e) => e.t)).toEqual(['draw', 'draw', 'shuffle', 'draw', 'draw', 'draw']);
    expect(turn2[2]).toEqual({ t: 'shuffle', reason: 'reshuffle', count: 5 });
  });

  it('stops drawing when both piles are empty', () => {
    const data = withEnemy(makeGameData(), dummy());
    const strat = scripted((turn) => (turn === 1 ? ['defend'] : []));
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['defend', 2]) }), strat, { log: true });
    const t1 = r.log!.findIndex((e) => e.t === 'turnStart' && e.turn === 1);
    const t2 = r.log!.findIndex((e) => e.t === 'turnStart' && e.turn === 2);
    expect(r.log!.slice(t1, t2).filter((e) => e.t === 'draw')).toHaveLength(2);
  });

  it('a card drawn at the hand limit goes to the discard pile', () => {
    const data = withEnemy(makeGameData(), dummy());
    data.characters.ironclad!.drawPerTurn = 12;
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['strike', 12]) }), passive, { log: true });
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
      decide: (v) => ({ kind: 'play', uid: v.state.player.hand.find((c) => c.cost !== null && c.cost > v.state.player.energy)?.uid ?? -1 }),
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
    simulateCombat(withEnemy(makeGameData(), dummy()), cfg({ enemyId: 'dummy', deck: deckOf(['defend', 10]) }), strat);
    expect(energies.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Innate', () => {
  const withInnate = () => {
    const data = withEnemy(makeGameData(), dummy());
    data.cards.opener = { ...cards.strike!, id: 'opener', code: 'Op', keywords: ['innate'], upgraded: null };
    return data;
  };
  const drawsOnTurn = (log: GameEvent[], turn: number) => {
    const start = log.findIndex((e) => e.t === 'turnStart' && e.turn === turn && e.side === 'player');
    const end = log.findIndex((e) => e.t === 'turnEnd' && e.turn === turn && e.side === 'player');
    return log.slice(start, end).filter((e): e is Ev<'draw'> => e.t === 'draw');
  };

  it('Innate cards are always in the opening hand, drawn first', () => {
    const data = withInnate();
    for (let s = 0; s < 30; s++) {
      const r = simulateCombat(data, cfg({ enemyId: 'dummy', seed: s, deck: deckOf(['defend', 15], ['opener', 2]) }), passive, { log: true });
      const t1 = drawsOnTurn(r.log!, 1);
      expect(t1).toHaveLength(5);
      expect(t1.slice(0, 2).map((d) => d.cardId)).toEqual(['opener', 'opener']);
      expect(t1.slice(2).every((d) => d.cardId === 'defend')).toBe(true);
    }
  });

  it('turn-1 draw is max(drawPerTurn, Innate count), capped at the hand limit; later turns draw normally', () => {
    const data = withInnate();
    const seven = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['defend', 10], ['opener', 7]) }), passive, { log: true });
    expect(drawsOnTurn(seven.log!, 1).map((d) => d.cardId)).toEqual(Array(7).fill('opener'));
    expect(drawsOnTurn(seven.log!, 2)).toHaveLength(5);

    const twelve = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['defend', 3], ['opener', 12]) }), passive, { log: true });
    const t1 = drawsOnTurn(twelve.log!, 1);
    expect(t1).toHaveLength(10);
    expect(t1.every((d) => d.cardId === 'opener')).toBe(true);
    expect(events(twelve.log, 'discard').filter((d) => d.reason === 'handLimit')).toHaveLength(0);
  });

  it('a deck without Innate cards gives the same log as before (no extra RNG use)', () => {
    const data = withInnate();
    const config = cfg({ enemyId: 'dummy', seed: 9, deck: deckOf(['strike', 5], ['defend', 5]) });
    const r = simulateCombat(data, config, passive, { log: true });
    // Draw order equals popping the start-shuffled pile.
    expect(drawsOnTurn(r.log!, 1)).toHaveLength(5);
    expect(simulateCombat(data, config, passive, { log: true })).toEqual(r);
  });

  it('Innate is deterministic', () => {
    const data = withInnate();
    const config = cfg({ enemyId: 'dummy', seed: 31, deck: deckOf(['strike', 8], ['opener', 3]), strategy: { kind: 'greedyDamage' } });
    expect(runCombat(data, config, { log: true })).toEqual(runCombat(data, config, { log: true }));
  });
});

describe('Retain', () => {
  const withRetain = () => {
    const data = withEnemy(makeGameData(), dummy());
    data.cards.keep = { ...cards.defend!, id: 'keep', code: 'Kp', keywords: ['retain'], upgraded: null };
    data.cards.ghost = { ...cards.defend!, id: 'ghost', code: 'Gh', keywords: ['ethereal', 'retain'], upgraded: null };
    return data;
  };

  it('Retain cards stay in hand at end of turn; the rest is discarded; next turn still draws drawPerTurn', () => {
    const data = withRetain();
    const hands: string[][] = [];
    const strat: Strategy = {
      decide(v) {
        if (hands.length < v.state.turn) hands.push(v.state.player.hand.map((c) => c.cardId));
        return { kind: 'endTurn' };
      },
    };
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['keep', 1], ['strike', 20]) }), strat, { log: true });
    const firstKeep = hands.findIndex((h) => h.includes('keep'));
    expect(firstKeep).toBeGreaterThanOrEqual(0);
    // From the turn it is drawn on, it stays in hand for good, and hand size is 5 + 1.
    expect(hands[firstKeep]).toHaveLength(5);
    for (let t = firstKeep + 1; t < firstKeep + 5; t++) {
      expect(hands[t]).toContain('keep');
      expect(hands[t]).toHaveLength(6);
    }
    expect(events(r.log, 'discard').some((d) => d.cardId === 'keep')).toBe(false);
    expect(events(r.log, 'draw').filter((d) => d.cardId === 'keep')).toHaveLength(1);
  });

  it('a retained card can be played on a later turn', () => {
    const data = withRetain();
    const strat = scripted((turn) => (turn === 3 ? ['keep'] : []));
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['keep', 1], ['strike', 4]) }), strat, { log: true });
    expect(events(r.log, 'play')[0]).toMatchObject({ cardId: 'keep' });
    expect(events(r.log, 'block')[0]).toMatchObject({ amount: 5 });
  });

  it('Ethereal + Retain exhausts', () => {
    const data = withRetain();
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['ghost', 1], ['strike', 4]) }), passive, { log: true });
    expect(events(r.log, 'exhaust')).toEqual([{ t: 'exhaust', uid: 0, cardId: 'ghost', reason: 'ethereal' }]);
    expect(events(r.log, 'draw').filter((d) => d.cardId === 'ghost')).toHaveLength(1);
  });

  it('retained cards count toward the hand limit for the next draw', () => {
    const data = withRetain();
    const r = simulateCombat(data, cfg({ enemyId: 'dummy', deck: deckOf(['keep', 8]) }), passive, { log: true });
    // Turn 1: 5 in hand. Turn 2: draws 3 (pile empty after 8). Turn 3: 8 retained, piles empty.
    const limitDiscards = events(r.log, 'discard').filter((d) => d.reason === 'handLimit');
    expect(limitDiscards).toHaveLength(0);
    const data2 = withRetain();
    const r2 = simulateCombat(data2, cfg({ enemyId: 'dummy', deck: deckOf(['keep', 8], ['strike', 10]) }), passive, { log: true });
    // Turn 2: 5 kept + 5 drawn = 10 (strikes discarded at end of turn 1 only if drawn). Over time the
    // hand fills with keeps; any draw at 10 cards goes to discard.
    const hl = events(r2.log, 'discard').filter((d) => d.reason === 'handLimit');
    expect(hl.length).toBeGreaterThan(0);
    for (const d of hl) expect(d.cardId).toBe('strike');
  });

  it('Retain is deterministic', () => {
    const data = withRetain();
    const config = cfg({ enemyId: 'dummy', seed: 5, deck: deckOf(['keep', 3], ['strike', 7]), strategy: { kind: 'block', allowThrough: 0 } });
    expect(runCombat(data, config, { log: true })).toEqual(runCombat(data, config, { log: true }));
  });
});

describe('end conditions', () => {
  it('turn cap: passive player vs. non-attacking enemy', () => {
    const data = withEnemy(makeGameData(), dummy());
    const r = simulateCombat(data, cfg({ enemyId: 'dummy' }), passive, { log: true });
    expect(r).toMatchObject({ outcome: 'turnCap', turns: 100, hpLost: 0 });
    expect(r.enemyHpRemaining).toBeGreaterThan(0);
    expect(events(r.log, 'discard').every((e) => e.reason === 'endOfTurn' || e.reason === 'handLimit')).toBe(true);
    expect(r.log!.at(-1)).toEqual({ t: 'combatEnd', outcome: 'turnCap', turns: 100, hpLost: 0 });
  });

  it('win ends immediately when the enemy hits 0 HP', () => {
    const data = withEnemy(makeGameData(), makeEnemy('weak', 5, { wait: { name: 'Wait', effects: [] } }));
    const r = runCombat(data, cfg({ enemyId: 'weak' }), { log: true });
    expect(r).toMatchObject({ outcome: 'win', turns: 1, hpLost: 0, enemyHpRemaining: 0 });
    // Only one card played: combat stops on the kill.
    expect(events(r.log, 'play')).toHaveLength(1);
    expect(r.log!.at(-1)!.t).toBe('combatEnd');
  });

  it('loss: hpLost is capped at max HP', () => {
    const data = makeGameData();
    data.characters.ironclad!.maxHp = 5;
    const r = simulateCombat(data, cfg({ deck: [] }), passive, { log: true });
    expect(r).toMatchObject({ outcome: 'loss', turns: 1, hpLost: 5 });
    expect(events(r.log, 'damage')[0]).toMatchObject({ amount: 12, hpLoss: 12 });
  });

  it('multi-hit stops once the target dies', () => {
    const data = withEnemy(makeGameData(), makeEnemy('flurry', 999, {
      f: { name: 'Flurry', effects: [{ type: 'attack', damage: 3, hits: 10 }] },
    }));
    data.characters.ironclad!.maxHp = 7;
    const r = simulateCombat(data, cfg({ enemyId: 'flurry', deck: [] }), passive, { log: true });
    expect(events(r.log, 'damage')).toHaveLength(3);
    expect(r).toMatchObject({ outcome: 'loss', hpLost: 7 });
  });

  it('greedy Ironclad starter beats A0 Nibbit; hpLost matches logged damage', () => {
    const data = makeGameData();
    for (let s = 0; s < 20; s++) {
      const r = runCombat(data, cfg({ seed: s }), { log: true });
      expect(r.outcome).toBe('win');
      const taken = events(r.log, 'damage').filter((d) => d.target === 'player').reduce((a, d) => a + d.hpLoss, 0);
      expect(r.hpLost).toBe(taken);
      expect(r.turns).toBe(events(r.log, 'turnStart').filter((t) => t.side === 'player').length);
    }
  });

  it('runCombat with and without a log gives the same result', () => {
    const data = makeGameData();
    for (let s = 0; s < 20; s++) {
      const config = cfg({ seed: s, ascension: 10, strategy: { kind: 'block', allowThrough: 2 } });
      const { log: _log, ...withLog } = runCombat(data, config, { log: true });
      expect(runCombat(data, config)).toEqual(withLog);
    }
  });
});
