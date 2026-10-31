import { useState } from 'react';
import { deriveSeed } from '../../engine/rng';
import type { GameData, RunResult } from '../../engine/types';
import { COLOR_HEX } from '../lib/colors';
import { fmtNumber, fmtRate, sortedResultRows } from '../lib/results';
import { deckSize } from '../lib/deck';
import { DistributionChart } from './DistributionChart';
import { logHref } from '../lib/links';

/** The results body (stats table, chart, combat picker), strategies sorted by avg HP lost. */
export function ResultsView({ data, result }: { data: GameData; result: RunResult }) {
  const rows = sortedResultRows(result);
  const cfg = result.config;
  const enemy = data.enemies[cfg.enemyId]?.name ?? cfg.enemyId;
  const combats = rows[0]?.summary.combats ?? 0;

  return (
    <div className="results">
      <p className="muted small">
        {combats} combats per strategy vs {enemy}, A{cfg.ascension}, {deckSize(cfg.deck)}-card deck, run seed {cfg.runSeed}. Game version{' '}
        {result.gameVersion}.
      </p>
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col">Avg HP lost</th>
              <th scope="col">Avg combat turn length</th>
              <th scope="col">Death rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.strategyId}>
                <th scope="row">
                  <span className="legend-swatch" style={{ background: COLOR_HEX[r.color] }} aria-hidden />
                  {r.name}
                </th>
                <td>{fmtNumber(r.summary.avgHpLost)}</td>
                <td>{fmtNumber(r.summary.avgTurns)}</td>
                <td>{fmtRate(r.summary.deathRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <DistributionChart rows={rows} />}
      {rows.length > 0 && <ViewCombat data={data} result={result} combats={combats} />}
    </div>
  );
}

function ViewCombat({ data, result, combats }: { data: GameData; result: RunResult; combats: number }) {
  const rows = sortedResultRows(result);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('0');
  const [strategyId, setStrategyId] = useState(rows[0]?.strategyId ?? '');
  const row = rows.find((r) => r.strategyId === strategyId) ?? rows[0];
  if (!row) return null;
  const max = Math.max(0, combats - 1);
  const seed = deriveSeed(result.config.runSeed, idx);
  const href = logHref(data, result.config, seed, result.config.strategies[row.strategyIndex]!.strategy.config);

  return (
    <div className="view-combat">
      <h3>View a combat</h3>
      <div className="field-row">
        <label className="field">
          <span>Strategy</span>
          <select value={row.strategyId} onChange={(e) => setStrategyId(e.target.value)}>
            {rows.map((r) => (
              <option key={r.strategyId} value={r.strategyId}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-narrow">
          <span>Combat # (0–{max})</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={max}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 0 && n <= max) setIdx(n);
            }}
          />
        </label>
        <a className="btn" href={href} target="_blank" rel="noopener">
          Open combat log
        </a>
      </div>
      <p className="muted small">
        Combat {idx} uses seed {seed}; every strategy faces the same combat for a given number.
      </p>
    </div>
  );
}
