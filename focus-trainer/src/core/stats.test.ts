import { describe, expect, it } from 'vitest';
// 时钟纪律扫描要读源码文本；node 类型由 @capacitor/cli 传递带入，仓库不直接声明
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addDays } from './daykey';
import {
  abilityWindow,
  calendarCells,
  pickTrendGame,
  radarAxes,
  CALENDAR_CELLS,
  RADAR_WINDOW,
  TREND_DAYS,
  type TrendGame,
} from './stats';
import type { GameId, SessionRecord } from './types';

const G = (id: GameId, ability: string): TrendGame => ({ id, ability });
const GAMES3: TrendGame[] = [G('schulte', '持续注意'), G('stroop', '抑制控制'), G('seqmem', '工作记忆')];

// 手写记录而不是走 SessionRunner：本层只认 gameId / dayKey / startedAt / ability 四个字段。
function rec(gameId: GameId, startedAt: number, day: string, ability: number): SessionRecord {
  return {
    gameId, mode: 'free', dayKey: day, startedAt,
    durationMs: 1000, startLevel: 1, endLevel: 1, rounds: [], summary: {}, ability,
  };
}

describe('radarAxes', () => {
  it('取最近 3 次训练 ability 的均值并四舍五入，第 4 次以前不参与', () => {
    const sessions = [
      rec('schulte', 1_000, '2026-10-16', 10),
      rec('schulte', 2_000, '2026-10-17', 20),
      rec('schulte', 3_000, '2026-10-18', 30),
      rec('schulte', 4_000, '2026-10-19', 40),
      rec('stroop', 5_000, '2026-10-19', 52),
    ];
    expect(radarAxes(GAMES3, sessions)).toEqual([
      { gameId: 'schulte', ability: '持续注意', value: 30, practiced: true },
      { gameId: 'stroop', ability: '抑制控制', value: 52, practiced: true },
      { gameId: 'seqmem', ability: '工作记忆', value: 0, practiced: false },
    ]);
  });

  it('输入乱序也按 startedAt 倒序取窗口，.5 向上取整', () => {
    const sessions = [rec('schulte', 3_000, '2026-10-19', 40), rec('schulte', 1_000, '2026-10-17', 10), rec('schulte', 2_000, '2026-10-18', 12)];
    expect(radarAxes([G('schulte', '持续注意')], sessions)[0].value).toBe(21);
  });

  it('从没练过是 value 0 且 practiced false', () => {
    expect(radarAxes([G('mot', '动态感知')], [])).toEqual([
      { gameId: 'mot', ability: '动态感知', value: 0, practiced: false },
    ]);
  });

  it('轴数跟随传入的注册表长度，不硬编码 5', () => {
    expect(radarAxes([], [])).toEqual([]);
    expect(radarAxes(GAMES3, [rec('schulte', 1, '2026-10-19', 5)])).toHaveLength(3);
  });
});

describe('abilityWindow', () => {
  const TODAY = '2026-10-19';

  it('默认给出以今天结尾、升序的 30 个日期键', () => {
    const win = abilityWindow('schulte', [], TODAY);
    expect(TREND_DAYS).toBe(30);
    expect(win.keys).toHaveLength(30);
    expect(win.keys[0]).toBe('2026-09-20');
    expect(win.keys[29]).toBe(TODAY);
    expect(win.points).toEqual([]);
    expect(win.gameId).toBe('schulte');
  });

  it('同一日期键取当天最高 ability，不按最后一条', () => {
    const win = abilityWindow('schulte', [rec('schulte', 1_000, TODAY, 45), rec('schulte', 2_000, TODAY, 20)], TODAY);
    expect(win.points).toEqual([{ index: 29, dayKey: TODAY, ability: 45 }]);
  });

  it('凌晨 02:00 的记录归前一天：只认记录自带的 dayKey，绝不再算一次', () => {
    // startedAt 是 2026-10-18 02:00 的时刻，但写入方按 04:00 分界把 dayKey 落成了 2026-10-17
    const lateNight = new Date(2026, 9, 18, 2, 0).getTime();
    const win = abilityWindow('schulte', [rec('schulte', lateNight, '2026-10-17', 33)], TODAY);
    expect(win.points).toEqual([{ index: 27, dayKey: '2026-10-17', ability: 33 }]);
    expect(win.keys[27]).toBe('2026-10-17');
  });

  it('窗口外（更早与更晚）的记录被丢掉', () => {
    const sessions = [
      rec('schulte', 1, addDays(TODAY, -30), 50),
      rec('schulte', 2, addDays(TODAY, 1), 60),
      rec('schulte', 3, addDays(TODAY, -29), 70),
    ];
    expect(abilityWindow('schulte', sessions, TODAY).points.map((p) => p.dayKey)).toEqual([addDays(TODAY, -29)]);
  });

  it('别的游戏的记录不进这条曲线', () => {
    expect(abilityWindow('schulte', [rec('stroop', 1, TODAY, 90)], TODAY).points).toEqual([]);
  });
});

