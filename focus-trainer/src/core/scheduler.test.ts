import { describe, expect, it } from 'vitest';
import { buildPlan, isPlanComplete, markCompleted, nextPending, streak, type GameStanding } from './scheduler';
import type { DayPlan, GameId } from './types';

const st = (gameId: GameId, lastPlayedDayKey: string | null = null, lastAbility: number | null = null): GameStanding => ({
  gameId,
  lastPlayedDayKey,
  lastAbility,
});

const all = (overrides: Partial<Record<GameId, GameStanding>> = {}): GameStanding[] =>
  (['schulte', 'stroop', 'seqmem', 'mot', 'gestalt'] as GameId[]).map((id) => overrides[id] ?? st(id));

const plan = (dayKey: string, games: GameId[], completed: GameId[] = []): DayPlan => ({ dayKey, games, completed });

describe('buildPlan', () => {
  it('首日全都没练过：按固定顺序取前 3 个', () => {
    expect(buildPlan('2026-10-18', all())).toEqual(plan('2026-10-18', ['schulte', 'stroop', 'seqmem']));
  });

  it('日期与能力全相同时按 GAME_IDS 固定顺序，不按输入顺序', () => {
    const tied = all({
      schulte: st('schulte', '2026-10-18', 50),
      stroop: st('stroop', '2026-10-18', 50),
      seqmem: st('seqmem', '2026-10-18', 50),
      mot: st('mot', '2026-10-18', 50),
      gestalt: st('gestalt', '2026-10-18', 50),
    }).reverse();
    expect(buildPlan('2026-10-19', tied)).toEqual(plan('2026-10-19', ['schulte', 'stroop', 'seqmem']));
  });

  it('次日：没练过的排最前，再按最近练习日期升序', () => {
    const standings = all({
      schulte: st('schulte', '2026-10-18', 40),
      stroop: st('stroop', '2026-10-18', 20),
      seqmem: st('seqmem', '2026-10-18', 30),
    });
    expect(buildPlan('2026-10-19', standings).games).toEqual(['mot', 'gestalt', 'stroop']);
  });

  it('最近练习日期相同时按上次能力指数升序，没有记录按 0', () => {
    const standings = all({
      schulte: st('schulte', '2026-10-17', 50),
      stroop: st('stroop', '2026-10-17', 10),
      seqmem: st('seqmem', '2026-10-17', 30),
      mot: st('mot', '2026-10-17', null),
      gestalt: st('gestalt', '2026-10-18', 0),
    });
    expect(buildPlan('2026-10-19', standings).games).toEqual(['mot', 'stroop', 'seqmem']);
  });

  it('不足 3 个游戏时全部入选', () => {
    expect(buildPlan('2026-10-18', [st('schulte')]).games).toEqual(['schulte']);
  });

  it('不修改传入数组的顺序', () => {
    const standings = all({ schulte: st('schulte', '2026-10-18', 10) });
    buildPlan('2026-10-19', standings);
    expect(standings.map((s) => s.gameId)).toEqual(['schulte', 'stroop', 'seqmem', 'mot', 'gestalt']);
  });
});

describe('markCompleted / isPlanComplete / nextPending', () => {
  const p = plan('2026-10-18', ['schulte', 'stroop', 'seqmem']);

  it('标记计划内游戏，重复标记不重复记录', () => {
    const once = markCompleted(p, 'stroop');
    expect(once.completed).toEqual(['stroop']);
    expect(markCompleted(once, 'stroop').completed).toEqual(['stroop']);
    expect(p.completed).toEqual([]);
  });

  it('计划外游戏不影响计划', () => {
    expect(markCompleted(p, 'mot')).toEqual(p);
  });

  it('全部完成才算完成，空计划不算完成', () => {
    let q = markCompleted(p, 'schulte');
    q = markCompleted(q, 'stroop');
    expect(isPlanComplete(q)).toBe(false);
    expect(isPlanComplete(markCompleted(q, 'seqmem'))).toBe(true);
    expect(isPlanComplete(plan('2026-10-18', []))).toBe(false);
  });

  it('nextPending 按计划顺序给出第一个未完成项', () => {
    expect(nextPending(p)).toBe('schulte');
    expect(nextPending(markCompleted(p, 'schulte'))).toBe('stroop');
    expect(nextPending(plan('2026-10-18', ['schulte'], ['schulte']))).toBeNull();
  });
});

describe('streak', () => {
  const done = (dayKey: string) => plan(dayKey, ['schulte'], ['schulte']);
  const open = (dayKey: string) => plan(dayKey, ['schulte'], []);

  it('今天已完成：从今天往前数', () => {
    expect(streak([done('2026-10-16'), done('2026-10-17'), done('2026-10-18')], '2026-10-18')).toBe(3);
  });

  it('今天未完成不打断连续，从昨天往前数', () => {
    expect(streak([done('2026-10-16'), done('2026-10-17'), open('2026-10-18')], '2026-10-18')).toBe(2);
    expect(streak([done('2026-10-16'), done('2026-10-17')], '2026-10-18')).toBe(2);
  });

  it('中间断一天就停', () => {
    expect(streak([done('2026-10-15'), open('2026-10-16'), done('2026-10-17'), done('2026-10-18')], '2026-10-18')).toBe(2);
    expect(streak([done('2026-10-15'), done('2026-10-17')], '2026-10-18')).toBe(1);
  });

  it('昨天没完成且今天也没完成时为 0', () => {
    expect(streak([open('2026-10-17'), open('2026-10-18')], '2026-10-18')).toBe(0);
    expect(streak([], '2026-10-18')).toBe(0);
  });

  it('跨月连续', () => {
    expect(streak([done('2026-09-30'), done('2026-10-01')], '2026-10-01')).toBe(2);
  });
});
