/** Plain-language card text, e.g. "Deal 8 damage. Apply 2 Vulnerable." */
import type { CardDef, CardKeyword, Effect } from '../../engine/types';

const KEYWORD_LABEL: Record<CardKeyword, string> = {
  unplayable: 'Unplayable',
  ethereal: 'Ethereal',
  eternal: 'Eternal',
  exhaust: 'Exhaust',
};

export function effectText(e: Effect): string {
  switch (e.type) {
    case 'attack':
      return e.hits === 1 ? `Deal ${e.damage} damage` : `Deal ${e.damage} damage ${e.hits} times`;
    case 'gainBlock':
      return `Gain ${e.amount} Block`;
    case 'gainStrength':
      return `Gain ${e.amount} Strength`;
    case 'applyVulnerable':
      return `Apply ${e.amount} Vulnerable`;
    case 'applyWeak':
      return `Apply ${e.amount} Weak`;
    case 'applyFrail':
      return `Apply ${e.amount} Frail`;
  }
}

export interface CardText {
  name: string;
  /** "1", "0", or "—" for unplayable. */
  cost: string;
  /** Keywords first, then effects, one phrase each. */
  lines: string[];
}

/** Text for a card as it would be in combat (upgrade applied). */
export function cardText(def: CardDef, upgraded: boolean): CardText {
  const up = upgraded ? def.upgraded : null;
  const keywords = up?.keywords ?? def.keywords;
  const effects = up?.effects ?? def.effects;
  const cost = keywords.includes('unplayable') ? null : up?.cost !== undefined ? up.cost : def.cost;
  return {
    name: up ? `${def.name}+` : def.name,
    cost: cost === null ? '—' : String(cost),
    lines: [...keywords.map((k) => KEYWORD_LABEL[k]), ...effects.map(effectText)],
  };
}

/** One sentence: "Deal 8 damage. Apply 2 Vulnerable." */
export function cardSummary(def: CardDef, upgraded: boolean): string {
  const { lines } = cardText(def, upgraded);
  return lines.length === 0 ? '' : `${lines.join('. ')}.`;
}
