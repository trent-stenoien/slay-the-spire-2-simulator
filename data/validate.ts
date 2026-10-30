/**
 * Runtime validation for hand-entered game data. No external libraries.
 *
 * Every error names the entity (e.g. `cards/bash`) and the field path
 * (e.g. `effects[1].amount`) so a broken JSON file is easy to find.
 */
import type {
  CardDef,
  CharacterDef,
  EnemyDef,
  GameData,
  Manifest,
} from '../engine/types';

export type ValidationResult =
  | { ok: true; data: GameData }
  | { ok: false; errors: string[] };

const CARD_TYPES = ['attack', 'skill', 'power', 'status', 'curse'] as const;
const CARD_KEYWORDS = ['unplayable', 'ethereal', 'eternal', 'exhaust'] as const;
const CHARACTER_CODES = ['I', 'S', 'D', 'N', 'R'] as const;
const ZONES = ['overgrowth', 'underdocks'] as const;
const DIFFICULTIES = ['easy', 'normal', 'elite', 'boss'] as const;
const PATTERN_STARTS = ['first', 'random'] as const;
const AMOUNT_EFFECTS = [
  'gainBlock',
  'gainStrength',
  'applyVulnerable',
  'applyWeak',
  'applyFrail',
] as const;
const TWO_CHAR_CODE = /^[A-Za-z0-9]{2}$/;
const NUMERIC_KEY = /^(0|[1-9][0-9]*)$/;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Collects errors with a fixed "<entity>: " prefix. */
class Reporter {
  constructor(
    private readonly errors: string[],
    private readonly entity: string,
  ) {}

  add(field: string, message: string): void {
    this.errors.push(`${this.entity}: field "${field}" ${message}`);
  }

  obj(o: Obj, field: string): Obj | undefined {
    const v = o[field];
    if (!isObj(v)) {
      this.add(field, 'must be an object');
      return undefined;
    }
    return v;
  }

  str(o: Obj, field: string, path = field): string | undefined {
    const v = o[field];
    if (typeof v !== 'string' || v.length === 0) {
      this.add(path, 'must be a non-empty string');
      return undefined;
    }
    return v;
  }

  bool(o: Obj, field: string, path = field): void {
    if (typeof o[field] !== 'boolean') this.add(path, 'must be a boolean');
  }

  int(o: Obj, field: string, min: number, path = field): number | undefined {
    const v = o[field];
    if (!isNonNegInt(v) || v < min) {
      this.add(path, `must be an integer >= ${min}`);
      return undefined;
    }
    return v;
  }

  oneOf<T extends string>(
    o: Obj,
    field: string,
    allowed: readonly T[],
    path = field,
  ): T | undefined {
    const v = o[field];
    if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
      this.add(path, `must be one of ${allowed.map((a) => `"${a}"`).join(', ')}`);
      return undefined;
    }
    return v as T;
  }

  arr(o: Obj, field: string, path = field): unknown[] | undefined {
    const v = o[field];
    if (!Array.isArray(v)) {
      this.add(path, 'must be an array');
      return undefined;
    }
    return v;
  }
}

function checkEffects(r: Reporter, list: unknown, path: string): void {
  if (!Array.isArray(list)) {
    r.add(path, 'must be an array');
    return;
  }
  list.forEach((e, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(e)) {
      r.add(p, 'must be an object');
      return;
    }
    if (e.type === 'attack') {
      r.int(e, 'damage', 0, `${p}.damage`);
      r.int(e, 'hits', 1, `${p}.hits`);
    } else if (
      typeof e.type === 'string' &&
      (AMOUNT_EFFECTS as readonly string[]).includes(e.type)
    ) {
      r.int(e, 'amount', 0, `${p}.amount`);
    } else {
      r.oneOf(e, 'type', ['attack', ...AMOUNT_EFFECTS], `${p}.type`);
    }
  });
}

function checkKeywords(r: Reporter, list: unknown, path: string): void {
  if (!Array.isArray(list)) {
    r.add(path, 'must be an array');
    return;
  }
  list.forEach((k, i) => {
    if (typeof k !== 'string' || !(CARD_KEYWORDS as readonly string[]).includes(k)) {
      r.add(`${path}[${i}]`, `must be one of ${CARD_KEYWORDS.map((a) => `"${a}"`).join(', ')}`);
    }
  });
}

function checkRange(r: Reporter, v: unknown, path: string): void {
  if (!isObj(v)) {
    r.add(path, 'must be an object with min and max');
    return;
  }
  const min = r.int(v, 'min', 1, `${path}.min`);
  const max = r.int(v, 'max', 1, `${path}.max`);
  if (min !== undefined && max !== undefined && min > max) {
    r.add(path, `has min (${min}) greater than max (${max})`);
  }
}

