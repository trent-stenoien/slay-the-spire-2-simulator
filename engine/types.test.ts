import { describe, expect, it } from 'vitest';
import { COMBATS_PER_RUN, MAX_STRATEGIES_PER_RUN, TURN_CAP } from './types';
import manifest from '../data/manifest.json';

describe('shared constants', () => {
  it('match the v1 design', () => {
    expect(TURN_CAP).toBe(100);
    expect(COMBATS_PER_RUN).toBe(10000);
    expect(MAX_STRATEGIES_PER_RUN).toBe(5);
  });

  it("manifest adds Ascender's Bane at Ascension 5", () => {
    expect(manifest.ascensionCards).toContainEqual({ level: 5, cardId: 'ascenders_bane' });
  });
});
