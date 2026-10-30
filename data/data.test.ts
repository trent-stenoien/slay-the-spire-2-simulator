import { describe, expect, it } from 'vitest';
import { cardByCode, characterByCode, enemyByCode, gameData } from './index';
import { assembleGameData, validateGameData } from './validate';

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
    expect(gameData.cards[card.id]).toEqual({ ...card, lastUpdateVersion: VERSION });
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

  it('Nibbit is at code Nb', () => {
    expect(enemyByCode('Nb')?.id).toBe('nibbit');
    expect(gameData.enemies.nibbit?.code).toBe('Nb');
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
    d.cards.bash.keywords = ['retain'];
    const errs = errorsOf(d);
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*effects\[2\]\.type/));
    expect(errs).toContainEqual(expect.stringMatching(/cards\/bash.*keywords\[0\]/));
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
