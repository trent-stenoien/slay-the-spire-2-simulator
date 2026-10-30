import { useState } from 'react';
import type { SimulationProgress } from '../sim/runSimulation';
import { parseSeedInput } from '../lib/results';

export type RunStatus =
  | { kind: 'idle' }
  | { kind: 'running'; progress: SimulationProgress | null }
  | { kind: 'error'; message: string; notImplemented: boolean }
  | { kind: 'done' };

interface Props {
  status: RunStatus;
  /** Why the run can't start, or null when it can. */
  blocker: string | null;
  onRun: (seed: number | null) => void;
}

export function RunPanel({ status, blocker, onRun }: Props) {
  const [seedText, setSeedText] = useState('');
  const seed = parseSeedInput(seedText);
  const running = status.kind === 'running';
  const disabled = running || blocker !== null || seed === undefined;
  const pct = status.kind === 'running' && status.progress && status.progress.total > 0 ? (status.progress.done / status.progress.total) * 100 : 0;

  return (
    <section className="panel" aria-labelledby="run-h">
      <h2 id="run-h">Run</h2>
      <form
        className="field-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onRun(seed ?? null);
        }}
      >
        <label className="field">
          <span>Run seed (blank = random)</span>
          <input inputMode="numeric" placeholder="random" value={seedText} aria-invalid={seed === undefined} onChange={(e) => setSeedText(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {running ? 'Running…' : 'Run simulation'}
        </button>
      </form>
      {seed === undefined && <p className="warn small">Seed must be a whole number from 0 to 4294967295.</p>}
      {blocker && <p className="warn small">{blocker}</p>}
      {status.kind === 'running' && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div style={{ width: `${pct}%` }} />
          <span>{status.progress ? `${status.progress.done} / ${status.progress.total} combats` : 'Starting…'}</span>
        </div>
      )}
      {status.kind === 'error' &&
        (status.notImplemented ? (
          <p className="warn">The simulation engine isn't available in this build yet (the Monte Carlo runner is still being implemented). Setup, deck and strategy choices still work, and combat logs can be viewed from a link.</p>
        ) : (
          <p className="warn">Simulation failed: {status.message}</p>
        ))}
    </section>
  );
}