describe('calendarCells', () => {
  const TODAY = '2026-10-19';

  it('默认 35 格、以今天结尾、升序', () => {
    const cells = calendarCells(GAMES3, [], TODAY);
    expect(CALENDAR_CELLS).toBe(35);
    expect(cells).toHaveLength(35);
    expect(cells[34].dayKey).toBe(TODAY);
    expect(cells[0].dayKey).toBe(addDays(TODAY, -34));
    expect(cells[34]).toEqual({ dayKey: TODAY, state: 'none', doneCount: 0, planSize: 0 });
  });

  it('计划全完成是 done，完成一半是 partial，没计划是 none', () => {
    const full = { dayKey: '2026-10-18', games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte', 'stroop', 'seqmem'] as GameId[] };
    const half = { dayKey: '2026-10-17', games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte'] as GameId[] };
    const cells = calendarCells(GAMES3, [full, half], TODAY);
    expect(cells[33]).toEqual({ dayKey: '2026-10-18', state: 'done', doneCount: 3, planSize: 3 });
    expect(cells[32]).toMatchObject({ dayKey: '2026-10-17', state: 'partial', doneCount: 1, planSize: 3 });
  });

  it('未注册游戏既不计进数字也不影响 done 判定', () => {
    // 注册表只有 2 个游戏时，那条 3 项计划：isPlanComplete 为真 → 状态仍是 done，数字按注册表过滤
    const games = [G('schulte', '持续注意'), G('stroop', '抑制控制')];
    const stale = { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte', 'stroop', 'seqmem'] as GameId[] };
    expect(calendarCells(games, [stale], TODAY)[34]).toEqual({ dayKey: TODAY, state: 'done', doneCount: 2, planSize: 2 });
    // 未注册项被勾掉后计划其实没打完：state 交给 isPlanComplete，绝不在 UI 层重算
    const partial = { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte', 'seqmem'] as GameId[] };
    expect(calendarCells(games, [partial], TODAY)[34]).toMatchObject({ state: 'partial', doneCount: 1, planSize: 2 });
  });

  it('空 games 的坏计划不算 done', () => {
    const broken = { dayKey: TODAY, games: [] as GameId[], completed: [] as GameId[] };
    expect(calendarCells(GAMES3, [broken], TODAY)[34].state).toBe('none');
  });
});

describe('pickTrendGame', () => {
  it('默认选中 lastPlayedDayKey 最新的那个', () => {
    const states = [
      { gameId: 'schulte' as GameId, lastPlayedDayKey: '2026-10-18' },
      { gameId: 'stroop' as GameId, lastPlayedDayKey: '2026-10-19' },
    ];
    expect(pickTrendGame(GAMES3, states)).toBe('stroop');
  });

  it('从没练过或注册表外都退回注册表第一项', () => {
    const [a, b] = GAMES3;
    expect(pickTrendGame([b, a], [{ gameId: a.id, lastPlayedDayKey: null }])).toBe(b.id);
    expect(pickTrendGame(GAMES3, [{ gameId: 'mot', lastPlayedDayKey: '2026-10-19' }])).toBe('schulte');
  });

  it('空注册表：有 fallback 用它，没有就抛错而不是渲染一条空曲线', () => {
    expect(pickTrendGame([], [], 'schulte')).toBe('schulte');
    expect(() => pickTrendGame([], [])).toThrow(TypeError);
  });
});

it('stats.ts 里没有第二套时钟来源', () => {
  const src = readFileSync(fileURLToPath(new URL('./stats.ts', import.meta.url)), 'utf8');
  expect(src).not.toMatch(/Date\.now|new Date|toISOString|getUTCHours/);
});

it('雷达窗口常量是 3', () => {
  expect(RADAR_WINDOW).toBe(3);
});
