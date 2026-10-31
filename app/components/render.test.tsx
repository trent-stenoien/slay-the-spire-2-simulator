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
import { startingDeckFor } from '../lib/deck';
import { DeckBuilder } from './DeckBuilder';
import { CombatLog } from './CombatLog';
import { DistributionChart } from './DistributionChart';
import { ResultsView } from './ResultsView';
import { SetupPanel } from './SetupPanel';
import { StrategyPanel } from './StrategyPanel';
import { DEFAULT_STRATEGIES } from '../lib/strategyLibrary';

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

  it('strategy panel: Title label, New Strategy heading, no description on custom strategies', () => {
    const custom = { id: 'u1', name: 'Mine', config: { kind: 'block' as const, allowThrough: 3 } };
    const noop = () => {};
    const html = renderToStaticMarkup(
      <StrategyPanel
        library={[...DEFAULT_STRATEGIES, custom]}
        selection={[]}
        storageOk
        onToggle={noop}
        onColor={noop}
        onAdd={noop}
        onRename={noop}
        onAllowThrough={noop}
        onDelete={noop}
        onClearAll={noop}
      />,
    );
    expect(html).toContain('New Strategy');
    expect(html).not.toContain('New block strategy');
    expect(html).toContain('<span>Title</span>');
    expect(html).not.toContain('<span>Name</span>');
    expect(html.match(/strat-desc/g)?.length).toBe(DEFAULT_STRATEGIES.length);
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

  it('marks characters with unsimulated starters as work in progress', () => {
    const html = renderToStaticMarkup(
      <SetupPanel data={gameData} setup={defaultSetup(gameData)} onCharacter={() => {}} onEnemy={() => {}} onAscension={() => {}} />,
    );
    const option = (id: string) => html.match(new RegExp(`<option value="${id}"[^>]*>([^<]*)</option>`))?.[1];
    expect(option('ironclad')).toBe(gameData.characters.ironclad!.name);
    expect(option('silent')).toBe(`${gameData.characters.silent!.name} (work in progress)`);
  });

  it('tints deck rows with the same key as the cost circle', () => {
    const html = renderToStaticMarkup(
      <DeckBuilder data={gameData} characterId="silent" ascension={0} deck={[]} onChange={() => {}} onReset={() => {}} />,
    );
    expect(html).toContain('row-silent');
    const rows = [...html.matchAll(/<li class="card-row row-(\w+)[^"]*">.*?<span class="cost cost-(\w+)"/g)];
    expect(rows.length).toBeGreaterThan(0);
    for (const [, row, cost] of rows) expect(row).toBe(cost);
  });

  it('shows the remove-all X only for cards that have copies in the deck', () => {
    const html = renderToStaticMarkup(
      <DeckBuilder data={gameData} characterId="ironclad" ascension={5} deck={startingDeckFor(gameData, 'ironclad')} onChange={() => {}} onReset={() => {}} />,
    );
    expect(html).toContain('aria-label="Remove all Strike from deck"');
    expect(html).toContain('title="Remove all Defend from deck"');
    expect(html).not.toContain('Remove all Anger from deck');
    expect(html).not.toContain('Remove all Ascender');
    const upgradedOnly = renderToStaticMarkup(
      <DeckBuilder data={gameData} characterId="ironclad" ascension={0} deck={[{ cardId: 'strike', upgraded: true, count: 1 }]} onChange={() => {}} onReset={() => {}} />,
    );
    expect(upgradedOnly).toContain('Remove all Strike from deck');
    expect(upgradedOnly).not.toContain('Remove all Defend from deck');
  });

  it("shows Ascender's Bane locked in the Curses group at A5, not at A4, and drops the old setup note", () => {
    const render = (ascension: number) =>
      renderToStaticMarkup(
        <DeckBuilder data={gameData} characterId="ironclad" ascension={ascension} deck={startingDeckFor(gameData, 'ironclad')} onChange={() => {}} onReset={() => {}} />,
      );
    const a5 = render(5);
    expect(a5).toContain('Ascender&#x27;s Bane');
    expect(a5).toContain('Added automatically at Ascension 5+');
    expect(a5).toContain('(11 cards)');
    expect(a5).toContain('1 in deck');
    expect(a5).not.toContain('Add one standard Ascender');
    const a4 = render(4);
    expect(a4).not.toContain('Ascender');
    expect(a4).toContain('(10 cards)');
    const setup = renderToStaticMarkup(
      <SetupPanel data={gameData} setup={{ ...defaultSetup(gameData), ascension: 5 }} onCharacter={() => {}} onEnemy={() => {}} onAscension={() => {}} />,
    );
    expect(setup).not.toContain('Ascender');
  });
});
