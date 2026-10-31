import { useState } from 'react';
import type { CardDef, Deck, GameData } from '../../engine/types';
import { cardText } from '../lib/cardText';
import { changeCount, copiesOf, deckSize, groupedPool, unsimulatedStarters } from '../lib/deck';

interface Props {
  data: GameData;
  characterId: string;
  deck: Deck;
  onChange: (deck: Deck) => void;
  onReset: () => void;
}

/** Searchable card pool, grouped by data folder; one row per card with normal and upgraded counts. */
export function DeckBuilder({ data, characterId, deck, onChange, onReset }: Props) {
  const [query, setQuery] = useState('');
  const groups = groupedPool(data, characterId, query);
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
      <input
        type="search"
        className="deck-search"
        placeholder="Search cards by name or text"
        aria-label="Search cards"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.length === 0 && <p className="muted small">No simulated cards match "{query}".</p>}
      {groups.map((g) => {
        const inDeck = g.cards.reduce((n, c) => n + copiesOf(deck, c.id, false) + copiesOf(deck, c.id, true), 0);
        return (
          <details key={g.key} className="card-group" open>
            <summary>
              {g.label} <span className="muted small">({g.cards.length} {g.cards.length === 1 ? 'card' : 'cards'}{inDeck > 0 ? `, ${inDeck} in deck` : ''})</span>
            </summary>
            <ul className="card-list">
              {g.cards.map((card) => (
                <CardRow key={card.id} card={card} deck={deck} onChange={onChange} />
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

function CardRow({ card, deck, onChange }: { card: CardDef; deck: Deck; onChange: (d: Deck) => void }) {
  const base = cardText(card, false);
  const up = card.upgraded ? cardText(card, true) : null;
  const n = copiesOf(deck, card.id, false);
  const nUp = copiesOf(deck, card.id, true);
  const upDiffers = up && (up.lines.join() !== base.lines.join() || up.cost !== base.cost);
  return (
    <li className={`card-row type-${card.type}${n + nUp > 0 ? ' in-deck' : ''}`}>
      <span className="cost" title="Energy cost">
        {base.cost}
      </span>
      <div className="card-main">
        <span className="card-name">{base.name}</span>
        <span className="card-text">{base.lines.join('. ')}</span>
        {up && upDiffers && (
          <span className="card-text card-text-up">
            Upgraded{up.cost !== base.cost ? ` (cost ${up.cost})` : ''}: {up.lines.join('. ')}
          </span>
        )}
      </div>
      <div className="steppers">
        <Stepper label={base.name} tag="" n={n} onStep={(d) => onChange(changeCount(deck, card.id, false, d))} />
        {up && <Stepper label={up.name} tag="+" n={nUp} onStep={(d) => onChange(changeCount(deck, card.id, true, d))} />}
      </div>
    </li>
  );
}

function Stepper({ label, tag, n, onStep }: { label: string; tag: string; n: number; onStep: (delta: number) => void }) {
  return (
    <div className="stepper" title={tag ? 'Upgraded copies' : 'Normal copies'}>
      <span className="stepper-tag">{tag}</span>
      <button type="button" aria-label={`Remove one ${label}`} disabled={n === 0} onClick={() => onStep(-1)}>
        −
      </button>
      <span className="count" aria-label={`${n} copies of ${label}`}>
        {n}
      </span>
      <button type="button" aria-label={`Add one ${label}`} disabled={n >= 99} onClick={() => onStep(1)}>
        +
      </button>
    </div>
  );
}
