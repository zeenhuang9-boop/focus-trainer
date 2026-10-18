import type { GameView, InputEvent } from '../../core/types';
import type { SchulteSnapshot } from './engine';

const TINT_COLORS = ['#2b3a4a', '#3a2b4a', '#2b4a3a', '#4a3a2b'];

export function createSchulteView(host: HTMLElement, emit: (e: InputEvent) => void): GameView<SchulteSnapshot> {
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

  const onDown = (ev: PointerEvent): void => {
    const hit = ev.target instanceof Element ? ev.target.closest('button[data-i]') : null;
    if (!(hit instanceof HTMLButtonElement)) return;
    ev.preventDefault();
    emit({ kind: 'cell', index: Number(hit.dataset.i), t: ev.timeStamp });
  };
  grid.addEventListener('pointerdown', onDown);

  return {
    render(s) {
      const key = s.cells.map((c) => c.label).join(',');
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
        buttons[i].classList.toggle('flash', s.flashIndex === i);
      });
      info.textContent = `下一个 ${s.nextLabel ?? '—'}　用时 ${(s.elapsedMs / 1000).toFixed(1)} 秒　误点 ${s.errors}`;
    },
    destroy() {
      grid.removeEventListener('pointerdown', onDown);
      root.remove();
    },
  };
}
