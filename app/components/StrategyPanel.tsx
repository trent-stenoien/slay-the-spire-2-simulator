import { useState } from 'react';
import { MAX_STRATEGIES_PER_RUN, type SavedStrategy, type StrategyColor } from '../../engine/types';
import { COLORS, COLOR_HEX, isColorTaken, type Selection } from '../lib/colors';
import { blockStrategyProblem, describeConfig, isBuiltIn, parseAllowThrough } from '../lib/strategyLibrary';

interface Props {
  library: SavedStrategy[];
  selection: Selection[];
  storageOk: boolean;
  onToggle: (id: string) => void;
  onColor: (id: string, color: StrategyColor) => void;
  onAdd: (name: string, allowThrough: number) => void;
  onRename: (id: string, name: string) => void;
  onAllowThrough: (id: string, allowThrough: number) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

/** Saved-strategy library with per-run selection and colors. */
export function StrategyPanel(props: Props) {
  const { library, selection, storageOk } = props;
  const full = selection.length >= MAX_STRATEGIES_PER_RUN;
  return (
    <section className="panel" aria-labelledby="strat-h">
      <div className="panel-head">
        <h2 id="strat-h">Strategies</h2>
        <span className="muted">
          {selection.length}/{MAX_STRATEGIES_PER_RUN} selected
        </span>
        {library.some((s) => !isBuiltIn(s.id)) && (
          <button
            type="button"
            className="btn-link danger"
            onClick={() => {
              if (globalThis.confirm?.('Delete all custom strategies?') ?? true) props.onClearAll();
            }}
          >
            Clear custom strategies
          </button>
        )}
      </div>
      {!storageOk && <p className="note">Browser storage is unavailable; custom strategies last only until you close the page.</p>}
      <ul className="strat-list">
        {library.map((s) => (
          <StrategyRow key={s.id} {...props} s={s} sel={selection.find((x) => x.strategyId === s.id)} full={full} />
        ))}
      </ul>
      <NewStrategyForm library={library} onAdd={props.onAdd} />
    </section>
  );
}

function StrategyRow({
  library,
  s,
  sel,
  selection,
  full,
  onToggle,
  onColor,
  onRename,
  onAllowThrough,
  onDelete,
}: Props & { s: SavedStrategy; sel: Selection | undefined; full: boolean }) {
  const builtIn = isBuiltIn(s.id);
  const [editing, setEditing] = useState(false);
  const checked = sel !== undefined;
  return (
    <li className={`strat-row${checked ? ' selected' : ''}${builtIn ? '' : ' custom'}`} style={sel ? { borderLeftColor: COLOR_HEX[sel.color] } : undefined}>
      <label className="strat-check">
        <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => onToggle(s.id)} />
        <span>
          <span className="strat-name">{s.name}</span>
          {builtIn && <span className="tag">default</span>}
          {builtIn && <span className="strat-desc">{describeConfig(s.config)}</span>}
        </span>
      </label>
      {!builtIn && (
        <div className="strat-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={editing ? `Done editing ${s.name}` : `Edit ${s.name}`}
            title={editing ? `Done editing ${s.name}` : `Edit ${s.name}`}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? <CheckIcon /> : <PencilIcon />}
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`Delete ${s.name}`}
            title={`Delete ${s.name}`}
            onClick={() => onDelete(s.id)}
          >
            <XIcon />
          </button>
        </div>
      )}
      {sel && (
        <div className="swatches" role="radiogroup" aria-label={`Color for ${s.name}`}>
          {COLORS.map((c) => {
            const taken = isColorTaken(selection, s.id, c);
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={sel.color === c}
                aria-label={c}
                title={taken ? `${c} (used by another strategy)` : c}
                disabled={taken}
                className={`swatch${sel.color === c ? ' on' : ''}`}
                style={{ background: COLOR_HEX[c] }}
                onClick={() => onColor(s.id, c)}
              />
            );
          })}
        </div>
      )}
      {editing && s.config.kind === 'block' && (
        <div className="strat-edit">
          <label className="field">
            <span>Title</span>
            <input defaultValue={s.name} onBlur={(e) => onRename(s.id, e.target.value)} maxLength={40} />
          </label>
          <AllowInput library={library} id={s.id} value={s.config.allowThrough} onCommit={(n) => onAllowThrough(s.id, n)} />
        </div>
      )}
    </li>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
const PencilIcon = () => (
  <Icon>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Icon>
);
const CheckIcon = () => (
  <Icon>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const XIcon = () => (
  <Icon>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

function AllowInput({ library, id, value, onCommit }: { library: SavedStrategy[]; id: string; value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const parsed = parseAllowThrough(text);
  const problem = parsed === null ? null : blockStrategyProblem(library, parsed, id);
  return (
    <label className="field field-narrow">
      <span>Allow at most X damage per turn</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={text}
        aria-invalid={parsed === null || problem !== null}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseAllowThrough(e.target.value);
          if (n !== null && blockStrategyProblem(library, n, id) === null) onCommit(n);
        }}
      />
      {parsed === null && <small className="warn">Whole number, 0 or more</small>}
      {problem && <small className="warn">{problem}</small>}
    </label>
  );
}

function NewStrategyForm({ library, onAdd }: { library: SavedStrategy[]; onAdd: (name: string, allowThrough: number) => void }) {
  const [name, setName] = useState('');
  const [allow, setAllow] = useState('5');
  const parsed = parseAllowThrough(allow);
  const problem = parsed === null ? null : blockStrategyProblem(library, parsed);
  return (
    <form
      className="new-strat"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed === null || problem !== null) return;
        onAdd(name, parsed);
        setName('');
      }}
    >
      <h3>New Strategy</h3>
      <div className="field-row">
        <label className="field">
          <span>Title</span>
          <input value={name} placeholder={`Block, allow ${parsed ?? 'X'}`} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field field-narrow">
          <span>Allow at most X damage per turn</span>
          <input type="number" inputMode="numeric" min={0} step={1} value={allow} aria-invalid={parsed === null} onChange={(e) => setAllow(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={parsed === null || problem !== null}>
          Add
        </button>
      </div>
      {parsed === null && <small className="warn">Allowance must be a whole number, 0 or more.</small>}
      {problem && <small className="warn">{problem}</small>}
    </form>
  );
}
