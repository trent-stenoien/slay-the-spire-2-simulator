import type { CardDef, Deck, GameData } from '../../engine/types';
import { cardText } from '../lib/cardText';
import { changeCount, copiesOf, deckPool, deckSize, toggleUpgrade } from '../lib/deck';

interface Props {
  data: GameData;
  characterId: string;
  deck: Deck;
  onChange: (deck: Deck) => void;
  onReset: () => void;
}

/** Add/remove copies of each pool card; upgraded copies are a separate group. */
export function DeckBuilder({ data, characterId, deck, onChange, onReset }: Props) {
  const pool = deckPool(data, characterId);
  const size = deckSize(deck);

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
      {size === 0 && <p className="warn">The deck is empty. Add at least one card.</p>}
      <ul className="card-list">
        {pool.map((card) =>
          (card.upgraded ? [false, true] : [false]).map((up) => (
            <CardRow key={`${card.id}${up ? '+' : ''}`} card={card} upgraded={up} deck={deck} onChange={onChange} />
          )),
        )}
      </ul>
    </section>
  );
}

function CardRow({ card, upgraded, deck, onChange }: { card: CardDef; upgraded: boolean; deck: Deck; onChange: (d: Deck) => void }) {
  const text = cardText(card, upgraded);
  const n = copiesOf(deck, card.id, upgraded);
  return (
    <li className={`card-row type-${card.type}${n > 0 ? ' in-deck' : ''}`}>
      <span className="cost" title="Energy cost">
        {text.cost}
      </span>
      <div className="card-main">
        <span className="card-name">{text.name}</span>
        <span className="card-text">{text.lines.join('. ')}</span>
      </div>
      <div className="stepper">
        {card.upgraded && n > 0 && (
          <button
            type="button"
            className="btn-small"
            title={upgraded ? 'Make these copies non-upgraded' : 'Upgrade these copies'}
            onClick={() => onChange(toggleUpgrade(deck, card.id, upgraded))}
          >
            {upgraded ? 'Un-upgrade' : 'Upgrade'}
          </button>
        )}
        <button type="button" aria-label={`Remove one ${text.name}`} disabled={n === 0} onClick={() => onChange(changeCount(deck, card.id, upgraded, -1))}>
          −
        </button>
        <span className="count" aria-label={`${n} copies`}>
          {n}
        </span>
        <button type="button" aria-label={`Add one ${text.name}`} disabled={n >= 99} onClick={() => onChange(changeCount(deck, card.id, upgraded, 1))}>
          +
        </button>
      </div>
    </li>
  );
}
