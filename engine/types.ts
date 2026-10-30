/**
 * Shared types for the STS2 combat simulator.
 *
 * This file is the contract between the engine, data, strategy, stats and UI
 * tracks. Change it only through the orchestrator, never from a feature branch.
 *
 * v1 is single-target: every card targets the one enemy, every enemy move
 * targets the player. Effects therefore carry no explicit target; the source
 * decides it (a card's effects hit the enemy, an enemy move's hit the player).
 */

// ---------------------------------------------------------------------------
// Versions, codes, constants
// ---------------------------------------------------------------------------

/** A game patch version string, e.g. "v0.107.1". */
export type GameVersion = string;

/** One-letter character codes used in URLs. */
export type CharacterCode = 'I' | 'S' | 'D' | 'N' | 'R';

export const TURN_CAP = 100;
export const COMBATS_PER_RUN = 10000;
export const MAX_STRATEGIES_PER_RUN = 5;
export const HAND_LIMIT = 10;

export interface IntRange {
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Effects (shared by cards and enemy moves, resolved in list order)
// ---------------------------------------------------------------------------

export type Effect =
  /** Deal `damage` per hit, `hits` times. Strength and modifiers apply per hit. */
  | { type: 'attack'; damage: number; hits: number }
  | { type: 'gainBlock'; amount: number }
  | { type: 'gainStrength'; amount: number }
  | { type: 'applyVulnerable'; amount: number }
  | { type: 'applyWeak'; amount: number }
  | { type: 'applyFrail'; amount: number };

export type EffectType = Effect['type'];

export type DebuffKind = 'vulnerable' | 'weak' | 'frail';

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type CardType = 'attack' | 'skill' | 'power' | 'status' | 'curse';

export type CardKeyword = 'unplayable' | 'ethereal' | 'eternal' | 'exhaust';

/**
 * What changes when a card is upgraded. Omitted fields keep the base value;
 * present fields (effects, keywords) replace the base list wholesale.
 */
export interface CardUpgrade {
  cost?: number;
  effects?: Effect[];
  keywords?: CardKeyword[];
}

export interface CardDef {
  /** Stable internal id, e.g. "strike". */
  id: string;
  /** Permanent two-character, case-sensitive URL code, e.g. "St". Never reused. */
  code: string;
  name: string;
  type: CardType;
  /** "shared": basic cards every character uses (Strike, Defend). */
  character: CharacterCode | 'colorless' | 'shared';
  /** Energy cost. `null` exactly when keywords include "unplayable". */
  cost: number | null;
  keywords: CardKeyword[];
  effects: Effect[];
  /** `null` when the card cannot be upgraded. */
  upgraded: CardUpgrade | null;
  /** Game version this entry was last checked against. */
  lastUpdateVersion: GameVersion;
}

/** One line of a deck: N copies of a card, upgraded or not. */
export interface DeckEntry {
  cardId: string;
  upgraded: boolean;
  count: number;
}

export type Deck = DeckEntry[];

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export interface CharacterDef {
  id: string;
  code: CharacterCode;
  name: string;
  maxHp: number;
  energyPerTurn: number;
  drawPerTurn: number;
  startingDeck: Deck;
  /** Informational only in v1; relic effects are not simulated. */
  startingRelic: string;
  lastUpdateVersion: GameVersion;
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

export type Zone = 'overgrowth' | 'underdocks';
export type EnemyDifficulty = 'easy' | 'normal' | 'elite' | 'boss';

export interface EnemyMove {
  name: string;
  effects: Effect[];
}

export interface CyclePattern {
  type: 'cycle';
  /** Move ids, played in this order and repeated. */
  order: string[];
  /** "first" starts at order[0]; "random" picks a seeded random start. */
  start: 'first' | 'random';
}

export type MovePattern = CyclePattern;

/**
 * Overrides for one Ascension level. Levels are cumulative: at A9 the engine
 * applies every override at or below 9, in ascending order. A move override
 * replaces that move's whole effect list.
 */
export interface EnemyAscensionOverride {
  hp?: IntRange;
  moves?: Record<string, { effects: Effect[] }>;
  pattern?: MovePattern;
}

export interface EnemyDef {
  id: string;
  /** Permanent two-character URL code, e.g. "Nb". */
  code: string;
  name: string;
  act: number;
  zone: Zone;
  difficulty: EnemyDifficulty;
  /** Rolled per combat, inclusive. */
  hp: IntRange;
  moves: Record<string, EnemyMove>;
  pattern: MovePattern;
  /** Keyed by Ascension level as a string ("8", "9"). */
  ascension: Record<string, EnemyAscensionOverride>;
  source: string;
  lastUpdateVersion: GameVersion;
}

// ---------------------------------------------------------------------------
// Manifest and loaded game data
// ---------------------------------------------------------------------------

export interface Manifest {
  /** Current game version, stamped on every simulation result. */
  gameVersion: GameVersion;
  /** Cards added to every starting deck at or above an Ascension level. */
  ascensionCards: { level: number; cardId: string }[];
}

export interface GameData {
  manifest: Manifest;
  cards: Record<string, CardDef>;
  enemies: Record<string, EnemyDef>;
  characters: Record<string, CharacterDef>;
}

// ---------------------------------------------------------------------------
// Combat state
// ---------------------------------------------------------------------------

/**
 * A card in combat, resolved at setup (upgrade applied), so strategies never
 * need to look up definitions.
 */
export interface CardInstance {
  /** Unique within one combat. */
  uid: number;
  cardId: string;
  name: string;
  type: CardType;
  upgraded: boolean;
  /** Effective cost; `null` if unplayable. */
  cost: number | null;
  keywords: CardKeyword[];
  effects: Effect[];
}

export type Debuffs = Record<DebuffKind, number>;

export interface PlayerState {
  hp: number;
  maxHp: number;
  block: number;
  energy: number;
  strength: number;
  debuffs: Debuffs;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
}

export interface EnemyState {
  enemyId: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  strength: number;
  debuffs: Debuffs;
  /** Index into the resolved pattern's `order`. */
  patternIndex: number;
}

export interface CombatState {
  turn: number;
  player: PlayerState;
  enemy: EnemyState;
}

/** What the enemy will do this turn, as the player sees it. */
export interface EnemyIntent {
  moveId: string;
  name: string;
  /** One entry per attack effect, in order; empty on non-attack turns. */
  attacks: { damagePerHit: number; hits: number }[];
  /** Sum of damagePerHit × hits over all attacks; 0 on non-attack turns. */
  totalIncoming: number;
}

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Everything a strategy may look at. It must not mutate anything. */
export interface StrategyView {
  state: DeepReadonly<CombatState>;
  intent: EnemyIntent;
  /** Cards in hand that are playable right now (affordable, not unplayable). */
  playable: readonly DeepReadonly<CardInstance>[];
}

export type Decision = { kind: 'play'; uid: number } | { kind: 'endTurn' };

/** Called repeatedly during the player's turn until it returns endTurn. */
export interface Strategy {
  decide(view: StrategyView): Decision;
}

/** Serializable strategy settings; URL code: "g" or "b<X>" (e.g. "b4"). */
export type StrategyConfig =
  | { kind: 'greedyDamage' }
  /** Play block while (incoming − block) > allowThrough, then attack. */
  | { kind: 'block'; allowThrough: number };

export type StrategyColor = 'blue' | 'green' | 'yellow' | 'red' | 'pink';

export interface SavedStrategy {
  id: string;
  name: string;
  config: StrategyConfig;
}

/** A strategy selected for one run, with its color for that run (unique per run). */
export interface RunStrategy {
  strategy: SavedStrategy;
  color: StrategyColor;
}

// ---------------------------------------------------------------------------
// Event log
// ---------------------------------------------------------------------------

export type Side = 'player' | 'enemy';

export type GameEvent =
  | { t: 'combatStart'; seed: number; enemyHp: number; playerHp: number }
  | { t: 'shuffle'; reason: 'start' | 'reshuffle'; count: number }
  | { t: 'turnStart'; turn: number; side: Side }
  | { t: 'draw'; uid: number; cardId: string }
  | { t: 'play'; uid: number; cardId: string; energyLeft: number }
  | { t: 'damage'; source: Side; target: Side; amount: number; blocked: number; hpLoss: number }
  | { t: 'block'; side: Side; amount: number; total: number }
  | { t: 'blockReset'; side: Side }
  | { t: 'strength'; side: Side; amount: number; total: number }
  | { t: 'debuff'; side: Side; kind: DebuffKind; amount: number; total: number }
  | { t: 'debuffTick'; side: Side; kind: DebuffKind; total: number }
  | { t: 'exhaust'; uid: number; cardId: string; reason: 'ethereal' | 'keyword' }
  | { t: 'discard'; uid: number; cardId: string; reason: 'endOfTurn' | 'handLimit' }
  | { t: 'enemyMove'; moveId: string; name: string }
  | { t: 'turnEnd'; turn: number; side: Side }
  | { t: 'combatEnd'; outcome: Outcome; turns: number; hpLost: number };

// ---------------------------------------------------------------------------
// Running combats
// ---------------------------------------------------------------------------

export type Outcome = 'win' | 'loss' | 'turnCap';

export interface CombatConfig {
  characterId: string;
  /** The player's deck before Ascension additions. */
  deck: Deck;
  enemyId: string;
  ascension: number;
  strategy: StrategyConfig;
  seed: number;
}

export interface CombatResult {
  seed: number;
  outcome: Outcome;
  /** Player turns taken. */
  turns: number;
  /** Max HP − final HP, measured before any end-of-combat healing. */
  hpLost: number;
  /** Enemy HP at the end (0 on a win); useful for turn-cap analysis. */
  enemyHpRemaining: number;
  /** Present only when requested (log viewer); omitted in bulk runs. */
  log?: GameEvent[];
}

/** Engine entry point, implemented in engine/combat.ts. */
export type RunCombat = (
  data: GameData,
  config: CombatConfig,
  options?: { log?: boolean },
) => CombatResult;

export interface RunConfig {
  characterId: string;
  deck: Deck;
  enemyId: string;
  ascension: number;
  strategies: RunStrategy[];
  /** Per-combat seeds are derived from this, identical across strategies. */
  runSeed: number;
}

export interface StrategySummary {
  strategyId: string;
  combats: number;
  avgHpLost: number;
  /** Over wins only; null if there were no wins. */
  avgTurnsToKill: number | null;
  deathRate: number;
  turnCapRate: number;
  /** hpLostCounts[n] = number of combats that lost exactly n HP. */
  hpLostCounts: number[];
}

export interface RunResult {
  gameVersion: GameVersion;
  config: RunConfig;
  summaries: StrategySummary[];
}

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/** Seeded RNG. Every random choice in a combat goes through one of these. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Fisher–Yates shuffle in place; returns the same array. */
  shuffle<T>(items: T[]): T[];
}
