import type { GameView, InputEvent } from '../../core/types';
import type { StroopSnapshot } from './engine';
import { STROOP_COLORS, WHITE_TEXT } from './rules';

export function createStroopView(host: HTMLElement, emit: (e: InputEvent) => void): GameView<StroopSnapshot> {
  const root = document.createElement('div');
  root.className = 'stroop';
  const rule = document.createElement('div');
  rule.className = 'stroop-rule';
  const word = document.createElement('div');
  word.className = 'stroop-word';
  const options = document.createElement('div');
  options.className = 'stroop-options';
  const info = document.createElement('div');
  info.className = 'stroop-info';
  root.append(rule, word, options, info);
  host.append(root);

  let layoutKey = '';
  let buttons: HTMLButtonElement[] = [];

  const onDown = (ev: PointerEvent): void => {
    const hit = ev.target instanceof Element ? ev.target.closest('button[data-i]') : null;
    if (!(hit instanceof HTMLButtonElement)) return;
    ev.preventDefault();
    emit({ kind: 'choice', index: Number(hit.dataset.i), t: ev.timeStamp });
  };
  options.addEventListener('pointerdown', onDown);

  return {
    render(s) {
      rule.textContent = s.rule === 'color' ? '按颜色' : '按字义';
      word.textContent = s.word === null ? '＋' : STROOP_COLORS[s.word].name;
      word.style.setProperty('--ink', s.ink === null ? WHITE_TEXT : STROOP_COLORS[s.ink].css);

      // 键必须同时含按钮顺序与文字墨色：按钮标签每轮固定（只由调色板决定），
      // 只用标签做键的话第 9/10 档的干扰色文字就不会刷新。
      const key = `${s.options.map((o) => o.colorIdx).join(',')}|${s.options.map((o) => o.textInk ?? '').join(',')}`;
      if (key !== layoutKey) {
        layoutKey = key;
        buttons = s.options.map((o, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'stroop-choice';
          b.dataset.i = String(i);
          b.textContent = o.label;
          return b;
        });
        options.replaceChildren(...buttons);
      }
      s.options.forEach((o, i) => {
        buttons[i].style.setProperty('--ink', o.textInk === null ? WHITE_TEXT : STROOP_COLORS[o.textInk].css);
        // 类名逐次重算：反馈只在 200ms 内出现，复用节点时不能残留上一次的 right/wrong
        buttons[i].classList.toggle('right', s.feedbackChoice === i && s.feedbackOk);
        buttons[i].classList.toggle('wrong', s.feedbackChoice === i && !s.feedbackOk);
        buttons[i].classList.toggle('locked', s.phase === 'fixation');
      });
      info.textContent = `第 ${s.trialNo}/${s.trialsTotal} 试次　正确 ${s.correctCount}　超时 ${s.timeoutCount}`;
    },
    destroy() {
      options.removeEventListener('pointerdown', onDown);
      root.remove();
    },
  };
}
