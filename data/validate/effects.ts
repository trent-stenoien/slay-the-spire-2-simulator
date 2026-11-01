/** Effect lists, including the #105 contract shapes (filters, conditions, sources, triggers). */
import { CARD_TYPES, CARD_RARITIES, CONTRACT_EFFECTS, PILES, DESTINATIONS, SELECT_MODES, COUNTERS, POWER_IDS, ENEMY_POWER_IDS, TRIGGER_WHENS, POOL_CHARACTERS, AMOUNT_EFFECTS } from './lists';
import { type Obj, isOneOf, isObj, has, Reporter, optInt, optBool, enumList } from './shared';

export function checkEffects(r: Reporter, list: unknown, path: string): void {
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
      optBool(r, e, 'allEnemies', p);
      optBool(r, e, 'xTimes', p);
      checkXBonus(r, e, p);
    } else if (isOneOf(e.type, AMOUNT_EFFECTS)) {
      r.int(e, 'amount', 0, `${p}.amount`);
    } else if (isOneOf(e.type, CONTRACT_EFFECTS)) {
      checkContractEffect(r, e, p);
    } else {
      r.oneOf(e, 'type', ['attack', ...AMOUNT_EFFECTS, ...CONTRACT_EFFECTS], `${p}.type`);
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

export function checkPer(r: Reporter, v: unknown, p: string): void {
  if (!isObj(v)) {
    r.add(p, 'must be an object with "per" and "amount"');
    return;
  }
  r.oneOf(v, 'per', COUNTERS, `${p}.per`);
  r.int(v, 'amount', 0, `${p}.amount`);
}

export function checkCondition(r: Reporter, v: unknown, p: string): void {
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

/** Optional `xBonus`, only alongside `"xTimes": true`. */
function checkXBonus(r: Reporter, e: Obj, p: string): void {
  if (!has(e, 'xBonus')) return;
  r.int(e, 'xBonus', 0, `${p}.xBonus`);
  if (e.xTimes !== true) r.add(`${p}.xBonus`, 'is only allowed with "xTimes": true');
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
      checkXBonus(r, e, p);
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

export function checkTriggers(r: Reporter, v: unknown, p: string): void {
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
