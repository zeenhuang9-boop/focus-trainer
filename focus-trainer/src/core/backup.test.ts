import { describe, expect, it } from 'vitest';
import {
  BACKUP_APP,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackup,
  importBackup,
  parseBackup,
} from './backup';
import { DEFAULT_SETTINGS, MemoryRepository, defaultGameState } from './storage';
import type { DayPlan, GameId, GameState, SessionRecord } from './types';

const rec = (gameId: GameId, startedAt: number): SessionRecord => ({
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
});

const state = (gameId: GameId, level = 2): GameState => ({
  gameId,
  level,
  passStreak: 0,
  failStreak: 0,
  lastPlayedDayKey: '2026-10-18',
});

const plan = (dayKey: string, completed: GameId[] = []): DayPlan => ({ dayKey, games: ['schulte'], completed });

async function seeded(): Promise<MemoryRepository> {
  const repo = new MemoryRepository();
  await repo.saveSession(rec('schulte', 100), state('schulte', 3), plan('2026-10-18', ['schulte']));
  await repo.putSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
  return repo;
}

const roundTrip = async (repo: MemoryRepository, now = 1000): Promise<string> =>
  JSON.stringify(await createBackup(repo, now));

/** 一份结构合法、各数组为空的原始备份；over 覆盖顶层字段，便于逐项构造坏数据。 */
const rawBackup = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: 0,
    sessions: [],
    gameStates: [],
    plans: [],
    settings: { ...DEFAULT_SETTINGS },
    ...over,
  });

