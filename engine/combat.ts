import { createRng } from './rng';
import { resolveEnemy } from './enemy';
import { createStrategy } from './strategies';
import {
  HAND_LIMIT,
  TURN_CAP,
  type CardDef,
  type CardInstance,
  type CombatConfig,
  type CombatResult,
  type CombatState,
  type DebuffKind,
  type Debuffs,
  type Effect,
  type EnemyDef,
  type EnemyIntent,
  type GameData,
  type GameEvent,
  type Outcome,
  type RunCombat,
  type Side,
  type Strategy,
  type StrategyView,
} from './types';

/** Safety guard: at most this many decisions per player turn. */
export const MAX_DECISIONS_PER_TURN = 50;

const DEBUFF_KINDS: readonly DebuffKind[] = ['vulnerable', 'weak', 'frail'];

// ---------------------------------------------------------------------------
// Pure rule helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Damage per hit = floor((base + Strength) × (Weak ? 0.75 : 1) × (Vulnerable ? 1.5 : 1)),
 * floored once at the end, minimum 0.
 */
export function attackDamage(
  base: number,
  attackerStrength: number,
  attackerWeak: number,
  targetVulnerable: number,
): number {
  let dmg = base + attackerStrength;
  if (attackerWeak > 0) dmg *= 0.75;
  if (targetVulnerable > 0) dmg *= 1.5;
  return Math.max(0, Math.floor(dmg));
}

/** Block gained = floor(amount × (Frail ? 0.75 : 1)), minimum 0. */
export function blockGain(amount: number, frail: number): number {
  return Math.max(0, Math.floor(amount * (frail > 0 ? 0.75 : 1)));
}

/** Intent for an enemy move as the player sees it right now. */
export function computeIntent(
  moveId: string,
  move: { name: string; effects: readonly Effect[] },
  enemy: { strength: number; debuffs: Debuffs },
  player: { debuffs: Debuffs },
): EnemyIntent {
  const attacks: EnemyIntent['attacks'] = [];
  let totalIncoming = 0;
  for (const e of move.effects) {
    if (e.type !== 'attack') continue;
    const dph = attackDamage(e.damage, enemy.strength, enemy.debuffs.weak, player.debuffs.vulnerable);
    attacks.push({ damagePerHit: dph, hits: e.hits });
    totalIncoming += dph * e.hits;
  }
  return { moveId, name: move.name, attacks, totalIncoming };
}

/** Resolve a CardDef (optionally upgraded) into a CardInstance. */
export function makeCardInstance(def: CardDef, upgraded: boolean, uid: number): CardInstance {
  const up = upgraded ? def.upgraded : null;
  if (upgraded && !up) {
    throw new Error(`Card ${def.id} cannot be upgraded`);
  }
  const keywords = [...(up?.keywords ?? def.keywords)];
  const effects = (up?.effects ?? def.effects).map((e) => ({ ...e }));
  let cost: number | null = up?.cost !== undefined ? up.cost : def.cost;
  if (keywords.includes('unplayable')) cost = null;
  return {
    uid,
    cardId: def.id,
    name: upgraded ? `${def.name}+` : def.name,
    type: def.type,
    upgraded,
    cost,
    keywords,
    effects,
  };
}

