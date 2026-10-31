import type {
  CardInstance,
  DeepReadonly,
  Decision,
  Strategy,
  StrategyConfig,
  StrategyView,
} from './types';

type Card = DeepReadonly<CardInstance>;

/**
 * Cards every strategy plays before anything else when they are affordable
 * (#1: Tremble, v1). Kept as a list so the rule can grow later.
 */
export const PLAY_FIRST_CARD_IDS: readonly string[] = ['tremble'];

/** Energy a card gains when played (sum of its `gainEnergy` effects). */
export function energyGain(card: Card): number {
  let sum = 0;
  for (const e of card.effects) if (e.type === 'gainEnergy') sum += e.amount;
  return sum;
}

/** True for a card that leaves you with more energy than it costs (e.g. Fuel, Forgotten Ritual). */
export function isNetEnergyCard(card: Card): boolean {
  return !card.xCost && card.cost !== null && energyGain(card) > card.cost;
}

/** True when an X-cost card is in `card`'s position to be played: never at 0 energy. */
function xCostPlayable(card: Card, energy: number): boolean {
  return !card.xCost || energy > 0;
}

/** v1: an attack is any card with an `attack` effect (Bash included). */
export function isAttackCard(card: Card): boolean {
  return card.effects.some((e) => e.type === 'attack');
}

/** v1: a block card is any card with a `gainBlock` effect. */
export function isBlockCard(card: Card): boolean {
  return card.effects.some((e) => e.type === 'gainBlock');
}

function appliesVulnerable(card: Card): boolean {
  return card.effects.some((e) => e.type === 'applyVulnerable');
}

/** Total base damage (damage × hits). For X-cost cards, X is `energy` (all of it gets spent). */
function totalBaseDamage(card: Card, energy: number): number {
  const x = card.xCost ? energy : 0;
  let sum = 0;
  for (const e of card.effects) {
    if (e.type !== 'attack') continue;
    const hits = e.xTimes ? e.hits * Math.max(0, x + (e.xBonus ?? 0)) : e.hits;
    sum += e.damage * hits;
  }
  return sum;
}

function totalBlock(card: Card): number {
  let sum = 0;
  for (const e of card.effects) if (e.type === 'gainBlock') sum += e.amount;
  return sum;
}

/**
 * Best attack to play: X-cost attacks only once no other attack is playable
 * (so they spend the leftover energy; never at 0 energy), then Vulnerable-appliers
 * first, then highest total base damage (damage × hits), ties → lowest uid.
 */
export function pickAttack(playable: readonly Card[], energy = 0): Card | undefined {
  let best: Card | undefined;
  for (const c of playable) {
    if (!isAttackCard(c) || !xCostPlayable(c, energy)) continue;
    if (!best) {
      best = c;
      continue;
    }
    const cx = c.xCost === true;
    const bx = best.xCost === true;
    if (cx !== bx) {
      if (bx) best = c;
      continue;
    }
    const cv = appliesVulnerable(c);
    const bv = appliesVulnerable(best);
    if (cv !== bv) {
      if (cv) best = c;
      continue;
    }
    const cd = totalBaseDamage(c, energy);
    const bd = totalBaseDamage(best, energy);
    if (cd > bd || (cd === bd && c.uid < best.uid)) best = c;
  }
  return best;
}

/**
 * Best block card: X-cost block cards only once no other block card is
 * playable (never at 0 energy), then largest block amount, ties → lowest uid.
 */
export function pickBlock(playable: readonly Card[], energy = 0): Card | undefined {
  let best: Card | undefined;
  for (const c of playable) {
    if (!isBlockCard(c) || !xCostPlayable(c, energy)) continue;
    if (!best) {
      best = c;
      continue;
    }
    const cx = c.xCost === true;
    const bx = best.xCost === true;
    if (cx !== bx) {
      if (bx) best = c;
      continue;
    }
    const cb = totalBlock(c);
    const bb = totalBlock(best);
    if (cb > bb || (cb === bb && c.uid < best.uid)) best = c;
  }
  return best;
}

const END: Decision = { kind: 'endTurn' };
const play = (c: Card): Decision => ({ kind: 'play', uid: c.uid });

/**
 * Plays every strategy makes before its own logic: Tremble (#1), then a card
 * that nets energy (#22), as long as some other card in hand could use it.
 */
function pickFirst(view: StrategyView): Card | undefined {
  let first: Card | undefined;
  for (const c of view.playable) {
    if (PLAY_FIRST_CARD_IDS.includes(c.cardId) && (!first || c.uid < first.uid)) first = c;
  }
  if (first) return first;
  let energy: Card | undefined;
  for (const c of view.playable) {
    if (!isNetEnergyCard(c)) continue;
    if (!energy) {
      energy = c;
      continue;
    }
    const gain = energyGain(c) - (c.cost as number);
    const bestGain = energyGain(energy) - (energy.cost as number);
    if (gain > bestGain || (gain === bestGain && c.uid < energy.uid)) energy = c;
  }
  if (!energy) return undefined;
  const e = energy;
  const useful = view.state.player.hand.some(
    (c) => c.uid !== e.uid && c.cost !== null && (c.xCost || c.cost > 0) && (isAttackCard(c) || isBlockCard(c) || isNetEnergyCard(c) || PLAY_FIRST_CARD_IDS.includes(c.cardId)),
  );
  return useful ? energy : undefined;
}

function greedyDecide(view: StrategyView): Decision {
  const first = pickFirst(view);
  if (first) return play(first);
  return greedyMain(view);
}

function greedyMain(view: StrategyView): Decision {
  const energy = view.state.player.energy;
  const atk = pickAttack(view.playable, energy);
  if (atk) return play(atk);
  const blk = pickBlock(view.playable, energy);
  if (blk) return play(blk);
  return END;
}

function blockDecide(view: StrategyView, allowThrough: number): Decision {
  const first = pickFirst(view);
  if (first) return play(first);
  // Phase 1: block until at most `allowThrough` damage would get through.
  const unblocked = view.intent.totalIncoming - view.state.player.block;
  if (unblocked > allowThrough) {
    const blk = pickBlock(view.playable, view.state.player.energy);
    if (blk) return play(blk);
  }
  // Phase 2: attacks. Phase 3: leftover block.
  return greedyMain(view);
}

/**
 * Strategies are stateless: each decision is recomputed from the view, so one
 * instance can safely be reused across combats.
 */
export function createStrategy(config: StrategyConfig): Strategy {
  switch (config.kind) {
    case 'greedyDamage':
      return { decide: greedyDecide };
    case 'block': {
      const x = config.allowThrough;
      return { decide: (view) => blockDecide(view, x) };
    }
  }
}

/** URL code: "g" or "b<X>". */
export function strategyCode(config: StrategyConfig): string {
  switch (config.kind) {
    case 'greedyDamage':
      return 'g';
    case 'block':
      return `b${config.allowThrough}`;
  }
}

export function parseStrategyCode(code: string): StrategyConfig | null {
  if (code === 'g') return { kind: 'greedyDamage' };
  const m = /^b(0|[1-9]\d{0,3})$/.exec(code);
  if (m) return { kind: 'block', allowThrough: Number(m[1]) };
  return null;
}
