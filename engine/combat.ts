import { createRng } from './rng';
import { resolveEnemy } from './enemy';
import { attackDamage, attackHits, blockGain, isPlayable } from './rules';
import { createStrategy } from './strategies';
import {
  HAND_LIMIT,
  TURN_CAP,
  type CardDef,
  type CardInstance,
  type CharacterDef,
  type CombatConfig,
  type CombatResult,
  type CombatState,
  type DebuffKind,
  type Debuffs,
  type Effect,
  type EnemyDef,
  type EnemyIntent,
  type EnemyMove,
  type GameData,
  type GameEvent,
  type Outcome,
  type Rng,
  type RunCombat,
  type Side,
  type Strategy,
  type StrategyView,
} from './types';

/** Safety guard: at most this many decisions per player turn. */
export const MAX_DECISIONS_PER_TURN = 50;

const DEBUFF_KINDS: readonly DebuffKind[] = ['vulnerable', 'weak', 'frail'];

// ---------------------------------------------------------------------------
// Intent and card instances (exported for tests)
// ---------------------------------------------------------------------------

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
  const inst: CardInstance = {
    uid,
    cardId: def.id,
    name: upgraded ? `${def.name}+` : def.name,
    type: def.type,
    upgraded,
    cost,
    keywords,
    effects,
  };
  if (def.xCost) {
    inst.cost = cost === null ? null : 0;
    inst.xCost = true;
  }
  return inst;
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

/** The combat deck: config deck in order, then Ascension cards. uids 0..n-1. */
function buildDeck(data: GameData, config: CombatConfig): CardInstance[] {
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
  return deck;
}

/** The enemy with Ascension applied, after checking its pattern only names known moves. */
function resolveCheckedEnemy(data: GameData, config: CombatConfig): EnemyDef {
  const baseEnemy = data.enemies[config.enemyId];
  if (!baseEnemy) throw new Error(`Unknown enemy "${config.enemyId}"`);
  const enemyDef = resolveEnemy(baseEnemy, config.ascension);
  const order = enemyDef.pattern.order;
  if (order.length === 0) throw new Error(`Enemy ${enemyDef.id} has an empty pattern`);
  for (const id of order) {
    if (!enemyDef.moves[id]) throw new Error(`Enemy ${enemyDef.id} pattern uses unknown move "${id}"`);
  }
  return enemyDef;
}

/**
 * Turn-1 Innate rule: Innate cards move to the top of the draw pile (keeping their shuffled
 * relative order) so they are drawn first, and at least that many cards are drawn, capped at
 * the hand limit. Returns the reordered pile and the draw count.
 */
function innateFirst(drawPile: CardInstance[], drawPerTurn: number): { drawPile: CardInstance[]; drawCount: number } {
  const innate = drawPile.filter((c) => c.keywords.includes('innate'));
  if (innate.length === 0) return { drawPile, drawCount: drawPerTurn };
  return {
    drawPile: [...drawPile.filter((c) => !c.keywords.includes('innate')), ...innate],
    drawCount: Math.min(Math.max(drawPerTurn, innate.length), HAND_LIMIT),
  };
}

/**
 * One combat in progress. Each method is a named step of the turn order in CLAUDE.md; all
 * randomness goes through `rng`, and events are recorded only when logging is on.
 */
class Combat {
  private readonly state: CombatState;
  private readonly log: GameEvent[] | null;
  private readonly rng: Rng;
  private readonly order: readonly string[];

