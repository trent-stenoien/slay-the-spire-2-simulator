/** Plain-language card text, e.g. "Deal 8 damage. Apply 2 Vulnerable." */
import type { CardDef, CardKeyword, Effect } from '../../engine/types';

const KEYWORD_LABEL: Record<CardKeyword, string> = {
  unplayable: 'Unplayable',
  ethereal: 'Ethereal',
  eternal: 'Eternal',
  exhaust: 'Exhaust',
  retain: 'Retain',
  innate: 'Innate',
  sly: 'Sly',
};

export function effectText(e: Effect): string {
  switch (e.type) {
    case 'attack': {
      const target = e.allEnemies ? ' to ALL enemies' : '';
      if (e.xTimes) {
        const x = e.xBonus ? `X+${e.xBonus}` : 'X';
        return `Deal ${e.damage} damage${target} ${e.hits === 1 ? x : `${e.hits}×(${x})`} times`;
      }
      return e.hits === 1 ? `Deal ${e.damage} damage${target}` : `Deal ${e.damage} damage${target} ${e.hits} times`;
    }
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
    case 'applyPoison':
      return `Apply ${e.amount} Poison`;
    case 'gainEnergy':
      return `Gain ${e.amount} Energy`;
    case 'gainStars':
      return `Gain ${e.amount} Stars`;
    // #105: plain fallback text for mechanics that are not simulated yet.
    case 'loseHp':
      return `Lose ${e.amount} HP`;
    case 'draw':
      return `Draw ${e.amount} ${e.amount === 1 ? 'card' : 'cards'}`;
    case 'drawUntil':
      return e.handFull ? 'Draw cards until your Hand is full' : 'Draw cards until a condition is met';
    case 'exhaustCards':
      return e.mode === 'all'
        ? 'Exhaust cards'
        : `Exhaust ${e.upTo ? 'up to ' : ''}${e.count ?? 1} ${e.count === 1 || e.count === undefined ? 'card' : 'cards'}${e.mode === 'random' ? ' at random' : ''}`;
    case 'applyPower':
      return `Gain ${e.amount} ${cap(e.power)}`;
    case 'applyEnemyPower':
      return `Apply ${e.amount} ${cap(e.power)} to the enemy`;
    case 'schedule':
      return e.delay === 1 ? 'Next turn: special effect' : `In ${e.delay} turns: special effect`;
    case 'dealDamage':
      return `Deal ${e.amount} damage${e.allEnemies ? ' to ALL enemies' : ''}`;
    case 'enemyLoseHp':
      return `Enemy loses ${e.amount} HP`;
    case 'setCost':
      return `Set card costs to ${e.cost} this ${e.duration}`;
    case 'conditional':
      return 'Conditional effect';
    case 'repeat':
      return 'Repeated effect';
    case 'attackFrom':
      return `Deal ${e.damage}+ damage${e.allEnemies ? ' to ALL enemies' : ''}`;
    case 'gainBlockFrom':
      return `Gain ${e.amount}+ Block`;
    case 'growDamage':
      return `Increase damage by ${e.amount} this combat`;
    case 'moveCards':
      return `Move ${e.mode === 'all' ? 'cards' : `${e.upTo ? 'up to ' : ''}${e.count ?? 1} card(s)`} from ${e.from} to ${e.to}`;
    case 'moveSelf':
      return e.when === 'nextTurnStart' ? `Next turn, move this card to ${e.to}` : `Move this card to ${e.to}`;
    case 'upgradeCards':
      return e.mode === 'all' ? 'Upgrade cards' : `Upgrade ${e.count ?? 1} card(s)`;
    case 'playCards':
      return `Play ${e.xTimes ? 'X' : e.count} card(s) from ${e.from}`;
    case 'addReplay':
      return `Give a card ${e.amount} Replay`;
    case 'addCards':
      return `Add ${e.count} card(s) to ${e.to}`;
    case 'transformCards':
      return 'Transform cards';
    case 'heal':
      return `Heal ${e.amount} HP`;
    case 'gainMaxHp':
      return `Raise Max HP by ${e.amount}`;
    case 'loseMaxHp':
      return `Lose ${e.amount} Max HP`;
    case 'script':
      return 'Special effect';
  }
}

/** "noDraw" → "No Draw". */
function cap(id: string): string {
  const words = id.replace(/([A-Z])/g, ' $1');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface CardText {
  name: string;
  /** "1", "0", "X" for X-cost, or "—" for unplayable. */
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
    cost: cost === null ? '—' : def.xCost ? 'X' : String(cost),
    lines: [...keywords.map((k) => KEYWORD_LABEL[k]), ...effects.map(effectText)],
  };
}
