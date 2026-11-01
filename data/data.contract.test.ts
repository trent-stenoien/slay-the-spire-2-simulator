/** #105 contract shapes in card and enemy data. */
import { describe, expect, it } from 'vitest';
import { CONTRACT_EFFECT_SAMPLES } from '../engine/testFixtures';
import { fixture, errorsOf } from './dataTestHelpers';

describe('#105 contract shapes', () => {
  it('accepts every contract effect on unsimulated cards', () => {
    const d = fixture();
    d.cards.strike.simulated = false;
    d.cards.strike.effects = structuredClone(CONTRACT_EFFECT_SAMPLES);
    d.cards.strike.upgraded.effects = structuredClone(CONTRACT_EFFECT_SAMPLES);
    expect(errorsOf(d)).toEqual([]);
  });

  it.each(CONTRACT_EFFECT_SAMPLES.map((e) => [e.type, e] as const))(
    'rejects "%s" on a simulated card',
    (type, effect) => {
      const d = fixture();
      d.cards.strike.effects.push(structuredClone(effect));
      expect(errorsOf(d)).toEqual([expect.stringMatching(new RegExp(`cards/strike.*"simulated".*"${type}"`))]);
      const u = fixture();
      u.cards.strike.upgraded.effects.push(structuredClone(effect));
      expect(errorsOf(u)).toEqual([expect.stringMatching(new RegExp(`cards/strike.*"simulated".*"${type}"`))]);
    },
  );

  it('rejects contract effects on enemy moves', () => {
    const d = fixture();
    d.enemies.nibbit.moves.hiss.effects.push({ type: 'heal', amount: 5 });
    expect(errorsOf(d)).toContainEqual(
      expect.stringMatching(/enemies\/nibbit.*moves\.hiss\.effects\[1\]\.type.*"heal".*not simulated on enemy moves/),
    );
  });

  it('accepts triggers, playableIf and costLessPer on unsimulated cards and rejects them on simulated ones', () => {
    const d = fixture();
    d.cards.strike.triggers = [{ when: 'exhausted', effects: [{ type: 'gainEnergy', amount: 2 }] }];
    d.cards.strike.upgraded.triggers = [{ when: 'exhausted', effects: [{ type: 'gainEnergy', amount: 3 }] }];
    d.cards.defend.playableIf = { kind: 'handAll', filter: { types: ['attack'] } };
    d.cards.bash.costLessPer = { per: 'attacksPlayedThisTurn', amount: 1 };
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/cards\/strike.*"simulated".*"triggers"/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/defend.*"simulated".*"playableIf"/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*"simulated".*"costLessPer"/));
    d.cards.strike.simulated = false;
    d.cards.defend.simulated = false;
    d.cards.bash.simulated = false;
    expect(errorsOf(d)).toEqual([]);
  });

  it('reports bad contract shapes with their field paths', () => {
    const d = fixture();
    d.cards.strike.simulated = false;
    d.cards.strike.effects = [
      { type: 'loseHp', amount: -1 },
      { type: 'drawUntil' },
      { type: 'exhaustCards', mode: 'choose' },
      { type: 'applyPower', power: 'flight', amount: 1 },
      { type: 'conditional', if: { kind: 'counter', counter: 'handSize' }, then: [{ type: 'nope' }] },
      { type: 'moveCards', from: 'deck', to: 'hand', mode: 'all' },
      { type: 'addCards', source: { kind: 'random', pool: { character: 'mine' } }, count: 0, to: 'hand' },
      { type: 'attackFrom', damage: 5, hits: 1 },
      { type: 'playCards', from: 'draw', mode: 'top', count: 1, xBonus: 1 },
      { type: 'script', values: ['x'] },
    ];
    d.cards.strike.triggers = [{ when: 'sometimes', effects: [] }];
    d.cards.strike.playableIf = { kind: 'enemyHas', status: 'shiny' };
    d.cards.strike.costLessPer = { per: 'moon', amount: 1 };
    const errs = errorsOf(d);
    for (const re of [
      /effects\[0\]\.amount/,
      /effects\[1\]" needs "handFull"/,
      /effects\[2\]\.count" is required/,
      /effects\[3\]\.power/,
      /effects\[4\]\.if" needs "min" or "max"/,
      /effects\[4\]\.then\[0\]\.type/,
      /effects\[5\]\.from/,
      /effects\[6\]\.source\.pool\.character/,
      /effects\[6\]\.count/,
      /effects\[7\]" needs "bonusPer" or "extraHitsPer"/,
      /effects\[8\]\.xBonus/,
      /effects\[9\]\.id/,
      /effects\[9\]\.values\[0\]/,
      /triggers\[0\]\.when/,
      /playableIf\.status/,
      /costLessPer\.per/,
    ]) {
      expect(errs).toContainEqual(expect.stringMatching(re));
    }
  });
});
