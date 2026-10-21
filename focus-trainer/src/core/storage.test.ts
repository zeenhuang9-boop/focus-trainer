import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MemoryRepository,
  defaultGameState,
  openIdbRepository,
  type RepoDump,
  type Repository,
} from './storage';
import type { DayPlan, GameId, GameState, SessionRecord, Settings } from './types';

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
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    await repo.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    expect(await repo.getSettings()).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
  });

  it('非默认设置四个字段全等往返', async () => {
    const settings: Settings = { dayStartHour: 2, theme: 'dark', hapticsEnabled: false, soundEnabled: true };
    await repo.putSettings(settings);
    expect(await repo.getSettings()).toEqual(settings);
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

  it('缺 key 的记录两种实现都拒绝且不落库', async () => {
    const broken = { games: ['schulte'], completed: [] } as unknown as DayPlan;
    await expect(repo.saveSession(rec('schulte', 100), state('schulte', 5), broken)).rejects.toThrow(TypeError);
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.getGameState('schulte')).toEqual(defaultGameState('schulte'));
    await repo.saveSession(rec('schulte', 120), state('schulte', 5), null);
    expect(await repo.listSessions()).toHaveLength(1);
  });

  it('写入后修改入参对象不影响库内数据', async () => {
    const rec1 = rec('schulte', 100);
    const st1 = state('schulte', 3);
    await repo.saveSession(rec1, st1, dayPlan('2026-10-18'));
    rec1.ability = 999;
    st1.level = 9;
    expect((await repo.lastSession('schulte'))?.ability).not.toBe(999);
    expect((await repo.getGameState('schulte')).level).toBe(3);
  });

  it('dumpAll 返回四类数据的副本', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18', ['schulte']));
    await repo.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    const dump = await repo.dumpAll();
    expect(dump.sessions).toHaveLength(1);
    expect(dump.gameStates).toEqual([state('schulte', 3)]);
    expect(dump.plans).toEqual([dayPlan('2026-10-18', ['schulte'])]);
    expect(dump.settings).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    dump.sessions[0].ability = 999;
    expect((await repo.lastSession('schulte'))?.ability).not.toBe(999);
  });

  it('loadAll 整体替换四类数据，自增 id 接在导入的最大 id 之后', async () => {
    await repo.saveSession(rec('schulte', 1), state('schulte'), null);
    const imported: RepoDump = {
      sessions: [{ ...rec('stroop', 500), id: 7 }],
      gameStates: [state('stroop', 4)],
      plans: [dayPlan('2026-10-20', ['stroop'])],
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
    };
    await repo.loadAll(imported);
    expect(await repo.listSessions()).toEqual([{ ...rec('stroop', 500), id: 7 }]);
    expect(await repo.getGameState('schulte')).toEqual(defaultGameState('schulte'));
    expect(await repo.getPlan('2026-10-20')).toEqual(dayPlan('2026-10-20', ['stroop']));
    expect(await repo.getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
    const newId = await repo.saveSession(rec('mot', 900), state('mot'), null);
    expect(newId).toBe(8);
  });

  it('loadAll 里重复的 session id 整体失败，不留半份数据', async () => {
    const dup: RepoDump = {
      sessions: [
        { ...rec('schulte', 1), id: 1 },
        { ...rec('mot', 2), id: 1 },
      ],
      gameStates: [],
      plans: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    await expect(repo.loadAll(dup)).rejects.toThrow();
    expect(await repo.listSessions()).toEqual([]);
  });

  it('loadAll 拒绝缺 gameId 的档位与缺 dayKey 的计划，库内旧数据原样保留', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18', ['schulte']));
    await repo.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    const before = await repo.dumpAll();

    const badState: RepoDump = {
      sessions: [],
      gameStates: [{ level: 2, passStreak: 0, failStreak: 0, lastPlayedDayKey: null } as unknown as GameState],
      plans: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    await expect(repo.loadAll(badState)).rejects.toThrow();
    expect(await repo.dumpAll()).toEqual(before);

    const badPlan: RepoDump = {
      sessions: [],
      gameStates: [],
      plans: [{ games: ['schulte'], completed: [] } as unknown as DayPlan],
      settings: { ...DEFAULT_SETTINGS },
    };
    await expect(repo.loadAll(badPlan)).rejects.toThrow();
    expect(await repo.dumpAll()).toEqual(before);
  });

  it('clearAll 清空全部数据', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18'));
    await repo.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 0 });
    await repo.clearAll();
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.listGameStates()).toEqual([]);
    expect(await repo.listPlans()).toEqual([]);
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('openIdbRepository', () => {
  // 模拟旧版本只写过一部分字段的库：绕过 Repository，直接往 settings store 塞半截行。
  function putRawSettingsRow(name: string, row: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(name);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('settings', 'readwrite');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
        tx.objectStore('settings').put(row);
      };
    });
  }

  it('旧库半截设置行：缺的字段按默认值补齐', async () => {
    const name = uniqueDbName();
    await openIdbRepository(name); // 先建库与 settings store
    await putRawSettingsRow(name, { key: 'settings', dayStartHour: 2 });
    const repo = await openIdbRepository(name);
    expect(await repo.getSettings()).toEqual({
      dayStartHour: 2,
      theme: 'auto',
      hapticsEnabled: true,
      soundEnabled: false,
    });
  });

  it('同一事务：计划写入失败时 session 和 gameState 都不落库', async () => {
    const repo = await openIdbRepository(uniqueDbName());
    // 带函数值的记录能过 assertWriteKeys，但 IndexedDB 结构化克隆会同步抛 DataError，
    // 用它专门验证 tx.abort() 这条回滚路径真的在承重。
    const broken = { dayKey: '2026-10-18', games: ['schulte'], completed: [() => undefined] } as unknown as DayPlan;
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
