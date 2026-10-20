import { createRng, shuffle } from '../../core/rng';
import { nextPending, streak } from '../../core/scheduler';
import type { GameId, Mode } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';
import { ensureTodayPlan } from '../today';

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

// 招牌方格的规格：5×5、按 1→25 顺序点。它是首页控件而不是训练网格，
// 所以走独立类名 .warmup-grid/.warmup-cell，绝不复用 .schulte-grid ——
// 后者那套「1px gap + 满宽出血」的算式是给 7×7 的 48px 触控下限用的，套进卡片内边距就失效。
export const WARMUP_SIZE = 5;
export const WARMUP_CELLS = WARMUP_SIZE * WARMUP_SIZE;
// 点满后的整面填充时长，也是跳转前的延迟；reduced-motion 只把视觉过渡降到 0ms，延迟照旧
const FILL_MS = 200;

function dateLine(now: number): string {
  const d = new Date(now);
  return `${WEEKDAYS[d.getDay()]} · ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/**
 * 活体舒尔特：真的可点的 5×5，点满 25 格就把人送进今日第一项未练的游戏。
 * 点错只抖一下（不惩罚、不改数字、不计数），因为它是入口和视觉主角，不是第二个测试。
 * 两个定时器都挂在 signal 上：换页 abort 后不许再有回调去改已拆掉的节点或再跳一次路由。
 */
function buildWarmup(onComplete: () => void, signal: AbortSignal): HTMLElement {
  // 种子只取时钟：唤醒格不需要可复现，用 core/rng 的 shuffle 是为了和五个游戏同一条随机通路
  const labels = shuffle(createRng(Date.now() >>> 0), Array.from({ length: WARMUP_CELLS }, (_, i) => i + 1));
  const hint = h('div', { class: 'warmup-hint' }, `按 1→${WARMUP_CELLS} 点满，进入今日第一项`);
  const grid = h('div', { class: 'warmup-grid' });
  const root = h('div', { class: 'warmup' }, h('div', { class: 'warmup-head' }, h('span', { class: 'eyebrow' }, 'warm-up'), hint), grid);

  const cells = labels.map((value) => {
    const cell = h('button', { class: 'warmup-cell', type: 'button' }, String(value));
    cell.addEventListener('click', () => tap(value, cell));
    return cell;
  });
  grid.replaceChildren(...cells);

  // @types/node 顺着 @capacitor/cli 进了这个工程，setTimeout 的返回类型是 Timeout 而不是 number，
  // 所以这里用 ReturnType 取，别写死 number。
  const timers: ReturnType<typeof setTimeout>[] = [];
  let next = 1;
  let filled = false;

  function tap(value: number, cell: HTMLButtonElement): void {
    if (filled) return;
    if (value !== next) {
      cell.classList.toggle('shake', true);
      timers.push(
        setTimeout(() => {
          cell.classList.toggle('shake', false);
        }, FILL_MS),
      );
      return;
    }
    cell.classList.toggle('done', true);
    next += 1;
    if (next <= WARMUP_CELLS) {
      hint.textContent = `下一个 ${next}`;
      return;
    }
    filled = true;
    root.classList.toggle('filled', true);
    hint.textContent = '整面填充 → 开始今日第一项';
    timers.push(setTimeout(onComplete, FILL_MS));
  }

  signal.addEventListener(
    'abort',
    () => {
      for (const id of timers) clearTimeout(id);
      timers.length = 0;
    },
    { once: true },
  );
  return root;
}

export async function renderHome(view: HTMLElement, ctx: AppContext, signal: AbortSignal, now = Date.now()): Promise<void> {
  const plan = await ensureTodayPlan(ctx.repo, GAMES.map((g) => g.id), ctx.settings.dayStartHour, now);
  const [plans, states] = await Promise.all([ctx.repo.listPlans(), ctx.repo.listGameStates()]);
  if (signal.aborted) return;
  const levelOf = new Map(states.map((s) => [s.gameId, s.level]));
  const pending = nextPending(plan);

  // 行：眉标是游戏的拉丁 id（就是路由名，点进去 URL 与标签一致），中文名在下，档位是读数
  const row = (gameId: GameId, mode: Mode, done: boolean): HTMLElement => {
    const game = getGame(gameId);
    return h(
      'div',
      { class: done ? 'plan-row done' : 'plan-row' },
      h(
        'div',
        { class: 'plan-main' },
        h('span', { class: 'eyebrow' }, gameId),
        h('span', { class: 'plan-name' }, game?.name ?? gameId),
      ),
      h('span', { class: 'spacer' }),
      h('span', { class: 'plan-meta' }, `第 ${levelOf.get(gameId) ?? 1} 档`),
      done ? h('span', { class: 'plan-mark' }, '✓') : null,
      h('button', { onclick: () => navigate({ name: 'play', gameId, mode }) }, '去练'),
    );
  };

  const planRows = plan.games.map((id) => row(id, 'plan', plan.completed.includes(id)));

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

  const warmup = buildWarmup(() => {
    // 首页被换成别的页面（abort）之后这个回调不该再跳第二次
    if (signal.aborted || pending === null) return;
    navigate({ name: 'play', gameId: pending, mode: 'plan' });
  }, signal);

  view.replaceChildren(
    h(
      'div',
      { class: 'row' },
      h('h1', null, '专注力训练'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'home-date' }, dateLine(now)),
    ),
    h('div', { class: 'home-streak' }, h('span', { class: 'big' }, String(streak(plans, plan.dayKey))), h('span', { class: 'tail' }, '天连续打卡')),
    warmup,
    h('div', { class: 'section-head' }, h('span', { class: 'eyebrow' }, 'today'), h('h2', null, '今日计划')),
    h('div', { class: 'list' }, ...planRows),
    start,
  );
}
