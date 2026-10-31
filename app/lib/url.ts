/**
 * Shareable URL format (v=1).
 *
 *   ?v=1&c=I&e=Nb&a=0&d=St5De4Ba1            setup link
 *   ?v=1&c=I&e=Nb&a=0&d=St5De4Ba1&s=123&st=b4 combat-log link
 *
 * Deck: concatenated entries of card code (2 chars) + optional "+" (upgraded)
 * + count (decimal, no leading zeros). The "+" is written literally, so the
 * query is built and parsed by hand rather than with URLSearchParams (which
 * would turn "+" into a space).
 */
import { parseStrategyCode, strategyCode } from '../../engine/strategies';
import type { CardDef, Deck, GameData, StrategyConfig } from '../../engine/types';
import { deckPool, startingDeckFor } from './deck';

export const URL_VERSION = '1';
export const MAX_ASCENSION = 10;
const MAX_SEED = 0xffffffff;
const MAX_COPIES = 99;
const MAX_COMBAT_INDEX = 9999;

export interface SetupState {
  characterId: string;
  enemyId: string;
  ascension: number;
  deck: Deck;
}

export interface LogTarget {
  /** Per-combat seed passed straight to runCombat. */
  seed: number;
  strategy: StrategyConfig;
  /** 0-based combat number within the run, when the link came from the results picker (optional `n`). Display only. */
  combatIndex?: number;
}

export interface ParsedUrl {
  /** Setup from the URL; fields that were missing or invalid fall back to defaults. */
  setup: SetupState;
  /** Present when both `s` and `st` were valid: the URL opens the log view. */
  log: LogTarget | null;
  /** Human-readable problems; empty when the URL was fine. */
  errors: string[];
}

/** Setup used when the URL has no (valid) params: first character, first enemy, A0, starter deck. */
export function defaultSetup(data: GameData): SetupState {
  const character = data.characters.ironclad ?? Object.values(data.characters)[0];
  const enemy = data.enemies.nibbit ?? Object.values(data.enemies)[0];
  if (!character || !enemy) throw new Error('Game data has no characters or enemies');
  return {
    characterId: character.id,
    enemyId: enemy.id,
    ascension: 0,
    deck: startingDeckFor(data, character.id),
  };
}

// ---------------------------------------------------------------------------
// Deck encoding
// ---------------------------------------------------------------------------

export function encodeDeck(data: GameData, deck: Deck): string {
  let out = '';
  for (const entry of deck) {
    if (entry.count <= 0) continue;
    const card = data.cards[entry.cardId];
    if (!card) throw new Error(`Unknown card id "${entry.cardId}"`);
    out += `${card.code}${entry.upgraded ? '+' : ''}${entry.count}`;
  }
  return out;
}

export type DeckParseResult = { ok: true; deck: Deck } | { ok: false; error: string };

/**
 * Strict deck parser. Rejects unknown codes, cards outside the character's
 * deck-builder pool, upgrades on cards that cannot be upgraded, duplicate
 * entries, zero / leading-zero / oversized counts, and any stray characters.
 */
export function decodeDeck(data: GameData, characterId: string, text: string): DeckParseResult {
  const byCode = new Map<string, CardDef>(Object.values(data.cards).map((c) => [c.code, c]));
  const pool = new Set(deckPool(data, characterId).map((c) => c.id));
  const re = /([A-Za-z0-9]{2})(\+?)(0|[1-9]\d*)/y;
  const deck: Deck = [];
  const seen = new Set<string>();
  let pos = 0;
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) return { ok: false, error: `Deck: cannot read "${text.slice(pos)}" (expected code, optional +, count)` };
    const [whole, code = '', plus, countText = ''] = m;
    const card = byCode.get(code);
    if (!card) return { ok: false, error: `Deck: unknown card code "${code}"` };
    if (!pool.has(card.id)) return { ok: false, error: `Deck: ${card.name} (${code}) is not available for this character` };
    const upgraded = plus === '+';
    if (upgraded && !card.upgraded) return { ok: false, error: `Deck: ${card.name} (${code}) cannot be upgraded` };
    const count = Number(countText);
    if (count < 1 || count > MAX_COPIES) {
      return { ok: false, error: `Deck: ${card.name} count must be 1–${MAX_COPIES}, got ${countText}` };
    }
    const key = `${card.id}${upgraded ? '+' : ''}`;
    if (seen.has(key)) return { ok: false, error: `Deck: ${code}${plus} appears more than once` };
    seen.add(key);
    deck.push({ cardId: card.id, upgraded, count });
    pos += whole.length;
  }
  return { ok: true, deck };
}

// ---------------------------------------------------------------------------
// Query string
// ---------------------------------------------------------------------------

