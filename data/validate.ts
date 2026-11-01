/**
 * Runtime validation for hand-entered game data. No external libraries.
 *
 * Every error names the entity (e.g. `cards/bash`) and the field path
 * (e.g. `effects[1].amount`) so a broken JSON file is easy to find.
 */
import type {
  CardDef,
  CharacterDef,
  Counter,
  EffectType,
  EnemyDef,
  EnemyPowerId,
  GameData,
  Manifest,
  PowerId,
} from '../engine/types';
import reservedCodes from './reserved-codes.json';

export type ValidationResult =
  | { ok: true; data: GameData }
  | { ok: false; errors: string[] };

const CARD_TYPES = ['attack', 'skill', 'power', 'status', 'curse', 'quest'] as const;
const CARD_RARITIES = ['basic', 'common', 'uncommon', 'rare', 'ancient', 'event', 'token', 'status', 'curse', 'quest'] as const;
const CARD_KEYWORDS = ['unplayable', 'ethereal', 'eternal', 'exhaust', 'retain', 'innate', 'sly'] as const;
/** Keywords and effects the engine implements; a `simulated` card may use only these. */
const SIMULATED_KEYWORDS = new Set(['unplayable', 'ethereal', 'eternal', 'exhaust', 'innate', 'retain']);
/**
 * #105 contract effects: valid data, but not simulated yet. Each mechanic card
 * (#106–#116) removes its effects from this list when the engine supports them.
 */
const CONTRACT_EFFECTS = [
  'loseHp',
  'draw',
  'drawUntil',
  'exhaustCards',
  'applyPower',
  'applyEnemyPower',
  'schedule',
  'dealDamage',
  'enemyLoseHp',
  'setCost',
  'conditional',
  'repeat',
  'attackFrom',
  'gainBlockFrom',
  'growDamage',
  'moveCards',
  'moveSelf',
  'upgradeCards',
  'playCards',
  'addReplay',
  'addCards',
  'transformCards',
  'heal',
  'gainMaxHp',
  'loseMaxHp',
  'script',
] as const;
const UNSIMULATED_EFFECTS = new Set<string>(['gainStars', ...CONTRACT_EFFECTS]);
/** CardDef fields from #105 that the engine does not simulate yet. */
const UNSIMULATED_CARD_FIELDS = ['triggers', 'playableIf', 'costLessPer'] as const;
const PILES = ['hand', 'draw', 'discard', 'exhaust'] as const;
const DESTINATIONS = ['hand', 'drawTop', 'drawBottom', 'drawRandom', 'discard', 'exhaust'] as const;
const SELECT_MODES = ['choose', 'random', 'all', 'top'] as const;
const COUNTERS = [
  'playerBlock',
  'playerStrength',
  'enemyVulnerable',
  'enemyUniqueDebuffs',
  'handSize',
  'drawPileSize',
  'discardPileSize',
  'exhaustPileSize',
  'hpLossesThisCombat',
  'cardsPlayedThisTurn',
  'cardsPlayedThisCombat',
  'attacksPlayedThisTurn',
  'cardsExhaustedThisTurn',
  'cardsExhaustedThisCombat',
  'lastEffectCount',
  'lastAttackDamage',
] as const;
const POWER_IDS = [
  'demonForm', 'energyPerTurn', 'rollingBoulder', 'crimsonMantle', 'plating', 'barricade', 'cruelty',
  'dexterity', 'fasten', 'thorns', 'vigorPerTurn', 'vigor', 'powersCostLess', 'upgradeAtCombatEnd',
  'corruption', 'strengthThisTurn', 'rage', 'flameBarrier', 'colossus', 'noBlockFromCards', 'retainHand',
  'freeAttack', 'doubleAttack', 'nextCardToDrawTop', 'choking', 'noDraw', 'darkEmbrace', 'feelNoPain',
  'rupture', 'inferno', 'juggernaut', 'unmovable', 'vicious', 'panache', 'automation', 'juggling',
  'aggression', 'hellraiser', 'stampede', 'mayhem', 'nostalgia', 'stratagem', 'intangible', 'gambit',
  'calamity', 'helloWorld', 'entropy',
] as const;
const ENEMY_POWER_IDS = ['strengthLossThisTurn', 'stun'] as const;
const TRIGGER_WHENS = ['exhausted', 'drawn', 'turnEndInHand', 'turnEndInExhaust'] as const;
const POOL_CHARACTERS = ['own', 'colorless', 'otherCharacters'] as const;

