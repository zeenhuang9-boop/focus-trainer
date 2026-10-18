import { nextPending, streak } from '../../core/scheduler';
import { GAMES, getGame } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';
import { ensureTodayPlan } from '../today';

export async function renderHome(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  const plan = await ensureTodayPlan(
    ctx.repo,
    GAMES.map((g) => g.id),
    ctx.settings.dayStartHour,
  );
  const [plans, states] = await Promise.all([ctx.repo.listPlans(), ctx.repo.listGameStates()]);
  if (signal.aborted) return;
  const levelOf = new Map(states.map((s) => [s.gameId, s.level]));
  const pending = nextPending(plan);

  const planCards = plan.games.map((id) => {
    const done = plan.completed.includes(id);
    return h(
      'div',
      { class: done ? 'card done' : 'card' },
      h('span', null, done ? '✓' : '○'),
      h('span', null, getGame(id)?.name ?? id),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, getGame(id)?.ability ?? ''),
    );
  });

  const start = h(
    'button',
    {
      class: 'primary',
      onclick: () => {
        if (pending) navigate({ name: 'play', gameId: pending, mode: 'plan' });
      },
    },
    pending ? '开始训练' : '今日完成',
  );
  start.disabled = pending === null;

  const freeButtons = GAMES.map((g) =>
    h(
      'button',
      { class: 'card', onclick: () => navigate({ name: 'play', gameId: g.id, mode: 'free' }) },
      h('span', null, g.name),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, `第 ${levelOf.get(g.id) ?? 1} 档`),
    ),
  );

  view.replaceChildren(
    h('h1', null, '专注力训练'),
    h(
      'div',
      { class: 'card' },
      h('span', { class: 'big' }, String(streak(plans, plan.dayKey))),
      h('span', null, '天连续打卡'),
    ),
    h('h2', null, '今日计划'),
    h('div', { class: 'list' }, ...planCards),
    start,
    h('h2', null, '自由练'),
    h('div', { class: 'list' }, ...freeButtons),
    h(
      'div',
      { class: 'row' },
      h('button', { disabled: true, title: '趋势页在 M3 提供' }, '趋势'),
      h('button', { onclick: () => navigate({ name: 'settings' }) }, '设置'),
    ),
  );
}
