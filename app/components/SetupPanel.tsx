import type { GameData } from '../../engine/types';
import { isCharacterSimulated } from '../lib/deck';
import { MAX_ASCENSION, type SetupState } from '../lib/url';

interface Props {
  data: GameData;
  setup: SetupState;
  onCharacter: (characterId: string) => void;
  onEnemy: (enemyId: string) => void;
  onAscension: (ascension: number) => void;
}

/** Character, enemy and Ascension pickers. */
export function SetupPanel({ data, setup, onCharacter, onEnemy, onAscension }: Props) {
  const characters = Object.values(data.characters);
  const enemies = Object.values(data.enemies).sort((a, b) => a.act - b.act || a.name.localeCompare(b.name));
  const baneLevel = data.manifest.ascensionCards.find((c) => c.cardId === 'ascenders_bane')?.level;
  const bane = baneLevel !== undefined && setup.ascension >= baneLevel;

  return (
    <section className="panel" aria-labelledby="setup-h">
      <h2 id="setup-h">Setup</h2>
      <div className="field-row">
        <label className="field">
          <span>Character</span>
          <select value={setup.characterId} onChange={(e) => onCharacter(e.target.value)}>
            {characters.map((c) => (
              <option key={c.id} value={c.id} disabled={!isCharacterSimulated(data, c)}>
                {c.name}
                {isCharacterSimulated(data, c) ? '' : ' (not simulated yet)'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Enemy</span>
          <select value={setup.enemyId} onChange={(e) => onEnemy(e.target.value)}>
            {enemies.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} (Act {e.act}, {e.difficulty})
              </option>
            ))}
          </select>
        </label>
        <label className="field field-narrow">
          <span>Ascension</span>
          <select value={setup.ascension} onChange={(e) => onAscension(Number(e.target.value))}>
            {Array.from({ length: MAX_ASCENSION + 1 }, (_, i) => (
              <option key={i} value={i}>
                A{i}
              </option>
            ))}
          </select>
        </label>
      </div>
      {bane && (
        <p className="note">
          Ascension {baneLevel}+: Ascender's Bane is added to the deck automatically (it is not shown in the deck builder).
        </p>
      )}
    </section>
  );
}
