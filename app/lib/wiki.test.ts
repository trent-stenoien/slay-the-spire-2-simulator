import { describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import { cardWikiUrl } from './wiki';

describe('cardWikiUrl', () => {
  it('uses underscores for spaces', () => {
    expect(cardWikiUrl('Bludgeon')).toBe('https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Bludgeon');
    expect(cardWikiUrl('Ultimate Strike')).toBe('https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Ultimate_Strike');
  });

  it('keeps apostrophes literal', () => {
    expect(cardWikiUrl("Ascender's Bane")).toBe("https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Ascender's_Bane");
  });

  it('keeps parentheses literal', () => {
    expect(cardWikiUrl('Mad Science (Sapping)')).toBe(
      'https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Mad_Science_(Sapping)',
    );
  });

  it('keeps ! , - literal and encodes what a path cannot hold', () => {
    expect(cardWikiUrl('Decisions, Decisions')).toBe(
      'https://slaythespire.wiki.gg/wiki/Slay_the_Spire_2:Decisions,_Decisions',
    );
    expect(cardWikiUrl('Flick-Flack')).toContain(':Flick-Flack');
    expect(cardWikiUrl('GUARDS!!!')).toContain(':GUARDS!!!');
    expect(cardWikiUrl('What?')).toContain(':What%3F');
    expect(cardWikiUrl('A/B #1')).toContain(':A%2FB_%231');
  });

  it('produces a valid URL for every card name', () => {
    for (const card of Object.values(gameData.cards)) {
      const url = new URL(cardWikiUrl(card.name));
      expect(url.hostname).toBe('slaythespire.wiki.gg');
      expect(url.href).not.toContain(' ');
    }
  });
});
