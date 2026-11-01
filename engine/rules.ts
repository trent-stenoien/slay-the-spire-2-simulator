/** Pure combat rules shared by the combat loop and the strategies. */
import type { CardInstance, DeepReadonly } from './types';

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

/** Total hits of an attack effect, given X (the energy spent on an X-cost card; 0 otherwise). */
export function attackHits(e: { hits: number; xTimes?: boolean; xBonus?: number }, x: number): number {
  return e.xTimes ? e.hits * Math.max(0, x + (e.xBonus ?? 0)) : e.hits;
}

/** True when the card has a cost, the energy covers it, and it isn't Unplayable. */
export function isPlayable(card: DeepReadonly<CardInstance>, energy: number): boolean {
  return card.cost !== null && card.cost <= energy && !card.keywords.includes('unplayable');
}
