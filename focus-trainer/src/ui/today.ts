import { dayKey } from '../core/daykey';
import { buildPlan, isPlanStale, markCompleted, reconcilePlan, type GameStanding } from '../core/scheduler';
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
  // 只有注册表长出了计划里没有的游戏才重算；已打完的那天绝不动，否则没收今天的打卡
  if (existing && !isPlanStale(existing, gameIds)) return existing;
  const standings = await standingsFor(repo, gameIds);
  const plan = existing ? reconcilePlan(existing, standings) : buildPlan(key, standings);
  if (plan !== existing) await repo.putPlan(plan);
  return plan;
}

async function standingsFor(repo: Repository, gameIds: readonly GameId[]): Promise<GameStanding[]> {
  return Promise.all(
    gameIds.map(async (gameId) => {
      const [state, last] = await Promise.all([repo.getGameState(gameId), repo.lastSession(gameId)]);
      return { gameId, lastPlayedDayKey: state.lastPlayedDayKey, lastAbility: last?.ability ?? null };
    }),
  );
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
