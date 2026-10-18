import { describe, expect, it } from 'vitest';
import { isPlanComplete, streak } from '../core/scheduler';
import { SessionRunner } from '../core/session';
import { MemoryRepository } from '../core/storage';
import { GAME_IDS, type GameId, type Mode } from '../core/types';
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