describe('备份导出与导入', () => {
  it('导出的 JSON 能解析回来并完整写进空库', async () => {
    const data = parseBackup(await roundTrip(await seeded()));
    expect(data.format).toBe(BACKUP_FORMAT);
    expect(data.app).toBe(BACKUP_APP);
    expect(data.version).toBe(BACKUP_VERSION);
    expect(data.exportedAt).toBe(1000);

    const target = new MemoryRepository();
    const s = await importBackup(target, data);
    expect(s).toEqual({ addedSessions: 1, mergedStates: 1, mergedPlans: 1 });
    expect((await target.listSessions()).map((x) => [x.gameId, x.startedAt])).toEqual([['schulte', 100]]);
    expect(await target.getGameState('schulte')).toEqual(state('schulte', 3));
    expect(await target.getPlan('2026-10-18')).toEqual(plan('2026-10-18', ['schulte']));
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('createBackup 的原始 JSON 同时含 format 与 app 标记', async () => {
    const text = await roundTrip(new MemoryRepository());
    expect(text).toContain('"format":"focus-trainer/backup"');
    expect(text).toContain('"app":"focus-trainer"');
    expect(JSON.parse(text)).toMatchObject({ format: BACKUP_FORMAT, app: BACKUP_APP });
  });

  it('空备份导入返回全 0，本地设置保持不变', async () => {
    const target = new MemoryRepository();
    await target.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });

    const s = await importBackup(target, parseBackup(rawBackup()));
    expect(s).toEqual({ addedSessions: 0, mergedStates: 0, mergedPlans: 0 });
    expect(await target.listSessions()).toEqual([]);
    expect(await target.listGameStates()).toEqual([]);
    expect(await target.listPlans()).toEqual([]);
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
  });

  it('合并：同一条训练不重复、档位取高、打卡取并集', async () => {
    const target = new MemoryRepository();
    await target.saveSession(rec('schulte', 100), state('schulte', 2), plan('2026-10-18', []));

    const source = new MemoryRepository();
    await source.saveSession(rec('schulte', 100), state('schulte', 5), plan('2026-10-18', ['schulte']));
    await source.saveSession(rec('mot', 300), state('mot', 4), null);

    const s = await importBackup(target, parseBackup(await roundTrip(source)));
    expect(s).toEqual({ addedSessions: 1, mergedStates: 2, mergedPlans: 1 });
    expect((await target.listSessions()).map((x) => x.gameId)).toEqual(['schulte', 'mot']);
    expect((await target.getGameState('schulte')).level).toBe(5);
    expect(await target.getPlan('2026-10-18')).toEqual({
      dayKey: '2026-10-18',
      games: ['schulte'],
      completed: ['schulte'],
    });
  });

  it('本地设置不是默认值时，不被备份里的设置覆盖', async () => {
    const target = await seeded();
    await target.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    const s = await importBackup(target, parseBackup(await roundTrip(await seeded())));
    expect(s).toEqual({ addedSessions: 0, mergedStates: 0, mergedPlans: 0 });
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
  });

  it('同一份备份导入两次是幂等的', async () => {
    const target = new MemoryRepository();
    const data = parseBackup(await roundTrip(await seeded()));
    await importBackup(target, data);
    const again = await importBackup(target, data);
    expect(again).toEqual({ addedSessions: 0, mergedStates: 0, mergedPlans: 0 });
    expect((await target.listSessions()).length).toBe(1);
  });

  it('去重键不含 dayKey：同游戏同开始时间、日期不同仍算同一条', async () => {
    const target = new MemoryRepository();
    await target.saveSession(rec('schulte', 100), state('schulte'), null);
    const source = new MemoryRepository();
    await source.saveSession({ ...rec('schulte', 100), dayKey: '2026-10-19' }, state('schulte', 5), null);

    const s = await importBackup(target, parseBackup(await roundTrip(source)));
    expect(s.addedSessions).toBe(0);
    const sessions = await target.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].dayKey).toBe('2026-10-18');
  });

  it('档位同级时 lastPlayedDayKey 较新的一方胜出', async () => {
    const target = new MemoryRepository();
    await target.saveSession(rec('schulte', 100), { ...state('schulte', 2), lastPlayedDayKey: '2026-10-17' }, null);
    const source = new MemoryRepository();
    await source.saveSession(rec('schulte', 100), { ...state('schulte', 2), lastPlayedDayKey: '2026-10-20' }, null);

    const s = await importBackup(target, parseBackup(await roundTrip(source)));
    expect(s.mergedStates).toBe(1);
    expect(await target.getGameState('schulte')).toEqual({ ...state('schulte', 2), lastPlayedDayKey: '2026-10-20' });
  });

  it('档位同级且备份更旧时不倒退', async () => {
    const target = new MemoryRepository();
    await target.saveSession(rec('schulte', 100), { ...state('schulte', 2), lastPlayedDayKey: '2026-10-20' }, null);
    const source = new MemoryRepository();
    await source.saveSession(rec('schulte', 100), { ...state('schulte', 2), lastPlayedDayKey: '2026-10-10' }, null);

    const s = await importBackup(target, parseBackup(await roundTrip(source)));
    expect(s.mergedStates).toBe(0);
    expect((await target.getGameState('schulte')).lastPlayedDayKey).toBe('2026-10-20');
  });

  it('同日计划 games 不同：completed 更全的一份整条胜出', async () => {
    const localPlan: DayPlan = { dayKey: '2026-10-21', games: ['schulte', 'stroop', 'seqmem'], completed: [] };
    const backupPlan: DayPlan = { dayKey: '2026-10-21', games: ['mot', 'gestalt', 'seqmem'], completed: ['seqmem', 'gestalt', 'mot'] };

    const target = new MemoryRepository();
    await target.putPlan(localPlan);
    const source = new MemoryRepository();
    await source.putPlan(backupPlan);

    const s = await importBackup(target, parseBackup(await roundTrip(source)));
    expect(s.mergedPlans).toBe(1);
    expect(await target.getPlan('2026-10-21')).toEqual(backupPlan);
    const merged = await target.getPlan('2026-10-21');
    expect(merged).not.toBeNull();
    for (const id of merged!.completed) expect(merged!.games).toContain(id);

    // (a) 本地 completed 更多：本地整条保留，备份里不同的 games 不掺进来
    const localAhead: DayPlan = {
      dayKey: '2026-10-22',
      games: ['schulte', 'stroop', 'mot'],
      completed: ['schulte', 'stroop'],
    };
    const backupBehind: DayPlan = { dayKey: '2026-10-22', games: ['mot', 'gestalt'], completed: ['mot'] };
    const targetA = new MemoryRepository();
    await targetA.putPlan(localAhead);
    const sourceA = new MemoryRepository();
    await sourceA.putPlan(backupBehind);
    const sa = await importBackup(targetA, parseBackup(await roundTrip(sourceA)));
    expect(sa.mergedPlans).toBe(0);
    expect(await targetA.getPlan('2026-10-22')).toEqual(localAhead);

    // (b) completed 等长但 games 不同：平手保留本地
    const localTie: DayPlan = { dayKey: '2026-10-23', games: ['schulte', 'stroop'], completed: ['schulte'] };
    const backupTie: DayPlan = { dayKey: '2026-10-23', games: ['mot', 'gestalt'], completed: ['mot'] };
    const targetB = new MemoryRepository();
    await targetB.putPlan(localTie);
    const sourceB = new MemoryRepository();
    await sourceB.putPlan(backupTie);
    const sb = await importBackup(targetB, parseBackup(await roundTrip(sourceB)));
    expect(sb.mergedPlans).toBe(0);
    expect(await targetB.getPlan('2026-10-23')).toEqual(localTie);
  });

  it('overwrite：四类数据整体替换为备份内容，本地旧数据消失', async () => {
    const target = new MemoryRepository();
    await target.saveSession(rec('mot', 50), state('mot', 9), plan('2026-10-01', ['mot']));
    await target.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });

    const data = parseBackup(await roundTrip(await seeded()));
    const s = await importBackup(target, data, 'overwrite');
    expect(s).toEqual({ addedSessions: 1, mergedStates: 1, mergedPlans: 1 });
    expect(await target.listSessions()).toEqual(data.sessions);
    expect(await target.listGameStates()).toEqual(data.gameStates);
    expect(await target.listPlans()).toEqual(data.plans);
    expect(await target.getSettings()).toEqual(data.settings);
    expect(await target.getPlan('2026-10-01')).toBeNull();
    expect(await target.getGameState('mot')).toEqual(defaultGameState('mot'));
  });
});