  constructor(
    private readonly config: CombatConfig,
    private readonly character: CharacterDef,
    private readonly enemyDef: EnemyDef,
    deck: CardInstance[],
    private readonly strategy: Strategy,
    logging: boolean,
  ) {
    this.log = logging ? [] : null;
    this.order = enemyDef.pattern.order;
    // RNG use order is fixed: (1) enemy HP, (2) random pattern start, (3) shuffle.
    this.rng = createRng(config.seed);
    const enemyHp = this.rng.int(enemyDef.hp.min, enemyDef.hp.max);
    const startIndex = enemyDef.pattern.start === 'random' ? this.rng.int(0, this.order.length - 1) : 0;
    this.rng.shuffle(deck);
    this.state = {
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
        poison: 0,
        patternIndex: startIndex,
      },
    };
    this.log?.push({ t: 'combatStart', seed: config.seed, enemyHp, playerHp: character.maxHp });
    this.log?.push({ t: 'shuffle', reason: 'start', count: deck.length });
  }

  private get player() {
    return this.state.player;
  }

  private get enemy() {
    return this.state.enemy;
  }

  /** Turns until one side dies or the turn cap is reached. */
  run(): CombatResult {
    for (;;) {
      this.state.turn++;
      this.startPlayerTurn();
      if (this.playCards()) return this.finish('win');
      this.endPlayerTurn();
      const outcome = this.enemyTurn();
      if (outcome) return this.finish(outcome);
      if (this.state.turn >= TURN_CAP) return this.finish('turnCap');
    }
  }

  /** Block resets, energy refills, then the draw (Innate cards first on turn 1). */
  private startPlayerTurn(): void {
    const { player, log } = this;
    log?.push({ t: 'turnStart', turn: this.state.turn, side: 'player' });
    player.block = 0;
    log?.push({ t: 'blockReset', side: 'player' });
    player.energy = this.character.energyPerTurn;
    let drawCount = this.character.drawPerTurn;
    if (this.state.turn === 1) {
      const opening = innateFirst(player.drawPile, drawCount);
      player.drawPile = opening.drawPile;
      drawCount = opening.drawCount;
    }
    for (let i = 0; i < drawCount; i++) {
      if (!this.drawOne()) break;
    }
  }

  /** The strategy plays cards until it ends its turn. Returns true if the enemy died. */
  private playCards(): boolean {
    const { player, enemy, log } = this;
    const { id: moveId, move } = this.currentMove();
    for (let decisions = 0; decisions < MAX_DECISIONS_PER_TURN; decisions++) {
      const view: StrategyView = {
        state: this.state,
        intent: computeIntent(moveId, move, enemy, player),
        playable: player.hand.filter((c) => isPlayable(c, player.energy)),
      };
      const decision = this.strategy.decide(view);
      if (decision.kind === 'endTurn') break;
      const idx = player.hand.findIndex((c) => c.uid === decision.uid);
      const card = idx >= 0 ? player.hand[idx] : undefined;
      if (!card || !isPlayable(card, player.energy)) {
        throw new Error(`Strategy tried to play illegal card uid ${decision.uid} on turn ${this.state.turn}`);
      }
      player.hand.splice(idx, 1);
      // X-cost: X is all the energy available, and the card spends all of it.
      const x = card.xCost ? player.energy : 0;
      player.energy -= card.xCost ? x : (card.cost as number);
      if (log) {
        const ev: GameEvent = { t: 'play', uid: card.uid, cardId: card.cardId, energyLeft: player.energy };
        if (card.xCost) ev.x = x;
        log.push(ev);
      }
      const killed = this.resolveEffects('player', card.effects, x);
      if (card.keywords.includes('exhaust')) {
        player.exhaustPile.push(card);
        log?.push({ t: 'exhaust', uid: card.uid, cardId: card.cardId, reason: 'keyword' });
      } else {
        player.discardPile.push(card);
      }
      if (killed || enemy.hp <= 0) return true;
    }
    return false;
  }

  /** Ethereal exhausts first (even if Retain), Retain stays, the rest is discarded; then player debuffs tick. */
  private endPlayerTurn(): void {
    const { player, log } = this;
    const retained: CardInstance[] = [];
    for (const card of player.hand) {
      if (card.keywords.includes('ethereal')) {
        player.exhaustPile.push(card);
        log?.push({ t: 'exhaust', uid: card.uid, cardId: card.cardId, reason: 'ethereal' });
      } else if (card.keywords.includes('retain')) {
        retained.push(card);
      } else {
        player.discardPile.push(card);
        log?.push({ t: 'discard', uid: card.uid, cardId: card.cardId, reason: 'endOfTurn' });
      }
    }
    player.hand = retained;
    this.tickDebuffs('player');
    log?.push({ t: 'turnEnd', turn: this.state.turn, side: 'player' });
  }

  /** Block resets, Poison, the move, pattern advance, then enemy debuffs tick. Returns the outcome if combat ended. */
  private enemyTurn(): Outcome | null {
    const { player, enemy, log } = this;
    log?.push({ t: 'turnStart', turn: this.state.turn, side: 'enemy' });
    enemy.block = 0;
    log?.push({ t: 'blockReset', side: 'enemy' });
    // Poison: HP loss equal to stacks (ignores Block and modifiers), then -1. A kill ends combat before the move.
    if (enemy.poison > 0) {
      const amount = enemy.poison;
      enemy.hp -= amount;
      enemy.poison--;
      log?.push({ t: 'poisonDamage', amount, hpAfter: Math.max(enemy.hp, 0) });
      if (enemy.hp <= 0) return 'win';
    }
    const { id: moveId, move } = this.currentMove();
    log?.push({ t: 'enemyMove', moveId, name: move.name });
    const playerDied = this.resolveEffects('enemy', move.effects);
    enemy.patternIndex = (enemy.patternIndex + 1) % this.order.length;
    if (playerDied || player.hp <= 0) return 'loss';
    // Debuffs on the enemy tick down at the end of the enemy's own turn, after its move.
    this.tickDebuffs('enemy');
    log?.push({ t: 'turnEnd', turn: this.state.turn, side: 'enemy' });
    return null;
  }

  private currentMove(): { id: string; move: EnemyMove } {
    const id = this.order[this.enemy.patternIndex] as string;
    return { id, move: this.enemyDef.moves[id]! };
  }

  private fighter(side: Side): Fighter {
    return side === 'player' ? this.player : this.enemy;
  }

  /**
   * Resolve effects from `source`. Attacks and debuffs hit the opponent; block
   * and Strength go to the source. Returns true if the opponent died.
   */
  private resolveEffects(source: Side, effects: readonly Effect[], x = 0): boolean {
    const { player, enemy, log } = this;
    const other: Side = source === 'player' ? 'enemy' : 'player';
    const self = this.fighter(source);
    for (const e of effects) {
      switch (e.type) {
        case 'attack':
          if (this.attack(source, other, e.damage, attackHits(e, x))) return true;
          break;
        case 'gainBlock': {
          const amt = blockGain(e.amount, self.debuffs.frail);
          self.block += amt;
          log?.push({ t: 'block', side: source, amount: amt, total: self.block });
          break;
        }
        case 'gainStrength':
          self.strength += e.amount;
          log?.push({ t: 'strength', side: source, amount: e.amount, total: self.strength });
          break;
        case 'applyVulnerable':
          this.applyDebuff(other, 'vulnerable', e.amount);
          break;
        case 'applyWeak':
          this.applyDebuff(other, 'weak', e.amount);
          break;
        case 'applyFrail':
          this.applyDebuff(other, 'frail', e.amount);
          break;
        case 'applyPoison':
          if (source !== 'player') throw new Error('Poison on the player is not simulated yet');
          enemy.poison += e.amount;
          log?.push({ t: 'poison', amount: e.amount, total: enemy.poison });
          break;
        case 'gainEnergy':
          if (source !== 'player') throw new Error('Enemies have no energy');
          player.energy += e.amount;
          log?.push({ t: 'energy', amount: e.amount, total: player.energy });
          break;
        case 'gainStars':
          throw new Error('Stars are not simulated yet');
        default:
          // #105: declared in the contract, implemented by later mechanic cards.
          throw new Error(`Effect "${e.type}" is not simulated yet`);
      }
    }
    return false;
  }

  /** Deal one attack effect, hit by hit (Block absorbs hits in order). Returns true if the target died. */
  private attack(source: Side, target: Side, damage: number, hits: number): boolean {
    const a = this.fighter(source);
    const t = this.fighter(target);
    const perHit = attackDamage(damage, a.strength, a.debuffs.weak, t.debuffs.vulnerable);
    for (let h = 0; h < hits; h++) {
      const blocked = Math.min(t.block, perHit);
      t.block -= blocked;
      const hpLoss = perHit - blocked;
      t.hp -= hpLoss;
      this.log?.push({ t: 'damage', source, target, amount: perHit, blocked, hpLoss });
      if (t.hp <= 0) return true;
    }
    return false;
  }

  private applyDebuff(side: Side, kind: DebuffKind, amount: number): void {
    const f = this.fighter(side);
    f.debuffs[kind] += amount;
    this.log?.push({ t: 'debuff', side, kind, amount, total: f.debuffs[kind] });
  }

  /** Draw one card, reshuffling the discard pile if the draw pile is empty. False when both are empty. */
  private drawOne(): boolean {
    const { player, log } = this;
    if (player.drawPile.length === 0) {
      if (player.discardPile.length === 0) return false;
      player.drawPile = player.discardPile;
      player.discardPile = [];
      this.rng.shuffle(player.drawPile);
      log?.push({ t: 'shuffle', reason: 'reshuffle', count: player.drawPile.length });
    }
    const card = player.drawPile.pop() as CardInstance;
    log?.push({ t: 'draw', uid: card.uid, cardId: card.cardId });
    if (player.hand.length >= HAND_LIMIT) {
      player.discardPile.push(card);
      log?.push({ t: 'discard', uid: card.uid, cardId: card.cardId, reason: 'handLimit' });
    } else {
      player.hand.push(card);
    }
    return true;
  }

  /** Each debuff on `side` goes down by 1 (at the end of that side's turn). */
  private tickDebuffs(side: Side): void {
    const f = this.fighter(side);
    for (const kind of DEBUFF_KINDS) {
      if (f.debuffs[kind] > 0) {
        f.debuffs[kind]--;
        this.log?.push({ t: 'debuffTick', side, kind, total: f.debuffs[kind] });
      }
    }
  }

  private finish(outcome: Outcome): CombatResult {
    const { player, enemy, log } = this;
    const hpLost = player.maxHp - Math.max(player.hp, 0);
    const result: CombatResult = {
      seed: this.config.seed,
      outcome,
      turns: this.state.turn,
      hpLost,
      enemyHpRemaining: Math.max(enemy.hp, 0),
    };
    if (log) {
      log.push({ t: 'combatEnd', outcome, turns: this.state.turn, hpLost });
      result.log = log;
    }
    return result;
  }
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
  const character = data.characters[config.characterId];
  if (!character) throw new Error(`Unknown character "${config.characterId}"`);
  const enemyDef = resolveCheckedEnemy(data, config);
  const deck = buildDeck(data, config);
  return new Combat(config, character, enemyDef, deck, strategy, options?.log === true).run();
}

export const runCombat: RunCombat = (data, config, options) =>
  simulateCombat(data, config, createStrategy(config.strategy), options);
