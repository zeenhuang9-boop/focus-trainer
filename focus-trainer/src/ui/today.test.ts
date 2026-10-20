import { describe, expect, it, vi } from 'vitest';
import { isPlanComplete, nextPending, streak } from '../core/scheduler';
import { SessionRunner } from '../core/session';
import { MemoryRepository } from '../core/storage';
import { GAME_IDS, type DayPlan, type GameId, type GameState, type Mode, type SessionRecord } from '../core/types';
import { schulte } from '../games/schulte';
import type { SchulteSnapshot } from '../games/schulte/engine';
import { ensureTodayPlan, saveFinishedSession } from './today';

const NOW = new Date(2026, 9, 18, 10, 0).getTime();
const IDS: readonly GameId[] = ['schulte'];

// 用真实的舒尔特模块跑完一次 3 轮训练，每 300ms 点对一格
async function playSchulte(repo: MemoryRepository, mode: Mode = 'plan'): Promise<SessionRunner> {
  const runner = new SessionRunner(schulte, await repo.getGameState('schulte'), mode, 99, NOW);
  let t = 0;
  while (!runner.isFinished()) {
    runner.beginRound(t);
    for (;;) {
      const snap = runner.engine.snapshot() as SchulteSnapshot;
      if (snap.done) break;
      t += 300;
      runner.input({ kind: 'cell', index: snap.cells.findIndex((c) => c.label === snap.nextLabel), t });
    }
  }
  return runner;
}

describe('ensureTodayPlan', () => {
  it('当天首次调用时生成计划并写库', async () => {
    const repo = new MemoryRepository();
    const plan = await ensureTodayPlan(repo, GAME_IDS, 4, NOW);
    expect(plan).toEqual({ dayKey: '2026-10-18', games: ['schulte', 'stroop', 'seqmem'], completed: [] });
    expect(await repo.getPlan('2026-10-18')).toEqual(plan);
  });

  it('当天内计划不变，第二天按上次训练日期轮换', async () => {
    const repo = new MemoryRepository();
    await ensureTodayPlan(repo, GAME_IDS, 4, NOW);
    await saveFinishedSession(repo, GAME_IDS, 4, await playSchulte(repo), NOW);
    const sameDay = await ensureTodayPlan(repo, GAME_IDS, 4, NOW + 3_600_000);
    expect(sameDay.games).toEqual(['schulte', 'stroop', 'seqmem']);
    expect(sameDay.completed).toEqual(['schulte']);
    const nextDay = await ensureTodayPlan(repo, GAME_IDS, 4, NOW + 24 * 3_600_000);
    expect(nextDay).toEqual({ dayKey: '2026-10-19', games: ['stroop', 'seqmem', 'mot'], completed: [] });
  });
});

describe('saveFinishedSession', () => {
  it('写入训练记录、更新档位、标记计划完成，打卡天数变为 1', async () => {
    const repo = new MemoryRepository();
    const { id, record } = await saveFinishedSession(repo, IDS, 4, await playSchulte(repo), NOW);
    expect(record).toMatchObject({
      id,
      gameId: 'schulte',
      mode: 'plan',
      dayKey: '2026-10-18',
      startedAt: NOW,
      durationMs: 15000,
      startLevel: 1,
      endLevel: 4,
      ability: 25,
    });
    expect(record.rounds.map((r) => [r.level, r.outcome, r.counted])).toEqual([
      [1, 'pass', true],
      [2, 'pass', true],
      [3, 'pass', true],
    ]);
    expect(record.summary).toEqual({ bestTimeMs: 2700, avgCellMs: 300, errors: 0 });
    expect(await repo.getSession(id)).toEqual(record);
    expect(await repo.getGameState('schulte')).toMatchObject({ level: 4, lastPlayedDayKey: '2026-10-18' });
    const plan = await repo.getPlan('2026-10-18');
    expect(plan?.completed).toEqual(['schulte']);
    expect(plan !== null && isPlanComplete(plan)).toBe(true);
    expect(streak(await repo.listPlans(), '2026-10-18')).toBe(1);
  });

  it('自由练也算完成计划项', async () => {
    const repo = new MemoryRepository();
    const { record } = await saveFinishedSession(repo, IDS, 4, await playSchulte(repo, 'free'), NOW);
    expect(record.mode).toBe('free');
    expect((await repo.getPlan('2026-10-18'))?.completed).toEqual(['schulte']);
  });

  it('凌晨 4 点前结束的训练记在前一天', async () => {
    const repo = new MemoryRepository();
    const lateNight = new Date(2026, 9, 19, 2, 0).getTime();
    const { record } = await saveFinishedSession(repo, IDS, 4, await playSchulte(repo), lateNight);
    expect(record.dayKey).toBe('2026-10-18');
    expect(await repo.getPlan('2026-10-18')).not.toBeNull();
  });
});

const savedState = (gameId: GameId, level: number, played: string | null): GameState => ({
  gameId,
  level,
  passStreak: 0,
  failStreak: 0,
  lastPlayedDayKey: played,
});

