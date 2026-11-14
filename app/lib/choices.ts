/** #271: "player chooses one of N" effects (Curse of Knowledge) in the current fight, and per-strategy picks. */
import { withOptionChoices } from '../../engine/strategies';
import type { Effect, GameData, StrategyConfig } from '../../engine/types';

export interface FightChoice {
  /** The `playerChoice` id (key in StrategyConfig.optionChoices). */
  id: string;
  /** "Knowledge Demon: Curse of Knowledge (1st use)". */
  title: string;
  /** Option labels, in index order ("Disintegration 6", "Mind Rot 1"). */
  options: string[];
}

const ORDINAL = ['1st', '2nd', '3rd'];

function choicesIn(effects: readonly Effect[]): Extract<Effect, { type: 'playerChoice' }>[] {
  return effects.filter((e): e is Extract<Effect, { type: 'playerChoice' }> => e.type === 'playerChoice');
}

/** Every `playerChoice` of the enemies in the fight, once per id, in enemy then move order. */
export function fightChoices(data: GameData, enemyIds: readonly string[]): FightChoice[] {
  const out: FightChoice[] = [];
  for (const enemyId of new Set(enemyIds)) {
    const def = data.enemies[enemyId];
    if (!def) continue;
    const moves = Object.values(def.moves);
    const total = new Map<string, number>();
    for (const m of moves) total.set(m.name, (total.get(m.name) ?? 0) + choicesIn(m.effects).length);
    const seenByName = new Map<string, number>();
    for (const m of moves) {
      for (const c of choicesIn(m.effects)) {
        if (out.some((x) => x.id === c.id)) continue;
        const n = (seenByName.get(m.name) ?? 0) + 1;
        seenByName.set(m.name, n);
        const use = (total.get(m.name) ?? 1) > 1 ? ` (${ORDINAL[n - 1] ?? `${n}th`} use)` : '';
        out.push({ id: c.id, title: `${def.name}: ${m.name}${use}`, options: c.options.map((o) => o.label) });
      }
    }
  }
  return out;
}

/** The picks that matter in this fight: only its choice ids, and only valid non-zero indexes. */
export function picksFor(choices: readonly FightChoice[], picks: Record<string, number> | undefined) {
  const out: Record<string, number> = {};
  for (const c of choices) {
    const n = picks?.[c.id];
    if (n !== undefined && Number.isInteger(n) && n > 0 && n < c.options.length) out[c.id] = n;
  }
  return out;
}

/** #271: the config a selected strategy runs with: its picks for this fight's choices, none otherwise. */
export function configForRun(
  config: StrategyConfig,
  choices: readonly FightChoice[],
  picks: Record<string, number> | undefined,
): StrategyConfig {
  return withOptionChoices(config, picksFor(choices, picks));
}
