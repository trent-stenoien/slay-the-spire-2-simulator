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
    <li className={`strat-row${checked ? ' selected' : ''}`} style={sel ? { borderLeftColor: COLOR_HEX[sel.color] } : undefined}>
      <label className="strat-check">
        <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => onToggle(s.id)} />
        <span>
          <span className="strat-name">{s.name}</span>
          {builtIn && <span className="tag">default</span>}
          <span className="strat-desc">{describeConfig(s.config)}</span>
        </span>
      </label>
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
      {!builtIn && (
        <div className="strat-actions">
          <button type="button" className="btn-link" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            type="button"
            className="btn-link danger"
            onClick={() => {
              if (globalThis.confirm?.(`Delete "${s.name}"?`) ?? true) onDelete(s.id);
            }}
          >
            Delete
          </button>
        </div>
      )}
      {editing && s.config.kind === 'block' && (
        <div className="strat-edit">
          <label className="field">
            <span>Name</span>
            <input defaultValue={s.name} onBlur={(e) => onRename(s.id, e.target.value)} maxLength={40} />
          </label>
          <AllowInput library={library} id={s.id} value={s.config.allowThrough} onCommit={(n) => onAllowThrough(s.id, n)} />
        </div>
      )}
    </li>
  );
}

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
      <h3>New block strategy</h3>
      <div className="field-row">
        <label className="field">
          <span>Name</span>
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
