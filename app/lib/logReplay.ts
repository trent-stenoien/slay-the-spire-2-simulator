/**
 * Groups a combat's event log into rounds (one player turn + the enemy turn
 * that follows) and tracks HP / block snapshots for display.
 */
import type { DebuffKind, Debuffs, GameEvent, Outcome } from '../../engine/types';

export interface SideSnapshot {
  hp: number;
  maxHp: number;
  block: number;
  strength: number;
  debuffs: Debuffs;
}

export interface Round {
  turn: number;
  /** State at the start of the round, before the player's block resets. */
  start: { player: SideSnapshot; enemy: SideSnapshot };
  /** State at the end of the round (after the enemy acts, or when combat ended). */
  end: { player: SideSnapshot; enemy: SideSnapshot };
  /** Card ids drawn this round, in order. */
  drawn: string[];
  /** Player phase events (after turnStart player, up to the enemy turnStart). */
  playerEvents: GameEvent[];
  /** Enemy move name, or null if the combat ended first. */
  enemyMove: string | null;
  /** Enemy move id, or null if the combat ended first. */
  enemyMoveId: string | null;
  /** Enemy phase events. */
  enemyEvents: GameEvent[];
  /** Total damage the enemy's move tried to deal (before block). */
  enemyAttack: number;
  /** Total damage the player's cards dealt before enemy block. */
  playerAttack: number;
}

export interface Replay {
  playerMaxHp: number;
  enemyMaxHp: number;
  seed: number;
  rounds: Round[];
  outcome: Outcome | null;
  hpLost: number | null;
}

function emptyDebuffs(): Debuffs {
  return { vulnerable: 0, weak: 0, frail: 0 };
}

function clone(s: SideSnapshot): SideSnapshot {
  return { ...s, debuffs: { ...s.debuffs } };
}

export function buildReplay(log: readonly GameEvent[]): Replay {
  const startEv = log.find((e) => e.t === 'combatStart');
  const playerMaxHp = startEv?.t === 'combatStart' ? startEv.playerHp : 0;
  const enemyMaxHp = startEv?.t === 'combatStart' ? startEv.enemyHp : 0;
  const player: SideSnapshot = { hp: playerMaxHp, maxHp: playerMaxHp, block: 0, strength: 0, debuffs: emptyDebuffs() };
  const enemy: SideSnapshot = { hp: enemyMaxHp, maxHp: enemyMaxHp, block: 0, strength: 0, debuffs: emptyDebuffs() };
  const side = (s: 'player' | 'enemy') => (s === 'player' ? player : enemy);

  const rounds: Round[] = [];
  let cur: Round | null = null;
  let phase: 'player' | 'enemy' = 'player';
  let outcome: Outcome | null = null;
  let hpLost: number | null = null;

  const closeRound = () => {
    if (cur) cur.end = { player: clone(player), enemy: clone(enemy) };
  };

  for (const ev of log) {
    switch (ev.t) {
      case 'turnStart':
        if (ev.side === 'player') {
          closeRound();
          const snap = { player: clone(player), enemy: clone(enemy) };
          cur = {
            turn: ev.turn, start: snap, end: snap, drawn: [], playerEvents: [], enemyMove: null, enemyMoveId: null,
            enemyEvents: [], enemyAttack: 0, playerAttack: 0,
          };
          rounds.push(cur);
          phase = 'player';
          continue;
        }
        phase = 'enemy';
        continue;
      case 'blockReset':
        side(ev.side).block = 0;
        break;
      case 'block':
        side(ev.side).block = ev.total;
        break;
      case 'strength':
        side(ev.side).strength = ev.total;
        break;
      case 'debuff':
      case 'debuffTick':
        side(ev.side).debuffs[ev.kind as DebuffKind] = ev.total;
        break;
      case 'damage': {
        const t = side(ev.target);
        t.block -= ev.blocked;
        t.hp = Math.max(0, t.hp - ev.hpLoss);
        if (cur) {
          if (ev.source === 'enemy') cur.enemyAttack += ev.amount;
          else cur.playerAttack += ev.amount;
        }
        break;
      }
      case 'draw':
        cur?.drawn.push(ev.cardId);
        break;
      case 'enemyMove':
        if (cur) {
          cur.enemyMove = ev.name;
          cur.enemyMoveId = ev.moveId;
        }
        break;
      case 'combatEnd':
        outcome = ev.outcome;
        hpLost = ev.hpLost;
        break;
      default:
        break;
    }
    if (cur && ev.t !== 'combatStart' && ev.t !== 'combatEnd') {
      (phase === 'player' ? cur.playerEvents : cur.enemyEvents).push(ev);
    }
  }
  closeRound();

  const seed = startEv?.t === 'combatStart' ? startEv.seed : 0;
  return { playerMaxHp, enemyMaxHp, seed, rounds, outcome, hpLost };
}

/** One line of text per event, for the log view. `name` maps a cardId to a display name. */
export function describeEvent(ev: GameEvent, name: (cardId: string) => string): string | null {
  const who = (s: 'player' | 'enemy') => (s === 'player' ? 'You' : 'Enemy');
  switch (ev.t) {
    case 'play':
      return `Play ${name(ev.cardId)} (${ev.energyLeft} energy left)`;
    case 'damage': {
      const by = ev.source === 'player' ? 'You hit' : 'Enemy hits';
      const parts = [`${by} for ${ev.amount}`];
      if (ev.blocked > 0) parts.push(`${ev.blocked} blocked`);
      parts.push(`${ev.hpLoss} HP lost`);
      return parts.join(', ');
    }
    case 'block':
      return `${who(ev.side)} gain${ev.side === 'enemy' ? 's' : ''} ${ev.amount} Block (total ${ev.total})`;
    case 'strength':
      return `${who(ev.side)} gain${ev.side === 'enemy' ? 's' : ''} ${ev.amount} Strength (total ${ev.total})`;
    case 'debuff':
      return `${ev.side === 'player' ? 'You get' : 'Enemy gets'} ${ev.amount} ${cap(ev.kind)} (total ${ev.total})`;
    case 'exhaust':
      return `${name(ev.cardId)} exhausted${ev.reason === 'ethereal' ? ' (Ethereal)' : ''}`;
    case 'discard':
      return ev.reason === 'handLimit' ? `${name(ev.cardId)} discarded (hand full)` : null;
    case 'shuffle':
      return ev.reason === 'reshuffle' ? `Discard pile shuffled into draw pile (${ev.count} cards)` : null;
    case 'enemyMove':
      return `Enemy uses ${ev.name}`;
    default:
      return null;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Move id the enemy intends in round `i`: the logged move, or (for a final
 * round that ended before the enemy acted) the move after the previous one in
 * the cycle. Null when it cannot be known (e.g. a random-start enemy killed on turn 1).
 */
export function intendedMoveId(rounds: readonly Round[], i: number, order: readonly string[], start: 'first' | 'random'): string | null {
  const r = rounds[i];
  if (!r) return null;
  if (r.enemyMoveId) return r.enemyMoveId;
  const prev = rounds[i - 1]?.enemyMoveId;
  if (prev) {
    const at = order.indexOf(prev);
    return at < 0 ? null : (order[(at + 1) % order.length] ?? null);
  }
  return i === 0 && start === 'first' ? (order[0] ?? null) : null;
}
