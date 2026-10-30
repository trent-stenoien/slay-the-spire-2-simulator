import { describe, expect, it } from 'vitest';
import { gameData } from '../../data';
import { runCombat, deriveSeed } from '../../engine';
import { buildReplay, describeEvent, intendedMoveId, type Round } from './logReplay';

describe('log replay', () => {
  const result = runCombat(
    gameData,
    {
      characterId: 'ironclad',
      deck: gameData.characters.ironclad!.startingDeck,
      enemyId: 'nibbit',
      ascension: 0,
      strategy: { kind: 'greedyDamage' },
      seed: deriveSeed(42, 0),
    },
    { log: true },
  );
  const replay = buildReplay(result.log!);

  it('has one round per player turn and the final outcome', () => {
    expect(replay.rounds).toHaveLength(result.turns);
    expect(replay.outcome).toBe(result.outcome);
    expect(replay.hpLost).toBe(result.hpLost);
    expect(replay.playerMaxHp).toBe(80);
  });

  it('tracks HP to the engine result', () => {
    const last = replay.rounds[replay.rounds.length - 1]!;
    expect(last.end.player.hp).toBe(80 - result.hpLost);
    expect(last.end.enemy.hp).toBe(result.enemyHpRemaining);
    expect(replay.rounds[0]!.start.player.hp).toBe(80);
  });

  it('records draws and the enemy move', () => {
    expect(replay.rounds[0]!.drawn).toHaveLength(5);
    expect(replay.rounds[0]!.enemyMove).toBe('Butt');
  });

  it('describes events', () => {
    const name = (id: string) => gameData.cards[id]?.name ?? id;
    expect(describeEvent({ t: 'damage', source: 'enemy', target: 'player', amount: 12, blocked: 5, hpLoss: 7 }, name)).toBe(
      'Enemy hits for 12, 5 blocked, 7 HP lost',
    );
    expect(describeEvent({ t: 'play', uid: 1, cardId: 'bash', energyLeft: 1 }, name)).toBe('Play Bash (1 energy left)');
    expect(describeEvent({ t: 'debuff', side: 'enemy', kind: 'vulnerable', amount: 2, total: 2 }, name)).toBe(
      'Enemy gets 2 Vulnerable (total 2)',
    );
    expect(describeEvent({ t: 'blockReset', side: 'player' }, name)).toBeNull();
  });

  it('works out the intended move, including after a kill', () => {
    expect(intendedMoveId(replay.rounds, 0, ['butt', 'hesitantStrike', 'hiss'], 'first')).toBe('butt');
    const r = (id: string | null) => ({ enemyMoveId: id }) as Round;
    const order = ['a', 'b', 'c'];
    expect(intendedMoveId([r('c'), r(null)], 1, order, 'first')).toBe('a');
    expect(intendedMoveId([r(null)], 0, order, 'first')).toBe('a');
    expect(intendedMoveId([r(null)], 0, order, 'random')).toBeNull();
    expect(intendedMoveId([], 0, order, 'first')).toBeNull();
  });
});
