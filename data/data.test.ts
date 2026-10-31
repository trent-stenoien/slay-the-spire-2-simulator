import { describe, expect, it } from 'vitest';
import { cardByCode, characterByCode, enemyByCode, gameData } from './index';
import { assembleGameData, validateGameData } from './validate';
import reservedCodes from './reserved-codes.json';
import { resolveEnemy } from '../engine/enemy';

const VERSION = 'v0.107.1';

/** Deep copy of the real data, for breaking in validator tests. */
function fixture(): any {
  return structuredClone(gameData);
}

function errorsOf(raw: unknown): string[] {
  const result = validateGameData(raw);
  return result.ok ? [] : result.errors;
}

describe('real game data', () => {
  it('validates with zero errors', () => {
    expect(errorsOf(gameData)).toEqual([]);
  });

  it('manifest is at the current game version', () => {
    expect(gameData.manifest.gameVersion).toBe(VERSION);
  });

  const expected = [
    { id: 'strike', code: 'St', name: 'Strike', type: 'attack', character: 'shared', cost: 1, keywords: [],
      effects: [{ type: 'attack', damage: 6, hits: 1 }],
      upgraded: { effects: [{ type: 'attack', damage: 9, hits: 1 }] } },
    { id: 'defend', code: 'De', name: 'Defend', type: 'skill', character: 'shared', cost: 1, keywords: [],
      effects: [{ type: 'gainBlock', amount: 5 }],
      upgraded: { effects: [{ type: 'gainBlock', amount: 8 }] } },
    { id: 'bash', code: 'Ba', name: 'Bash', type: 'attack', character: 'I', cost: 2, keywords: [],
      effects: [{ type: 'attack', damage: 8, hits: 1 }, { type: 'applyVulnerable', amount: 2 }],
      upgraded: { effects: [{ type: 'attack', damage: 10, hits: 1 }, { type: 'applyVulnerable', amount: 3 }] } },
    { id: 'ultimate_strike', code: 'US', name: 'Ultimate Strike', type: 'attack', character: 'colorless', cost: 1, keywords: [],
      effects: [{ type: 'attack', damage: 14, hits: 1 }],
      upgraded: { effects: [{ type: 'attack', damage: 20, hits: 1 }] } },
    { id: 'ultimate_defend', code: 'UD', name: 'Ultimate Defend', type: 'skill', character: 'colorless', cost: 1, keywords: [],
      effects: [{ type: 'gainBlock', amount: 11 }],
      upgraded: { effects: [{ type: 'gainBlock', amount: 15 }] } },
    { id: 'ascenders_bane', code: 'AB', name: "Ascender's Bane", type: 'curse', character: 'colorless', cost: null,
      keywords: ['unplayable', 'ethereal', 'eternal'], effects: [], upgraded: null },
  ];

  it.each(expected)('card $id has the wiki values', (card) => {
    expect(gameData.cards[card.id]).toMatchObject({ ...card, simulated: true, lastUpdateVersion: VERSION });
    expect(cardByCode(card.code)?.id).toBe(card.id);
  });

  it('Bash deals damage before applying Vulnerable', () => {
    expect(gameData.cards.bash?.effects.map((e) => e.type)).toEqual(['attack', 'applyVulnerable']);
    expect(gameData.cards.bash?.upgraded?.effects?.map((e) => e.type)).toEqual(['attack', 'applyVulnerable']);
  });

  it('Ironclad has the v1 stats and a 10-card starting deck', () => {
    const ic = characterByCode('I');
    expect(ic?.id).toBe('ironclad');
    expect(ic).toMatchObject({ name: 'Ironclad', maxHp: 80, energyPerTurn: 3, drawPerTurn: 5, startingRelic: 'Burning Blood', lastUpdateVersion: VERSION });
    expect(ic?.startingDeck.reduce((n, e) => n + e.count, 0)).toBe(10);
    expect(ic?.startingDeck).toEqual([
      { cardId: 'strike', upgraded: false, count: 5 },
      { cardId: 'defend', upgraded: false, count: 4 },
      { cardId: 'bash', upgraded: false, count: 1 },
    ]);
  });

  // Random-target damage is the one enemy in a single-enemy fight (#6): plain attack, no target flag.
  it.each([
    ['sword_boomerang', 3, 3, 3, 4, true],
    ['rip_and_tear', 7, 2, 9, 2, true],
    ['ricochet', 3, 4, 3, 5, false], // Sly keeps it unsimulated
  ] as const)('random-target card %s is a plain multi-hit attack', (id, dmg, hits, upDmg, upHits, simulated) => {
    const c = gameData.cards[id]!;
    expect(c.effects).toEqual([{ type: 'attack', damage: dmg, hits }]);
    expect(c.upgraded?.effects).toEqual([{ type: 'attack', damage: upDmg, hits: upHits }]);
    expect(c.simulated).toBe(simulated);
  });

  it('Nibbit is at code Nb', () => {
    expect(enemyByCode('Nb')?.id).toBe('nibbit');
    expect(gameData.enemies.nibbit?.code).toBe('Nb');
  });

  it('Nibbit has the wiki moves: Butt, Hesitant Slice, Hiss', () => {
    const nb = gameData.enemies.nibbit!;
    expect(nb.pattern.order).toEqual(['butt', 'hesitantSlice', 'hiss']);
    expect(nb.moves.hesitantSlice?.name).toBe('Hesitant Slice');
    expect(nb.moves).not.toHaveProperty('hesitantStrike');
  });

  // data/raw/intents.txt: Hesitant Slice "Deals (6;7 9) damage. Gains (5;6 8) Block."
  it.each([
    [0, { min: 42, max: 46 }, 12, [6, 5], 2],
    [7, { min: 42, max: 46 }, 12, [6, 5], 2],
    [8, { min: 44, max: 48 }, 12, [6, 6], 2],
    [9, { min: 44, max: 48 }, 13, [7, 6], 3],
    [20, { min: 44, max: 48 }, 13, [7, 6], 3],
  ] as const)('Nibbit at A%i has the wiki numbers', (asc, hp, butt, [slice, block], hiss) => {
    const e = resolveEnemy(gameData.enemies.nibbit!, asc);
    expect(e.hp).toEqual(hp);
    expect(e.moves.butt!.effects).toEqual([{ type: 'attack', damage: butt, hits: 1 }]);
    expect(e.moves.hesitantSlice).toEqual({
      name: 'Hesitant Slice',
      effects: [{ type: 'attack', damage: slice, hits: 1 }, { type: 'gainBlock', amount: block }],
    });
    expect(e.moves.hiss!.effects).toEqual([{ type: 'gainStrength', amount: hiss }]);
  });

  it('lookups return undefined for unknown codes', () => {
    expect(cardByCode('zz')).toBeUndefined();
    expect(enemyByCode('zz')).toBeUndefined();
    expect(characterByCode('X')).toBeUndefined();
  });

  it('Ascender\'s Bane referenced by the manifest exists', () => {
    for (const { cardId } of gameData.manifest.ascensionCards) {
      expect(gameData.cards[cardId]).toBeDefined();
    }
  });
});

