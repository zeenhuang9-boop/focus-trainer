import { dayKey } from '../../core/daykey';
import { streak } from '../../core/scheduler';
import {
  abilityWindow,
  calendarCells,
  CALENDAR_CELLS,
  pickTrendGame,
  RADAR_WINDOW,
  radarAxes,
  TREND_DAYS,
  type TrendGame,
} from '../../core/stats';
import type { GameId } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import { calendarGrid, lineChart, radarChart } from '../charts';
import type { AppContext } from '../context';
import { h } from '../dom';

export async function renderTrends(
  view: HTMLElement,
  ctx: AppContext,
  signal: AbortSignal,
  now = Date.now(),
): Promise<void> {
  const games: TrendGame[] = GAMES.map((g) => ({ id: g.id, ability: g.ability }));
  const [sessions, plans, states] = await Promise.all([
    ctx.repo.listSessions(),
    ctx.repo.listPlans(),
    ctx.repo.listGameStates(),
  ]);
  if (signal.aborted) return;
  const todayKey = dayKey(now, ctx.settings.dayStartHour);
  const axes = radarAxes(games, sessions);
  const cells = calendarCells(games, plans, todayKey);
  const selected = pickTrendGame(games, states);

  const curveHost = h('div', { class: 'curve-host' });
  const paintCurve = (gameId: GameId): void => {
    const win = abilityWindow(gameId, sessions, todayKey);
    if (win.points.length === 0) {
      curveHost.replaceChildren(h('div', { class: 'trend-empty' }, `近 ${TREND_DAYS} 天还没有训练记录`));
      return;
    }
    curveHost.replaceChildren(lineChart(win));
  };
  paintCurve(selected);

  const select = h(
    'select',
    { 'aria-label': '选择游戏' },
    ...games.map((g) => {
      const option = h('option', { value: g.id }, getGame(g.id)?.name ?? g.ability);
      option.selected = g.id === selected;
      return option;
    }),
  );
  select.addEventListener('change', () => paintCurve(select.value as GameId));

  const legend = h(
    'ul',
    { class: 'radar-legend' },
    ...axes.map((a) =>
      h(
        'li',
        null,
        h('span', null, a.ability),
        h('span', { class: 'spacer' }),
        h('span', { class: a.practiced ? undefined : 'muted' }, a.practiced ? String(a.value) : '未练'),
      ),
    ),
  );

  view.replaceChildren(
    h('h1', null, '趋势'),
    h(
      'div',
      { class: 'card trend-streak' },
      h('span', { class: 'big' }, String(streak(plans, todayKey))),
      h('span', null, '天连续打卡'),
    ),
    h(
      'section',
      { class: 'trend-radar' },
      h('h2', null, `能力雷达（近 ${RADAR_WINDOW} 次训练均值）`),
      radarChart(axes),
      legend,
    ),
    h(
      'section',
      { class: 'trend-curve' },
      h('h2', null, `能力曲线（近 ${TREND_DAYS} 天）`),
      select,
      curveHost,
    ),
    h(
      'section',
      { class: 'trend-calendar' },
      h('h2', null, `打卡日历（近 ${CALENDAR_CELLS / 7} 周）`),
      calendarGrid(cells),
    ),
  );
}
