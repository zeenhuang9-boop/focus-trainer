import { dayKey } from '../core/daykey';
import { buildPlan, markCompleted, type GameStanding } from '../core/scheduler';
import type { SessionRunner } from '../core/session';
import type { Repository } from '../core/storage';
import type { DayPlan, GameId, SessionRecord } from '../core/types';

export async function ensureTodayPlan(
  repo: Repository,
  gameIds: readonly GameId[],
  dayStartHour: number,
  now = Date.now(),
): Promise<DayPlan> {
  const key = dayKey(now, dayStartHour);
  const existing = await repo.getPlan(key);
  if (existing) return existing;
  const standings: GameStanding[] = await Promise.all(
    gameIds.map(async (gameId) => {
      const [state, last] = await Promise.all([repo.getGameState(gameId), repo.lastSession(gameId)]);
      return { gameId, lastPlayedDayKey: state.lastPlayedDayKey, lastAbility: last?.ability ?? null };
    }),
  );
  const plan = buildPlan(key, standings);
  await repo.putPlan(plan);
  return plan;
}

export async function saveFinishedSession(
  repo: Repository,
  gameIds: readonly GameId[],
  dayStartHour: number,
  runner: SessionRunner,
  now = Date.now(),
): Promise<{ id: number; record: SessionRecord }> {
  const key = dayKey(now, dayStartHour);
  const plan = await ensureTodayPlan(repo, gameIds, dayStartHour, now);
  const { record, state } = runner.finish(key);
  const id = await repo.saveSession(record, state, markCompleted(plan, record.gameId));
  return { id, record: { ...record, id } };
}
