// @vitest-environment jsdom
/**
 * Interaction tests: render into jsdom and drive the UI the way a user does (clicks, typing),
 * checking what the page shows afterwards.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import type { Deck, RunResult, StrategyConfig } from '../../engine/types';
import { App } from '../App';
import { replayCombat } from '../lib/compare';
import { foldersForFilter } from '../lib/deck';
import { STORAGE_KEY } from '../lib/strategyLibrary';
import { SELECTION_STORAGE_KEY } from '../lib/selectionStorage';
import { defaultSetup } from '../lib/url';
import { CombatLog } from './CombatLog';
import { DeckBuilder } from './DeckBuilder';
import { DistributionChart } from './DistributionChart';
import { ResultsView } from './ResultsView';
import { resultRows } from '../lib/results';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const result: RunResult = {
  gameVersion: 'v0.107.1',
  config: {
    characterId: 'ironclad',
    deck: gameData.characters.ironclad!.startingDeck,
    enemyId: 'nibbit',
    ascension: 0,
    runSeed: 99,
    strategies: [
      { strategy: { id: 'g', name: 'Greedy Damage', config: { kind: 'greedyDamage' } }, color: 'blue' },
      { strategy: { id: 's', name: 'Scared Block', config: { kind: 'block', allowThrough: 0 } }, color: 'purple' },
    ],
  },
  summaries: [
    {
      strategyId: 'g',
      combats: 10,
      avgHpLost: 8.4,
      avgTurnsToKill: 6.1,
      avgTurns: 6.4,
      deathRate: 0.1,
      turnCapRate: 0,
      hpLostCounts: [0, 0, 2, 3, 5],
      firstCombatByHpLost: { 2: 4, 3: 0, 4: 1 },
    },
    {
      strategyId: 's',
      combats: 10,
      avgHpLost: 3.2,
      avgTurnsToKill: null,
      avgTurns: 9.5,
      deathRate: 0,
      turnCapRate: 0.2,
      hpLostCounts: [4, 4, 2],
      firstCombatByHpLost: { 0: 1, 1: 0, 2: 7 },
    },
  ],
};

const legendButton = (name: string) =>
  within(screen.getByRole('list', { name: /Strategies \(click to show or hide\)/ })).getByRole('button', {
    name,
  });
const percentileLinks = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLAnchorElement>('a.pmark-link')].map((a) => a.getAttribute('href') ?? '');
const curveFills = (container: HTMLElement) => container.querySelectorAll('path.curve-fill').length;

describe('compare view: stepping turns', () => {
  it('a column whose combat is over reads "Combat ended on turn N" while the longer one still shows its turn', async () => {
    const setup = defaultSetup(gameData);
    const strategies: StrategyConfig[] = [{ kind: 'greedyDamage' }, { kind: 'block', allowThrough: 0 }];
    // Find a seed where the two strategies' combats last a different number of turns.
    let seed = -1;
    let lengths: number[] = [];
    for (let s = 1; s < 200 && seed < 0; s++) {
      const ls = strategies.map((c) => {
        const r = replayCombat(gameData, setup, c, s);
        return r.ok ? r.replay.rounds.length : 0;
      });
      if (ls[0]! > 0 && ls[1]! > 0 && ls[0] !== ls[1]) [seed, lengths] = [s, ls];
    }
    expect(seed).toBeGreaterThan(0);
    const short = Math.min(...lengths);
    const long = Math.max(...lengths);
    const shortCol = lengths.indexOf(short);

    const { container } = render(
      <CombatLog data={gameData} setup={setup} target={{ seed, strategies, colors: ['blue', 'red'] }} />,
    );
    const cols = () => [...container.querySelectorAll<HTMLElement>('section.compare-col')];
    expect(cols()).toHaveLength(2);
    expect(screen.getByRole('combobox')).toHaveProperty('value', '0');
    expect(container.querySelector('.compare-ended')).toBeNull();

    const user = userEvent.setup();
    // On the short combat's last turn, both columns still show a round.
    for (let i = 1; i < short; i++) await user.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(container.querySelector('.compare-ended')).toBeNull();
    // One more step: the short column has ended, the long one shows turn short + 1.
    await user.click(screen.getByRole('button', { name: 'Next turn' }));
    expect(cols()[shortCol]!.querySelector('.compare-ended')?.textContent).toMatch(
      new RegExp(`^Combat ended on turn ${short}: (won|died|hit the turn cap), lost \\d+ HP\\.$`, 'i'),
    );
    expect(cols()[1 - shortCol]!.querySelector('.compare-ended')).toBeNull();
    expect(within(cols()[1 - shortCol]!).getByText('Your Turn')).toBeTruthy();
    expect(screen.getByRole('combobox')).toHaveProperty('value', String(short));
    // The shared selector spans the longer combat, and Next stops there.
    expect(screen.getAllByRole('option')).toHaveLength(long);
    // Stepping back brings the short column's round back.
    await user.click(screen.getByRole('button', { name: 'Previous turn' }));
    expect(container.querySelector('.compare-ended')).toBeNull();
  });
});

/** DeckBuilder with real deck state, as App wires it. */
function DeckHarness({ initial, ascension = 0 }: { initial: Deck; ascension?: number }) {
  const [deck, setDeck] = useState<Deck>(initial);
  return (
    <>
      <DeckBuilder
        data={gameData}
        characterId="ironclad"
        ascension={ascension}
        deck={deck}
        onChange={setDeck}
        onReset={() => setDeck(initial)}
      />
      <output data-testid="deck">{JSON.stringify(deck)}</output>
    </>
  );
}
const deckState = (): Deck => JSON.parse(screen.getByTestId('deck').textContent ?? '[]');
const folder = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLDetailsElement>('details.card-group')].find((d) =>
    d.querySelector('summary')?.textContent?.startsWith(label),
  );