describe('validateGameData on broken fixtures', () => {
  it('rejects a non-object', () => {
    expect(validateGameData(null).ok).toBe(false);
  });

  it('reports a duplicate card code naming both cards', () => {
    const d = fixture();
    d.cards.defend.code = 'St';
    const errs = errorsOf(d);
    expect(errs.some((e) => e.includes('"St"') && e.includes('cards/strike') && e.includes('cards/defend'))).toBe(true);
  });

  it('reports a duplicate enemy code', () => {
    const d = fixture();
    d.enemies.copy = { ...structuredClone(d.enemies.nibbit), id: 'copy' };
    expect(errorsOf(d).some((e) => e.startsWith('enemies:') && e.includes('"Nb"'))).toBe(true);
  });

  it('reports a pattern move id missing from moves', () => {
    const d = fixture();
    d.enemies.nibbit.pattern.order.push('bite');
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/enemies\/nibbit.*pattern\.order\[3\].*"bite"/));
  });

  it('reports an empty pattern order', () => {
    const d = fixture();
    d.enemies.nibbit.pattern.order = [];
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/enemies\/nibbit.*pattern\.order.*empty/));
  });

  it('reports a bad character code', () => {
    const d = fixture();
    d.characters.ironclad.code = 'X';
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/characters\/ironclad.*"code"/));
  });

  it('reports cost and "unplayable" disagreeing', () => {
    const d = fixture();
    d.cards.ascenders_bane.cost = 0;
    d.cards.bash.cost = null;
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/cards\/ascenders_bane.*"cost"/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*"cost"/));
  });

  it('reports hp.min > hp.max', () => {
    const d = fixture();
    d.enemies.nibbit.hp = { min: 50, max: 40 };
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/enemies\/nibbit.*"hp".*min.*max/));
  });

  it('reports hp.min > hp.max inside an ascension override', () => {
    const d = fixture();
    d.enemies.nibbit.ascension['8'].hp = { min: 50, max: 40 };
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/enemies\/nibbit.*ascension\.8\.hp/));
  });

  it('reports an unknown card id in a starting deck', () => {
    const d = fixture();
    d.characters.ironclad.startingDeck[0].cardId = 'strike_silent';
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/characters\/ironclad.*startingDeck\[0\]\.cardId.*"strike_silent"/));
  });

  it('reports an unknown manifest ascension card', () => {
    const d = fixture();
    d.manifest.ascensionCards[0].cardId = 'nope';
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/manifest.*ascensionCards\[0\]\.cardId/));
  });

  it('reports bad card code format, hits < 1, bad enum, negative amount', () => {
    const d = fixture();
    d.cards.bash.code = 'B!';
    d.cards.strike.effects[0].hits = 0;
    d.cards.defend.type = 'block';
    d.cards.ultimate_defend.effects[0].amount = -1;
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*"code"/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/strike.*effects\[0\]\.hits/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/defend.*"type"/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/ultimate_defend.*effects\[0\]\.amount/));
  });

  it('reports unknown effect types and keywords', () => {
    const d = fixture();
    d.cards.bash.effects.push({ type: 'heal', amount: 3 });
    d.cards.bash.keywords = ['shiny'];
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*effects\[2\]\.type/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*keywords\[0\]/));
  });

  it('rejects simulated cards that use unsimulated mechanics', () => {
    const d = fixture();
    d.cards.bash.keywords = ['sly'];
    d.cards.strike.effects.push({ type: 'gainStars', amount: 2 });
    d.cards.defend.starCost = 1;
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*"simulated".*sly/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/strike.*"simulated".*gainStars/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/defend.*"simulated".*Star cost/));
    d.cards.bash.simulated = false;
    expect(errorsOf(d).some((e) => e.includes('cards/bash'))).toBe(false);
  });

  it('accepts applyPoison on cards and rejects it on enemy moves', () => {
    const d = fixture();
    d.cards.strike.effects.push({ type: 'applyPoison', amount: 3 });
    expect(errorsOf(d)).toEqual([]);
    d.cards.strike.effects.push({ type: 'applyPoison', amount: -1 });
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/cards\/strike.*effects\[2\]\.amount/));
    const e = fixture();
    e.enemies.nibbit.moves.hiss.effects.push({ type: 'applyPoison', amount: 2 });
    e.enemies.nibbit.ascension['9'].moves.butt.effects.push({ type: 'applyPoison', amount: 2 });
    const errs = errorsOf(e);
    expect(errs).toContainEqual(expect.stringMatching(/enemies\/nibbit.*moves\.hiss\.effects\[1\]\.type.*Poison/));
    expect(errs).toContainEqual(expect.stringMatching(/enemies\/nibbit.*ascension\.9\.moves\.butt\.effects\[1\]\.type.*Poison/));
  });

  it('accepts gainEnergy on cards and rejects it on enemy moves', () => {
    const d = fixture();
    d.cards.strike.effects.push({ type: 'gainEnergy', amount: 1 });
    expect(errorsOf(d)).toEqual([]);
    d.cards.strike.effects.push({ type: 'gainEnergy', amount: -1 });
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/cards\/strike.*effects\[2\]\.amount/));
    const e = fixture();
    e.enemies.nibbit.moves.hiss.effects.push({ type: 'gainEnergy', amount: 1 });
    expect(errorsOf(e)).toContainEqual(expect.stringMatching(/enemies\/nibbit.*moves\.hiss\.effects\[1\]\.type.*energy/));
  });

  it('X-cost: simulated only with an xTimes effect; xTimes only on X-cost cards; xBonus needs xTimes', () => {
    const d = fixture();
    d.cards.strike.effects[0].xTimes = true;
    d.cards.defend.effects = [{ type: 'attack', damage: 1, hits: 1, xBonus: 1 }];
    d.cards.whirlwind.effects = [{ type: 'attack', damage: 5, hits: 1, allEnemies: true }];
    d.cards.whirlwind.upgraded.effects[0].xBonus = -1;
    const e = fixture();
    e.enemies.nibbit.moves.butt.effects[0].xTimes = true;
    const errs = [...errorsOf(d), ...errorsOf(e)];
    expect(errs).toContainEqual(expect.stringMatching(/cards\/strike.*effects\[0\]\.xTimes.*X-cost/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/defend.*effects\[0\]\.xBonus.*xTimes/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/whirlwind.*"simulated".*scales with X/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/whirlwind.*upgraded\.effects\[0\]\.xBonus/));
    expect(errs).toContainEqual(expect.stringMatching(/enemies\/nibbit.*moves\.butt\.effects\[0\]\.xTimes/));
  });

  it('X-Star cards stay unsimulated', () => {
    const d = fixture();
    const stardust = Object.values(d.cards).find((c: any) => c.xStarCost === true) as any;
    expect(stardust?.simulated).toBe(false);
    stardust.simulated = true;
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/"simulated"/));
  });

  it('energy, X-cost and Tremble cards (#1, #22, #23) have the expected effects', () => {
    const c = gameData.cards;
    expect(c.whirlwind).toMatchObject({ xCost: true, cost: 0, simulated: true,
      effects: [{ type: 'attack', damage: 5, hits: 1, allEnemies: true, xTimes: true }],
      upgraded: { effects: [{ type: 'attack', damage: 8, hits: 1, allEnemies: true, xTimes: true }] } });
    expect(c.forgotten_ritual).toMatchObject({ simulated: true, effects: [{ type: 'gainEnergy', amount: 3 }], upgraded: { effects: [{ type: 'gainEnergy', amount: 4 }] } });
    expect(c.fuel).toMatchObject({ simulated: true, effects: [{ type: 'gainEnergy', amount: 1 }], upgraded: { effects: [{ type: 'gainEnergy', amount: 2 }] } });
    expect(c.production).toMatchObject({ simulated: true, effects: [{ type: 'gainEnergy', amount: 2 }], upgraded: { effects: [{ type: 'gainEnergy', amount: 3 }] } });
    expect(c.luminesce).toMatchObject({ simulated: true, keywords: ['retain', 'exhaust'], effects: [{ type: 'gainEnergy', amount: 2 }], upgraded: { effects: [{ type: 'gainEnergy', amount: 3 }] } });
    expect(c.mad_science_energized).toMatchObject({ simulated: true, effects: [{ type: 'gainBlock', amount: 8 }, { type: 'gainEnergy', amount: 2 }] });
    for (const id of ['bloodletting', 'offering', 'brightest_flame', 'cascade']) expect(c[id]?.simulated).toBe(false);
    expect(c.tremble).toMatchObject({ simulated: true, effects: [{ type: 'applyVulnerable', amount: 3 }] });
  });

  // Volley (#64): random target is the one enemy (#6), repeated X times (#23).
  it('Volley is a simulated X-times attack', () => {
    expect(gameData.cards.volley).toMatchObject({ xCost: true, cost: 0, simulated: true, keywords: [],
      effects: [{ type: 'attack', damage: 10, hits: 1, xTimes: true }],
      upgraded: { effects: [{ type: 'attack', damage: 14, hits: 1, xTimes: true }] } });
    expect(cardByCode('Vl')?.id).toBe('volley');
  });

  it('beta-only cards are removed and their codes reserved (#59)', () => {
    for (const { code, id } of reservedCodes.cards) {
      expect(gameData.cards[id]).toBeUndefined();
      expect(cardByCode(code)).toBeUndefined();
    }
    expect(reservedCodes.cards.map((r) => r.code).sort()).toEqual(['Ca', 'SD', 'Ud']);
  });

  it('reports a card that uses a reserved code', () => {
    const d = fixture();
    d.cards.strike.code = 'Ud';
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/cards\/strike.*"code" "Ud".*reserved.*Underworld/));
  });

  it('allows innate and retain on simulated cards, base and upgraded', () => {
    const d = fixture();
    d.cards.bash.keywords = ['innate'];
    d.cards.strike.keywords = ['retain'];
    d.cards.defend.upgraded.keywords = ['retain', 'innate'];
    expect(errorsOf(d)).toEqual([]);
  });

  it('reports non-numeric ascension keys and overrides of unknown moves', () => {
    const d = fixture();
    d.enemies.nibbit.ascension.A9 = {};
    d.enemies.nibbit.ascension['9'].moves.bite = { effects: [] };
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/enemies\/nibbit.*ascension\.A9.*numeric/));
    expect(errs).toContainEqual(expect.stringMatching(/enemies\/nibbit.*ascension\.9\.moves\.bite.*unknown move/));
  });

  it('reports an id that does not match its key', () => {
    const d = fixture();
    d.cards.bash.id = 'bash2';
    expect(errorsOf(d)).toContainEqual(expect.stringMatching(/cards\/bash.*"id"/));
  });

  it('reports missing required fields', () => {
    const d = fixture();
    delete d.characters.ironclad.maxHp;
    delete d.enemies.nibbit.source;
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/characters\/ironclad.*"maxHp"/));
    expect(errs).toContainEqual(expect.stringMatching(/enemies\/nibbit.*"source"/));
  });
});

