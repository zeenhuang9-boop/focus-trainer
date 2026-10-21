// focus-trainer/src/games/mot/view.ts
import type { Fx, GameView, InputEvent } from '../../core/types';
import type { MotSnapshot } from './engine';

const FIELD_CLASS = 'mot-field';

export function createMotView(host: HTMLElement, emit: (e: InputEvent) => void, fx?: Fx): GameView<MotSnapshot> {
  const root = document.createElement('div');
  root.className = 'mot';
  const info = document.createElement('div');
  info.className = 'mot-info';
  const field = document.createElement('div');
  field.className = FIELD_CLASS;
  root.append(info, field);
  host.append(root);

  // 只在点数变化时重建：每帧 replaceChildren 会打断 transform 的合成层连续性（点会抖），
  // 并把 16 个节点的创建摊到每秒 60 帧上。
  let dots: HTMLElement[] = [];
  let prevPhase: MotSnapshot['phase'] | null = null;

  const onDown = (ev: PointerEvent): void => {
    const rect = field.getBoundingClientRect();
    // 边长 0 = 场地还没布局（或父级 display:none）。除以 0 得到 Infinity/NaN，
    // 它会一路进 hitTest 并静默判空。这是几何守卫，与时钟契约禁的「负值/NaN 钳制」无关。
    if (!(rect.width > 0) || !(rect.height > 0)) return;
    ev.preventDefault();
    emit({
      kind: 'point',
      x: (ev.clientX - rect.left) / rect.width,
      y: (ev.clientY - rect.top) / rect.height,
      // 与 rAF 同域；engine 的 startAt / submitAt 都吃它，视图自身绝不 Date.now()。
      t: ev.timeStamp,
    });
  };
  field.addEventListener('pointerdown', onDown);

  const infoText = (s: MotSnapshot): string => {
    // 唯一允许钳 0 的地方：显示量。判分路径上的时间（engine 的 remainMs / answerMs）都是原始差值。
    const remain = Math.max(0, s.remainMs) / 1000;
    if (s.phase === 'prompt') return `盯住 ${s.k} 个橙色点　${remain.toFixed(1)} 秒`;
    if (s.phase === 'motion') return `追踪目标　剩余 ${remain.toFixed(1)} 秒`;
    if (s.phase === 'answer') return `点出 ${s.k} 个目标　已选 ${s.selectedCount}`;
    return `命中 ${s.dots.filter((d) => d.mark === 'hit').length} / ${s.k}`;
  };

  return {
    render(s) {
      if (s.dots.length !== dots.length) {
        dots = s.dots.map(() => {
          const el = document.createElement('div');
          el.className = 'mot-dot';
          return el;
        });
        field.replaceChildren(...dots);
      }
      const side = field.getBoundingClientRect().width;
      const phaseClass = `${FIELD_CLASS} ${s.phase}`;
      // 只在相位变化时刷 class（避免每秒 60 次重刷同一字符串）；class 集合本身在桩与浏览器里
      // 都由这一次赋值整体替换，prompt/motion 不会并存。
      if (field.className !== phaseClass) field.className = phaseClass;
      s.dots.forEach((d, i) => {
        const el = dots[i];
        // class 逐次重算：换轮/换相位复用节点时不能残留上一轮的 hit/wrong/missed/sel/target
        const cls = ['mot-dot'];
        if (d.target) cls.push('target');
        if (d.selected) cls.push('sel');
        if (d.mark !== 'none') cls.push(d.mark);
        el.className = cls.join(' ');
        el.style.transform = `translate3d(${d.x * side}px, ${d.y * side}px, 0)`;
      });
      info.textContent = infoText(s);
      if (s.phase === 'feedback' && prevPhase !== 'feedback') {
        const hits = s.dots.filter((d) => d.mark === 'hit').length;
        const misses = s.dots.filter((d) => d.mark === 'wrong' || d.mark === 'missed').length;
        if (misses > 0) fx?.miss();
        else if (hits > 0) fx?.hit();
      }
      prevPhase = s.phase;
    },
    destroy() {
      field.removeEventListener('pointerdown', onDown);
      root.remove();
      dots = [];
    },
  };
}