/** Compile-time check that the lists above match the contract unions exactly (fails typecheck otherwise). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const CONTRACT_LISTS_MATCH_TYPES: Same<PowerId, (typeof POWER_IDS)[number]> &
  Same<EnemyPowerId, (typeof ENEMY_POWER_IDS)[number]> &
  Same<Counter, (typeof COUNTERS)[number]> &
  Same<EffectType, 'attack' | (typeof AMOUNT_EFFECTS)[number] | (typeof CONTRACT_EFFECTS)[number]> = true;
const CHARACTER_CODES = ['I', 'S', 'D', 'N', 'R'] as const;
const ZONES = ['overgrowth', 'underdocks', 'hive', 'glory'] as const;
const DIFFICULTIES = ['easy', 'normal', 'elite', 'boss', 'minion', 'event'] as const;
const PATTERN_STARTS = ['first', 'random'] as const;
const AMOUNT_EFFECTS = [
  'gainBlock',
  'gainStrength',
  'applyVulnerable',
  'applyWeak',
  'applyFrail',
  'applyPoison',
  'gainEnergy',
  'gainStars',
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
      if ('allEnemies' in e && e.allEnemies !== undefined) r.bool(e, 'allEnemies', `${p}.allEnemies`);
      if ('xTimes' in e && e.xTimes !== undefined) r.bool(e, 'xTimes', `${p}.xTimes`);
      if ('xBonus' in e && e.xBonus !== undefined) {
        r.int(e, 'xBonus', 0, `${p}.xBonus`);
        if (e.xTimes !== true) r.add(`${p}.xBonus`, 'is only allowed with "xTimes": true');
      }
    } else if (
      typeof e.type === 'string' &&
      (AMOUNT_EFFECTS as readonly string[]).includes(e.type)
    ) {
      r.int(e, 'amount', 0, `${p}.amount`);
    } else if (typeof e.type === 'string' && (CONTRACT_EFFECTS as readonly string[]).includes(e.type)) {
      checkContractEffect(r, e, p);
    } else {
      r.oneOf(e, 'type', ['attack', ...AMOUNT_EFFECTS, ...CONTRACT_EFFECTS], `${p}.type`);
    }
  });
}

// ---------------------------------------------------------------------------
// #105 contract shapes
// ---------------------------------------------------------------------------

function has(o: Obj, field: string): boolean {
  return field in o && o[field] !== undefined;
}

function optInt(r: Reporter, o: Obj, field: string, min: number, p: string): void {
  if (has(o, field)) r.int(o, field, min, `${p}.${field}`);
}

function optBool(r: Reporter, o: Obj, field: string, p: string): void {
  if (has(o, field)) r.bool(o, field, `${p}.${field}`);
}

function enumList(r: Reporter, o: Obj, field: string, allowed: readonly string[], p: string, nonEmpty = false): void {
  const list = r.arr(o, field, `${p}.${field}`);
  if (!list) return;
  if (nonEmpty && list.length === 0) r.add(`${p}.${field}`, 'must not be empty');
  list.forEach((v, i) => {
    if (typeof v !== 'string' || !allowed.includes(v)) {
      r.add(`${p}.${field}[${i}]`, `must be one of ${allowed.map((a) => `"${a}"`).join(', ')}`);
    }
  });
}

function checkFilter(r: Reporter, v: unknown, p: string): void {
  if (!isObj(v)) {
    r.add(p, 'must be an object');
    return;
  }
  if (has(v, 'types')) enumList(r, v, 'types', CARD_TYPES, p);
  if (has(v, 'notTypes')) enumList(r, v, 'notTypes', CARD_TYPES, p);
  if (has(v, 'rarity')) enumList(r, v, 'rarity', CARD_RARITIES, p);
  if (has(v, 'nameIncludes')) r.str(v, 'nameIncludes', `${p}.nameIncludes`);
  if (has(v, 'cardId')) r.str(v, 'cardId', `${p}.cardId`);
  optBool(r, v, 'upgraded', p);
  optBool(r, v, 'noReplay', p);
}

function optFilter(r: Reporter, o: Obj, field: string, p: string): void {
  if (has(o, field)) checkFilter(r, o[field], `${p}.${field}`);
}

function checkPer(r: Reporter, v: unknown, p: string): void {
  if (!isObj(v)) {
    r.add(p, 'must be an object with "per" and "amount"');
    return;
  }
  r.oneOf(v, 'per', COUNTERS, `${p}.per`);
  r.int(v, 'amount', 0, `${p}.amount`);
}

function checkCondition(r: Reporter, v: unknown, p: string): void {
  if (!isObj(v)) {
    r.add(p, 'must be an object');
    return;
  }
  const kind = r.oneOf(v, 'kind', ['lostHpThisTurn', 'enemyHas', 'counter', 'handHasNone', 'handAll', 'fatal'], `${p}.kind`);
  if (kind === 'enemyHas') r.oneOf(v, 'status', ['vulnerable', 'weak', 'frail', 'poison'], `${p}.status`);
  if (kind === 'counter') {
    r.oneOf(v, 'counter', COUNTERS, `${p}.counter`);
    optInt(r, v, 'min', 0, p);
    optInt(r, v, 'max', 0, p);
    if (!has(v, 'min') && !has(v, 'max')) r.add(p, 'needs "min" or "max"');
  }
  if (kind === 'handHasNone' || kind === 'handAll') checkFilter(r, v.filter, `${p}.filter`);
}

function checkSource(r: Reporter, v: unknown, p: string): void {
  if (!isObj(v)) {
    r.add(p, 'must be an object');
    return;
  }
  const kind = r.oneOf(v, 'kind', ['self', 'card', 'copyOf', 'random'], `${p}.kind`);
  if (kind === 'card') r.str(v, 'cardId', `${p}.cardId`);
  if (kind === 'copyOf') {
    r.oneOf(v, 'from', PILES, `${p}.from`);
    r.oneOf(v, 'mode', SELECT_MODES, `${p}.mode`);
    optFilter(r, v, 'filter', p);
  }
  if (kind === 'random') {
    const pool = v.pool;
    const pp = `${p}.pool`;
    if (!isObj(pool)) {
      r.add(pp, 'must be an object');
      return;
    }
    if (has(pool, 'character')) r.oneOf(pool, 'character', POOL_CHARACTERS, `${pp}.character`);
    if (has(pool, 'types')) enumList(r, pool, 'types', CARD_TYPES, pp);
    if (has(pool, 'rarity')) enumList(r, pool, 'rarity', CARD_RARITIES, pp);
    optInt(r, pool, 'cost', 0, pp);
  }
}

/** `count` is required unless mode is "all". */
function checkCountMode(r: Reporter, e: Obj, p: string): void {
  const mode = r.oneOf(e, 'mode', SELECT_MODES, `${p}.mode`);
  if (has(e, 'count')) r.int(e, 'count', 1, `${p}.count`);
  else if (mode !== undefined && mode !== 'all') r.add(`${p}.count`, 'is required unless "mode" is "all"');
}

