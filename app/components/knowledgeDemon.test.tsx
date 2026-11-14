// @vitest-environment jsdom
/** #271: Curse of Knowledge choices in the UI (per-strategy modal, picks, storage) and the enemy heal in the log. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import { GREEDY_CONFIG, strategyCode } from '../../engine/strategies';
import type { SavedStrategy } from '../../engine/types';
import { configForRun, fightChoices, picksFor } from '../lib/choices';
import type { Selection } from '../lib/colors';
import { setOptionChoices, selectStrategy, deselectStrategy } from '../lib/colors';
import { buildReplay, describeEvent } from '../lib/logReplay';
import { loadSelection, saveSelection } from '../lib/selectionStorage';
import { DEFAULT_STRATEGIES, type StorageLike } from '../lib/strategyLibrary';
import { StrategyPanel, choiceSummary } from './StrategyPanel';

afterEach(cleanup);

const demonChoices = () => fightChoices(gameData, ['knowledge_demon']);

describe('#271 fight choices', () => {
  it('lists the three Curse of Knowledge uses with their option labels', () => {
    expect(demonChoices()).toEqual([
      {
        id: 'curseOfKnowledge1',
        title: 'Knowledge Demon: Curse of Knowledge (1st use)',
        options: ['Disintegration 6', 'Mind Rot 1'],
      },
      {
        id: 'curseOfKnowledge2',
        title: 'Knowledge Demon: Curse of Knowledge (2nd use)',
        options: ['Disintegration 7', 'Sloth 3'],
      },
      {
        id: 'curseOfKnowledge3',
        title: 'Knowledge Demon: Curse of Knowledge (3rd use)',
        options: ['Disintegration 8', 'Waste Away 1'],
      },
    ]);
    expect(fightChoices(gameData, ['nibbit'])).toEqual([]);
  });

  it('keeps only valid non-zero picks for the fight, and the run config carries them', () => {
    const c = demonChoices();
    expect(picksFor(c, { curseOfKnowledge1: 1, curseOfKnowledge2: 0, curseOfKnowledge3: 7, other: 1 })).toEqual({
      curseOfKnowledge1: 1,
    });
    expect(strategyCode(configForRun(GREEDY_CONFIG, c, { curseOfKnowledge2: 1 }))).toBe(
      `${strategyCode(GREEDY_CONFIG)}~curseOfKnowledge2.1`,
    );
    // Outside a fight with choices, the picks are left out.
    expect(configForRun(GREEDY_CONFIG, [], { curseOfKnowledge2: 1 })).toEqual(GREEDY_CONFIG);
    expect(choiceSummary(c, { curseOfKnowledge2: 1 })).toBe('Takes: Disintegration 6, Sloth 3, Disintegration 8');
  });

  it('selection picks are set, cleared and persisted', () => {
    let sel: Selection[] = selectStrategy([], 'default-greedy');
    sel = setOptionChoices(sel, 'default-greedy', { curseOfKnowledge1: 1 });
    expect(sel[0]!.optionChoices).toEqual({ curseOfKnowledge1: 1 });
    const store = new Map<string, string>();
    const storage: StorageLike = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
    saveSelection(storage, sel);
    expect(loadSelection(storage, DEFAULT_STRATEGIES)).toEqual(sel);
    expect(setOptionChoices(sel, 'default-greedy', {})[0]!.optionChoices).toBeUndefined();
    store.set(
      'sts2sim.selection.v1',
      JSON.stringify([{ strategyId: 'default-greedy', color: 'blue', optionChoices: { x: -1 } }]),
    );
    expect(loadSelection(storage, DEFAULT_STRATEGIES)[0]!.optionChoices).toBeUndefined();
  });
});

function Harness({ withChoices = true }: { withChoices?: boolean }) {
  const library: SavedStrategy[] = [...DEFAULT_STRATEGIES];
  const [selection, setSelection] = useState<Selection[]>([]);
  const noop = () => {};
  return (
    <StrategyPanel
      library={library}
      selection={selection}
      storageOk
      powerNames={[]}
      onToggle={(id) =>
        setSelection((s) => (s.some((x) => x.strategyId === id) ? deselectStrategy(s, id) : selectStrategy(s, id)))
      }
      onColor={noop}
      onAdd={noop}
      onRename={noop}
      onConfig={noop}
      onDelete={noop}
      onClearAll={noop}
      {...(withChoices
        ? { choices: demonChoices(), onChoices: (id, picks) => setSelection((s) => setOptionChoices(s, id, picks)) }
        : {})}
    />
  );
}

describe('#271 per-strategy choice modal', () => {
  it('selecting a strategy with Knowledge Demon in the fight opens its modal; Done saves the picks', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Greedy Damage/ }));
    const dialog = screen.getByRole('dialog', { name: 'Choices for Greedy Damage' });
    expect(dialog).toBeTruthy();
    // Option 0 preselected.
    expect((screen.getByRole('radio', { name: /Disintegration 6/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Sloth 3/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Takes: Disintegration 6, Sloth 3, Disintegration 8')).toBeTruthy();
    // Change reopens with the saved picks; Cancel keeps them.
    fireEvent.click(screen.getByRole('button', { name: 'Choices for Greedy Damage' }));
    expect((screen.getByRole('radio', { name: /Sloth 3/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Waste Away 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Takes: Disintegration 6, Sloth 3, Disintegration 8')).toBeTruthy();
  });

  it('no modal or choice row without a choice in the fight', () => {
    render(<Harness withChoices={false} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Greedy Damage/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/^Takes:/)).toBeNull();
  });
});

describe('#271 enemy heal in the log', () => {
  it('replays the enemy heal onto the enemy HP and describes it', () => {
    const r = buildReplay([
      { t: 'combatStart', seed: 1, enemyHp: 379, playerHp: 80 },
      { t: 'turnStart', turn: 1, side: 'player' },
      { t: 'damage', source: 'player', target: 'enemy', amount: 40, blocked: 0, hpLoss: 40 },
      { t: 'heal', side: 'enemy', amount: 30, hpAfter: 369 },
    ]);
    expect(r.rounds[0]!.end.enemies[0]!.hp).toBe(369);
    expect(r.rounds[0]!.end.player.hp).toBe(80);
    expect(describeEvent({ t: 'heal', side: 'enemy', amount: 30, hpAfter: 369 }, (id) => id)).toBe(
      'Enemy heals 30 HP (369 HP)',
    );
  });
});
