import { SessionRunner, type SessionSnapshot } from '../../core/session';
import type { GameId, GameModule, Mode, Outcome } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import { EXIT_CONFIRM } from '../back-rule';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';
import { saveFinishedSession } from '../today';

const COUNTDOWN_MS = 3000;

function outcomeLabel(o: Outcome): string {
  return o === 'pass' ? '通过' : o === 'fail' ? '未通过' : '保持';
}

function breakText(s: SessionSnapshot): string {
  if (s.lastInvalid) return `画面卡顿，本轮不计分\n再来一轮（第 ${s.roundNo} / ${s.roundsTotal} 轮）`;
  const dir =
    s.lastLevelChange > 0
      ? `↑ 升到第 ${s.level} 档`
      : s.lastLevelChange < 0
        ? `↓ 降到第 ${s.level} 档`
        : `→ 保持第 ${s.level} 档`;
  return `${outcomeLabel(s.lastOutcome ?? 'hold')}\n${dir}`;
}

export async function renderPlay(
  view: HTMLElement,
  ctx: AppContext,
  gameId: GameId,
  mode: Mode,
  signal: AbortSignal,
): Promise<void> {
  const mod = getGame(gameId);
  if (!mod) {
    navigate({ name: 'home' }, true);
    return;
  }
  // 判空必须早于取状态。TS 不保留「提升的函数声明」里的窄化（showIntro 里会退回
  // GameModule | undefined），所以在这里一次性固定成非空类型，闭包统一用 game。
  const game: GameModule = mod;
  const state = await ctx.repo.getGameState(gameId);
  if (signal.aborted) return;

  // Date.now() 只用于种子与记录时间；轮内计时全用帧时间戳
  const startedAt = Date.now();
  const runner = new SessionRunner(game, state, mode, startedAt, startedAt);
  const countdownEl = h('div', { class: 'countdown' }, String(Math.ceil(COUNTDOWN_MS / 1000)));

  let ui: 'intro' | 'countdown' | 'starting' | 'running' | 'paused' | 'saving' = 'intro';
  let countdownEnd = 0;
  let raf = 0;

  const roundEl = h('span', { class: 'muted' });
  const levelEl = h('span', { class: 'muted' });
  const stageGame = h('div', { class: 'stage-game' });
  const overlay = h('div', { class: 'overlay' });
  const quitBtn = h(
    'button',
    {
      onclick: () => {
        if (ui === 'intro') {
          navigate({ name: 'home' });
          return;
        }
        if (confirm(EXIT_CONFIRM)) navigate({ name: 'home' });
      },
    },
    '退出',
  );
  view.replaceChildren(
    h(
      'div',
      { class: 'play-top' },
      h('span', null, game.name),
      roundEl,
      levelEl,
      h('span', { class: 'spacer' }),
      quitBtn,
    ),
    h('div', { class: 'stage' }, stageGame, overlay),
  );

  const gameView = game.createView(stageGame, (e) => runner.input(e));

  function overlayShow(...nodes: HTMLElement[]): void {
    overlay.hidden = false;
    overlay.replaceChildren(...nodes);
  }

  function overlayHide(): void {
    overlay.hidden = true;
  }

  function primary(label: string, onclick: () => void): HTMLElement {
    return h('button', { class: 'primary', onclick }, label);
  }

  function sync(s: SessionSnapshot): void {
    roundEl.textContent = `第 ${s.roundNo} / ${s.roundsTotal} 轮`;
    levelEl.textContent = `第 ${s.level} 档`;
  }

  function showIntro(): void {
    ui = 'intro';
    const s = runner.snapshot();
    overlayShow(
      h('h2', null, game.name),
      h('div', { class: 'muted' }, game.instructions),
      h('div', null, `当前第 ${s.level} 档　共 ${s.roundsTotal} 轮`),
      primary('开始', startCountdown),
    );
  }

  function startCountdown(): void {
    ui = 'countdown';
    countdownEnd = performance.now() + COUNTDOWN_MS;
    countdownEl.textContent = String(Math.ceil(COUNTDOWN_MS / 1000));
    overlayShow(countdownEl);
  }

  function resume(): void {
    ui = 'starting';
    overlayHide();
  }

  function showBreak(s: SessionSnapshot): void {
    if (s.phase === 'voided') {
      overlayShow(h('div', { class: 'overlay-msg' }, '本轮已作废，点击继续'), primary('继续', resume));
      return;
    }
    overlayShow(h('div', { class: 'overlay-msg' }, breakText(s)), primary('继续', resume));
  }

  function saveAndGo(): void {
    ui = 'saving';
    overlayShow(h('div', null, '正在保存…'));
    saveFinishedSession(ctx.repo, GAMES.map((g) => g.id), ctx.settings.dayStartHour, runner).then(
      ({ id }) => navigate({ name: 'result', sessionId: id }, true),
      (err: unknown) => {
        overlayShow(
          h('div', null, `保存失败：${String(err)}`),
          primary('回首页', () => navigate({ name: 'home' })),
        );
      },
    );
  }

  function frame(now: number): void {
    if (ui === 'countdown') {
      const left = Math.ceil((countdownEnd - now) / 1000);
      if (left <= 0) {
        ui = 'starting';
      } else if (countdownEl.textContent !== String(left)) {
        countdownEl.textContent = String(left);
      }
    } else if (ui === 'starting') {
      ui = 'running';
      runner.beginRound(now);
      overlayHide();
    } else if (ui === 'running') {
      runner.tick(now);
      gameView.render(runner.engine.snapshot());
      const s = runner.snapshot();
      sync(s);
      if (s.phase === 'finished') {
        saveAndGo();
        return;
      }
      if (s.phase === 'between' && !s.waitingForTap) {
        // roundBreak === 'auto' 的 600ms 间隔：浮层不出现，继续跑帧让 tick 自动开下一轮
        overlayHide();
      } else if (s.phase !== 'playing') {
        ui = 'paused';
        showBreak(s);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function onVisibility(): void {
    if (document.visibilityState === 'visible' || signal.aborted) return;
    if (ui === 'countdown' || ui === 'starting') {
      // 这一轮还没真正开始，退回说明层重走倒计时
      showIntro();
      return;
    }
    if (ui !== 'running') return;
    runner.voidCurrentRound();
    ui = 'paused';
    showBreak(runner.snapshot());
  }

  document.addEventListener('visibilitychange', onVisibility, { signal });
  signal.addEventListener(
    'abort',
    () => {
      cancelAnimationFrame(raf);
      gameView.destroy();
    },
    { once: true },
  );

  sync(runner.snapshot());
  showIntro();
  raf = requestAnimationFrame(frame);
}
