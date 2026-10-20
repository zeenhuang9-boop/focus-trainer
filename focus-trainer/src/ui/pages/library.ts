import type { GameId } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

/**
 * 训练库：把「今天没排上但想练」的五款收在一页里。
 * 行的语法与首页的今日计划完全一致（眉标 id + 中文名 + 档位读数 + 去练），
 * 只多一行 ability —— 它既是这页的「练什么」，也是趋势页雷达图那五根轴的名字。
 */
export async function renderLibrary(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  const states = await ctx.repo.listGameStates();
  if (signal.aborted) return;
  const levelOf = new Map(states.map((s) => [s.gameId, s.level]));

  const row = (gameId: GameId): HTMLElement => {
    const game = getGame(gameId);
    return h(
      'div',
      { class: 'plan-row' },
      h(
        'div',
        { class: 'plan-main' },
        h('span', { class: 'eyebrow' }, gameId),
        h('span', { class: 'plan-name' }, game?.name ?? gameId),
        h('span', { class: 'plan-ability' }, `练${game?.ability ?? ''}`),
      ),
      h('span', { class: 'spacer' }),
      h('span', { class: 'plan-meta' }, `第 ${levelOf.get(gameId) ?? 1} 档`),
      h('button', { onclick: () => navigate({ name: 'play', gameId, mode: 'free' }) }, '去练'),
    );
  };

  view.replaceChildren(
    h('div', { class: 'row' }, h('h1', null, '训练库'), h('span', { class: 'spacer' }), h('span', { class: 'home-date' }, `${GAMES.length} 款`)),
    h(
      'div',
      { class: 'section-head' },
      h('span', { class: 'eyebrow' }, 'library'),
      h('h2', null, '想练哪个就点哪个'),
    ),
    h('div', { class: 'list' }, ...GAMES.map((g) => row(g.id))),
  );
}
