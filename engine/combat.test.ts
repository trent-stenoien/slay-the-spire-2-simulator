import { describe, expect, it } from 'vitest';
import { computeIntent, makeCardInstance, runCombat, simulateCombat } from './combat';
import { attackDamage, blockGain } from './rules';
import { CONTRACT_EFFECT_SAMPLES, cards, makeEnemy, makeGameData } from './testFixtures';
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

/** Game data with the 999-HP `dummy` enemy that never acts. */
const dummyData = () => withEnemy(makeGameData(), dummy());

const noDebuffs = () => ({ vulnerable: 0, weak: 0, frail: 0 });

/** Run a combat with the event log on; `overrides` go to `cfg`. */
const logged = (data: GameData, strategy: Strategy, overrides: Partial<CombatConfig> = {}) =>
  simulateCombat(data, cfg(overrides), strategy, { log: true });

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
      { strength: 0, debuffs: noDebuffs() },
      { debuffs: noDebuffs() });
    expect(i).toEqual({ moveId: 'hiss', name: 'Hiss', attacks: [], totalIncoming: 0 });
  });

  it('computeIntent: multi-hit with Strength and player Vulnerable', () => {
    const i = computeIntent('x', { name: 'X', effects: [{ type: 'attack', damage: 2, hits: 2 }] },
      { strength: 2, debuffs: noDebuffs() },
      { debuffs: { vulnerable: 1, weak: 0, frail: 0 } });
    expect(i).toMatchObject({ attacks: [{ damagePerHit: 6, hits: 2 }], totalIncoming: 12 });
  });

  it('computeIntent: sums across several attack effects', () => {
    const i = computeIntent('x', {
      name: 'X',
      effects: [{ type: 'attack', damage: 5, hits: 1 }, { type: 'gainBlock', amount: 3 }, { type: 'attack', damage: 3, hits: 2 }],
    }, { strength: 1, debuffs: noDebuffs() }, { debuffs: noDebuffs() });
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
    const r = logged(makeGameData(), passive, { deck: deckOf(['defend', 10]) });
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
      const log = logged(data, passive, { enemyId: 'rnd', seed: s, deck: [] }).log;
      const first = events(log, 'enemyMove')[0]!.moveId;
      const again = events(logged(data, passive, { enemyId: 'rnd', seed: s, deck: [] }).log, 'enemyMove')[0]!.moveId;
      expect(again).toBe(first);
      starts.add(first);
    }
    expect([...starts].sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('damage rules in combat', () => {
  it('Vulnerable: Bash then Strike = 8 + 9; Vulnerable 2 lasts two player turns', () => {
    const data = dummyData();
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
    const r = logged(data, strat, { enemyId: 'twin', deck: deckOf(['defend', 5]) });
    expect(intents.slice(0, 2)).toEqual([0, 8]);
    const dmg = events(r.log, 'damage').slice(0, 2);
    expect(dmg).toEqual([
      { t: 'damage', source: 'enemy', target: 'player', amount: 4, blocked: 4, hpLoss: 0 },
      { t: 'damage', source: 'enemy', target: 'player', amount: 4, blocked: 1, hpLoss: 3 },
    ]);
  });

  it('enemy Strength persists: Nibbit second Butt hits 14 at A0', () => {
    const r = logged(makeGameData(), passive, { deck: [] });
    expect(events(r.log, 'enemyMove').slice(0, 4).map((m) => m.moveId)).toEqual(['butt', 'hesitantSlice', 'hiss', 'butt']);
    expect(events(r.log, 'damage').slice(0, 3).map((d) => d.amount)).toEqual([12, 6, 14]);
  });

  it('A9 Nibbit uses the A9 numbers', () => {
    const r = logged(makeGameData(), passive, { deck: [], ascension: 9 });
    expect(events(r.log, 'damage').slice(0, 3).map((d) => d.amount)).toEqual([13, 7, 16]);
  });

  it('enemy block protects it during the next player turn only', () => {
    const strat = scripted((turn) => (turn <= 4 ? ['strike'] : []));
    const r = logged(makeGameData(), strat, { deck: deckOf(['strike', 10]) });
    const playerHits = events(r.log, 'damage').filter((d) => d.source === 'player');
    // Turn 1, 2: no enemy block. Hesitant Slice (enemy turn 2) gives 5 block.
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
    const r = logged(data, strat, { enemyId: 'late', deck: deckOf(['defend', 10]) });
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
    const r = logged(data, strat, { enemyId: 'hexer', deck: deckOf(['weakener', 5]) });
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
    const data = dummyData();
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
    const r = logged(data, strat, { enemyId: 'brute', deck: deckOf(['sap', 1], ['defend', 9]) });
    expect(intents).toEqual([9]); // intent already reflects Weak
    expect(events(r.log, 'damage').slice(0, 2).map((d) => d.amount)).toEqual([9, 12]);
  });

  it('Weak on the player cuts its attacks by 25% for that whole player turn, then ticks off at its end', () => {
    // Enemy turn 1 applies Weak 1 to the player. Player turn 2: two Strikes deal floor(6 × 0.75) = 4.
    // The tick at the end of player turn 2 removes it, so the turn-3 Strike deals 6.
    const e = makeEnemy('hexer2', 999, {
      hex: { name: 'Hex', effects: [{ type: 'applyWeak', amount: 1 }] },
      wait: { name: 'Wait', effects: [] },
    });
    const data = withEnemy(makeGameData(), e);
    const strat = scripted((turn) => (turn === 2 ? ['strike', 'strike'] : turn === 3 ? ['strike'] : []));
    const r = logged(data, strat, { enemyId: 'hexer2', deck: deckOf(['strike', 15]) });
    const log = r.log!;
    expect(events(log, 'damage').map((d) => d.amount)).toEqual([4, 4, 6]);
    // The tick comes after the player's last play of turn 2 and right before that player turn ends.
    const ticks = events(log, 'debuffTick').filter((t) => t.side === 'player');
    expect(ticks[0]).toEqual({ t: 'debuffTick', side: 'player', kind: 'weak', total: 0 });
    const tickIdx = log.findIndex((ev) => ev.t === 'debuffTick' && ev.side === 'player');
    const t2End = log.findIndex((ev) => ev.t === 'turnEnd' && ev.turn === 2 && ev.side === 'player');
    const lastT2Play = log.slice(0, t2End).map((ev) => ev.t).lastIndexOf('play');
    expect(tickIdx).toBe(t2End - 1);
    expect(tickIdx).toBeGreaterThan(lastT2Play);
  });

  it('one full round logs its phases in the documented order', () => {
    // Player turn: block reset → draw → plays → Ethereal exhausts / rest discarded → PLAYER debuffs tick.
    // Enemy turn: block reset → Poison → move → ENEMY debuffs tick.
    const e = makeEnemy('hexer3', 999, { hex: { name: 'Hex', effects: [{ type: 'applyWeak', amount: 1 }] } });
    const data = withEnemy(makeGameData(), e);
    data.cards.mist = { ...cards.defend!, id: 'mist', code: 'Mi', keywords: ['ethereal'], upgraded: null };
    data.cards.venom = {
      ...cards.defend!, id: 'venom', code: 'Vn', cost: 0,
      effects: [{ type: 'applyPoison', amount: 3 }, { type: 'applyVulnerable', amount: 1 }], upgraded: null,
    };
    const strat = scripted((turn) => (turn === 1 ? ['venom'] : []));
    const r = logged(data, strat, { enemyId: 'hexer3', deck: deckOf(['mist', 1], ['venom', 1], ['strike', 3]) });
    const log = r.log!;
    const at = (t: GameEvent['t'], turn: number, side: 'player' | 'enemy') =>
      log.findIndex((ev) => ev.t === t && 'turn' in ev && ev.turn === turn && 'side' in ev && ev.side === side);
    const types = (from: number, to: number) => log.slice(from, to).map((ev) => ev.t);

    const p1 = at('turnStart', 1, 'player');
    const p1End = at('turnEnd', 1, 'player');
    expect(types(p1, p1 + 7)).toEqual(['turnStart', 'blockReset', 'draw', 'draw', 'draw', 'draw', 'draw']);
    expect(types(p1 + 7, p1 + 10)).toEqual(['play', 'poison', 'debuff']);
    // End of player turn 1: the Ethereal card exhausts, the 3 Strikes are discarded (no player debuffs yet).
    expect([...types(p1 + 10, p1End)].sort()).toEqual(['discard', 'discard', 'discard', 'exhaust']);
    expect(events(log, 'exhaust')[0]).toMatchObject({ cardId: 'mist', reason: 'ethereal' });

    const e1 = at('turnStart', 1, 'enemy');
    const e1End = at('turnEnd', 1, 'enemy');
    expect(e1).toBe(p1End + 1);
    expect(types(e1, e1End + 1)).toEqual(['turnStart', 'blockReset', 'poisonDamage', 'enemyMove', 'debuff', 'debuffTick', 'turnEnd']);
    expect(log[e1End - 1]).toEqual({ t: 'debuffTick', side: 'enemy', kind: 'vulnerable', total: 0 });

    // Player turn 2: the empty draw pile reshuffles the discard; end of turn ticks the player's Weak last.
    const p2 = at('turnStart', 2, 'player');
    const p2End = at('turnEnd', 2, 'player');
    expect(p2).toBe(e1End + 1);
    expect(types(p2, p2 + 3)).toEqual(['turnStart', 'blockReset', 'shuffle']);
    expect(log[p2End - 1]).toEqual({ t: 'debuffTick', side: 'player', kind: 'weak', total: 0 });
  });
});

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
    const turn2 = log.slice(t2).filter((e) => e.t === 'draw' || e.t === 'shuffle').slice(0, 6);
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
    simulateCombat(dummyData(), cfg({ enemyId: 'dummy', deck: deckOf(['defend', 10]) }), strat);
    expect(energies.slice(0, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Innate', () => {
  const withInnate = () => {
    const data = dummyData();
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
      const r = logged(data, passive, { enemyId: 'dummy', seed: s, deck: deckOf(['defend', 15], ['opener', 2]) });
      const t1 = drawsOnTurn(r.log!, 1);
      expect(t1).toHaveLength(5);
      expect(t1.slice(0, 2).map((d) => d.cardId)).toEqual(['opener', 'opener']);
      expect(t1.slice(2).every((d) => d.cardId === 'defend')).toBe(true);
    }
  });

  it('turn-1 draw is max(drawPerTurn, Innate count), capped at the hand limit; later turns draw normally', () => {
    const data = withInnate();
    const seven = logged(data, passive, { enemyId: 'dummy', deck: deckOf(['defend', 10], ['opener', 7]) });
    expect(drawsOnTurn(seven.log!, 1).map((d) => d.cardId)).toEqual(Array(7).fill('opener'));
    expect(drawsOnTurn(seven.log!, 2)).toHaveLength(5);

    const twelve = logged(data, passive, { enemyId: 'dummy', deck: deckOf(['defend', 3], ['opener', 12]) });
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
    const data = dummyData();
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
    const r = logged(data, strat, { enemyId: 'dummy', deck: deckOf(['keep', 1], ['strike', 20]) });
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
    const r = logged(data, strat, { enemyId: 'dummy', deck: deckOf(['keep', 1], ['strike', 4]) });
    expect(events(r.log, 'play')[0]).toMatchObject({ cardId: 'keep' });
    expect(events(r.log, 'block')[0]).toMatchObject({ amount: 5 });
  });

  it('Ethereal + Retain exhausts', () => {
    const data = withRetain();
    const r = logged(data, passive, { enemyId: 'dummy', deck: deckOf(['ghost', 1], ['strike', 4]) });
    expect(events(r.log, 'exhaust')).toEqual([{ t: 'exhaust', uid: 0, cardId: 'ghost', reason: 'ethereal' }]);
    expect(events(r.log, 'draw').filter((d) => d.cardId === 'ghost')).toHaveLength(1);
  });

  it('retained cards count toward the hand limit for the next draw', () => {
    const data = withRetain();
    const hands: number[] = [];
    const strat: Strategy = {
      decide(v) {
        if (hands.length < v.state.turn) hands.push(v.state.player.hand.length);
        return { kind: 'endTurn' };
      },
    };
    // 12 Retain cards: turn 1 holds 5, turn 2 draws 5 more (10). On turn 3 the hand is full, so all
    // 5 draws (the last 2 cards, reshuffled back and drawn again) go straight to the discard pile.
    const r = logged(data, strat, { enemyId: 'dummy', deck: deckOf(['keep', 12]) });
    expect(hands.slice(0, 3)).toEqual([5, 10, 10]);
    const log = r.log!;
    const t3 = log.findIndex((e) => e.t === 'turnStart' && e.turn === 3 && e.side === 'player');
    const t3End = log.findIndex((e) => e.t === 'turnEnd' && e.turn === 3 && e.side === 'player');
    const t3Limit = log.slice(t3, t3End).filter((e) => e.t === 'discard' && e.reason === 'handLimit');
    expect(t3Limit).toHaveLength(5);
    expect(events(log.slice(0, t3), 'discard')).toHaveLength(0);
  });

  it('Retain is deterministic', () => {
    const data = withRetain();
    const config = cfg({ enemyId: 'dummy', seed: 5, deck: deckOf(['keep', 3], ['strike', 7]), strategy: { kind: 'block', allowThrough: 0 } });
    expect(runCombat(data, config, { log: true })).toEqual(runCombat(data, config, { log: true }));
  });
});

