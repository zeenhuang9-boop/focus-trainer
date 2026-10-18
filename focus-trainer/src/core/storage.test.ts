import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, defaultGameState, openIdbRepository, type Repository } from './storage';
import type { DayPlan, GameId, GameState, SessionRecord } from './types';

let dbSeq = 0;
const uniqueDbName = () => `focus-trainer-test-${++dbSeq}`;

const rec = (gameId: GameId, startedAt: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  gameId,
  mode: 'free',
  dayKey: '2026-10-18',
  startedAt,
  durationMs: 1000,
  startLevel: 1,
  endLevel: 2,
  rounds: [],
  summary: { bestTimeMs: 5000 },
  ability: 12,
  ...extra,
});

const state = (gameId: GameId, level = 2): GameState => ({
  gameId,
  level,
  passStreak: 0,
  failStreak: 0,
  lastPlayedDayKey: '2026-10-18',
});

const dayPlan = (dayKey: string, completed: GameId[] = []): DayPlan => ({ dayKey, games: ['schulte'], completed });

const impls = [
  { name: 'memory', make: async (): Promise<Repository> => new MemoryRepository() },
  { name: 'indexeddb', make: (): Promise<Repository> => openIdbRepository(uniqueDbName()) },
];

describe.each(impls)('$name repository', ({ make }) => {
  let repo: Repository;
  beforeEach(async () => {
    repo = await make();
  });

  it('没存过的游戏返回默认状态', async () => {
    expect(await repo.getGameState('mot')).toEqual(defaultGameState('mot'));
    expect(defaultGameState('mot')).toEqual({ gameId: 'mot', level: 1, passStreak: 0, failStreak: 0, lastPlayedDayKey: null });
  });

  it('saveSession 一次写入 session、gameState 与 plan', async () => {
    const id = await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18', ['schulte']));
    expect(typeof id).toBe('number');
    expect(await repo.getSession(id)).toEqual({ ...rec('schulte', 100), id });
    expect(await repo.getGameState('schulte')).toEqual(state('schulte', 3));
    expect(await repo.getPlan('2026-10-18')).toEqual(dayPlan('2026-10-18', ['schulte']));
  });

  it('plan 为 null 时不写计划', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte'), null);
    expect(await repo.getPlan('2026-10-18')).toBeNull();
  });

  it('记录里带着值为 undefined 的 id 也能写入', async () => {
    const id = await repo.saveSession({ ...rec('schulte', 100), id: undefined }, state('schulte'), null);
    expect((await repo.getSession(id))?.id).toBe(id);
  });

  it('listSessions 按游戏过滤并按开始时间升序', async () => {
    await repo.saveSession(rec('schulte', 300), state('schulte'), null);
    await repo.saveSession(rec('stroop', 200), state('stroop'), null);
    await repo.saveSession(rec('schulte', 100), state('schulte'), null);
    expect((await repo.listSessions('schulte')).map((s) => s.startedAt)).toEqual([100, 300]);
    expect((await repo.listSessions()).map((s) => s.startedAt)).toEqual([100, 200, 300]);
    expect(await repo.listSessions('mot')).toEqual([]);
  });

  it('lastSession 返回最晚的一次，没有时为 null', async () => {
    expect(await repo.lastSession('schulte')).toBeNull();
    await repo.saveSession(rec('schulte', 100, { ability: 1 }), state('schulte'), null);
    await repo.saveSession(rec('schulte', 200, { ability: 2 }), state('schulte'), null);
    expect((await repo.lastSession('schulte'))?.ability).toBe(2);
  });

  it('getSession 找不到时为 null', async () => {
    expect(await repo.getSession(9999)).toBeNull();
  });

  it('设置有默认值并能往返', async () => {
    expect(await repo.getSettings()).toEqual({ dayStartHour: 4 });
    await repo.putSettings({ dayStartHour: 2 });
    expect(await repo.getSettings()).toEqual({ dayStartHour: 2 });
  });

  it('计划能往返，listPlans 按日期升序', async () => {
    expect(await repo.getPlan('2026-10-18')).toBeNull();
    await repo.putPlan(dayPlan('2026-10-18'));
    await repo.putPlan(dayPlan('2026-10-16'));
    await repo.putPlan(dayPlan('2026-10-18', ['schulte']));
    expect((await repo.listPlans()).map((p) => [p.dayKey, p.completed.length])).toEqual([
      ['2026-10-16', 0],
      ['2026-10-18', 1],
    ]);
  });

  it('listGameStates 按 gameId 字典序返回已保存的状态', async () => {
    await repo.saveSession(rec('stroop', 1), state('stroop'), null);
    await repo.saveSession(rec('mot', 2), state('mot'), null);
    expect((await repo.listGameStates()).map((s) => s.gameId)).toEqual(['mot', 'stroop']);
  });

  it('返回的是副本，改动不影响库里的数据', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18'));
    const s = await repo.getGameState('schulte');
    s.level = 9;
    const p = await repo.getPlan('2026-10-18');
    p?.completed.push('schulte');
    expect((await repo.getGameState('schulte')).level).toBe(3);
    expect((await repo.getPlan('2026-10-18'))?.completed).toEqual([]);
  });

  it('clearAll 清空全部数据', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18'));
    await repo.putSettings({ dayStartHour: 0 });
    await repo.clearAll();
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.listGameStates()).toEqual([]);
    expect(await repo.listPlans()).toEqual([]);
    expect(await repo.getSettings()).toEqual({ dayStartHour: 4 });
  });
});

describe('openIdbRepository', () => {
  it('同一事务：计划写入失败时 session 和 gameState 都不落库', async () => {
    const repo = await openIdbRepository(uniqueDbName());
    const broken = { games: ['schulte'], completed: [] } as unknown as DayPlan;
    await expect(repo.saveSession(rec('schulte', 100), state('schulte', 5), broken)).rejects.toThrow();
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.getGameState('schulte')).toEqual(defaultGameState('schulte'));
  });

  it('用同一库名重新打开，数据仍在', async () => {
    const name = uniqueDbName();
    const first = await openIdbRepository(name);
    await first.saveSession(rec('schulte', 100), state('schulte', 4), dayPlan('2026-10-18'));
    const second = await openIdbRepository(name);
    expect((await second.getGameState('schulte')).level).toBe(4);
    expect(await second.listSessions('schulte')).toHaveLength(1);
  });
});
