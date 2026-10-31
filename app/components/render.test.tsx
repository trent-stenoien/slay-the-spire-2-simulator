/**
 * Smoke tests: render each view to static HTML (no DOM library needed).
 * engine/stats is still a stub on this branch, so it is mocked with simple
 * curves to exercise the chart's real rendering path.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../../data';
import type { RunResult } from '../../engine/types';
import { App } from '../App';
import { resultRows } from '../lib/results';
import { defaultSetup } from '../lib/url';
import { CombatLog } from './CombatLog';
import { DistributionChart } from './DistributionChart';
import { ResultsView } from './ResultsView';

vi.mock('../../engine/stats', () => {
  const curve = (counts: readonly number[], range: [number, number]) => {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    const pts = [];
    for (let x = range[0]; x <= range[1]; x++) pts.push({ x, y: ((counts[x] ?? 0) / total) * 100 });
    return pts;
  };
  return {
    hpLostRange: () => [0, 12],
    rawCurve: curve,
    kdeCurve: curve,
    cumulativeCurve: curve,
  };
});

const result: RunResult = {
  gameVersion: 'v0.107.1',
  config: {
    characterId: 'ironclad',
    deck: gameData.characters.ironclad!.startingDeck,
    enemyId: 'nibbit',
    ascension: 5,
    runSeed: 99,
    strategies: [
      { strategy: { id: 'g', name: 'Greedy Damage', config: { kind: 'greedyDamage' } }, color: 'blue' },
      { strategy: { id: 's', name: 'Scared Block', config: { kind: 'block', allowThrough: 0 } }, color: 'purple' },
    ],
  },
  summaries: [
    { strategyId: 'g', combats: 10, avgHpLost: 8.4, avgTurnsToKill: 6.1, deathRate: 0.1, turnCapRate: 0, hpLostCounts: [0, 0, 2, 3, 5] },
    { strategyId: 's', combats: 10, avgHpLost: 3.2, avgTurnsToKill: null, deathRate: 0, turnCapRate: 0.2, hpLostCounts: [4, 4, 2] },
  ],
};

describe('views render', () => {
  it('renders the main page with the Burning Blood note and defaults', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Burning Blood&#x27;s 6 HP heal is not simulated.");
    expect(html).toContain('Greedy Damage');
    expect(html).toContain('Scared Block');
    expect(html).toContain('Deal 8 damage. Apply 2 Vulnerable');
    expect(html).not.toContain('Ascender');
  });

  it('renders results with rates as percentages and the game version', () => {
    const html = renderToStaticMarkup(<ResultsView data={gameData} result={result} />);
    expect(html).toContain('10.0%');
    expect(html).toContain('20.0%');
    expect(html).toContain('v0.107.1');
    expect(html).toContain('<svg');
    expect(html).toContain('st=g');
    expect(html).toContain('?v=1&amp;c=I&amp;e=Nb&amp;a=5&amp;d=St5De4Ba1&amp;s=2751716061&amp;st=g');
  });

  it('draws one line and one 15% fill per strategy in run colors', () => {
    const html = renderToStaticMarkup(<DistributionChart rows={resultRows(result)} />);
    expect(html.match(/fill-opacity="0.15"/g)).toHaveLength(2);
    expect(html).toContain('stroke="#2f6fdf"');
    expect(html).toContain('stroke="#8a5cd6"');
    expect(html).toContain('HP lost');
  });

  it('renders a combat log with intent', () => {
    const html = renderToStaticMarkup(
      <CombatLog data={gameData} setup={defaultSetup(gameData)} target={{ seed: 123456, strategy: { kind: 'block', allowThrough: 4 } }} />,
    );
    expect(html).toContain('Turn');
    expect(html).toContain('Enemy intent:</strong> Butt: attack 12');
    expect(html).toMatch(/Won|Died|turn cap/);
  });
});
