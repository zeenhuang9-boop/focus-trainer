import type { Fx, GameView, InputEvent } from '../../core/types';
import type { SeqmemSnapshot } from './engine';

// 顶部提示行：所有措辞只由快照决定，视图不持有任何时间/相位游标（裁定 R-1）。
function infoText(s: SeqmemSnapshot): string {
  if (s.phase === 'done') return `本轮结束 · 答对 ${s.correct} 条`;
  if (s.phase === 'replay') return '正确顺序回放 · 看清它';
  if (s.phase === 'reveal') {
    return s.wrongIndex === null
      ? `第 ${s.span} 格对了 · 下一条更长`
      : `点错了 · 本轮结束（答对 ${s.correct} 条）`;
  }
  if (s.phase === 'recall') return `${s.dir === 'fwd' ? '按原顺序' : '倒着'}点回 ${s.span} 格 · 已点 ${s.tapped.length}`;
  return `记住顺序 · 第 ${s.spanNo} 条 · ${s.span} 格`; // idle / show
}

export function createSeqmemView(
  host: HTMLElement,
  emit: (e: InputEvent) => void,
  fx?: Fx,
): GameView<SeqmemSnapshot> {
  const root = document.createElement('div');
  root.className = 'seqmem';
  const info = document.createElement('div');
  info.className = 'seqmem-info';
  const grid = document.createElement('div');
  grid.className = 'seqmem-grid';
  root.append(info, grid);
  host.append(root);

  let layoutCells = 0;
  let buttons: HTMLButtonElement[] = [];
  let prevPhase: SeqmemSnapshot['phase'] | null = null;

  const onDown = (ev: PointerEvent): void => {
    const hit = ev.target instanceof Element ? ev.target.closest('button[data-i]') : null;
    if (!(hit instanceof HTMLButtonElement)) return;
    ev.preventDefault();
    emit({ kind: 'cell', index: Number(hit.dataset.i), t: ev.timeStamp });
  };
  grid.addEventListener('pointerdown', onDown);

  return {
    render(s) {
      // cells = size²，档位变了才重建；同一档内复用节点，只切 class（每帧都要 render）
      if (s.cells !== layoutCells) {
        layoutCells = s.cells;
        grid.style.gridTemplateColumns = `repeat(${s.size}, 1fr)`;
        buttons = Array.from({ length: s.cells }, (_, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'seqmem-cell';
          b.dataset.i = String(i);
          b.textContent = String(i + 1);
          return b;
        });
        grid.replaceChildren(...buttons);
      }
      const picked = new Set(s.tapped);
      buttons.forEach((b, i) => {
        // done 之后 SessionRunner 停止喂帧，lit/wrong 只能靠 !s.done 兜住，否则会挂到用户点「继续」
        b.classList.toggle('lit', s.litIndex === i && !s.done);
        b.classList.toggle('wrong', s.wrongIndex === i && !s.done);
        b.classList.toggle('picked', picked.has(i));
      });
      info.textContent = infoText(s);
      if (s.phase === 'reveal' && prevPhase !== 'reveal') {
        if (s.wrongIndex === null) fx?.hit();
        else fx?.miss();
      }
      prevPhase = s.phase;
    },
    destroy() {
      grid.removeEventListener('pointerdown', onDown);
      root.remove();
    },
  };
}
