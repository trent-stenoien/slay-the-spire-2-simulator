import { describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import { buildQuery, decodeDeck, defaultSetup, encodeDeck, parseQuery, splitQuery } from './url';

const data = gameData;
const starter = data.characters.ironclad!.startingDeck;

describe('deck encoding', () => {
  it('encodes the starter deck', () => {
    expect(encodeDeck(data, starter)).toBe('St5De4Ba1');
  });

  it('encodes upgraded entries with +', () => {
    expect(
      encodeDeck(data, [
        { cardId: 'strike', upgraded: false, count: 4 },
        { cardId: 'strike', upgraded: true, count: 1 },
      ]),
    ).toBe('St4St+1');
  });

  it("does not encode Ascender's Bane at A5+ (the engine adds it)", () => {
    expect(encodeDeck(data, starter)).toBe('St5De4Ba1');
    expect(buildQuery(data, { ...defaultSetup(data), ascension: 5 })).toContain('d=St5De4Ba1');
    expect(buildQuery(data, { ...defaultSetup(data), ascension: 5 })).not.toContain('As');
  });

  it('skips zero-count entries', () => {
    expect(encodeDeck(data, [{ cardId: 'bash', upgraded: false, count: 0 }])).toBe('');
  });

  it('decodes and round-trips', () => {
    const deck = [
      { cardId: 'strike', upgraded: false, count: 4 },
      { cardId: 'strike', upgraded: true, count: 1 },
      { cardId: 'ultimate_defend', upgraded: true, count: 12 },
    ];
    const text = encodeDeck(data, deck);
    expect(text).toBe('St4St+1UD+12');
    expect(decodeDeck(data, 'ironclad', text)).toEqual({ ok: true, deck });
  });

  it('decodes an empty deck', () => {
    expect(decodeDeck(data, 'ironclad', '')).toEqual({ ok: true, deck: [] });
  });

  it.each([
    ['Zz3', /unknown card code "Zz"/],
    ['St', /cannot read/],
    ['St0', /count must be/],
    ['St05', /cannot read|count must be/],
    ['St100', /count must be/],
    ['St5x', /cannot read/],
    ['St2St3', /more than once/],
    ['AB1', /not available/],
    ['St-1', /cannot read/],
  ])('rejects %s', (text, msg) => {
    const r = decodeDeck(data, 'ironclad', text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });

  it('is case-sensitive on codes', () => {
    expect(decodeDeck(data, 'ironclad', 'st1').ok).toBe(false);
  });
});

describe('query strings', () => {
  const setup = defaultSetup(data);

  it('builds the documented setup URL', () => {
    expect(buildQuery(data, setup)).toBe('v=1&c=I&e=Nb&a=0&d=St5De4Ba1');
  });

  it('builds the documented combat-log URL', () => {
    expect(buildQuery(data, setup, { seed: 123456, strategy: { kind: 'block', allowThrough: 4 } })).toBe(
      'v=1&c=I&e=Nb&a=0&d=St5De4Ba1&s=123456&st=b4',
    );
  });

  it('round-trips setup and log target', () => {
    const s = { ...setup, ascension: 9, deck: [{ cardId: 'bash', upgraded: true, count: 2 }] };
    const log = { seed: 4294967295, strategy: { kind: 'greedyDamage' as const } };
    const parsed = parseQuery(data, `?${buildQuery(data, s, log)}`);
    expect(parsed).toEqual({ setup: s, log, errors: [] });
  });

  it('keeps a literal + in the deck', () => {
    expect(parseQuery(data, '?v=1&c=I&e=Nb&a=0&d=St4St%2B1').setup.deck).toEqual(
      parseQuery(data, '?v=1&c=I&e=Nb&a=0&d=St4St+1').setup.deck,
    );
    expect(parseQuery(data, '?d=St4St+1').setup.deck).toEqual([
      { cardId: 'strike', upgraded: false, count: 4 },
      { cardId: 'strike', upgraded: true, count: 1 },
    ]);
  });

  it('an empty query is defaults with no errors', () => {
    expect(parseQuery(data, '')).toEqual({ setup, log: null, errors: [] });
    expect(parseQuery(data, '?')).toEqual({ setup, log: null, errors: [] });
  });

  it('reports unknown codes without throwing and falls back', () => {
    const r = parseQuery(data, '?v=1&c=X&e=Qq&a=0&d=St5');
    expect(r.errors).toEqual(['Unknown character code "X"', 'Unknown enemy code "Qq"']);
    expect(r.setup).toEqual(setup);
  });

  it('reports a bad deck and keeps the starter deck', () => {
    const r = parseQuery(data, '?v=1&c=I&e=Nb&a=3&d=Zz1');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/Zz/);
    expect(r.setup.deck).toEqual(starter);
    expect(r.setup.ascension).toBe(3);
  });

  it.each(['21', '-1', '1.5', '05', 'abc', ''])('rejects Ascension "%s"', (a) => {
    const r = parseQuery(data, `?a=${a}`);
    expect(r.errors[0]).toMatch(/Ascension/);
    expect(r.setup.ascension).toBe(0);
  });

  it('rejects an unsupported version', () => {
    const r = parseQuery(data, '?v=2&c=I');
    expect(r.errors[0]).toMatch(/version/);
    expect(r.log).toBeNull();
  });

  it('needs both s and st for a log link', () => {
    expect(parseQuery(data, '?s=5').log).toBeNull();
    expect(parseQuery(data, '?s=5').errors[0]).toMatch(/strategy/);
    expect(parseQuery(data, '?st=g').errors[0]).toMatch(/seed/);
  });

  it.each([
    ['s=abc&st=g', /Seed/],
    ['s=4294967296&st=g', /Seed/],
    ['s=1&st=x', /strategy code "x"/],
    ['s=1&st=b01', /strategy code/],
  ])('rejects log params %s', (q, msg) => {
    const r = parseQuery(data, `?${q}`);
    expect(r.log).toBeNull();
    expect(r.errors[0]).toMatch(msg);
  });

  it('splitQuery ignores malformed escapes and keeps the first value', () => {
    const m = splitQuery('?a=1&a=2&b=%E0%A4%A&c');
    expect(m.get('a')).toBe('1');
    expect(m.has('b')).toBe(false);
    expect(m.get('c')).toBe('');
  });
});
