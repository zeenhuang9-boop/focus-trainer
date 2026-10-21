import type { Fx, GameView, InputEvent } from '../../core/types';
import type { SchulteSnapshot } from './engine';

// 导出只为让 view.test.ts 能把「调色板长度 === TINTS」这条耦合钉住：engine.ts 用
// randInt(rng, 0, TINTS - 1) 生成 tint 下标，这里按下标取色。两处各自硬编码时，任一方改动
// 会让 setProperty('--tint', undefined) 静默 no-op —— 格子掉回默认底色，无类型错误、无异常、测试全绿。
export const TINT_COLORS = ['#2b3a4a', '#3a2b4a', '#2b4a3a', '#4a3a2b'];

export function createSchulteView(
  host: HTMLElement,
  emit: (e: InputEvent) => void,
  fx?: Fx,
): GameView<SchulteSnapshot> {
  const root = document.createElement('div');
  root.className = 'schulte';
  const info = document.createElement('div');
  info.className = 'schulte-info';
  const grid = document.createElement('div');
  grid.className = 'schulte-grid';
  root.append(info, grid);
  host.append(root);

  let layoutKey = '';
  let buttons: HTMLButtonElement[] = [];
  let prevDone = -1;
  let prevErrors = -1;

  const onDown = (ev: PointerEvent): void => {
    const hit = ev.target instanceof Element ? ev.target.closest('button[data-i]') : null;
    if (!(hit instanceof HTMLButtonElement)) return;
    ev.preventDefault();
    emit({ kind: 'cell', index: Number(hit.dataset.i), t: ev.timeStamp });
  };
  grid.addEventListener('pointerdown', onDown);

  return {
    render(s) {
      // 键必须含 size 与 tint：作废重开是同档位 + 新 seed（session.ts 用 seed + attempt），
      // 同档布局数有限，有一定概率撞出相同排列；只比标签会跳过重建，上一轮的 --tint 底色就残留下来。
      const key = `${s.size}|${s.cells.map((c) => c.label).join(',')}|${s.cells.map((c) => c.tint ?? '').join(',')}`;
      if (key !== layoutKey) {
        layoutKey = key;
        grid.style.gridTemplateColumns = `repeat(${s.size}, 1fr)`;
        buttons = s.cells.map((c, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'schulte-cell';
          b.dataset.i = String(i);
          b.textContent = c.label;
          if (c.tint !== null) b.style.setProperty('--tint', TINT_COLORS[c.tint]);
          return b;
        });
        grid.replaceChildren(...buttons);
      }
      s.cells.forEach((c, i) => {
        buttons[i].classList.toggle('done', c.done);
        // flashIndex 只由 tick 清除，而 SessionRunner 在 isDone() 后停止喂帧；
        // 最后一格若是误点，那格会红到用户点「继续」为止（评审 M-4）。
        buttons[i].classList.toggle('flash', s.flashIndex === i && !s.done);
      });
      // 上升沿：每帧 render 只在这一格新完成或误点计数增加时触发一次反馈。
      const doneCount = s.cells.filter((c) => c.done).length;
      if (prevDone >= 0) {
        if (s.errors > prevErrors) fx?.miss();
        else if (doneCount > prevDone) fx?.hit();
      }
      prevDone = doneCount;
      prevErrors = s.errors;
      info.textContent = `下一个 ${s.nextLabel ?? '—'}　用时 ${(s.elapsedMs / 1000).toFixed(1)} 秒　误点 ${s.errors}`;
    },
    destroy() {
      grid.removeEventListener('pointerdown', onDown);
      root.remove();
    },
  };
}
