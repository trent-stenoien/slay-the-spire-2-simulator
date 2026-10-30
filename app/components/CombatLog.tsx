import { useEffect, useMemo, useState } from 'react';
import { computeIntent, runCombat } from '../../engine/combat';
import { resolveEnemy } from '../../engine/enemy';
import { strategyCode } from '../../engine/strategies';
import type { EnemyIntent, GameData, GameEvent } from '../../engine/types';
import { describeConfig } from '../lib/strategyLibrary';
import { buildReplay, describeEvent, intendedMoveId, type SideSnapshot } from '../lib/logReplay';
import { setupHref } from '../lib/links';
import type { LogTarget, SetupState } from '../lib/url';
import { deckSize } from '../lib/deck';

interface Props {
  data: GameData;
  setup: SetupState;
  target: LogTarget;
}

/** Replays one combat from a seed + strategy and steps through it turn by turn. */
export function CombatLog({ data, setup, target }: Props) {
  const outcome = useMemo(() => {
    try {
      const r = runCombat(
        data,
        { characterId: setup.characterId, deck: setup.deck, enemyId: setup.enemyId, ascension: setup.ascension, strategy: target.strategy, seed: target.seed },
        { log: true },
      );
      const replay = buildReplay(r.log ?? []);
      const base = data.enemies[setup.enemyId];
      const resolved = base ? resolveEnemy(base, setup.ascension) : null;
      // Intent as the player saw it at the start of each turn.
      const intents = replay.rounds.map((round, i) => {
        if (!resolved) return null;
        const id = intendedMoveId(replay.rounds, i, resolved.pattern.order, resolved.pattern.start);
        const move = id ? resolved.moves[id] : undefined;
        return id && move ? computeIntent(id, move, round.start.enemy, round.start.player) : null;
      });
      return { ok: true as const, replay, intents, result: r };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  }, [data, setup, target]);

  const [turnIdx, setTurnIdx] = useState(0);
  const roundCount = outcome.ok ? outcome.replay.rounds.length : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === 'ArrowRight') setTurnIdx((i) => Math.min(roundCount - 1, i + 1));
      if (e.key === 'ArrowLeft') setTurnIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [roundCount]);

  const enemy = data.enemies[setup.enemyId];
  const name = (id: string) => data.cards[id]?.name ?? id;
  const back = setupHref(data, setup);

  return (
    <section className="panel" aria-labelledby="log-h">
      <div className="panel-head">
        <h2 id="log-h">Combat log</h2>
        <a className="btn-link" href={back}>
          Back to setup
        </a>
      </div>
      <p className="muted small">
        {enemy?.name ?? setup.enemyId}, A{setup.ascension}, {deckSize(setup.deck)}-card deck. Strategy: {describeConfig(target.strategy)} (
        <code>{strategyCode(target.strategy)}</code>). Seed {target.seed}.
      </p>
      {!outcome.ok ? (
        <p className="warn">Could not replay this combat: {outcome.error}</p>
      ) : (
        <>
          <p className={`outcome outcome-${outcome.result.outcome}`}>
            {outcome.result.outcome === 'win' ? 'Won' : outcome.result.outcome === 'loss' ? 'Died' : 'Hit the turn cap'} on turn {outcome.result.turns}, losing{' '}
            {outcome.result.hpLost} HP.
          </p>
          {roundCount > 0 && (
            <Round
              idx={Math.min(turnIdx, roundCount - 1)}
              count={roundCount}
              round={outcome.replay.rounds[Math.min(turnIdx, roundCount - 1)]!}
              intent={outcome.intents[Math.min(turnIdx, roundCount - 1)] ?? null}
              name={name}
              onStep={(d) => setTurnIdx((i) => Math.max(0, Math.min(roundCount - 1, i + d)))}
              onJump={setTurnIdx}
            />
          )}
        </>
      )}
    </section>
  );
}

function Round({
  idx,
  count,
  round,
  intent,
  name,
  onStep,
  onJump,
}: {
  intent: EnemyIntent | null;
  idx: number;
  count: number;
  round: ReturnType<typeof buildReplay>['rounds'][number];
  name: (id: string) => string;
  onStep: (d: number) => void;
  onJump: (i: number) => void;
}) {
  const lines = (evs: GameEvent[]) => evs.map((e) => describeEvent(e, name)).filter((s): s is string => s !== null);
  const playerLines = lines(round.playerEvents);
  const enemyLines = lines(round.enemyEvents).filter((l) => !l.startsWith('Enemy uses'));
  return (
    <div className="round">
      <div className="turn-nav">
        <button type="button" className="btn" onClick={() => onStep(-1)} disabled={idx === 0} aria-label="Previous turn">
          ← Prev
        </button>
        <label className="turn-pick">
          Turn{' '}
          <select value={idx} onChange={(e) => onJump(Number(e.target.value))}>
            {Array.from({ length: count }, (_, i) => (
              <option key={i} value={i}>
                {i + 1}
              </option>
            ))}
          </select>{' '}
          of {count}
        </label>
        <button type="button" className="btn" onClick={() => onStep(1)} disabled={idx >= count - 1} aria-label="Next turn">
          Next →
        </button>
      </div>
      <div className="fighters">
        <Fighter label="You" start={round.start.player} end={round.end.player} />
        <Fighter label="Enemy" start={round.start.enemy} end={round.end.enemy} />
      </div>
      <p className="intent small">
        <strong>Enemy intent:</strong> {intent ? intentText(intent) : 'unknown'}
      </p>
      <div className="phase">
        <h4>Your turn</h4>
        <p className="small">
          <strong>Drew:</strong> {round.drawn.length ? round.drawn.map(name).join(', ') : 'nothing'}
        </p>
        {playerLines.length ? (
          <ol className="events">
            {playerLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : (
          <p className="muted small">No cards played.</p>
        )}
      </div>
      <div className="phase">
        <h4>Enemy turn{round.enemyMove ? `: ${round.enemyMove}` : ''}</h4>
        {round.enemyMove === null ? (
          <p className="muted small">The combat ended before the enemy acted.</p>
        ) : enemyLines.length ? (
          <ol className="events">
            {enemyLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        ) : (
          <p className="muted small">Nothing happened.</p>
        )}
      </div>
    </div>
  );
}

function Fighter({ label, start, end }: { label: string; start: SideSnapshot; end: SideSnapshot }) {
  const pct = start.maxHp > 0 ? (end.hp / start.maxHp) * 100 : 0;
  const deb = Object.entries(end.debuffs).filter(([, v]) => v > 0);
  return (
    <div className="fighter">
      <div className="fighter-head">
        <strong>{label}</strong>
        <span>
          HP {start.hp} → {end.hp} / {start.maxHp}
        </span>
      </div>
      <div className="hpbar" aria-hidden>
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="small muted">
        Block at end {end.block}
        {end.strength ? ` · Strength ${end.strength}` : ''}
        {deb.map(([k, v]) => ` · ${k} ${v}`).join('')}
      </div>
    </div>
  );
}

function intentText(intent: EnemyIntent): string {
  if (intent.attacks.length === 0) return `${intent.name} (no attack)`;
  const hits = intent.attacks.map((a) => (a.hits > 1 ? `${a.damagePerHit}×${a.hits}` : `${a.damagePerHit}`)).join(' + ');
  return `${intent.name}: attack ${hits}${intent.attacks.length > 1 || (intent.attacks[0]?.hits ?? 1) > 1 ? ` = ${intent.totalIncoming}` : ''}`;
}
