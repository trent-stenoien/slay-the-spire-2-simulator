import { useId, useState, type CSSProperties } from 'react';
import { cumulativeCurve, kdeCurve, rawCurve, type CurvePoint } from '../../engine/stats';
import { COLOR_HEX } from '../lib/colors';
import {
  aboveCurvePath,
  areaPath,
  BANDWIDTH_FACTOR,
  BAND_OPACITY,
  CURVE_FILL_OPACITY,
  bandwidthTicks,
  bandwidthFactorLabel,
  clampBandwidthFactor,
  curveRange,
  curvesMaxYInRange,
  kdeBandwidth,
  linePath,
  linearScale,
  niceMax,
  niceTicks,
  percentLabel,
  groupedLabelRows,
  percentileMarkerSets,
  toggleHidden,
  visibleHpLostRange,
  type CurveShape,
} from '../lib/chart';
import type { ResultRow } from '../lib/results';
import { InfoPopover } from './InfoPopover';

export type ChartMode = 'kde' | 'raw' | 'cumulative';

const MODES: { id: ChartMode; label: string }[] = [
  { id: 'kde', label: 'Smoothed (KDE)' },
  { id: 'raw', label: 'Raw' },
  { id: 'cumulative', label: 'Cumulative' },
];

const W = 640;
const H = 320;
const M = { top: 12, right: 16, bottom: 44, left: 52 };
/** Percentile marker labels: font size and row height in viewBox units, and an approximate glyph width. */
const MARK_FONT = 11;
const MARK_ROW = 13;
const MARK_CHAR_W = 6.4;

interface Computed {
  range: [number, number];
  curves: CurvePoint[][];
}

function compute(rows: readonly ResultRow[], hidden: ReadonlySet<string>, mode: ChartMode, bandwidthFactor: number): Computed {
  // The x range fits only the visible strategies ([P5 − 2, P95 + 2]), so hiding or showing a
  // line rescales the axis. Curves extend 1 HP past it on each side and are clipped at the edge.
  const range = visibleHpLostRange(rows, hidden);
  const span = curveRange(range);
  const curve = (counts: number[]) =>
    mode === 'kde'
      ? kdeCurve(counts, span, { bandwidth: kdeBandwidth(counts, bandwidthFactor) })
      : mode === 'raw'
        ? rawCurve(counts, span)
        : cumulativeCurve(counts, span);
  return { range, curves: rows.map((r) => curve(r.summary.hpLostCounts)) };
}

/**
 * Overlaid HP-lost distributions, one line + light fill per strategy. The legend sits
 * above the chart, aligned with the plot area; clicking an entry hides or shows that
 * strategy's line (hidden entries stay in the legend, dimmed). The KDE view has a smoothing
 * (bandwidth) slider with ticks from its min to its max. With one or two strategies visible, each one's
 * P5/P25/P50/P75/P95 are marked in its color (one label row block per strategy), with a light
 * P25-P75 band drawn only above its curve. With three or more visible, no marks are drawn.
 */
