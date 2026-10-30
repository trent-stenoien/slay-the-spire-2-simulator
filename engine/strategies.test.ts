import { describe, expect, it } from 'vitest';
import { makeCardInstance } from './combat';
import { createStrategy, parseStrategyCode, pickAttack, pickBlock, strategyCode } from './strategies';
import { cards } from './testFixtures';
import type { CardInstance, CombatState, StrategyConfig, StrategyView } from './types';

let nextUid = 0;
function card(id: keyof typeof cards, upgraded = false): CardInstance {
  return makeCardInstance(cards[id]!, upgraded, nextUid++);
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
      debuffs: { vulnerable: 0, weak: 0, frail: 0 }, patternIndex: 0,
    },
  } satisfies CombatState;
  const played: string[] = [];
  for (let i = 0; i < 50; i++) {
    const view: StrategyView = {
      state,
      intent: {
        moveId: 'm', name: 'm',
        damagePerHit: incoming, hits: incoming > 0 ? 1 : 0, totalIncoming: incoming,
      },
      playable: state.player.hand.filter((c) => c.cost !== null && c.cost <= state.player.energy),
    };
    const d = strategy.decide(view);
    if (d.kind === 'endTurn') return played;
    const idx = state.player.hand.findIndex((c) => c.uid === d.uid);
    const c = state.player.hand[idx]!;
    expect(view.playable).toContain(c);
    state.player.hand.splice(idx, 1);
    state.player.energy -= c.cost!;
    for (const e of c.effects) if (e.type === 'gainBlock') state.player.block += e.amount;
    played.push(c.cardId);
  }
  throw new Error('strategy never ended its turn');
}

const S = 'strike_ironclad';
const D = 'defend_ironclad';
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