describe('assembleGameData', () => {
  it('reports two files sharing an id', () => {
    const { errors } = assembleGameData({
      manifest: gameData.manifest,
      cards: { './cards/a.json': { id: 'x' }, './cards/b.json': { id: 'x' } },
      enemies: {},
      characters: {},
    });
    expect(errors).toEqual([expect.stringMatching(/cards.*"x".*a\.json.*b\.json/)]);
  });
});

describe('imported characters and enemies', () => {
  it.each([
    ['S', 'silent', 70, 12, 'Ring of the Snake'],
    ['D', 'defect', 75, 10, 'Cracked Core'],
    ['N', 'necrobinder', 66, 10, 'Bound Phylactery'],
    ['R', 'regent', 75, 10, 'Divine Right'],
  ])('%s is %s with %i HP, %i starting cards and %s', (code, id, hp, cards, relic) => {
    const ch = characterByCode(code);
    expect(ch).toMatchObject({ id, maxHp: hp, startingRelic: relic });
    expect(ch?.startingDeck.reduce((n, e) => n + e.count, 0)).toBe(cards);
  });

  it('Seapunk cycles Sea Kick, Spinning Kick, Bubble Burp', () => {
    expect(enemyByCode('Sp')?.pattern.order).toEqual(['seaKick', 'spinningKick', 'bubbleBurp']);
  });

  it('Fuzzy Wurm Crawler cycles Acid Goop, Inhale, Acid Goop', () => {
    expect(enemyByCode('FW')?.pattern.order).toEqual(['acidGoop', 'inhale', 'acidGoop']);
  });
});