describe('备份解析校验', () => {
  it('只有 format 标记（无 app）的备份也能解析，只有 app 的老备份也接受', () => {
    const formatOnly = parseBackup(
      rawBackup({ app: undefined, exportedAt: 7, settings: { ...DEFAULT_SETTINGS } }),
    );
    expect(formatOnly.format).toBe(BACKUP_FORMAT);
    expect(formatOnly.app).toBe(BACKUP_APP);
    expect(formatOnly.exportedAt).toBe(7);

    const appOnly = parseBackup(rawBackup({ format: undefined }));
    expect(appOnly.app).toBe(BACKUP_APP);
  });

  it('拒绝坏 JSON、两个标记都错、版本不符与缺字段', () => {
    expect(() => parseBackup('{')).toThrow('JSON');
    expect(() => parseBackup('{}')).toThrow('本应用的备份');
    expect(() => parseBackup(rawBackup({ format: 'other-app', app: 'other-app' }))).toThrow('本应用的备份');
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 99 }))).toThrow('版本');
    expect(() =>
      parseBackup(
        JSON.stringify({ app: BACKUP_APP, version: 1, sessions: [], gameStates: [], plans: [], settings: {} }),
      ),
    ).toThrow('设置');
    expect(() =>
      parseBackup(
        JSON.stringify({
          app: BACKUP_APP,
          version: 1,
          sessions: [{}],
          gameStates: [],
          plans: [],
          settings: { dayStartHour: 4 },
        }),
      ),
    ).toThrow('训练记录');
  });

  it('训练记录缺 id 被拒绝', () => {
    const session: Record<string, unknown> = { ...rec('schulte', 100), id: undefined };
    expect(() => parseBackup(rawBackup({ sessions: [session] }))).toThrow('训练记录');
  });

  it('非有限数字被拒绝：exportedAt 与训练记录 id 为 Infinity', () => {
    const badExport = rawBackup().replace('"exportedAt":0', '"exportedAt":1e999');
    expect(JSON.parse(badExport).exportedAt).toBe(Infinity);
    expect(() => parseBackup(badExport)).toThrow('exportedAt');

    const badId = rawBackup({ sessions: [{ ...rec('schulte', 100), id: 1 }] }).replace('"id":1', '"id":1e999');
    expect(JSON.parse(badId).sessions[0].id).toBe(Infinity);
    expect(() => parseBackup(badId)).toThrow('训练记录');
  });

  it('数组字段不是数组时错误信息同时含中文名与英文键', () => {
    expect(() => parseBackup(rawBackup({ sessions: {} }))).toThrow('训练记录（sessions）');
    expect(() => parseBackup(rawBackup({ gameStates: {} }))).toThrow('档位记录（gameStates）');
    expect(() => parseBackup(rawBackup({ plans: {} }))).toThrow('计划记录（plans）');
  });

  it('非法 gameId 被拒绝', () => {
    expect(() =>
      parseBackup(rawBackup({ sessions: [{ ...rec('schulte', 100), id: 1, gameId: 'nope' }] })),
    ).toThrow('训练记录');
    expect(() => parseBackup(rawBackup({ gameStates: [{ ...state('schulte'), gameId: 'nope' }] }))).toThrow('档位');
    expect(() =>
      parseBackup(rawBackup({ plans: [{ dayKey: '2026-10-18', games: ['nope'], completed: [] }] })),
    ).toThrow('计划');
  });

  it('非法 theme 被拒绝', () => {
    expect(() => parseBackup(rawBackup({ settings: { ...DEFAULT_SETTINGS, theme: 'blue' } }))).toThrow('设置');
  });

  it('旧备份缺少新增设置字段时按默认值回填', () => {
    const data = parseBackup(rawBackup({ settings: { dayStartHour: 2 } }));
    expect(data.settings).toEqual({ dayStartHour: 2, theme: 'auto', hapticsEnabled: true, soundEnabled: false });
  });
});