export function isPlayable(card: CardInstance, energy: number): boolean {
  return card.cost !== null && card.cost <= energy && !card.keywords.includes('unplayable');
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

interface Fighter {
  hp: number;
  block: number;
  strength: number;
  debuffs: Debuffs;
}

function emptyDebuffs(): Debuffs {
  return { vulnerable: 0, weak: 0, frail: 0 };
}

/**
 * Run one combat with an explicit Strategy object. `runCombat` builds the
 * strategy from `config.strategy`; tests use this to script exact plays.
 */
export function simulateCombat(
  data: GameData,
  config: CombatConfig,
  strategy: Strategy,
  options?: { log?: boolean },
): CombatResult {
  const log: GameEvent[] | null = options?.log ? [] : null;

  const character = data.characters[config.characterId];
  if (!character) throw new Error(`Unknown character "${config.characterId}"`);
  const baseEnemy = data.enemies[config.enemyId];
  if (!baseEnemy) throw new Error(`Unknown enemy "${config.enemyId}"`);
  const enemyDef: EnemyDef = resolveEnemy(baseEnemy, config.ascension);
  const order = enemyDef.pattern.order;
  if (order.length === 0) throw new Error(`Enemy ${enemyDef.id} has an empty pattern`);
  for (const id of order) {
    if (!enemyDef.moves[id]) throw new Error(`Enemy ${enemyDef.id} pattern uses unknown move "${id}"`);
  }

  // Build the deck: config deck in order, then Ascension cards. uids 0..n-1.
  const deck: CardInstance[] = [];
  const addCard = (cardId: string, upgraded: boolean) => {
    const def = data.cards[cardId];
    if (!def) throw new Error(`Unknown card "${cardId}"`);
    if (!def.simulated) throw new Error(`Card "${def.name}" is not supported by the simulator yet`);
    deck.push(makeCardInstance(def, upgraded, deck.length));
  };
  for (const entry of config.deck) {
    for (let i = 0; i < entry.count; i++) addCard(entry.cardId, entry.upgraded);
  }
  for (const ac of data.manifest.ascensionCards) {
    if (ac.level <= config.ascension) addCard(ac.cardId, false);
  }

  // RNG use order is fixed: (1) enemy HP, (2) random pattern start, (3) shuffle.
  const rng = createRng(config.seed);
  const enemyHp = rng.int(enemyDef.hp.min, enemyDef.hp.max);
  const startIndex = enemyDef.pattern.start === 'random' ? rng.int(0, order.length - 1) : 0;
  rng.shuffle(deck);

  const state: CombatState = {
    turn: 0,
    player: {
      hp: character.maxHp,
      maxHp: character.maxHp,
      block: 0,
      energy: 0,
      strength: 0,
      debuffs: emptyDebuffs(),
      drawPile: deck,
      hand: [],
      discardPile: [],
      exhaustPile: [],
    },
    enemy: {
      enemyId: enemyDef.id,
      name: enemyDef.name,
      hp: enemyHp,
      maxHp: enemyHp,
      block: 0,
      strength: 0,
      debuffs: emptyDebuffs(),
      patternIndex: startIndex,
    },
  };
  const player = state.player;
  const enemy = state.enemy;

  if (log) {
    log.push({ t: 'combatStart', seed: config.seed, enemyHp, playerHp: player.hp });
    log.push({ t: 'shuffle', reason: 'start', count: deck.length });
  }

  const fighter = (side: Side): Fighter => (side === 'player' ? player : enemy);

  /** Deal one attack effect. Returns true if the target died. */
  const doAttack = (source: Side, target: Side, damage: number, hits: number): boolean => {
    const a = fighter(source);
    const t = fighter(target);
    const perHit = attackDamage(damage, a.strength, a.debuffs.weak, t.debuffs.vulnerable);
    for (let h = 0; h < hits; h++) {
      const blocked = Math.min(t.block, perHit);
      t.block -= blocked;
      const hpLoss = perHit - blocked;
      t.hp -= hpLoss;
      if (log) log.push({ t: 'damage', source, target, amount: perHit, blocked, hpLoss });
      if (t.hp <= 0) return true;
    }
    return false;
  };

  const applyDebuff = (side: Side, kind: DebuffKind, amount: number) => {
    const f = fighter(side);
    f.debuffs[kind] += amount;
    if (log) log.push({ t: 'debuff', side, kind, amount, total: f.debuffs[kind] });
  };

  /**
   * Resolve effects from `source`. Attacks and debuffs hit the opponent; block
   * and Strength go to the source. Returns true if the opponent died.
   */
  const resolveEffects = (source: Side, effects: readonly Effect[]): boolean => {
    const other: Side = source === 'player' ? 'enemy' : 'player';
    const self = fighter(source);
    for (const e of effects) {
      switch (e.type) {
        case 'attack':
          if (doAttack(source, other, e.damage, e.hits)) return true;
          break;
        case 'gainBlock': {
          const amt = blockGain(e.amount, self.debuffs.frail);
          self.block += amt;
          if (log) log.push({ t: 'block', side: source, amount: amt, total: self.block });
          break;
        }
        case 'gainStrength':
          self.strength += e.amount;
          if (log) log.push({ t: 'strength', side: source, amount: e.amount, total: self.strength });
          break;
        case 'applyVulnerable':
          applyDebuff(other, 'vulnerable', e.amount);
          break;
        case 'applyWeak':
          applyDebuff(other, 'weak', e.amount);
          break;
        case 'applyFrail':
          applyDebuff(other, 'frail', e.amount);
          break;
        case 'gainStars':
          throw new Error('Stars are not simulated yet');
      }
    }
    return false;
  };

  const drawOne = (): boolean => {
    if (player.drawPile.length === 0) {
      if (player.discardPile.length === 0) return false;
      player.drawPile = player.discardPile;
      player.discardPile = [];
      rng.shuffle(player.drawPile);
      if (log) log.push({ t: 'shuffle', reason: 'reshuffle', count: player.drawPile.length });
    }
    const card = player.drawPile.pop() as CardInstance;
    if (log) log.push({ t: 'draw', uid: card.uid, cardId: card.cardId });
    if (player.hand.length >= HAND_LIMIT) {
      player.discardPile.push(card);
      if (log) log.push({ t: 'discard', uid: card.uid, cardId: card.cardId, reason: 'handLimit' });
    } else {
      player.hand.push(card);
    }
    return true;
  };

  /** Each debuff on `side` goes down by 1 (at the end of that side's turn). */
  const tickDebuffs = (side: Side) => {
    const f = fighter(side);
    for (const kind of DEBUFF_KINDS) {
      if (f.debuffs[kind] > 0) {
        f.debuffs[kind]--;
        if (log) log.push({ t: 'debuffTick', side, kind, total: f.debuffs[kind] });
      }
    }
  };

  const currentMoveId = (): string => order[enemy.patternIndex] as string;

  const finish = (outcome: Outcome): CombatResult => {
    const hpLost = player.maxHp - Math.max(player.hp, 0);
    const result: CombatResult = {
      seed: config.seed,
      outcome,
      turns: state.turn,
      hpLost,
      enemyHpRemaining: Math.max(enemy.hp, 0),
    };
    if (log) {
      log.push({ t: 'combatEnd', outcome, turns: state.turn, hpLost });
      result.log = log;
    }
    return result;
  };

  for (;;) {
    // 1. Player turn start.
    state.turn++;
    if (log) log.push({ t: 'turnStart', turn: state.turn, side: 'player' });
    player.block = 0;
    if (log) log.push({ t: 'blockReset', side: 'player' });
    player.energy = character.energyPerTurn;
    for (let i = 0; i < character.drawPerTurn; i++) {
      if (!drawOne()) break;
    }

    // 2. Strategy plays.
    const moveId = currentMoveId();
    const move = enemyDef.moves[moveId]!;
    for (let decisions = 0; decisions < MAX_DECISIONS_PER_TURN; decisions++) {
      const view: StrategyView = {
        state,
        intent: computeIntent(moveId, move, enemy, player),
        playable: player.hand.filter((c) => isPlayable(c, player.energy)),
      };
      const decision = strategy.decide(view);
      if (decision.kind === 'endTurn') break;
      const idx = player.hand.findIndex((c) => c.uid === decision.uid);
      const card = idx >= 0 ? player.hand[idx] : undefined;
      if (!card || !isPlayable(card, player.energy)) {
        throw new Error(`Strategy tried to play illegal card uid ${decision.uid} on turn ${state.turn}`);
      }
      player.hand.splice(idx, 1);
      player.energy -= card.cost as number;
      if (log) log.push({ t: 'play', uid: card.uid, cardId: card.cardId, energyLeft: player.energy });
      const killed = resolveEffects('player', card.effects);
      if (card.keywords.includes('exhaust')) {
        player.exhaustPile.push(card);
        if (log) log.push({ t: 'exhaust', uid: card.uid, cardId: card.cardId, reason: 'keyword' });
      } else {
        player.discardPile.push(card);
      }
      if (killed || enemy.hp <= 0) return finish('win');
    }

    // 3. Player turn end.
    for (const card of player.hand) {
      if (card.keywords.includes('ethereal')) {
        player.exhaustPile.push(card);
        if (log) log.push({ t: 'exhaust', uid: card.uid, cardId: card.cardId, reason: 'ethereal' });
      } else {
        player.discardPile.push(card);
        if (log) log.push({ t: 'discard', uid: card.uid, cardId: card.cardId, reason: 'endOfTurn' });
      }
    }
    player.hand = [];
    tickDebuffs('player');
    if (log) log.push({ t: 'turnEnd', turn: state.turn, side: 'player' });

    // 4. Enemy turn.
    if (log) log.push({ t: 'turnStart', turn: state.turn, side: 'enemy' });
    enemy.block = 0;
    if (log) {
      log.push({ t: 'blockReset', side: 'enemy' });
      log.push({ t: 'enemyMove', moveId, name: move.name });
    }
    const playerDied = resolveEffects('enemy', move.effects);
    enemy.patternIndex = (enemy.patternIndex + 1) % order.length;
    if (playerDied || player.hp <= 0) return finish('loss');
    // Debuffs on the enemy tick down at the end of the enemy's own turn, after its move.
    tickDebuffs('enemy');
    if (log) log.push({ t: 'turnEnd', turn: state.turn, side: 'enemy' });

    // 5. Turn cap.
    if (state.turn >= TURN_CAP) return finish('turnCap');
  }
}

export const runCombat: RunCombat = (data, config, options) =>
  simulateCombat(data, config, createStrategy(config.strategy), options);