/** Build the query string (without "?"). Param order is fixed: v c e a d [s st [n]]. */
export function buildQuery(data: GameData, setup: SetupState, log?: LogTarget | null): string {
  const character = data.characters[setup.characterId];
  const enemy = data.enemies[setup.enemyId];
  if (!character) throw new Error(`Unknown character id "${setup.characterId}"`);
  if (!enemy) throw new Error(`Unknown enemy id "${setup.enemyId}"`);
  const parts = [
    `v=${URL_VERSION}`,
    `c=${character.code}`,
    `e=${enemy.code}`,
    `a=${setup.ascension}`,
    `d=${encodeDeck(data, setup.deck)}`,
  ];
  if (log) parts.push(`s=${log.seed >>> 0}`, `st=${strategyCode(log.strategy)}`);
  if (log && log.combatIndex !== undefined) parts.push(`n=${log.combatIndex}`);
  return parts.join('&');
}

/** Split a query by hand so a literal "+" survives. First occurrence of a key wins. */
export function splitQuery(search: string): Map<string, string> {
  const params = new Map<string, string>();
  const q = search.startsWith('?') ? search.slice(1) : search;
  if (q === '') return params;
  for (const pair of q.split('&')) {
    if (pair === '') continue;
    const eq = pair.indexOf('=');
    const rawKey = eq < 0 ? pair : pair.slice(0, eq);
    const rawValue = eq < 0 ? '' : pair.slice(eq + 1);
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey);
      value = decodeURIComponent(rawValue);
    } catch {
      continue; // malformed escape: ignore the pair
    }
    if (!params.has(key)) params.set(key, value);
  }
  return params;
}

function parseIntStrict(text: string, max: number): number | null {
  if (!/^(0|[1-9]\d*)$/.test(text)) return null;
  const n = Number(text);
  return n <= max ? n : null;
}

/**
 * Parse a location.search string. Never throws: problems are collected in
 * `errors` and the affected fields fall back to defaults. A query with no
 * params at all is not an error.
 */
export function parseQuery(data: GameData, search: string): ParsedUrl {
  const setup = defaultSetup(data);
  const errors: string[] = [];
  const p = splitQuery(search);
  if (p.size === 0) return { setup, log: null, errors };

  const v = p.get('v');
  if (v !== undefined && v !== URL_VERSION) {
    errors.push(`Unsupported link version "${v}" (this app reads v=${URL_VERSION})`);
    return { setup, log: null, errors };
  }

  const c = p.get('c');
  let characterOk = true;
  if (c !== undefined) {
    const ch = Object.values(data.characters).find((x) => x.code === c);
    if (ch) {
      setup.characterId = ch.id;
      setup.deck = startingDeckFor(data, ch.id);
    } else {
      errors.push(`Unknown character code "${c}"`);
      characterOk = false;
    }
  }

  const e = p.get('e');
  if (e !== undefined) {
    const en = Object.values(data.enemies).find((x) => x.code === e);
    if (en) setup.enemyId = en.id;
    else errors.push(`Unknown enemy code "${e}"`);
  }

  const a = p.get('a');
  if (a !== undefined) {
    const n = parseIntStrict(a, MAX_ASCENSION);
    if (n === null) errors.push(`Ascension must be a whole number 0–${MAX_ASCENSION}, got "${a}"`);
    else setup.ascension = n;
  }

  const d = p.get('d');
  if (d !== undefined && characterOk) {
    // Tolerate a "+" that some tool turned into a space.
    const r = decodeDeck(data, setup.characterId, d.replace(/ /g, '+'));
    if (r.ok) setup.deck = r.deck;
    else errors.push(r.error);
  }

  let log: LogTarget | null = null;
  const s = p.get('s');
  const st = p.get('st');
  if (s !== undefined || st !== undefined) {
    let seed: number | null = null;
    let strategy: StrategyConfig | null = null;
    if (s === undefined) errors.push('Combat link is missing the seed (s)');
    else {
      seed = parseIntStrict(s, MAX_SEED);
      if (seed === null) errors.push(`Seed must be a whole number 0–${MAX_SEED}, got "${s}"`);
    }
    if (st === undefined) errors.push('Combat link is missing the strategy (st)');
    else {
      strategy = parseStrategyCode(st);
      if (!strategy) errors.push(`Unknown strategy code "${st}"`);
    }
    if (seed !== null && strategy) {
      log = { seed, strategy };
      const n = p.get('n');
      // Optional and display-only: a bad value is ignored, never an error.
      const combatIndex = n === undefined ? null : parseIntStrict(n, MAX_COMBAT_INDEX);
      if (combatIndex !== null) log.combatIndex = combatIndex;
    }
  }

  return { setup, log, errors };
}
