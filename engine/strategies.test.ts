import { describe, expect, it } from 'vitest';
import { makeCardInstance } from './combat';
import { createStrategy, parseStrategyCode, pickAttack, pickBlock, strategyCode } from './strategies';
import { cards } from './testFixtures';
import type { CardDef, CardInstance, CombatState, StrategyConfig, StrategyView } from './types';

/** Extra test cards: Tremble (#1), energy gain (#22), X-cost (#23). */
const extra: Record<string, CardDef> = {
  tremble: {
    ...cards.defend!, id: 'tremble', code: 'Tl', cost: 1, keywords: ['exhaust'],
    effects: [{ type: 'applyVulnerable', amount: 3 }], upgraded: { effects: [{ type: 'applyVulnerable', amount: 4 }] },
  },
  fuel: { ...cards.defend!, id: 'fuel', code: 'Fu', cost: 0, keywords: ['exhaust'], effects: [{ type: 'gainEnergy', amount: 1 }], upgraded: null },
  ritual: { ...cards.defend!, id: 'ritual', code: 'FR', cost: 1, keywords: ['exhaust'], effects: [{ type: 'gainEnergy', amount: 3 }], upgraded: null },
  /** Gains exactly its cost back: not a net energy card. */
  wash: { ...cards.defend!, id: 'wash', code: 'Wa', cost: 1, effects: [{ type: 'gainEnergy', amount: 1 }], upgraded: null },
  whirlwind: {
    ...cards.strike!, id: 'whirlwind', code: 'Wh', cost: 0, xCost: true,
    effects: [{ type: 'attack', damage: 5, hits: 1, allEnemies: true, xTimes: true }], upgraded: null,
  },
  xblock: {
    ...cards.defend!, id: 'xblock', code: 'XB', cost: 0, xCost: true,
    effects: [{ type: 'gainBlock', amount: 20 }], upgraded: null,
  },
};

let nextUid = 0;
function card(id: keyof typeof cards | keyof typeof extra, upgraded = false): CardInstance {
  return makeCardInstance((cards[id] ?? extra[id])!, upgraded, nextUid++);
}

/**
 * Drive one player turn with a strategy against a fixed incoming intent.
 * Only block and energy are tracked; returns the cardIds played in order.
 */
function playTurn(config: StrategyConfig, hand: CardInstance[], incoming: number, energy = 3): string[] {
  const strategy = createStrategy(config);
  const state = {
    turn: 1,
    player: {
      hp: 80, maxHp: 80, block: 0, energy, strength: 0,
      debuffs: { vulnerable: 0, weak: 0, frail: 0 },
      drawPile: [], hand: [...hand], discardPile: [], exhaustPile: [],
    },
    enemy: {
      enemyId: 'x', name: 'x', hp: 100, maxHp: 100, block: 0, strength: 0,
      debuffs: { vulnerable: 0, weak: 0, frail: 0 }, poison: 0, patternIndex: 0,
    },
  } satisfies CombatState;
  const played: string[] = [];
  for (let i = 0; i < 50; i++) {
    const view: StrategyView = {
      state,
      intent: {
        moveId: 'm', name: 'm',
        attacks: incoming > 0 ? [{ damagePerHit: incoming, hits: 1 }] : [], totalIncoming: incoming,
      },
      playable: state.player.hand.filter((c) => c.cost !== null && c.cost <= state.player.energy),
    };
    const d = strategy.decide(view);
    if (d.kind === 'endTurn') return played;
    const idx = state.player.hand.findIndex((c) => c.uid === d.uid);
    const c = state.player.hand[idx]!;
    expect(view.playable).toContain(c);
    state.player.hand.splice(idx, 1);
    state.player.energy -= c.xCost ? state.player.energy : c.cost!;
    for (const e of c.effects) {
      if (e.type === 'gainBlock') state.player.block += e.amount;
      if (e.type === 'gainEnergy') state.player.energy += e.amount;
    }
    played.push(c.cardId);
  }
  throw new Error('strategy never ended its turn');
}

const S = 'strike';
const D = 'defend';
const B = 'bash';

function starterHand(): CardInstance[] {
  return [card(S), card(S), card(D), card(D), card(D)];
}