function checkContractEffect(r: Reporter, e: Obj, p: string): void {
  switch (e.type) {
    case 'loseHp':
    case 'draw':
    case 'dealDamage':
    case 'enemyLoseHp':
    case 'heal':
    case 'gainMaxHp':
    case 'loseMaxHp':
      r.int(e, 'amount', 0, `${p}.amount`);
      if (e.type === 'dealDamage') optBool(r, e, 'allEnemies', p);
      break;
    case 'drawUntil':
      optBool(r, e, 'handFull', p);
      optFilter(r, e, 'stopOn', p);
      if (e.handFull !== true && !has(e, 'stopOn')) r.add(p, 'needs "handFull": true or "stopOn"');
      break;
    case 'exhaustCards':
      if (has(e, 'from')) r.oneOf(e, 'from', PILES, `${p}.from`);
      checkCountMode(r, e, p);
      optBool(r, e, 'upTo', p);
      optFilter(r, e, 'filter', p);
      break;
    case 'applyPower':
      r.oneOf(e, 'power', POWER_IDS, `${p}.power`);
      r.int(e, 'amount', 0, `${p}.amount`);
      break;
    case 'applyEnemyPower':
      r.oneOf(e, 'power', ENEMY_POWER_IDS, `${p}.power`);
      r.int(e, 'amount', 0, `${p}.amount`);
      break;
    case 'schedule':
      r.int(e, 'delay', 1, `${p}.delay`);
      if (has(e, 'at')) r.oneOf(e, 'at', ['turnStart', 'turnEnd'], `${p}.at`);
      checkEffects(r, e.effects, `${p}.effects`);
      break;
    case 'setCost':
      enumList(r, e, 'piles', PILES, p, true);
      r.int(e, 'cost', 0, `${p}.cost`);
      r.oneOf(e, 'duration', ['turn', 'combat'], `${p}.duration`);
      optBool(r, e, 'onlyIfHigher', p);
      optFilter(r, e, 'filter', p);
      break;
    case 'conditional':
      checkCondition(r, e.if, `${p}.if`);
      checkEffects(r, e.then, `${p}.then`);
      if (has(e, 'else')) checkEffects(r, e.else, `${p}.else`);
      break;
    case 'repeat':
      r.oneOf(e, 'per', COUNTERS, `${p}.per`);
      optInt(r, e, 'times', 1, p);
      checkEffects(r, e.effects, `${p}.effects`);
      break;
    case 'attackFrom':
      r.int(e, 'damage', 0, `${p}.damage`);
      r.int(e, 'hits', 0, `${p}.hits`);
      optBool(r, e, 'allEnemies', p);
      if (has(e, 'bonusPer')) checkPer(r, e.bonusPer, `${p}.bonusPer`);
      if (has(e, 'extraHitsPer')) checkPer(r, e.extraHitsPer, `${p}.extraHitsPer`);
      if (!has(e, 'bonusPer') && !has(e, 'extraHitsPer')) r.add(p, 'needs "bonusPer" or "extraHitsPer" (use "attack" otherwise)');
      break;
    case 'gainBlockFrom':
      r.int(e, 'amount', 0, `${p}.amount`);
      checkPer(r, e.bonusPer, `${p}.bonusPer`);
      break;
    case 'growDamage':
      r.int(e, 'amount', 0, `${p}.amount`);
      r.oneOf(e, 'scope', ['self', 'sameCard'], `${p}.scope`);
      break;
    case 'moveCards':
      r.oneOf(e, 'from', PILES, `${p}.from`);
      r.oneOf(e, 'to', DESTINATIONS, `${p}.to`);
      checkCountMode(r, e, p);
      optBool(r, e, 'upTo', p);
      optFilter(r, e, 'filter', p);
      optInt(r, e, 'options', 1, p);
      optBool(r, e, 'upgrade', p);
      break;
    case 'moveSelf':
      r.oneOf(e, 'to', DESTINATIONS, `${p}.to`);
      r.oneOf(e, 'when', ['now', 'nextTurnStart'], `${p}.when`);
      break;
    case 'upgradeCards':
      enumList(r, e, 'piles', PILES, p, true);
      checkCountMode(r, e, p);
      break;
    case 'playCards':
      r.oneOf(e, 'from', PILES, `${p}.from`);
      r.oneOf(e, 'mode', ['top', 'random'], `${p}.mode`);
      r.int(e, 'count', 0, `${p}.count`);
      optBool(r, e, 'xTimes', p);
      if (has(e, 'xBonus')) {
        r.int(e, 'xBonus', 0, `${p}.xBonus`);
        if (e.xTimes !== true) r.add(`${p}.xBonus`, 'is only allowed with "xTimes": true');
      }
      optFilter(r, e, 'filter', p);
      optBool(r, e, 'exhaust', p);
      break;
    case 'addReplay':
      r.int(e, 'amount', 1, `${p}.amount`);
      r.oneOf(e, 'from', PILES, `${p}.from`);
      r.oneOf(e, 'mode', SELECT_MODES, `${p}.mode`);
      optFilter(r, e, 'filter', p);
      break;
    case 'addCards':
      checkSource(r, e.source, `${p}.source`);
      r.int(e, 'count', 1, `${p}.count`);
      r.oneOf(e, 'to', DESTINATIONS, `${p}.to`);
      optInt(r, e, 'options', 1, p);
      optBool(r, e, 'upgraded', p);
      optBool(r, e, 'freeThisTurn', p);
      optInt(r, e, 'costThisCombat', 0, p);
      break;
    case 'transformCards':
      r.oneOf(e, 'from', PILES, `${p}.from`);
      checkCountMode(r, e, p);
      optFilter(r, e, 'filter', p);
      checkSource(r, e.into, `${p}.into`);
      break;
    case 'script': {
      r.str(e, 'id', `${p}.id`);
      if (has(e, 'values')) {
        const vals = r.arr(e, 'values', `${p}.values`);
        vals?.forEach((v, i) => {
          if (typeof v !== 'number' || !Number.isFinite(v)) r.add(`${p}.values[${i}]`, 'must be a number');
        });
      }
      break;
    }
  }
}