const dummyRecord = (gameId: GameId, level: number, day: string): SessionRecord => ({
  gameId,
  mode: 'plan',
  dayKey: day,
  startedAt: NOW,
  durationMs: 1000,
  startLevel: level,
  endLevel: level,
  rounds: [],
  summary: {},
  ability: 25,
});

describe('ensureTodayPlan 的注册表增长重算（K8）', () => {
  it('注册表没长时当天计划原样返回，并且不再写库', async () => {
    const repo = new MemoryRepository();
    const first = await ensureTodayPlan(repo, IDS, 4, NOW);
    expect(first.games).toEqual(['schulte']);
    const put = vi.spyOn(repo, 'putPlan');
    // 这两条读库计数断言只为 today.ts 的早返回（if (existing && !isPlanStale(...)) return existing）而存在：
    // 它是唯一省下档位读取的一层，删掉它首页/结算页每次渲染仍全绿，却按注册表长度多读 2×N 次库（评审探针 T1）。
    // 对照：第二个写库闸门 if (plan !== existing) 在可达路径上恒为真，删掉它测试全绿（探针 T2），
    // 所以这里不给它写任何假装有效的断言，只靠上面的读库计数护住真正承重的那一行。
    const gs = vi.spyOn(repo, 'getGameState');
    const ls = vi.spyOn(repo, 'lastSession');
    const again = await ensureTodayPlan(repo, IDS, 4, NOW);
    expect(again).toEqual(first);
    expect(put).not.toHaveBeenCalled();
    expect(gs).toHaveBeenCalledTimes(0);
    expect(ls).toHaveBeenCalledTimes(0);
    put.mockRestore();
    gs.mockRestore();
    ls.mockRestore();
  });

  it('M1 时代留下的 1 项计划：注册了第二个游戏后当天就重算成 2 项并写库', async () => {
    const repo = new MemoryRepository();
    await repo.putPlan({ dayKey: '2026-10-18', games: ['schulte'], completed: [] });
    const two: GameId[] = ['schulte', 'stroop'];
    const plan = await ensureTodayPlan(repo, two, 4, NOW);
    expect(plan).toEqual({ dayKey: '2026-10-18', games: ['schulte', 'stroop'], completed: [] });
    expect(await repo.getPlan('2026-10-18')).toEqual(plan);
  });

  it('重算是幂等的：第二次调用不写库', async () => {
    const repo = new MemoryRepository();
    await repo.putPlan({ dayKey: '2026-10-18', games: ['schulte'], completed: [] });
    const two: GameId[] = ['schulte', 'stroop'];
    const once = await ensureTodayPlan(repo, two, 4, NOW);
    const put = vi.spyOn(repo, 'putPlan');
    const twice = await ensureTodayPlan(repo, two, 4, NOW);
    expect(twice).toEqual(once);
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it('今天已经打完的 1 项计划绝不重算，否则没收用户今天的打卡', async () => {
    const repo = new MemoryRepository();
    await repo.putPlan({ dayKey: '2026-10-18', games: ['schulte'], completed: ['schulte'] });
    const two: GameId[] = ['schulte', 'stroop'];
    const plan = await ensureTodayPlan(repo, two, 4, NOW);
    expect(plan).toEqual({ dayKey: '2026-10-18', games: ['schulte'], completed: ['schulte'] });
    expect(isPlanComplete(plan)).toBe(true);
    expect(await repo.getPlan('2026-10-18')).toEqual(plan);
  });

  it('重算保留已完成标记：昨天打完 + 今天已练一项，连续打卡不会掉', async () => {
    const repo = new MemoryRepository();
    await repo.putPlan({ dayKey: '2026-10-17', games: ['schulte'], completed: ['schulte'] });
    await repo.putPlan({ dayKey: '2026-10-18', games: ['schulte', 'stroop'], completed: ['schulte'] });
    await repo.saveSession(dummyRecord('schulte', 5, '2026-10-18'), savedState('schulte', 5, '2026-10-18'), null);
    const three: GameId[] = ['schulte', 'stroop', 'seqmem'];
    const plan = await ensureTodayPlan(repo, three, 4, NOW);
    // stroop 与 seqmem 都没练过排前面，schulte 今天练过排最后；已完成标记跟着留下
    expect(plan).toEqual({ dayKey: '2026-10-18', games: ['stroop', 'seqmem', 'schulte'], completed: ['schulte'] });
    expect(nextPending(plan)).toBe('stroop');
    expect(streak(await repo.listPlans(), '2026-10-18')).toBe(1);
  });

  it('历史日期的计划一律不动，打卡记录不可能被追溯收回', async () => {
    const repo = new MemoryRepository();
    const yesterday: DayPlan = { dayKey: '2026-10-17', games: ['schulte'], completed: ['schulte'] };
    await repo.putPlan(yesterday);
    await ensureTodayPlan(repo, ['schulte', 'stroop'], 4, NOW);
    expect(await repo.getPlan('2026-10-17')).toEqual(yesterday);
    expect(streak(await repo.listPlans(), '2026-10-17')).toBe(1);
  });
});
