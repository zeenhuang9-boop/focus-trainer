export const PRESS_MS = 90;

/** 五个游戏里四个的输入是 <button>；MOT 的输入面是 .mot-dot（div）。 */
const PRESS_SELECTOR = 'button, .mot-dot';

// 极快的点按在视觉上只有一帧，和「没点到」分不清。按下态至少驻留 PRESS_MS，
// 让每一次有效输入都留下一次可见的压下-回弹；到点后由计时器摘除，不依赖 pointerup。
export function attachPressDwell(root: HTMLElement, ms = PRESS_MS): () => void {
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  const onDown = (ev: PointerEvent): void => {
    const target = ev.target instanceof Element ? ev.target.closest(PRESS_SELECTOR) : null;
    if (!(target instanceof HTMLElement)) return;
    target.classList.add('is-pressed');
    const old = timers.get(target);
    if (old !== undefined) clearTimeout(old);
    timers.set(
      target,
      setTimeout(() => {
        timers.delete(target);
        target.classList.remove('is-pressed');
      }, ms),
    );
  };

  root.addEventListener('pointerdown', onDown);
  return () => {
    root.removeEventListener('pointerdown', onDown);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}