function checkPattern(r: Reporter, v: unknown, path: string, moveIds: Set<string>): void {
  if (!isObj(v)) {
    r.add(path, 'must be an object');
    return;
  }
  r.oneOf(v, 'type', ['cycle'], `${path}.type`);
  r.oneOf(v, 'start', PATTERN_STARTS, `${path}.start`);
  const order = r.arr(v, 'order', `${path}.order`);
  if (!order) return;
  if (order.length === 0) r.add(`${path}.order`, 'must not be empty');
  order.forEach((id, i) => {
    if (typeof id !== 'string') {
      r.add(`${path}.order[${i}]`, 'must be a string');
    } else if (!moveIds.has(id)) {
      r.add(`${path}.order[${i}]`, `references unknown move id "${id}"`);
    }
  });
}

function checkManifest(errors: string[], raw: unknown, cardIds: Set<string>): void {
  const r = new Reporter(errors, 'manifest');
  if (!isObj(raw)) {
    errors.push('manifest: must be an object');
    return;
  }
  r.str(raw, 'gameVersion');
  const list = r.arr(raw, 'ascensionCards');
  list?.forEach((entry, i) => {
    const p = `ascensionCards[${i}]`;
    if (!isObj(entry)) {
      r.add(p, 'must be an object');
      return;
    }
    r.int(entry, 'level', 0, `${p}.level`);
    const id = r.str(entry, 'cardId', `${p}.cardId`);
    if (id !== undefined && !cardIds.has(id)) r.add(`${p}.cardId`, `references unknown card id "${id}"`);
  });
}

function checkCard(r: Reporter, c: Obj): void {
  r.str(c, 'code');
  if (typeof c.code === 'string' && !TWO_CHAR_CODE.test(c.code)) {
    r.add('code', `"${c.code}" must be exactly 2 characters [A-Za-z0-9]`);
  }
  r.str(c, 'name');
  r.oneOf(c, 'type', CARD_TYPES);
  r.oneOf(c, 'character', [...CHARACTER_CODES, 'colorless']);
  if (c.cost !== null) r.int(c, 'cost', 0);
  checkKeywords(r, c.keywords, 'keywords');
  const unplayable = Array.isArray(c.keywords) && c.keywords.includes('unplayable');
  if (unplayable !== (c.cost === null)) {
    r.add('cost', 'must be null exactly when keywords include "unplayable"');
  }
  checkEffects(r, c.effects, 'effects');
  if (c.upgraded !== null) {
    if (!isObj(c.upgraded)) {
      r.add('upgraded', 'must be an object or null');
    } else {
      const u = c.upgraded;
      if ('cost' in u && u.cost !== undefined) r.int(u, 'cost', 0, 'upgraded.cost');
      if ('effects' in u && u.effects !== undefined) checkEffects(r, u.effects, 'upgraded.effects');
      if ('keywords' in u && u.keywords !== undefined) checkKeywords(r, u.keywords, 'upgraded.keywords');
    }
  }
  r.str(c, 'lastUpdateVersion');
}

function checkEnemy(r: Reporter, e: Obj): void {
  r.str(e, 'code');
  if (typeof e.code === 'string' && !TWO_CHAR_CODE.test(e.code)) {
    r.add('code', `"${e.code}" must be exactly 2 characters [A-Za-z0-9]`);
  }
  r.str(e, 'name');
  r.int(e, 'act', 1);
  r.oneOf(e, 'zone', ZONES);
  r.oneOf(e, 'difficulty', DIFFICULTIES);
  checkRange(r, e.hp, 'hp');

  const moveIds = new Set<string>();
  const moves = r.obj(e, 'moves');
  if (moves) {
    if (Object.keys(moves).length === 0) r.add('moves', 'must contain at least one move');
    for (const [id, m] of Object.entries(moves)) {
      moveIds.add(id);
      const p = `moves.${id}`;
      if (!isObj(m)) {
        r.add(p, 'must be an object');
        continue;
      }
      r.str(m, 'name', `${p}.name`);
      checkEffects(r, m.effects, `${p}.effects`);
    }
  }
  checkPattern(r, e.pattern, 'pattern', moveIds);

  const asc = r.obj(e, 'ascension');
  if (asc) {
    for (const [level, o] of Object.entries(asc)) {
      const p = `ascension.${level}`;
      if (!NUMERIC_KEY.test(level)) r.add(p, 'key must be a numeric string, e.g. "8"');
      if (!isObj(o)) {
        r.add(p, 'must be an object');
        continue;
      }
      if (o.hp !== undefined) checkRange(r, o.hp, `${p}.hp`);
      if (o.moves !== undefined) {
        if (!isObj(o.moves)) {
          r.add(`${p}.moves`, 'must be an object');
        } else {
          for (const [id, m] of Object.entries(o.moves)) {
            const mp = `${p}.moves.${id}`;
            if (!moveIds.has(id)) r.add(mp, `overrides unknown move id "${id}"`);
            if (!isObj(m)) r.add(mp, 'must be an object');
            else checkEffects(r, m.effects, `${mp}.effects`);
          }
        }
      }
      if (o.pattern !== undefined) checkPattern(r, o.pattern, `${p}.pattern`, moveIds);
    }
  }
  r.str(e, 'source');
  r.str(e, 'lastUpdateVersion');
}