describe('block strategy (allow through X)', () => {
  it('X=1 with 6 incoming plays exactly one Defend, then attacks', () => {
    expect(playTurn({ kind: 'block', allowThrough: 1 }, starterHand(), 6)).toEqual([D, S, S]);
  });

  it('X=1 with 7 incoming plays two Defends', () => {
    expect(playTurn({ kind: 'block', allowThrough: 1 }, starterHand(), 7)).toEqual([D, D, S]);
  });

  it('X=0 blocks everything possible', () => {
    expect(playTurn({ kind: 'block', allowThrough: 0 }, starterHand(), 5)).toEqual([D, S, S]);
    expect(playTurn({ kind: 'block', allowThrough: 0 }, starterHand(), 11)).toEqual([D, D, D]);
  });

  it('X=4 blocks with a 5-block Defend only when it is fully used', () => {
    const b4: StrategyConfig = { kind: 'block', allowThrough: 4 };
    expect(playTurn(b4, starterHand(), 4)).toEqual([S, S, D]);
    expect(playTurn(b4, starterHand(), 5)).toEqual([D, S, S]);
    expect(playTurn(b4, starterHand(), 9)).toEqual([D, S, S]);
    expect(playTurn(b4, starterHand(), 10)).toEqual([D, D, S]);
  });

  it('non-attack intent: no blocking before attacks, leftover energy goes to block', () => {
    expect(playTurn({ kind: 'block', allowThrough: 0 }, starterHand(), 0)).toEqual([S, S, D]);
  });

  it('plays the largest block card first', () => {
    const hand = [card(D), card('ultimate_defend'), card(S)];
    expect(playTurn({ kind: 'block', allowThrough: 0 }, hand, 20, 1)).toEqual(['ultimate_defend']);
  });
});

describe('greedy damage strategy', () => {
  it('plays Bash before Strikes with 2+ energy', () => {
    const hand = [card(S), card(S), card(B), card(D), card(D)];
    expect(playTurn({ kind: 'greedyDamage' }, hand, 12)).toEqual([B, S]);
  });

  it('plays a Strike when Bash is unaffordable, then block with leftovers', () => {
    const hand = [card(B), card(S), card(D)];
    expect(playTurn({ kind: 'greedyDamage' }, hand, 12, 2)).toEqual([B]);
    expect(playTurn({ kind: 'greedyDamage' }, [card(B), card(S), card(D)], 12, 1)).toEqual([S]);
    expect(playTurn({ kind: 'greedyDamage' }, [card(S), card(D), card(D)], 12)).toEqual([S, D, D]);
  });

  it('prefers the highest total base damage', () => {
    const hand = [card(S), card('ultimate_strike'), card(S, true)];
    expect(playTurn({ kind: 'greedyDamage' }, hand, 0, 1)).toEqual(['ultimate_strike']);
  });

  it('ends turn when nothing is playable', () => {
    expect(playTurn({ kind: 'greedyDamage' }, [card('ascenders_bane')], 0)).toEqual([]);
  });
});

describe('pick helpers', () => {
  it('break ties by lowest uid', () => {
    const a = makeCardInstance(cards[S]!, false, 7);
    const b = makeCardInstance(cards[S]!, false, 3);
    expect(pickAttack([a, b])!.uid).toBe(3);
    const c = makeCardInstance(cards[D]!, false, 9);
    const d = makeCardInstance(cards[D]!, false, 4);
    expect(pickBlock([c, d])!.uid).toBe(4);
  });

  it('Vulnerable-appliers beat higher-damage attacks', () => {
    const us = makeCardInstance(cards.ultimate_strike!, true, 0);
    const bash = makeCardInstance(cards.bash!, false, 1);
    expect(pickAttack([us, bash])!.cardId).toBe('bash');
  });
});

const G: StrategyConfig = { kind: 'greedyDamage' };
const B0: StrategyConfig = { kind: 'block', allowThrough: 0 };
const B4: StrategyConfig = { kind: 'block', allowThrough: 4 };

describe('Tremble first (#1)', () => {
  it('Greedy plays Tremble before Bash and Strikes', () => {
    expect(playTurn(G, [card(S), card(B), card('tremble'), card(D)], 12)).toEqual(['tremble', B]);
  });

  it('block strategies play Tremble before blocking', () => {
    expect(playTurn(B0, [card(D), card(D), card('tremble'), card(S)], 10)).toEqual(['tremble', D, D]);
    expect(playTurn(B4, [card(S), card(D), card('tremble')], 0)).toEqual(['tremble', S, D]);
  });

  it('upgraded Tremble counts too; two Trembles go lowest uid first', () => {
    const t1 = card('tremble', true);
    const t2 = card('tremble');
    expect(playTurn(G, [card(S), t2, t1], 0, 2)).toEqual(['tremble', 'tremble']);
  });

  it('Tremble is played only while affordable; it does not block other plays', () => {
    expect(playTurn(G, [card('tremble')], 0, 0)).toEqual([]);
    // Bash first would leave 0 for Tremble; Tremble first leaves 1 for a Strike.
    expect(playTurn(G, [card(B), card(S), card('tremble')], 0, 2)).toEqual(['tremble', S]);
  });
});

