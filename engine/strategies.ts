import type {
  CardInstance,
  DeepReadonly,
  Decision,
  Strategy,
  StrategyConfig,
  StrategyView,
} from './types';

type Card = DeepReadonly<CardInstance>;

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

function totalBaseDamage(card: Card): number {
  let sum = 0;
  for (const e of card.effects) if (e.type === 'attack') sum += e.damage * e.hits;
  return sum;
}

function totalBlock(card: Card): number {
  let sum = 0;
  for (const e of card.effects) if (e.type === 'gainBlock') sum += e.amount;
  return sum;
}

/**
 * Best attack to play: Vulnerable-appliers first, then highest total base
 * damage (damage × hits), ties → lowest uid.
 */
export function pickAttack(playable: readonly Card[]): Card | undefined {
  let best: Card | undefined;
  for (const c of playable) {
    if (!isAttackCard(c)) continue;
    if (!best) {
      best = c;
      continue;
    }
    const cv = appliesVulnerable(c);
    const bv = appliesVulnerable(best);
    if (cv !== bv) {
      if (cv) best = c;
      continue;
    }
    const cd = totalBaseDamage(c);
    const bd = totalBaseDamage(best);
    if (cd > bd || (cd === bd && c.uid < best.uid)) best = c;
  }
  return best;
}

/** Best block card: largest block amount, ties → lowest uid. */
export function pickBlock(playable: readonly Card[]): Card | undefined {
  let best: Card | undefined;
  for (const c of playable) {
    if (!isBlockCard(c)) continue;
    if (!best) {
      best = c;
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

function greedyDecide(view: StrategyView): Decision {
  const atk = pickAttack(view.playable);
  if (atk) return play(atk);
  const blk = pickBlock(view.playable);
  if (blk) return play(blk);
  return END;
}

function blockDecide(view: StrategyView, allowThrough: number): Decision {
  // Phase 1: block until at most `allowThrough` damage would get through.
  const unblocked = view.intent.totalIncoming - view.state.player.block;
  if (unblocked > allowThrough) {
    const blk = pickBlock(view.playable);
    if (blk) return play(blk);
  }
  // Phase 2: attacks. Phase 3: leftover block.
  return greedyDecide(view);
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