export function DistributionChart({
  rows,
  initialMode = 'kde',
  hidden: hiddenProp,
  onHiddenChange,
  percentileHref,
}: {
  rows: ResultRow[];
  initialMode?: ChartMode;
  /** Optional controlled legend state (ids of hidden strategies); the parent can then react to it. */
  hidden?: ReadonlySet<string>;
  onHiddenChange?: (hidden: ReadonlySet<string>) => void;
  /**
   * Optional link for a percentile label: given the ids of every strategy showing percentiles
   * (chart order), the label's strategy and its HP value. Labels without an href stay plain text.
   */
  percentileHref?: (markedIds: string[], strategyId: string, hpLost: number) => string | undefined;
}) {
  const [mode, setMode] = useState<ChartMode>(initialMode);
  const [ownHidden, setOwnHidden] = useState<ReadonlySet<string>>(() => new Set());
  const hidden = hiddenProp ?? ownHidden;
  const setHidden = (f: (h: ReadonlySet<string>) => ReadonlySet<string>) => {
    const next = f(hidden);
    if (hiddenProp === undefined) setOwnHidden(next);
    onHiddenChange?.(next);
  };
  const [bandwidthFactor, setBandwidthFactor] = useState<number>(BANDWIDTH_FACTOR.default);
  const clipId = useId();
  const sliderId = useId();

  let computed: Computed;
  try {
    computed = compute(rows, hidden, mode, bandwidthFactor);
  } catch (err) {
    return (
      <div className="chart-box">
        <p className="warn">Chart unavailable: {err instanceof Error ? err.message : String(err)}</p>
      </div>
    );
  }

  const { range, curves } = computed;
  const visible = rows.map((r) => !hidden.has(r.strategyId));
  const yMax = mode === 'cumulative' ? 100 : niceMax(curvesMaxYInRange(curves.filter((_, i) => visible[i]), range), 5, 1);
  const sx = linearScale(range, [M.left, W - M.right]);
  const markerSets = percentileMarkerSets(rows, hidden);
  const markerLabels = groupedLabelRows(
    markerSets.map((set) => set.markers.map((m) => ({ x: sx(m.value), width: m.label.length * MARK_CHAR_W + 4 }))),
    [M.left + 2, W - M.right - 2],
  );
  // Marker labels get their own strip above the plot, so they never sit on the curves.
  const labelRows = markerLabels.flat().reduce((n, l) => Math.max(n, l.row + 1), 0);
  const top = M.top + (labelRows > 0 ? labelRows * MARK_ROW + 2 : 0);
  const labelY = (row: number) => M.top + MARK_FONT - 2 + row * MARK_ROW;
  const sy = linearScale([0, yMax], [H - M.bottom, top]);
  const xTicks = niceTicks(range[0], range[1], 8, true);
  const yTicks = niceTicks(0, yMax, 5);
  const shape: CurveShape = mode === 'raw' ? 'step' : 'smooth';
  const yLabel = mode === 'cumulative' ? '% of combats losing ≤ x HP' : mode === 'raw' ? '% of combats' : '% of combats (per HP)';

  return (
    <div className="chart-box">
      {/* Picker, smoothing row and legend share the plot's left edge (the Y axis). */}
      <div className="chart-controls" style={{ paddingLeft: `${(M.left / W) * 100}%` }}>
      <div className="segmented" role="tablist" aria-label="Chart view">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {mode === 'kde' && (
        <div className="bandwidth">
          <label htmlFor={sliderId}>Smoothing</label>
          <InfoPopover />
          <span className="bandwidth-slider">
            <input
              id={sliderId}
              type="range"
              list={`${sliderId}-ticks`}
              min={BANDWIDTH_FACTOR.min}
              max={BANDWIDTH_FACTOR.max}
              step={BANDWIDTH_FACTOR.step}
              value={bandwidthFactor}
              aria-valuetext={`${bandwidthFactorLabel(bandwidthFactor)} Silverman bandwidth`}
              onChange={(e) => setBandwidthFactor(clampBandwidthFactor(Number(e.target.value)))}
            />
            <datalist id={`${sliderId}-ticks`}>
              {bandwidthTicks().map((t) => (
                <option key={t.value} value={t.value} label={t.label} />
              ))}
            </datalist>
            <span className="bandwidth-ticks" aria-hidden>
              {bandwidthTicks().map((t) => (
                <span key={t.value} className="bandwidth-tick" style={{ '--f': t.fraction } as CSSProperties}>
                  {t.label}
                </span>
              ))}
            </span>
          </span>
          <output htmlFor={sliderId} className="small">
            {bandwidthFactorLabel(bandwidthFactor)}
          </output>
          <button
            type="button"
            className="btn-link bandwidth-reset small"
            disabled={bandwidthFactor === BANDWIDTH_FACTOR.default}
            onClick={() => setBandwidthFactor(BANDWIDTH_FACTOR.default)}
          >
            Reset
          </button>
        </div>
      )}
      <ul className="legend" aria-label="Strategies (click to show or hide)">
        {rows.map((r, i) => (
          <li key={r.strategyId}>
            <button
              type="button"
              className={visible[i] ? 'legend-item' : 'legend-item off'}
              aria-pressed={visible[i]}
              title={visible[i] ? `Hide ${r.name}` : `Show ${r.name}`}
              onClick={() => setHidden((h) => toggleHidden(h, r.strategyId))}
            >
              <span className="legend-swatch" style={{ background: COLOR_HEX[r.color] }} aria-hidden />
              <span className="legend-name" data-text={r.name}>
                {r.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`HP lost distribution, ${mode} view`}>
        <defs>
          <clipPath id={clipId}>
            <rect x={M.left} y={top} width={W - M.left - M.right} height={H - top - M.bottom} />
          </clipPath>
          {markerSets.map(({ row }) => {
            const i = rows.indexOf(row);
            return (
              <clipPath key={row.strategyId} id={`${clipId}-above-${i}`}>
                <path d={aboveCurvePath(curves[i]!, sx, sy, top, shape)} />
              </clipPath>
            );
          })}
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
        <line className="axis" x1={M.left} x2={M.left} y1={top} y2={H - M.bottom} />
        <text className="axis-label" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          HP lost
        </text>
        <text className="axis-label" transform={`translate(14 ${(top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">
          {yLabel}
        </text>
        <g clipPath={`url(#${clipId})`}>
          {/* P25-P75 bands, only between each marked strategy's curve and the top of the plot. */}
          {markerSets.map(({ row, markers }) => {
            const i = rows.indexOf(row);
            const p25 = markers.find((m) => m.p === 25)!.value;
            const p75 = markers.find((m) => m.p === 75)!.value;
            return (
              <rect
                key={`band-${row.strategyId}`}
                className="pband"
                x={sx(p25)}
                y={top}
                width={Math.max(0, sx(p75) - sx(p25))}
                height={H - M.bottom - top}
                fill={COLOR_HEX[row.color]}
                fillOpacity={BAND_OPACITY}
                clipPath={`url(#${clipId}-above-${i})`}
              />
            );
          })}
          {curves.map((pts, i) => {
            if (!visible[i]) return null;
            const color = COLOR_HEX[rows[i]!.color];
            return (
              <g key={rows[i]!.strategyId}>
                <path className="curve-fill" d={areaPath(pts, sx, sy, sy(0), shape)} fill={color} fillOpacity={CURVE_FILL_OPACITY} stroke="none" />
                <path d={linePath(pts, sx, sy, shape)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
              </g>
            );
          })}
        </g>
        {markerSets.length > 0 && (
          <g className="pmarks" aria-label="Percentiles of HP lost">
            {markerSets.map(({ row, markers }, s) => (
              <g key={row.strategyId} className="pmark-set" style={{ '--mark-color': COLOR_HEX[row.color] } as CSSProperties}>
                {markers.map((m, i) => (
                  <line key={`l${m.p}`} className="pmark" x1={sx(m.value)} x2={sx(m.value)} y1={labelY(markerLabels[s]![i]!.row) + 3} y2={H - M.bottom} />
                ))}
              </g>
            ))}
            {markerSets.map(({ row, markers }, s) => (
              <g key={`t-${row.strategyId}`} className="pmark-set" style={{ '--mark-color': COLOR_HEX[row.color] } as CSSProperties}>
                {markers.map((m, i) => {
                  const label = (
                    <text
                      key={`t${m.p}`}
                      className="pmark-label"
                      x={markerLabels[s]![i]!.x}
                      y={labelY(markerLabels[s]![i]!.row)}
                      textAnchor="middle"
                      fontSize={MARK_FONT}
                    >
                      {m.label}
                    </text>
                  );
                  const href = percentileHref?.(markerSets.map((set) => set.row.strategyId), row.strategyId, m.value);
                  return href ? (
                    <a key={`t${m.p}`} className="pmark-link" href={href} target="_blank" rel="noopener" aria-label={`${row.name}: ${m.label} HP lost, open the first combat with that HP lost`}>
                      {label}
                    </a>
                  ) : (
                    label
                  );
                })}
              </g>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
