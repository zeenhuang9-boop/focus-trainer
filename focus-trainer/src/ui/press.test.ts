import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_MS, attachPressDwell } from './press';

class El {
  readonly classes = new Set<string>();
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; remove(c: string): void; contains(c: string): boolean } {
    const classes = this.classes;
    return {
      add: (c) => void classes.add(c),
      remove: (c) => void classes.delete(c),
      contains: (c) => classes.has(c),
    };
  }

  closest(sel: string): El | null {
    // press.ts 的选择器是 A7 定的 'button, .mot-dot'；桩按逗号拆开逐条匹配。
    const parts = sel.split(',').map((s) => s.trim());
    return parts.some((p) => (p.startsWith('.') ? this.classes.has(p.slice(1)) : p === this.tag)) ? this : null;
  }

  addEventListener(type: string, fn: (ev: never) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: never) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  fire(type: string, ev: Record<string, unknown>): void {
    for (const h of this.handlers.filter((x) => x.type === type)) (h.fn as (e: unknown) => void)(ev);
  }
}

function stubDom(): void {
  vi.stubGlobal('Element', El);
  vi.stubGlobal('HTMLElement', El);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('attachPressDwell', () => {
  it('按下加 .is-pressed，满 90ms 才摘掉', () => {
    stubDom();
    vi.useFakeTimers();
    const root = new El('div');
    const btn = new El('button');
    const detach = attachPressDwell(root as unknown as HTMLElement);
    root.fire('pointerdown', { target: btn });
    expect(btn.classes.has('is-pressed')).toBe(true);
    vi.advanceTimersByTime(PRESS_MS - 1);
    expect(btn.classes.has('is-pressed')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(btn.classes.has('is-pressed')).toBe(false);
    detach();
  });

  it('非按钮目标不加类；MOT 的 .mot-dot 也算触控目标', () => {
    stubDom();
    const root = new El('div');
    const plain = new El('div');
    const detach = attachPressDwell(root as unknown as HTMLElement);
    root.fire('pointerdown', { target: plain });
    expect(plain.classes.size).toBe(0);
    const dot = new El('div');
    dot.classes.add('mot-dot');
    root.fire('pointerdown', { target: dot });
    expect(dot.classes.has('is-pressed')).toBe(true);
    detach();
  });

  it('卸载后清掉未到期的计时器，不再回调', () => {
    stubDom();
    vi.useFakeTimers();
    const root = new El('div');
    const btn = new El('button');
    const detach = attachPressDwell(root as unknown as HTMLElement);
    root.fire('pointerdown', { target: btn });
    detach();
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
