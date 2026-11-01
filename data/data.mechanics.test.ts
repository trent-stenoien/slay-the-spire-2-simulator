/** #106 Lose HP and #107 Draw cards: effects and the simulated flag, checked against the wiki text. */
import { describe, expect, it } from 'vitest';
import { gameData } from './index';

const c = gameData.cards;
const atk = (damage: number, extra: object = {}) => ({ type: 'attack', damage, hits: 1, ...extra });
const block = (amount: number) => ({ type: 'gainBlock', amount });
const loseHp = (amount: number) => ({ type: 'loseHp', amount });
const draw = (amount: number) => ({ type: 'draw', amount });
const energy = (amount: number) => ({ type: 'gainEnergy', amount });
const noDraw = { type: 'applyPower', power: 'noDraw', amount: 1 };
const untilNonAttack = { type: 'drawUntil', stopOn: { notTypes: ['attack'] } };

describe('#106 Lose HP cards', () => {
  it.each([
    ['blood_wall', [loseHp(2), block(16)], [loseHp(2), block(20)]],
    ['bloodletting', [loseHp(3), energy(2)], [loseHp(3), energy(3)]],
    ['breakthrough', [loseHp(1), atk(9, { allEnemies: true })], [loseHp(1), atk(13, { allEnemies: true })]],
    ['hemokinesis', [loseHp(2), atk(15)], [loseHp(2), atk(20)]],
  ])('%s loses HP first and is simulated', (id, base, up) => {
    expect(c[id]).toMatchObject({ simulated: true, effects: base, upgraded: { effects: up } });
  });

  it('Spite and Tear Asunder are recorded but wait for conditional / attackFrom (#111)', () => {
    expect(c.spite).toMatchObject({
      simulated: false,
      effects: [{ type: 'conditional', if: { kind: 'lostHpThisTurn' }, then: [atk(5, { hits: 2 })], else: [atk(5)] }],
      upgraded: { effects: [{ type: 'conditional', then: [atk(5, { hits: 3 })], else: [atk(5)] }] },
    });
    const per = { per: 'hpLossesThisCombat', amount: 1 };
    expect(c.tear_asunder).toMatchObject({
      simulated: false,
      effects: [{ type: 'attackFrom', damage: 5, hits: 1, extraHitsPer: per }],
      upgraded: { effects: [{ type: 'attackFrom', damage: 7, hits: 1, extraHitsPer: per }] },
    });
  });
});

describe('#107 Draw cards', () => {
  it.each([
    ['pommel_strike', [atk(9), draw(1)], [atk(10), draw(2)], []],
    ['shrug_it_off', [block(8), draw(1)], [block(11), draw(1)], []],
    ['finesse', [block(4), draw(1)], [block(7), draw(1)], []],
    ['flash_of_steel', [atk(5), draw(1)], [atk(8), draw(1)], []],
    ['minion_strike', [atk(6), draw(1)], [atk(9), draw(1)], ['exhaust']],
    ['master_of_strategy', [draw(3)], [draw(4)], ['exhaust']],
    ['soul', [draw(2)], [draw(3)], ['exhaust']],
    ['battle_trance', [draw(3), noDraw], [draw(4), noDraw], []],
    ['pillage', [atk(6), untilNonAttack], [atk(9), untilNonAttack], []],
    ['offering', [loseHp(6), energy(2), draw(3)], [loseHp(6), energy(2), draw(5)], ['exhaust']],
  ])('%s is simulated', (id, base, up, keywords) => {
    expect(c[id]).toMatchObject({ simulated: true, keywords, effects: base, upgraded: { effects: up } });
  });

  it('Scrawl draws until the hand is full; the upgrade only adds Retain', () => {
    expect(c.scrawl).toMatchObject({
      simulated: true,
      keywords: ['exhaust'],
      effects: [{ type: 'drawUntil', handFull: true }],
      upgraded: { keywords: ['retain', 'exhaust'] },
    });
    expect(c.scrawl!.upgraded!.effects).toBeUndefined();
  });

  it('Master of Strategy: Wisdom (Mad Science) is block + draw; the upgrade adds Innate', () => {
    expect(c.mad_science_wisdom).toMatchObject({
      simulated: true,
      effects: [block(8), draw(3)],
      upgraded: { keywords: ['innate'] },
    });
  });

  it('cards whose other parts belong to later mechanics stay unsimulated', () => {
    // Impatience, Restlessness: conditional (#111). Drum of Battle: on-exhaust trigger (#108).
    // Brightest Flame: Max HP loss (#115).
    expect(c.impatience).toMatchObject({
      simulated: false,
      effects: [{ type: 'conditional', if: { kind: 'handHasNone', filter: { types: ['attack'] } }, then: [draw(2)] }],
    });
    expect(c.restlessness).toMatchObject({
      simulated: false,
      keywords: ['retain'],
      effects: [
        { type: 'conditional', if: { kind: 'counter', counter: 'handSize', max: 0 }, then: [draw(2), energy(2)] },
      ],
    });
    expect(c.drum_of_battle).toMatchObject({
      simulated: false,
      effects: [draw(2)],
      triggers: [{ when: 'exhausted', effects: [energy(2)] }],
      upgraded: { triggers: [{ when: 'exhausted', effects: [energy(3)] }] },
    });
    expect(c.brightest_flame).toMatchObject({
      simulated: false,
      effects: [energy(2), draw(2), { type: 'loseMaxHp', amount: 2 }],
      upgraded: { effects: [energy(3), draw(3), { type: 'loseMaxHp', amount: 2 }] },
    });
  });
});
