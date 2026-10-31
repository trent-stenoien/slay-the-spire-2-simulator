import { useEffect, useState } from 'react';
import type { CardDef, Deck, GameData } from '../../engine/types';
import { cardText } from '../lib/cardText';
import type { CostColorKey, PoolFilters } from '../lib/deck';
import { DEFAULT_FILTERS, changeCount, copiesOf, costColorKey, deckSize, groupedPool, unsimulatedStarters } from '../lib/deck';

interface Props {
  data: GameData;
  characterId: string;
  deck: Deck;
  onChange: (deck: Deck) => void;
  onReset: () => void;
}

const FILTER_BUTTONS: [keyof PoolFilters, string][] = [
  ['statuses', 'Statuses'],
  ['curses', 'Curses'],
  ['multiplayer', 'Multiplayer'],
];

/** Searchable card pool, grouped by data folder; one row per card with normal and upgraded counts. */
export function DeckBuilder({ data, characterId, deck, onChange, onReset }: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<PoolFilters>(DEFAULT_FILTERS);
  useEffect(() => setFilters(DEFAULT_FILTERS), [characterId]);
  const groups = groupedPool(data, characterId, query, filters);
  const size = deckSize(deck);
  const leftOut = unsimulatedStarters(data, characterId);

  return (
    <section className="panel" aria-labelledby="deck-h">
      <div className="panel-head">
        <h2 id="deck-h">
          Deck <span className="muted">({size} cards)</span>
        </h2>
        <button type="button" className="btn-link" onClick={onReset}>
          Reset to starter deck
        </button>
      </div>
      {leftOut.length > 0 && (
        <p className="note">Not simulated yet, so left out of the starter deck: {leftOut.join(', ')}.</p>
      )}
      {size === 0 && <p className="warn">The deck is empty. Add at least one card.</p>}
      <div className="deck-tools">
        <input
          type="search"
          className="deck-search"
          placeholder="Search cards by name or text"
          aria-label="Search cards"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="filter-pills" role="group" aria-label="Show more card types">
          {FILTER_BUTTONS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="pill"
              aria-pressed={filters[key]}
              onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {groups.length === 0 && <p className="muted small">No cards match{query.trim() ? ` "${query}"` : ' the current filters'}.</p>}
      {groups.map((g) => {
        const inDeck = g.cards.reduce((n, c) => n + copiesOf(deck, c.id, false) + copiesOf(deck, c.id, true), 0);
        return (
          <details key={g.key} className="card-group" open>
            <summary>
              {g.label} <span className="muted small">({g.cards.length} {g.cards.length === 1 ? 'card' : 'cards'}{inDeck > 0 ? `, ${inDeck} in deck` : ''})</span>
            </summary>
            <ul className="card-list">
              {g.cards.map((card) => (
                <CardRow key={card.id} card={card} colorKey={costColorKey(card, characterId, data)} deck={deck} onChange={onChange} />
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

function CardRow({ card, colorKey, deck, onChange }: { card: CardDef; colorKey: CostColorKey; deck: Deck; onChange: (d: Deck) => void }) {
  const base = cardText(card, false);
  const up = card.upgraded ? cardText(card, true) : null;
  const n = copiesOf(deck, card.id, false);
  const nUp = copiesOf(deck, card.id, true);
  return (
    <li className={`card-row row-${colorKey} type-${card.type}${n + nUp > 0 ? ' in-deck' : ''}`}>
      <div className="card-head">
        <span className={`cost cost-${colorKey}`} title="Energy cost">
          {base.cost}
        </span>
        <span className="card-name">{base.name}</span>
      </div>
      <span className="card-label">Standard</span>
      <span className="card-text">{base.lines.join('. ')}</span>
      <Stepper label={base.name} tag="Standard" n={n} onStep={(d) => onChange(changeCount(deck, card.id, false, d))} />
      {up && (
        <>
          <span className="card-label">Upgraded</span>
          <span className="card-text">
            {up.lines.join('. ')}
            {up.cost !== base.cost ? ` (costs ${up.cost})` : ''}
          </span>
          <Stepper label={up.name} tag="Upgraded" n={nUp} onStep={(d) => onChange(changeCount(deck, card.id, true, d))} />
        </>
      )}
    </li>
  );
}

function Stepper({ label, tag, n, onStep }: { label: string; tag: string; n: number; onStep: (delta: number) => void }) {
  return (
    <div className="stepper" title={`${tag} copies`}>
      <button type="button" aria-label={`Remove one ${tag.toLowerCase()} ${label}`} disabled={n === 0} onClick={() => onStep(-1)}>
        −
      </button>
      <span className="count" aria-label={`${n} ${tag.toLowerCase()} copies of ${label}`}>
        {n}
      </span>
      <button type="button" aria-label={`Add one ${tag.toLowerCase()} ${label}`} disabled={n >= 99} onClick={() => onStep(1)}>
        +
      </button>
    </div>
  );
}
