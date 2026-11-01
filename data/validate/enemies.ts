/** Enemy validation: moves, patterns and Ascension overrides. */
import { CONTRACT_EFFECTS, ZONES, DIFFICULTIES, PATTERN_STARTS, NUMERIC_KEY } from './lists';
import { type Obj, isOneOf, isObj, Reporter, checkTwoCharCode } from './shared';
import { checkEffects } from './effects';

/**
 * Effects an enemy move may not use: v1 simulates Poison on enemies only, enemies have no
 * energy, #105 contract effects are card-only, and "X times" needs an X-cost card.
 */
function checkEnemyOnlyEffects(r: Reporter, list: unknown, path: string): void {
  if (!Array.isArray(list)) return;
  list.forEach((e, i) => {
    if (!isObj(e)) return;
    if (e.type === 'applyPoison')
      r.add(`${path}[${i}].type`, 'is "applyPoison", but Poison on the player is not simulated');
    if (e.type === 'gainEnergy') r.add(`${path}[${i}].type`, 'is "gainEnergy", but enemies have no energy');
    if (isOneOf(e.type, CONTRACT_EFFECTS)) {
      r.add(`${path}[${i}].type`, `is "${e.type}", which is not simulated on enemy moves`);
    }
    if (e.xTimes === true) r.add(`${path}[${i}].xTimes`, 'is only allowed on X-cost cards');
  });
}

function checkMoveEffects(r: Reporter, list: unknown, path: string): void {
  checkEffects(r, list, path);
  checkEnemyOnlyEffects(r, list, path);
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

export function checkEnemy(r: Reporter, e: Obj): void {
  checkTwoCharCode(r, e);
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
      checkMoveEffects(r, m.effects, `${p}.effects`);
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
              checkMoveEffects(r, m.effects, `${mp}.effects`);
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
