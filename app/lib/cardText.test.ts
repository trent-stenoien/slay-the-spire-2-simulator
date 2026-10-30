import { describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import { cardSummary, cardText, effectText } from './cardText';

const card = (id: string) => gameData.cards[id]!;

describe('card text', () => {
  it.each([
    [{ type: 'attack', damage: 6, hits: 1 } as const, 'Deal 6 damage'],
    [{ type: 'attack', damage: 5, hits: 2 } as const, 'Deal 5 damage 2 times'],
    [{ type: 'gainBlock', amount: 5 } as const, 'Gain 5 Block'],
    [{ type: 'gainStrength', amount: 2 } as const, 'Gain 2 Strength'],
    [{ type: 'applyVulnerable', amount: 2 } as const, 'Apply 2 Vulnerable'],
    [{ type: 'applyWeak', amount: 1 } as const, 'Apply 1 Weak'],
    [{ type: 'applyFrail', amount: 3 } as const, 'Apply 3 Frail'],
  ])('%o → %s', (e, text) => {
    expect(effectText(e)).toBe(text);
  });

  it('summarizes Bash and its upgrade', () => {
    expect(cardSummary(card('bash'), false)).toBe('Deal 8 damage. Apply 2 Vulnerable.');
    expect(cardText(card('bash'), true)).toEqual({ name: 'Bash+', cost: '2', lines: ['Deal 10 damage', 'Apply 3 Vulnerable'] });
  });

  it('shows keywords and a dash cost for unplayable cards', () => {
    expect(cardText(card('ascenders_bane'), false)).toEqual({
      name: "Ascender's Bane",
      cost: '—',
      lines: ['Unplayable', 'Ethereal', 'Eternal'],
    });
  });

  it('applies an upgrade cost change', () => {
    const def = { ...card('strike'), upgraded: { cost: 0 } };
    expect(cardText(def, true).cost).toBe('0');
    expect(cardText(def, true).lines).toEqual(['Deal 6 damage']);
  });
});