describe('deck builder interactions', () => {
  it('every folder starts collapsed, and clicking a folder header opens it', async () => {
    const { container } = render(<DeckHarness initial={[]} />);
    const all = [...container.querySelectorAll<HTMLDetailsElement>('details.card-group')];
    expect(all.length).toBeGreaterThan(1);
    expect(all.every((d) => !d.open)).toBe(true);
    await userEvent.click(folder(container, 'Ironclad')!.querySelector('summary')!);
    expect(folder(container, 'Ironclad')!.open).toBe(true);
    expect(all.filter((d) => d.open)).toHaveLength(1);
  });

  it('the X removes every standard and upgraded copy of that card, and then disappears', async () => {
    render(
      <DeckHarness
        initial={[
          { cardId: 'strike', upgraded: false, count: 3 },
          { cardId: 'strike', upgraded: true, count: 2 },
          { cardId: 'defend', upgraded: false, count: 4 },
        ]}
      />,
    );
    expect(screen.getByLabelText('3 standard copies of Strike')).toBeTruthy();
    expect(screen.getByLabelText('2 upgraded copies of Strike+')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Remove all Strike from deck' }));
    expect(deckState()).toEqual([{ cardId: 'defend', upgraded: false, count: 4 }]);
    expect(screen.getByLabelText('0 standard copies of Strike')).toBeTruthy();
    expect(screen.getByLabelText('0 upgraded copies of Strike+')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove all Strike from deck' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove all Defend from deck' })).toBeTruthy();
  });

  it('the Standard and Upgraded steppers change only their own count', async () => {
    render(<DeckHarness initial={[{ cardId: 'strike', upgraded: false, count: 1 }]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add one upgraded Strike+' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add one standard Strike' }));
    expect(deckState()).toEqual([
      { cardId: 'strike', upgraded: false, count: 2 },
      { cardId: 'strike', upgraded: true, count: 1 },
    ]);
  });

  it.each([
    ['Statuses', 'statuses'],
    ['Curses', 'curses'],
    ['Multiplayer', 'multiplayer'],
  ] as const)('turning on the %s filter shows its folders already expanded', async (label, key) => {
    const { container } = render(<DeckHarness initial={[]} />);
    // Ironclad has no simulated multiplayer-only cards, so Multiplayer expands nothing for it.
    const keys = foldersForFilter(gameData, 'ironclad', key, 0);
    expect(keys.length > 0).toBe(key !== 'multiplayer');
    const openKeys = () =>
      [...container.querySelectorAll<HTMLDetailsElement>('details.card-group')]
        .filter((d) => d.open)
        .map((d) => d.querySelector('summary')!.textContent!.split(' (')[0]!.trim().toLowerCase());
    expect(openKeys()).toEqual([]);
    const pill = screen.getByRole('button', { name: label });
    expect(pill.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(pill);
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    expect(openKeys().sort()).toEqual([...keys].sort());
    // Turning the filter off again hides those cards.
    await userEvent.click(pill);
    expect(pill.getAttribute('aria-pressed')).toBe('false');
  });

  it("Ascender's Bane is locked at A5: no X, no stepper buttons, counted in the deck size", () => {
    render(<DeckHarness initial={[{ cardId: 'strike', upgraded: false, count: 2 }]} ascension={5} />);
    expect(screen.getByText('(3 cards)')).toBeTruthy();
    expect(screen.getByLabelText("1 standard copy of Ascender's Bane, added automatically")).toBeTruthy();
    expect(screen.queryByRole('button', { name: "Remove all Ascender's Bane from deck" })).toBeNull();
    expect(screen.queryByRole('button', { name: "Remove one standard Ascender's Bane" })).toBeNull();
  });
});