function checkCharacter(r: Reporter, c: Obj, cardIds: Set<string>): void {
  r.oneOf(c, 'code', CHARACTER_CODES);
  r.str(c, 'name');
  r.int(c, 'maxHp', 1);
  r.int(c, 'energyPerTurn', 0);
  r.int(c, 'drawPerTurn', 0);
  const deck = r.arr(c, 'startingDeck');
  deck?.forEach((entry, i) => {
    const p = `startingDeck[${i}]`;
    if (!isObj(entry)) {
      r.add(p, 'must be an object');
      return;
    }
    const id = r.str(entry, 'cardId', `${p}.cardId`);
    if (id !== undefined && !cardIds.has(id)) r.add(`${p}.cardId`, `references unknown card id "${id}"`);
    r.bool(entry, 'upgraded', `${p}.upgraded`);
    r.int(entry, 'count', 1, `${p}.count`);
  });
  r.str(c, 'startingRelic');
  r.str(c, 'lastUpdateVersion');
}

/**
 * Validates a collection keyed by id: each entry is an object whose `id`
 * matches its key, then runs the per-entity check. Returns the seen ids.
 */
function checkCollection(
  errors: string[],
  name: 'cards' | 'enemies' | 'characters',
  raw: unknown,
  check: (r: Reporter, o: Obj) => void,
): void {
  if (!isObj(raw)) {
    errors.push(`${name}: must be an object keyed by id`);
    return;
  }
  for (const [key, value] of Object.entries(raw)) {
    const r = new Reporter(errors, `${name}/${key}`);
    if (!isObj(value)) {
      errors.push(`${name}/${key}: must be an object`);
      continue;
    }
    const id = r.str(value, 'id');
    if (id !== undefined && id !== key) r.add('id', `"${id}" does not match its key "${key}"`);
    check(r, value);
  }
}

/** Reports every code shared by more than one entity in a collection. */
function checkUniqueCodes(errors: string[], name: string, raw: unknown): void {
  if (!isObj(raw)) return;
  const byCode = new Map<string, string[]>();
  for (const [key, value] of Object.entries(raw)) {
    if (!isObj(value) || typeof value.code !== 'string') continue;
    const list = byCode.get(value.code) ?? [];
    list.push(key);
    byCode.set(value.code, list);
  }
  for (const [code, keys] of byCode) {
    if (keys.length > 1) {
      errors.push(`${name}: field "code" "${code}" is used by more than one entry: ${keys.map((k) => `${name}/${k}`).join(', ')}`);
    }
  }
}

export function validateGameData(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['gameData: must be an object'] };

  const cardIds = new Set(isObj(raw.cards) ? Object.keys(raw.cards) : []);

  checkManifest(errors, raw.manifest, cardIds);
  checkCollection(errors, 'cards', raw.cards, checkCard);
  checkCollection(errors, 'enemies', raw.enemies, checkEnemy);
  checkCollection(errors, 'characters', raw.characters, (r, o) => checkCharacter(r, o, cardIds));
  checkUniqueCodes(errors, 'cards', raw.cards);
  checkUniqueCodes(errors, 'enemies', raw.enemies);
  checkUniqueCodes(errors, 'characters', raw.characters);

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      manifest: raw.manifest as Manifest,
      cards: raw.cards as Record<string, CardDef>,
      enemies: raw.enemies as Record<string, EnemyDef>,
      characters: raw.characters as Record<string, CharacterDef>,
    },
  };
}

/** Raw JSON modules keyed by file path, as `import.meta.glob` returns them. */
export interface RawGameFiles {
  manifest: unknown;
  cards: Record<string, unknown>;
  enemies: Record<string, unknown>;
  characters: Record<string, unknown>;
}

/**
 * Keys each collection by entity id. Two files with the same id would
 * otherwise silently collapse into one entry, so they are reported here.
 * A file with no string id is kept under its path so validation reports it.
 */
export function assembleGameData(files: RawGameFiles): { raw: Obj; errors: string[] } {
  const errors: string[] = [];
  const collect = (name: string, byPath: Record<string, unknown>): Obj => {
    const out: Obj = {};
    const seenIn = new Map<string, string>();
    for (const [path, value] of Object.entries(byPath)) {
      const id = isObj(value) && typeof value.id === 'string' ? value.id : path;
      const prior = seenIn.get(id);
      if (prior !== undefined) {
        errors.push(`${name}: field "id" "${id}" is used by both ${prior} and ${path}`);
        continue;
      }
      seenIn.set(id, path);
      out[id] = value;
    }
    return out;
  };
  return {
    raw: {
      manifest: files.manifest,
      cards: collect('cards', files.cards),
      enemies: collect('enemies', files.enemies),
      characters: collect('characters', files.characters),
    },
    errors,
  };
}
