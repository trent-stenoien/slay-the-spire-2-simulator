import { useEffect, useMemo, useState } from 'react';
import { gameData } from '../data';
import type { RunConfig, RunResult, RunStrategy } from '../engine/types';
import { CombatLog } from './components/CombatLog';
import { DeckBuilder } from './components/DeckBuilder';
import { ResultsView } from './components/ResultsView';
import { RunPanel, type RunStatus } from './components/RunPanel';
import { SetupPanel } from './components/SetupPanel';
import { StrategyPanel } from './components/StrategyPanel';
import { deckSize, startingDeckFor } from './lib/deck';
import { setupHref } from './lib/links';
import { randomSeed } from './lib/results';
import { buildQuery, parseQuery, type SetupState } from './lib/url';
import { runSimulation } from './sim/runSimulation';
import { useStrategies } from './useStrategies';

const data = gameData;

function readUrl() {
  return parseQuery(data, typeof location === 'undefined' ? '' : location.search);
}

export function App() {
  const initial = useMemo(readUrl, []);
  const [setup, setSetup] = useState<SetupState>(initial.setup);
  const [urlErrors, setUrlErrors] = useState<string[]>(initial.errors);
  const logTarget = initial.log;

  return (
    <div className="app">
      <header className="app-head">
        <h1>
          <a href={setupHref(data, setup)}>STS2 Combat Simulator</a>
        </h1>
        <p className="muted small">
          Monte Carlo comparison of Slay the Spire 2 play strategies. Game data {data.manifest.gameVersion}.
        </p>
      </header>
      {urlErrors.length > 0 && (
        <div className="banner warn" role="alert">
          <strong>Some of this link couldn't be read; defaults were used instead:</strong>
          <ul>
            {urlErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <button type="button" className="btn-link" onClick={() => setUrlErrors([])}>
            Dismiss
          </button>
        </div>
      )}
      <p className="note">
        {setup.characterId === 'ironclad'
          ? "Burning Blood's 6 HP heal is not simulated."
          : `${data.characters[setup.characterId]?.startingRelic ?? 'The starting relic'} (starting relic) is not simulated.`}
      </p>
      <main>{logTarget ? <CombatLog data={data} setup={setup} target={logTarget} /> : <Simulator setup={setup} setSetup={setSetup} />}</main>
      <footer className="muted small">
        Card and enemy data from slaythespire.wiki.gg (CC BY-SA 4.0). Not affiliated with Mega Crit.
      </footer>
    </div>
  );
}

function Simulator({ setup, setSetup }: { setup: SetupState; setSetup: (s: SetupState) => void }) {
  const strategies = useStrategies();
  const [status, setStatus] = useState<RunStatus>({ kind: 'idle' });
  const [result, setResult] = useState<RunResult | null>(null);

  // Keep the URL in sync so a copied link reproduces the setup.
  useEffect(() => {
    try {
      history.replaceState(null, '', `?${buildQuery(data, setup)}`);
    } catch {
      /* history unavailable (sandboxed frame): nothing to sync */
    }
  }, [setup]);

  const blocker =
    deckSize(setup.deck) === 0 ? 'Add at least one card to the deck.' : strategies.selection.length === 0 ? 'Select at least one strategy.' : null;

  const run = async (fixedSeed: number | null) => {
    const strategiesForRun: RunStrategy[] = strategies.selection.flatMap((sel) => {
      const s = strategies.library.find((x) => x.id === sel.strategyId);
      return s ? [{ strategy: s, color: sel.color }] : [];
    });
    const config: RunConfig = {
      characterId: setup.characterId,
      deck: setup.deck,
      enemyId: setup.enemyId,
      ascension: setup.ascension,
      strategies: strategiesForRun,
      runSeed: fixedSeed ?? randomSeed(),
    };
    setStatus({ kind: 'running', progress: null });
    try {
      const r = await runSimulation(config, (progress) => setStatus({ kind: 'running', progress }));
      setResult(r);
      setStatus({ kind: 'done' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message, notImplemented: /not implemented/i.test(message) });
    }
  };

  return (
    <>
      <div className="grid">
        <div className="col">
          <SetupPanel
            data={data}
            setup={setup}
            onCharacter={(id) => setSetup({ ...setup, characterId: id, deck: startingDeckFor(data, id) })}
            onEnemy={(id) => setSetup({ ...setup, enemyId: id })}
            onAscension={(a) => setSetup({ ...setup, ascension: a })}
          />
          <DeckBuilder
            data={data}
            characterId={setup.characterId}
            ascension={setup.ascension}
            deck={setup.deck}
            onChange={(deck) => setSetup({ ...setup, deck })}
            onReset={() => setSetup({ ...setup, deck: startingDeckFor(data, setup.characterId) })}
          />
        </div>
        <div className="col">
          <StrategyPanel
            library={strategies.library}
            selection={strategies.selection}
            storageOk={strategies.storageOk}
            onToggle={strategies.toggle}
            onColor={strategies.color}
            onAdd={strategies.add}
            onRename={strategies.rename}
            onAllowThrough={strategies.allowThrough}
            onDelete={strategies.remove}
            onClearAll={strategies.clearAll}
          />
          <RunPanel status={status} blocker={blocker} onRun={run} />
        </div>
      </div>
      {result && <ResultsView data={data} result={result} />}
    </>
  );
}