function checkTriggers(r: Reporter, v: unknown, p: string): void {
  if (!Array.isArray(v)) {
    r.add(p, 'must be an array');
    return;
  }
  v.forEach((t, i) => {
    const tp = `${p}[${i}]`;
    if (!isObj(t)) {
      r.add(tp, 'must be an object');
      return;
    }
    r.oneOf(t, 'when', TRIGGER_WHENS, `${tp}.when`);
    checkEffects(r, t.effects, `${tp}.effects`);
  });
}

/**
 * Card-only mechanics: v1 simulates Poison on enemies only, enemies have no
 * energy, and "X times" needs an X-cost card.
 */
function checkNoEnemyPoison(r: Reporter, list: unknown, path: string): void {
  if (!Array.isArray(list)) return;
  list.forEach((e, i) => {
    if (!isObj(e)) return;
    if (e.type === 'applyPoison') r.add(`${path}[${i}].type`, 'is "applyPoison", but Poison on the player is not simulated');
    if (e.type === 'gainEnergy') r.add(`${path}[${i}].type`, 'is "gainEnergy", but enemies have no energy');
    if (typeof e.type === 'string' && (CONTRACT_EFFECTS as readonly string[]).includes(e.type)) {
      r.add(`${path}[${i}].type`, `is "${e.type}", which is not simulated on enemy moves`);
    }
    if (e.xTimes === true) r.add(`${path}[${i}].xTimes`, 'is only allowed on X-cost cards');
  });
}

