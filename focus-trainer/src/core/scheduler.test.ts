import { describe, expect, it } from 'vitest';
import {
  buildPlan,
  isPlanComplete,
  isPlanStale,
  markCompleted,
  nextPending,
  reconcilePlan,
  streak,
  type GameStanding,
} from './scheduler';
import { GAME_IDS, type DayPlan, type GameId } from './types';

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

describe('注册表增长后的计划重算（K8）', () => {
  it('注册表没长时不陈旧', () => {
    expect(isPlanStale(plan('2026-10-18', ['schulte']), ['schulte'])).toBe(false);
  });

  it('注册表长了且计划项未满 3 个时陈旧', () => {
    expect(isPlanStale(plan('2026-10-18', ['schulte']), ['schulte', 'stroop'])).toBe(true);
  });

  it('边界：计划项已达 PLAN_SIZE 就不再重算', () => {
    expect(isPlanStale(plan('2026-10-18', ['schulte', 'stroop']), ['schulte', 'stroop', 'seqmem'])).toBe(true);
    expect(isPlanStale(plan('2026-10-18', ['schulte', 'stroop', 'seqmem']), GAME_IDS)).toBe(false);
  });

  it('当天已经打完的计划永不陈旧 —— 重算会没收这一天的打卡', () => {
    expect(isPlanStale(plan('2026-10-18', ['schulte'], ['schulte']), GAME_IDS)).toBe(false);
  });

  it('不陈旧时 reconcilePlan 返回同一个对象，也不改入参', () => {
    const p = plan('2026-10-18', ['schulte', 'stroop', 'seqmem'], ['schulte']);
    const standings = all();
    expect(reconcilePlan(p, standings)).toBe(p);
    expect(standings.map((s) => s.gameId)).toEqual(['schulte', 'stroop', 'seqmem', 'mot', 'gestalt']);
  });

  it('只有 1 个注册游戏时留下的计划：新游戏排在前面（没练过优先）', () => {
    const rebuilt = reconcilePlan(plan('2026-10-18', ['schulte'], []), [
      st('schulte', '2026-10-18', 25),
      st('stroop'),
    ]);
    expect(rebuilt).toEqual(plan('2026-10-18', ['stroop', 'schulte']));
    expect(nextPending(rebuilt)).toBe('stroop');
  });

  it('重算保留已完成标记', () => {
    const rebuilt = reconcilePlan(plan('2026-10-18', ['schulte', 'stroop'], ['schulte']), [
      st('schulte', '2026-10-18', 25),
      st('stroop'),
      st('seqmem'),
    ]);
    expect(rebuilt).toEqual(plan('2026-10-18', ['stroop', 'seqmem', 'schulte'], ['schulte']));
    expect(nextPending(rebuilt)).toBe('stroop');
    expect(isPlanComplete(rebuilt)).toBe(false);
  });

  it('重算是幂等的：第二次调用不再判陈旧', () => {
    const ids: GameId[] = ['schulte', 'stroop', 'seqmem'];
    const once = reconcilePlan(plan('2026-10-18', ['schulte'], []), ids.map((id) => st(id)));
    expect(isPlanStale(once, ids)).toBe(false);
    expect(reconcilePlan(once, ids.map((id) => st(id)))).toBe(once);
  });

  it('挤出旧项时只保留仍在新计划里的完成标记（未完成的日子不会倒退打卡）', () => {
    const rebuilt = reconcilePlan(plan('2026-10-18', ['gestalt', 'mot'], ['mot']), all());
    expect(rebuilt).toEqual(plan('2026-10-18', ['schulte', 'stroop', 'seqmem']));
  });
});