describe('energy gain (#22)', () => {
  it('Greedy plays a net energy card first, then uses the extra energy', () => {
    // 3 energy + Ritual (1 → 3) = 5: Bash (2) + 3 Strikes.
    const hand = [card(S), card(S), card(S), card(B), card('ritual')];
    expect(playTurn(G, hand, 0)).toEqual(['ritual', B, S, S, S]);
  });

  it('block strategies play it first too, and the extra energy goes to block and attacks', () => {
    const hand = [card(D), card(D), card(S), card(S), card('fuel')];
    expect(playTurn(B0, hand, 10)).toEqual(['fuel', D, D, S, S]);
  });

  it('Tremble still comes before the energy card', () => {
    expect(playTurn(G, [card(S), card('fuel'), card('tremble')], 0, 1)).toEqual(['tremble', 'fuel', S]);
  });

  it('an energy card with nothing to spend it on stays in hand', () => {
    expect(playTurn(G, [card('fuel')], 0)).toEqual([]);
    expect(playTurn(G, [card('fuel'), card('ascenders_bane')], 0)).toEqual([]);
  });

  it('a card that only gains back its cost is not played first', () => {
    expect(playTurn(G, [card('wash'), card(S)], 0, 1)).toEqual([S]);
  });

  it('at 0 energy, Fuel unlocks a Strike', () => {
    expect(playTurn(G, [card(S), card('fuel')], 0, 0)).toEqual(['fuel', S]);
  });
});

describe('X-cost (#23)', () => {
  it('Greedy plays X-cost attacks last among attacks, with the leftover energy', () => {
    expect(playTurn(G, [card('whirlwind'), card(S), card(D)], 0)).toEqual([S, 'whirlwind']);
    expect(playTurn(G, [card('whirlwind'), card(B), card(S)], 0, 3)).toEqual([B, S]);
  });

  it('never plays an X-cost card at 0 energy', () => {
    expect(playTurn(G, [card('whirlwind')], 0, 0)).toEqual([]);
    expect(playTurn(B0, [card('xblock')], 20, 0)).toEqual([]);
  });

  it('block strategy: blocks first, then the X attack takes what is left', () => {
    expect(playTurn(B0, [card('whirlwind'), card(D), card(S)], 5)).toEqual([D, S, 'whirlwind']);
  });

  it('X-cost block cards are block, played after other block cards', () => {
    expect(playTurn(B0, [card('xblock'), card(D), card(S)], 30)).toEqual([D, 'xblock']);
  });

  it('energy cards come before the X attack so X is larger', () => {
    expect(playTurn(G, [card('whirlwind'), card('ritual')], 0)).toEqual(['ritual', 'whirlwind']);
  });

  it('pickAttack scores an X attack by the current energy but still ranks it last', () => {
    const w = card('whirlwind');
    const s = card(S);
    expect(pickAttack([w, s], 5)!.uid).toBe(s.uid);
    expect(pickAttack([w], 5)!.uid).toBe(w.uid);
    expect(pickAttack([w], 0)).toBeUndefined();
    expect(pickBlock([card('xblock')], 0)).toBeUndefined();
  });
});

describe('strategy codes', () => {
  it('encodes', () => {
    expect(strategyCode({ kind: 'greedyDamage' })).toBe('g');
    expect(strategyCode({ kind: 'block', allowThrough: 4 })).toBe('b4');
    expect(strategyCode({ kind: 'block', allowThrough: 0 })).toBe('b0');
  });

  it('round-trips', () => {
    for (const c of ['g', 'b0', 'b1', 'b4', 'b12'] as const) {
      expect(strategyCode(parseStrategyCode(c)!)).toBe(c);
    }
  });

  it('rejects invalid codes', () => {
    for (const c of ['', 'G', 'b', 'b-1', 'b01', 'b1.5', 'x4', 'g1', 'b4 ']) {
      expect(parseStrategyCode(c)).toBeNull();
    }
  });
});