/** `xTimes` effects only on X-cost cards. */
function checkXTimes(r: Reporter, c: Obj, list: unknown, path: string): void {
  if (!Array.isArray(list) || c.xCost === true) return;
  list.forEach((e, i) => {
    if (isObj(e) && e.xTimes === true) r.add(`${path}[${i}].xTimes`, 'is only allowed on X-cost cards ("xCost": true)');
  });
}

/** True when some effect in the list scales with X. */
function usesX(list: unknown): boolean {
  return Array.isArray(list) && list.some((e) => isObj(e) && e.xTimes === true);
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
  r.oneOf(c, 'character', [...CHARACTER_CODES, 'colorless', 'shared']);
  r.oneOf(c, 'rarity', CARD_RARITIES);
  if (c.cost !== null) r.int(c, 'cost', 0);
  r.bool(c, 'xCost');
  if (c.starCost !== null) r.int(c, 'starCost', 0);
  if ('xStarCost' in c && c.xStarCost !== undefined) r.bool(c, 'xStarCost');
  r.str(c, 'description');
  if (c.upgradedDescription !== null) r.str(c, 'upgradedDescription');
  if ((c.upgraded === null) !== (c.upgradedDescription === null)) {
    r.add('upgradedDescription', 'must be null exactly when "upgraded" is null');
  }
  r.bool(c, 'simulated');
  r.bool(c, 'multiplayerOnly');
  if ('hidden' in c && c.hidden !== undefined) r.bool(c, 'hidden');
  if (has(c, 'triggers')) checkTriggers(r, c.triggers, 'triggers');
  if (has(c, 'playableIf')) checkCondition(r, c.playableIf, 'playableIf');
  if (has(c, 'costLessPer')) checkPer(r, c.costLessPer, 'costLessPer');
  if (c.simulated === true) {
    const lists: unknown[] = [c.keywords, c.effects];
    if (isObj(c.upgraded)) lists.push(c.upgraded.keywords, c.upgraded.effects);
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const name = typeof item === 'string' ? item : isObj(item) ? item.type : undefined;
        if (typeof name !== 'string') continue;
        const bad = typeof item === 'string' ? !SIMULATED_KEYWORDS.has(name) : UNSIMULATED_EFFECTS.has(name);
        if (bad) r.add('simulated', `is true but the card uses "${name}", which the engine does not simulate`);
      }
    }
    for (const field of UNSIMULATED_CARD_FIELDS) {
      if (has(c, field) || (isObj(c.upgraded) && has(c.upgraded, field))) {
        r.add('simulated', `is true but the card uses "${field}", which the engine does not simulate`);
      }
    }
    if (c.starCost !== null) r.add('simulated', 'is true but the card has a Star cost');
    if (c.xStarCost === true) r.add('simulated', 'is true but X-Star cards are not simulated');
    if (c.xCost === true) {
      const upEffects = isObj(c.upgraded) && Array.isArray(c.upgraded.effects) ? c.upgraded.effects : c.effects;
      if (!usesX(c.effects) || (c.upgraded !== null && !usesX(upEffects))) {
        r.add('simulated', 'is true but the X-cost card has no effect that scales with X ("xTimes")');
      }
    }
  }
  checkKeywords(r, c.keywords, 'keywords');
  const unplayable = Array.isArray(c.keywords) && c.keywords.includes('unplayable');
  if (unplayable !== (c.cost === null)) {
    r.add('cost', 'must be null exactly when keywords include "unplayable"');
  }
  checkEffects(r, c.effects, 'effects');
  checkXTimes(r, c, c.effects, 'effects');
  if (isObj(c.upgraded)) checkXTimes(r, c, c.upgraded.effects, 'upgraded.effects');
  if (c.upgraded !== null) {
    if (!isObj(c.upgraded)) {
      r.add('upgraded', 'must be an object or null');
    } else {
      const u = c.upgraded;
      if ('cost' in u && u.cost !== undefined) r.int(u, 'cost', 0, 'upgraded.cost');
      if ('starCost' in u && u.starCost !== undefined) r.int(u, 'starCost', 0, 'upgraded.starCost');
      if ('effects' in u && u.effects !== undefined) checkEffects(r, u.effects, 'upgraded.effects');
      if ('keywords' in u && u.keywords !== undefined) checkKeywords(r, u.keywords, 'upgraded.keywords');
      if (has(u, 'triggers')) checkTriggers(r, u.triggers, 'upgraded.triggers');
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
      checkNoEnemyPoison(r, m.effects, `${p}.effects`);
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
            else {
              checkEffects(r, m.effects, `${mp}.effects`);
              checkNoEnemyPoison(r, m.effects, `${mp}.effects`);
            }
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

/**
 * Codes of removed cards (e.g. beta-only) stay reserved: no card may use them.
 * A card that returns to the game takes its reserved code back by removing the
 * entry from data/reserved-codes.json.
 */
function checkReservedCodes(errors: string[], raw: unknown): void {
  if (!isObj(raw)) return;
  const reserved = new Map(reservedCodes.cards.map((r) => [r.code, r]));
  for (const [key, value] of Object.entries(raw)) {
    if (!isObj(value) || typeof value.code !== 'string') continue;
    const r = reserved.get(value.code);
    if (r) {
      errors.push(`cards/${key}: field "code" "${value.code}" is reserved for removed card "${r.name}" (data/reserved-codes.json): ${r.reason}`);
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
  checkReservedCodes(errors, raw.cards);
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
