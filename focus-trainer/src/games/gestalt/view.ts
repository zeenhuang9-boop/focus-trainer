import type { GameView, InputEvent } from '../../core/types';
import type { GestaltChoiceView, GestaltSnapshot } from './engine';
import type { FigureStroke, Pt } from './figures';
import type { Segment } from './fragment';

/** 本项目唯一允许的 URL 字面量：M4 的 APK 审计只放行 w3.org。 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

const VIEW_BOX = '-1.15 -1.15 2.3 2.3';

const f = (n: number): string => n.toFixed(3);

/** 图形坐标 y 轴向上、SVG 向下，这里统一取反；闭合笔补回首点。 */
export function pointsAttr(pts: readonly Pt[], closed: boolean): string {
  const loop = closed ? [...pts, pts[0]] : pts;
  return loop.map((p) => `${f(p[0])},${f(-p[1])}`).join(' ');
}

export function segmentPoints(s: Segment): string {
  return `${f(s.a[0])},${f(-s.a[1])} ${f(s.b[0])},${f(-s.b[1])}`;
}

function svg(children: SVGElement[]): SVGElement {
  const el = document.createElementNS(SVG_NS, 'svg') as unknown as SVGElement;
  el.setAttribute('viewBox', VIEW_BOX);
  el.setAttribute('class', 'gestalt-svg');
  el.append(...(children as unknown as Node[]));
  return el;
}

function polyline(points: string): SVGElement {
  const el = document.createElementNS(SVG_NS, 'polyline') as unknown as SVGElement;
  el.setAttribute('points', points);
  el.setAttribute('class', 'gestalt-seg');
  return el;
}

function figureSvg(c: GestaltChoiceView): SVGElement {
  return svg(c.strokes.map((s: FigureStroke) => polyline(pointsAttr(s.pts, s.closed))));
}

export function createGestaltView(host: HTMLElement, emit: (e: InputEvent) => void): GameView<GestaltSnapshot> {
  const root = document.createElement('div');
  root.className = 'gestalt';
  const info = document.createElement('div');
  info.className = 'gestalt-info';
  const stage = document.createElement('div');
  stage.className = 'gestalt-stage';
  root.append(info, stage);
  host.append(root);

  let layoutKey = '';
  let buttons: HTMLElement[] = [];

  const onDown = (ev: PointerEvent): void => {
    const hit = ev.target instanceof Element ? ev.target.closest('button[data-i]') : null;
    if (!(hit instanceof HTMLButtonElement)) return;
    ev.preventDefault();
    emit({ kind: 'choice', index: Number(hit.dataset.i), t: ev.timeStamp });
  };
  stage.addEventListener('pointerdown', onDown);

  const build = (s: GestaltSnapshot): void => {
    if (s.choices.length > 0) {
      buttons = s.choices.map((c, i) => {
        const b = document.createElement('button') as unknown as HTMLElement;
        b.className = 'gestalt-choice';
        b.dataset.i = String(i);
        b.append(figureSvg(c) as unknown as Node);
        return b;
      });
      stage.replaceChildren(...(buttons as unknown as Node[]));
      return;
    }
    buttons = [];
    if (s.fragments.length > 0) {
      stage.replaceChildren(svg(s.fragments.map((g) => polyline(segmentPoints(g)))) as unknown as Node);
    } else if (s.mask.length > 0) {
      stage.replaceChildren(svg(s.mask.map((g) => polyline(segmentPoints(g)))) as unknown as Node);
    } else {
      const mark = document.createElement('div');
      mark.className = 'gestalt-fixation';
      mark.textContent = '+';
      stage.replaceChildren(mark);
    }
  };

  return {
    render(s) {
      // 键含阶段桶 + 内容长度 + 选项 id：布局相关阶段一变就整体重建，杜绝「暴露期碎片残留进作答期」。
      // answer/feedback/done 归同一桶：反馈只改 class 不重建（少重建一次就闪一次，且测试持有按钮引用）。
      const bucket = s.phase === 'feedback' || s.phase === 'done' ? 'answer' : s.phase;
      const key = `${bucket}|${s.fragments.length}|${s.mask.length}|${s.choices.map((c) => c.id).join(',')}`;
      if (key !== layoutKey) {
        layoutKey = key;
        build(s);
      }
      if (s.choices.length > 0 && (s.phase === 'feedback' || s.phase === 'done')) {
        buttons.forEach((b, i) => {
          b.classList.toggle('right', s.correctIndex === i);
          b.classList.toggle('wrong', s.answeredIndex === i && s.correctIndex !== i);
        });
      }
      info.textContent =
        s.phase === 'answer'
          ? '选出刚才看到的图形'
          : s.phase === 'feedback' || s.phase === 'done'
            ? `反应 ${(s.rtMs / 1000).toFixed(2)} 秒`
            : ' ';
    },
    destroy() {
      stage.removeEventListener('pointerdown', onDown);
      root.remove();
    },
  };
}
