import { useId, useState } from 'react';
import { cumulativeCurve, hpLostRange, kdeCurve, rawCurve, type CurvePoint } from '../../engine/stats';
import { COLOR_HEX } from '../lib/colors';
import { areaPath, curvesMaxY, linePath, linearScale, niceMax, niceTicks, percentLabel, type CurveShape } from '../lib/chart';
import type { ResultRow } from '../lib/results';

export type ChartMode = 'kde' | 'raw' | 'cumulative';

const MODES: { id: ChartMode; label: string }[] = [
  { id: 'kde', label: 'Smoothed (KDE)' },
  { id: 'raw', label: 'Raw' },
  { id: 'cumulative', label: 'Cumulative' },
];

const W = 640;
const H = 320;
const M = { top: 12, right: 16, bottom: 44, left: 52 };

interface Computed {
  range: [number, number];
  curves: CurvePoint[][];
}

function compute(rows: readonly ResultRow[], mode: ChartMode): Computed {
  const range = hpLostRange(rows.map((r) => r.summary));
  const curve = mode === 'kde' ? kdeCurve : mode === 'raw' ? rawCurve : cumulativeCurve;
  return { range, curves: rows.map((r) => curve(r.summary.hpLostCounts, range)) };
}

/** Overlaid HP-lost distributions, one line + light fill per strategy. */
export function DistributionChart({ rows }: { rows: ResultRow[] }) {
  const [mode, setMode] = useState<ChartMode>('kde');
  const clipId = useId();

  let computed: Computed;
  try {
    computed = compute(rows, mode);
  } catch (err) {
    return (
      <div className="chart-box">
        <p className="warn">Chart unavailable: {err instanceof Error ? err.message : String(err)}</p>
      </div>
    );
  }

  const { range, curves } = computed;
  const yMax = mode === 'cumulative' ? 100 : niceMax(curvesMaxY(curves), 5, 1);
  const sx = linearScale(range, [M.left, W - M.right]);
  const sy = linearScale([0, yMax], [H - M.bottom, M.top]);
  const xTicks = niceTicks(range[0], range[1], 8, true);
  const yTicks = niceTicks(0, yMax, 5);
  const shape: CurveShape = mode === 'raw' ? 'step' : 'smooth';
  const yLabel = mode === 'cumulative' ? '% of combats losing ≤ x HP' : mode === 'raw' ? '% of combats' : '% of combats (per HP)';

  return (
    <div className="chart-box">
      <div className="segmented" role="tablist" aria-label="Chart view">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`HP lost distribution, ${mode} view`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} />
          </clipPath>
        </defs>
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="grid" x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} />
            <text className="tick" x={M.left - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle">
              {percentLabel(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line className="axis" x1={sx(t)} x2={sx(t)} y1={H - M.bottom} y2={H - M.bottom + 5} />
            <text className="tick" x={sx(t)} y={H - M.bottom + 18} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <line className="axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        <line className="axis" x1={M.left} x2={M.left} y1={M.top} y2={H - M.bottom} />
        <text className="axis-label" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          HP lost
        </text>
        <text className="axis-label" transform={`translate(14 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">
          {yLabel}
        </text>
        <g clipPath={`url(#${clipId})`}>
          {curves.map((pts, i) => {
            const color = COLOR_HEX[rows[i]!.color];
            return (
              <g key={rows[i]!.strategyId}>
                {mode !== 'cumulative' && <path d={areaPath(pts, sx, sy, sy(0), shape)} fill={color} fillOpacity={0.15} stroke="none" />}
                <path d={linePath(pts, sx, sy, shape)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              </g>
            );
          })}
        </g>
      </svg>
      <ul className="legend">
        {rows.map((r) => (
          <li key={r.strategyId}>
            <span className="legend-swatch" style={{ background: COLOR_HEX[r.color] }} aria-hidden />
            {r.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
