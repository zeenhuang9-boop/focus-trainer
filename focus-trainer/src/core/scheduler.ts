import { addDays } from './daykey';
import { GAME_IDS, type DayPlan, type GameId } from './types';

export interface GameStanding {
  gameId: GameId;
  lastPlayedDayKey: string | null;
  lastAbility: number | null;
}

export const PLAN_SIZE = 3;

function compareStanding(a: GameStanding, b: GameStanding): number {
  if (a.lastPlayedDayKey !== b.lastPlayedDayKey) {
    if (a.lastPlayedDayKey === null) return -1;
    if (b.lastPlayedDayKey === null) return 1;
    return a.lastPlayedDayKey < b.lastPlayedDayKey ? -1 : 1;
  }
  const abilityDiff = (a.lastAbility ?? 0) - (b.lastAbility ?? 0);
  if (abilityDiff !== 0) return abilityDiff;
  return GAME_IDS.indexOf(a.gameId) - GAME_IDS.indexOf(b.gameId);
}

export function buildPlan(dayKey: string, standings: readonly GameStanding[]): DayPlan {
  const games = standings
    .slice()
    .sort(compareStanding)
    .slice(0, PLAN_SIZE)
    .map((s) => s.gameId);
  return { dayKey, games, completed: [] };
}

export function markCompleted(plan: DayPlan, gameId: GameId): DayPlan {
  if (!plan.games.includes(gameId) || plan.completed.includes(gameId)) return plan;
  return { ...plan, completed: [...plan.completed, gameId] };
}

export function isPlanComplete(plan: DayPlan): boolean {
  return plan.games.length > 0 && plan.games.every((g) => plan.completed.includes(g));
}

export function nextPending(plan: DayPlan): GameId | null {
  return plan.games.find((g) => !plan.completed.includes(g)) ?? null;
}

export function streak(plans: readonly DayPlan[], todayKey: string): number {
  const byKey = new Map(plans.map((p) => [p.dayKey, p]));
  const today = byKey.get(todayKey);
  // 今天还没练完不算断签，从昨天往前数
  let key = today && isPlanComplete(today) ? todayKey : addDays(todayKey, -1);
  let count = 0;
  for (;;) {
    const p = byKey.get(key);
    if (!p || !isPlanComplete(p)) return count;
    count += 1;
    key = addDays(key, -1);
  }
}
