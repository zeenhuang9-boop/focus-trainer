import { nextPending } from '../../core/scheduler';
import type { SummaryItem } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';
import { ensureTodayPlan } from '../today';

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function stat(item: SummaryItem): HTMLElement {
  return h('div', { class: 'stat' }, h('span', null, item.label), h('span', null, item.value));
}

export async function renderResult(
  view: HTMLElement,
  ctx: AppContext,
  sessionId: number,
  signal: AbortSignal,
): Promise<void> {
  const record = await ctx.repo.getSession(sessionId);
  if (signal.aborted) return;
  const game = record === null ? undefined : getGame(record.gameId);
  if (!record || !game) {
    navigate({ name: 'home' }, true);
    return;
  }

  // 变量名用 past，不要占掉全局 history
  const [past, plan] = await Promise.all([
    ctx.repo.listSessions(record.gameId),
    ensureTodayPlan(ctx.repo, GAMES.map((g) => g.id), ctx.settings.dayStartHour),
  ]);
  if (signal.aborted) return;

  const idx = past.findIndex((r) => r.id === record.id);
  const prev = idx > 0 ? past[idx - 1].ability : null;
  const arrow =
    record.endLevel > record.startLevel ? '↑' : record.endLevel < record.startLevel ? '↓' : '→';
  const abilityText =
    prev === null
      ? `${record.ability}（首次训练）`
      : `${record.ability}（上次 ${prev}，${signed(record.ability - prev)}）`;

  const pending = nextPending(plan);
  const nextGame = pending === null ? undefined : getGame(pending);

  view.replaceChildren(
    h('h1', null, '本次结果'),
    h(
      'div',
      { class: 'muted' },
      `${game.name}　${record.mode === 'plan' ? '今日计划' : '自由练'}　用时 ${(record.durationMs / 1000).toFixed(1)} 秒`,
    ),
    h('div', { class: 'card' }, ...game.formatSummary(record.summary).map(stat)),
    h('div', { class: 'stat' }, h('span', null, '档位'), h('span', null, `第 ${record.startLevel} 档 ${arrow} 第 ${record.endLevel} 档`)),
    h('div', { class: 'stat' }, h('span', null, '能力指数'), h('span', null, abilityText)),
    pending !== null && nextGame
      ? h('button', { class: 'primary', onclick: () => navigate({ name: 'play', gameId: pending, mode: 'plan' }) }, `下一个：${nextGame.name}`)
      : h('div', { class: 'big' }, '今日计划已完成 ✓'),
    h('button', { onclick: () => navigate({ name: 'home' }) }, '回首页'),
  );
}
