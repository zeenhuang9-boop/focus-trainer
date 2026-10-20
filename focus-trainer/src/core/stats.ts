import { addDays } from './daykey';
import { isPlanComplete } from './scheduler';
import type { DayPlan, GameId, SessionRecord } from './types';

export const RADAR_WINDOW = 3;
export const TREND_DAYS = 30;
export const CALENDAR_CELLS = 35;

export type TrendGame = { id: GameId; ability: string };

export interface RadarAxis {
  gameId: GameId;
  ability: string;
  value: number;
  practiced: boolean;
}

export interface AbilityPoint {
  index: number;
  dayKey: string;
  ability: number;
}

export interface AbilityWindow {
  gameId: GameId;
  keys: string[];
  points: AbilityPoint[];
}

export type CalendarState = 'done' | 'partial' | 'none';

export interface CalendarCell {
  dayKey: string;
  state: CalendarState;
  doneCount: number;
  planSize: number;
}

const byStartedAtDesc = (a: SessionRecord, b: SessionRecord): number => b.startedAt - a.startedAt;

export function radarAxes(games: readonly TrendGame[], sessions: readonly SessionRecord[]): RadarAxis[] {
  return games.map((g) => {
    const recent = sessions.filter((s) => s.gameId === g.id).slice().sort(byStartedAtDesc).slice(0, RADAR_WINDOW);
    if (recent.length === 0) return { gameId: g.id, ability: g.ability, value: 0, practiced: false };
    const mean = recent.reduce((sum, s) => sum + s.ability, 0) / recent.length;
    return { gameId: g.id, ability: g.ability, value: Math.round(mean), practiced: true };
  });
}

// 只认记录自带的 dayKey（写入方已按本地 dayStartHour 分界算过），这里绝不再从 startedAt 推日期。
export function abilityWindow(gameId: GameId, sessions: readonly SessionRecord[], todayKey: string, days = TREND_DAYS): AbilityWindow {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(addDays(todayKey, -i));
  const first = keys[0] as string;
  const best = new Map<string, number>();
  for (const s of sessions) {
    if (s.gameId !== gameId) continue;
    if (s.dayKey < first || s.dayKey > todayKey) continue;
    const cur = best.get(s.dayKey);
    if (cur === undefined || s.ability > cur) best.set(s.dayKey, s.ability);
  }
  const points: AbilityPoint[] = [];
  keys.forEach((key, index) => {
    const ability = best.get(key);
    if (ability !== undefined) points.push({ index, dayKey: key, ability });
  });
  return { gameId, keys, points };
}

export function calendarCells(games: readonly TrendGame[], plans: readonly DayPlan[], todayKey: string, cells = CALENDAR_CELLS): CalendarCell[] {
  const valid = new Set<string>(games.map((g) => g.id));
  const byKey = new Map(plans.map((p) => [p.dayKey, p]));
  const out: CalendarCell[] = [];
  for (let i = cells - 1; i >= 0; i--) {
    const dayKey = addDays(todayKey, -i);
    const p = byKey.get(dayKey);
    const doneCount = p === undefined ? 0 : p.completed.filter((g) => valid.has(g)).length;
    const planSize = p === undefined ? 0 : p.games.filter((g) => valid.has(g)).length;
    // done 只问 isPlanComplete（与首页、streak 同一把尺子），数字才按注册表过滤
    const state: CalendarState = p !== undefined && isPlanComplete(p) ? 'done' : doneCount > 0 ? 'partial' : 'none';
    out.push({ dayKey, state, doneCount, planSize });
  }
  return out;
}

export function pickTrendGame(
  games: readonly TrendGame[],
  states: readonly { gameId: GameId; lastPlayedDayKey: string | null }[],
  fallback?: GameId,
): GameId {
  const ids = new Set<string>(games.map((g) => g.id));
  let bestKey = '';
  let bestId: GameId | null = null;
  for (const s of states) {
    if (!ids.has(s.gameId) || s.lastPlayedDayKey === null) continue;
    if (s.lastPlayedDayKey > bestKey) {
      bestKey = s.lastPlayedDayKey;
      bestId = s.gameId;
    }
  }
  const first = games.length > 0 ? (games[0] as TrendGame).id : fallback;
  if (first === undefined) throw new TypeError('趋势页没有可显示的游戏');
  return bestId ?? first;
}