describe('chart legend and smoothing slider', () => {
  it('clicking a legend entry hides that strategy everywhere it is drawn, and clicking again shows it', async () => {
    const { container } = render(<ResultsView data={gameData} result={result} />);
    const checks = () =>
      [...container.querySelectorAll('.strategy-checks label')].map((l) => l.textContent?.trim() ?? '');
    expect(curveFills(container)).toBe(2);
    expect(checks()).toEqual(['Scared Block', 'Greedy Damage']);

    await userEvent.click(legendButton('Greedy Damage'));
    expect(legendButton('Greedy Damage').getAttribute('aria-pressed')).toBe('false');
    expect(legendButton('Greedy Damage').className).toContain('off');
    expect(curveFills(container)).toBe(1);
    expect(checks()).toEqual(['Scared Block']);

    await userEvent.click(legendButton('Greedy Damage'));
    expect(legendButton('Greedy Damage').getAttribute('aria-pressed')).toBe('true');
    expect(curveFills(container)).toBe(2);
    expect(checks()).toEqual(['Scared Block', 'Greedy Damage']);
  });

  it('Reset puts the smoothing slider back to ×3 and is disabled there', async () => {
    const { container } = render(<DistributionChart rows={resultRows(result)} />);
    const slider = screen.getByRole('slider') as HTMLInputElement;
    const reset = screen.getByRole('button', { name: 'Reset' }) as HTMLButtonElement;
    const output = () => container.querySelector('.bandwidth output')!.textContent;
    const curve = () => container.querySelector('path.curve-fill')!.getAttribute('d');
    expect(slider.value).toBe('3');
    expect(output()).toBe('×3.00');
    expect(reset.disabled).toBe(true);
    const atDefault = curve();

    fireEvent.change(slider, { target: { value: '1' } });
    expect(output()).toBe('×1.00');
    expect(reset.disabled).toBe(false);
    expect(curve()).not.toBe(atDefault);

    await userEvent.click(reset);
    expect(slider.value).toBe('3');
    expect(output()).toBe('×3.00');
    expect(reset.disabled).toBe(true);
    expect(curve()).toBe(atDefault);
  });

  it('the slider at its minimum reads Raw', () => {
    const { container } = render(<DistributionChart rows={resultRows(result)} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    expect(container.querySelector('.bandwidth output')!.textContent).toBe('Raw');
  });
});

describe('percentile label links', () => {
  it('link to the compare view with two strategies shown, and to one combat log after hiding one', async () => {
    const { container } = render(<ResultsView data={gameData} result={result} />);
    // Two visible: 10 labels, each opening both strategies (chart order b0, g) with their colors.
    let links = percentileLinks(container);
    expect(links).toHaveLength(10);
    expect(links.every((h) => /&st=b0,g&k=p,b&n=\d+$/.test(h))).toBe(true);
    // Scared Block P50 = 1 HP -> its first combat with 1 HP lost is index 0.
    expect(links.some((h) => h.endsWith('&n=0'))).toBe(true);

    await userEvent.click(legendButton('Scared Block'));
    links = percentileLinks(container);
    expect(links).toHaveLength(5);
    // Greedy alone: no colors, just its own combat; P75 = 4 HP -> first combat index 1, P50 = 3 -> index 0.
    expect(links.every((h) => /&st=g&n=\d+$/.test(h))).toBe(true);
    expect(links.some((h) => h.endsWith('&n=1'))).toBe(true);
    expect(links.some((h) => h.endsWith('&n=0'))).toBe(true);
  });

  it('three visible strategies get no percentile labels', () => {
    const three: RunResult = {
      ...result,
      config: {
        ...result.config,
        strategies: [
          ...result.config.strategies,
          { strategy: { id: 'b4', name: 'Block 4', config: { kind: 'block', allowThrough: 4 } }, color: 'green' },
        ],
      },
      summaries: [...result.summaries, { ...result.summaries[0]!, strategyId: 'b4' }],
    };
    const { container } = render(<ResultsView data={gameData} result={three} />);
    expect(percentileLinks(container)).toHaveLength(0);
  });
});

describe('view-a-combat picker', () => {
  it('checking a second strategy turns "Open combat log" into "Compare" linking both', async () => {
    render(<ResultsView data={gameData} result={result} />);
    const button = () => screen.getByText(/^(Open combat log|Compare)$/);
    expect(button().textContent).toBe('Open combat log');
    expect(button().getAttribute('href')).toMatch(/&st=b0&n=0$/);
    await userEvent.click(screen.getByRole('checkbox', { name: /Greedy Damage/ }));
    expect(button().textContent).toBe('Compare');
    expect(button().getAttribute('href')).toMatch(/&st=b0,g&k=p,b&n=0$/);
    // Combat 5 in the field is index 4 in the link.
    const field = screen.getByRole('spinbutton');
    await userEvent.clear(field);
    await userEvent.type(field, '5');
    expect(button().getAttribute('href')).toMatch(/&n=4$/);
    // Unchecking both leaves a disabled button with no link.
    await userEvent.click(screen.getByRole('checkbox', { name: /Greedy Damage/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Scared Block/ }));
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().getAttribute('href')).toBeNull();
    expect(screen.getByText('Check at least one strategy to view its combat.')).toBeTruthy();
  });
});

