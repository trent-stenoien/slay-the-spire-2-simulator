import { useEffect, useState } from 'react';
import { deriveSeed } from '../../engine/rng';
import type { GameData, RunResult } from '../../engine/types';
import { COLOR_HEX } from '../lib/colors';
import { describeRun, fmtHpLostRange, fmtNumber, fmtRate, sortedResultRows } from '../lib/results';
import { DistributionChart } from './DistributionChart';
import { logHref } from '../lib/links';
import { combatRangeLabel, effectiveStrategyId, fromDisplayCombat, toDisplayCombat } from '../lib/combatPicker';

/** The results body (stats table, chart, combat picker), strategies sorted by avg HP lost. */
export function ResultsView({ data, result }: { data: GameData; result: RunResult }) {
  const rows = sortedResultRows(result);
  const cfg = result.config;
  const combats = rows[0]?.summary.combats ?? 0;
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());

  return (
    <div className="results">
      <p className="muted small">{describeRun(data, cfg)}</p>
      <div className="table-wrap">
        <table className="stats">
          <thead>
            <tr>
              <th scope="col">Strategy</th>
              <th scope="col">Avg HP lost</th>
              <th scope="col">HP lost, P25-P75</th>
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
                <td>{fmtHpLostRange(r.summary.hpLostCounts)}</td>
                <td>{fmtNumber(r.summary.avgTurns)}</td>
                <td>{fmtRate(r.summary.deathRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && <DistributionChart rows={rows} hidden={hidden} onHiddenChange={setHidden} />}
      {rows.length > 0 && <ViewCombat data={data} result={result} combats={combats} hidden={hidden} />}
    </div>
  );
}

function ViewCombat({ data, result, combats, hidden }: { data: GameData; result: RunResult; combats: number; hidden: ReadonlySet<string> }) {
  const rows = sortedResultRows(result);
  const [idx, setIdx] = useState(0); // 0-based internally; the field shows idx + 1
  const [text, setText] = useState(String(toDisplayCombat(0)));
  const [strategyId, setStrategyId] = useState(rows[0]?.strategyId ?? '');
  // Only strategies shown on the chart can be picked; a newly hidden selection moves to the first visible one.
  const effectiveId = effectiveStrategyId(rows.map((r) => r.strategyId), hidden, strategyId);
  useEffect(() => {
    if (effectiveId !== null && effectiveId !== strategyId) setStrategyId(effectiveId);
  }, [effectiveId, strategyId]);
  const visibleRows = rows.filter((r) => !hidden.has(r.strategyId));
  const row = rows.find((r) => r.strategyId === effectiveId);
  if (rows.length === 0) return null;
  const seed = deriveSeed(result.config.runSeed, idx);
  const href = row ? logHref(data, result.config, seed, result.config.strategies[row.strategyIndex]!.strategy.config, idx) : undefined;
  const disabled = !row;

  return (
    <div className="view-combat">
      <h3>View a combat</h3>
      <div className="field-row">
        <label className="field">
          <span>Strategy</span>
          <select value={row?.strategyId ?? ''} disabled={disabled} onChange={(e) => setStrategyId(e.target.value)}>
            {visibleRows.map((r) => (
              <option key={r.strategyId} value={r.strategyId}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-narrow">
          <span>{combatRangeLabel(combats)}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(1, combats)}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              const n = fromDisplayCombat(e.target.value, combats);
              if (n !== null) setIdx(n);
            }}
          />
        </label>
        {disabled ? (
          <span className="btn" aria-disabled="true" role="link" style={{ opacity: 0.5, pointerEvents: 'none' }}>
            Open combat log
          </span>
        ) : (
          <a className="btn" href={href} target="_blank" rel="noopener">
            Open combat log
          </a>
        )}
      </div>
      <p className="muted small">
        {disabled
          ? 'Show at least one strategy on the chart to view its combats.'
          : `Combat ${toDisplayCombat(idx)} uses seed ${seed}; every strategy faces the same combat for a given number.`}
      </p>
    </div>
  );
}