describe('Poison', () => {
  const withVenom = (...extraEnemies: ReturnType<typeof makeEnemy>[]) => {
    const data = withEnemy(makeGameData(), dummy(), ...extraEnemies);
    data.cards.venom = {
      ...cards.defend!, id: 'venom', code: 'Vn', cost: 0,
      effects: [{ type: 'applyPoison', amount: 3 }], upgraded: null,
    };
    data.cards.expose = {
      ...cards.defend!, id: 'expose', code: 'Ex', cost: 0,
      effects: [{ type: 'applyVulnerable', amount: 5 }, { type: 'applyWeak', amount: 5 }], upgraded: null,
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
    expect(log.slice(enemyStart, enemyStart + 4).map((e) => e.t)).toEqual(['turnStart', 'blockReset', 'poisonDamage', 'enemyMove']);
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
    expect(events(r.log, 'poisonDamage').slice(0, 3).map((p) => p.amount)).toEqual([6, 8, 7]);
  });

  it('is HP loss: ignores enemy Block and is not changed by Strength, Weak or Vulnerable', () => {
    const blocker = makeEnemy('blocker', 999, {
      fortify: { name: 'Fortify', effects: [{ type: 'gainBlock', amount: 50 }, { type: 'gainStrength', amount: 5 }] },
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
    const brute = makeEnemy('brute', 5, { smash: { name: 'Smash', effects: [{ type: 'attack', damage: 99, hits: 1 }] } });
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
      ...cards.strike!, id: 'stab', code: 'Sb',
      effects: [{ type: 'attack', damage: 6, hits: 1 }, { type: 'applyPoison', amount: 3 }], upgraded: null,
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

describe('end conditions', () => {
  it('turn cap: passive player vs. non-attacking enemy', () => {
    const data = dummyData();
    const r = logged(data, passive, { enemyId: 'dummy' });
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
    const r = logged(data, passive, { deck: [] });
    expect(r).toMatchObject({ outcome: 'loss', turns: 1, hpLost: 5 });
    expect(events(r.log, 'damage')[0]).toMatchObject({ amount: 12, hpLoss: 12 });
  });

  it('multi-hit stops once the target dies', () => {
    const data = withEnemy(makeGameData(), makeEnemy('flurry', 999, {
      f: { name: 'Flurry', effects: [{ type: 'attack', damage: 3, hits: 10 }] },
    }));
    data.characters.ironclad!.maxHp = 7;
    const r = logged(data, passive, { enemyId: 'flurry', deck: [] });
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

describe('#105 contract effects are not simulated yet', () => {
  it('covers every contract effect type exactly once', () => {
    const types = CONTRACT_EFFECT_SAMPLES.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toHaveLength(26);
  });

  it.each(CONTRACT_EFFECT_SAMPLES.map((e) => [e.type, e] as const))('playing a card with "%s" throws "not simulated yet"', (type, effect) => {
    const data = makeGameData();
    const probe: CardDef = { ...cards.strike!, id: 'probe', code: 'Pr', name: 'Probe', cost: 0, effects: [effect], upgraded: null };
    data.cards.probe = probe;
    const strat = scripted((turn) => (turn === 1 ? ['probe'] : []));
    expect(() => simulateCombat(data, cfg({ deck: deckOf(['probe', 5]) }), strat)).toThrow(new RegExp(`Effect "${type}" is not simulated yet`));
  });

  it('a contract effect on an enemy move also throws', () => {
    const e = makeEnemy('healer', 50, { mend: { name: 'Mend', effects: [{ type: 'heal', amount: 5 }] } });
    const data = withEnemy(makeGameData(), e);
    expect(() => simulateCombat(data, cfg({ enemyId: 'healer', deck: [] }), passive)).toThrow(/"heal" is not simulated yet/);
  });

  it('new optional state and card fields are absent, so existing combats are unchanged', () => {
    const r = runCombat(makeGameData(), cfg(), { log: true });
    expect(r.log!.some((ev) => ['loseHp', 'heal', 'maxHp', 'powerApplied', 'powerRemoved', 'moved', 'generated', 'upgraded', 'transformed', 'costChanged', 'replay', 'enemySkip'].includes(ev.t))).toBe(false);
    const inst = makeCardInstance(cards.strike!, false, 0);
    expect(Object.keys(inst).sort()).toEqual(['cardId', 'cost', 'effects', 'keywords', 'name', 'type', 'uid', 'upgraded']);
  });
});