describe('strategy selection limits (App)', () => {
  const customs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `u${i}`,
      name: `Block ${i + 1}`,
      config: { kind: 'block', allowThrough: i + 1 },
    }));
  const strategyBoxes = () => [...document.querySelectorAll<HTMLInputElement>('.strat-list input[type="checkbox"]')];

  it('at 5 selected the unchecked boxes are disabled; unchecking one frees them; the selection persists', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customs(8)));
    render(<App />);
    expect(strategyBoxes()).toHaveLength(10);
    const user = userEvent.setup();
    // Defaults start selected; select more until 5 are checked.
    for (const box of strategyBoxes()) {
      if (strategyBoxes().filter((b) => b.checked).length >= 5) break;
      if (!box.checked) await user.click(box);
    }
    expect(strategyBoxes().filter((b) => b.checked)).toHaveLength(5);
    expect(screen.getByText('5/5 selected')).toBeTruthy();
    const unchecked = strategyBoxes().filter((b) => !b.checked);
    expect(unchecked).toHaveLength(5);
    expect(unchecked.every((b) => b.disabled)).toBe(true);
    await user.click(unchecked[0]!);
    expect(strategyBoxes().filter((b) => b.checked)).toHaveLength(5);

    const firstChecked = strategyBoxes().find((b) => b.checked)!;
    await user.click(firstChecked);
    expect(screen.getByText('4/5 selected')).toBeTruthy();
    expect(
      strategyBoxes()
        .filter((b) => !b.checked)
        .every((b) => !b.disabled),
    ).toBe(true);
    // The selection survives a reload.
    expect(localStorage.getItem(SELECTION_STORAGE_KEY)).not.toBeNull();
    const before = strategyBoxes().map((b) => b.checked);
    cleanup();
    render(<App />);
    expect(strategyBoxes().map((b) => b.checked)).toEqual(before);
    expect(screen.getByText('4/5 selected')).toBeTruthy();
  });

  it('Add is disabled once the library holds 10 strategies, and adding the 10th works', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customs(7)));
    render(<App />);
    const add = () => screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement;
    const allowance = screen.getByRole('spinbutton', { name: /Allow at most X damage per turn/ });
    await userEvent.clear(allowance);
    await userEvent.type(allowance, '20');
    expect(add().disabled).toBe(false);
    await userEvent.click(add());
    expect(strategyBoxes()).toHaveLength(10);
    await userEvent.clear(allowance);
    await userEvent.type(allowance, '21');
    expect(add().disabled).toBe(true);
    expect(screen.getByText(/at most 10 strategies/)).toBeTruthy();
  });

  it('a duplicate allowance cannot be added', async () => {
    render(<App />);
    const allowance = screen.getByRole('spinbutton', { name: /Allow at most X damage per turn/ });
    await userEvent.clear(allowance);
    await userEvent.type(allowance, '0');
    expect((screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/already allows 0/)).toBeTruthy();
  });
});
