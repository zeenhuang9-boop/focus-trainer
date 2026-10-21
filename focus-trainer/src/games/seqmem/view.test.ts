import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fx, GameView, InputEvent } from '../../core/types';
import type { SeqmemSnapshot } from './engine';
import { createSeqmemView } from './view';

// node 环境没有 DOM，这里手写 view.ts 用到的那一小撮 API 的最小桩：createElement / append /
// replaceChildren / add|removeEventListener / classList / dataset / textContent / remove / closest。
// 目的不是模拟浏览器，而是让「emit 必带 timeStamp」「残留清除」「destroy 摘监听」在 CI 里有守卫；
// 手感与真实事件时间戳仍由浏览器验收负责。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly style = { gridTemplateColumns: '' };
  textContent = '';
  parent: StubEl | null = null;
  removed = false;
  private readonly handlers: Array<{ type: string; fn: (ev: unknown) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; contains(c: string): boolean; toggle(c: string, on: boolean): boolean } {
    const classes = this.classes;
    return {
      add: (c: string) => {
        classes.add(c);
      },
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on: boolean) => {
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    };
  }

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  append(...els: StubEl[]): void {
    for (const e of els) {
      e.parent = this;
      this.children.push(e);
    }
  }

  replaceChildren(...els: StubEl[]): void {
    this.children.length = 0;
    this.append(...els);
  }

  remove(): void {
    this.removed = true;
    const p = this.parent;
    if (p) p.children.splice(p.children.indexOf(this), 1);
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  closest(selector: string): StubEl | null {
    return selector === 'button[data-i]' && this.tag === 'button' && this.dataset.i !== undefined ? this : null;
  }

  fire(type: string, ev: Record<string, unknown>): { defaultPrevented: boolean } {
    const state = { defaultPrevented: false };
    for (const h of this.handlers.filter((x) => x.type === type)) {
      h.fn({ ...ev, preventDefault: () => void (state.defaultPrevented = true) });
    }
    return state;
  }

  handlerCount(type: string): number {
    return this.handlers.filter((h) => h.type === type).length;
  }
}

class StubButton extends StubEl {}

function installDom(): void {
  vi.stubGlobal('Element', StubEl);
  vi.stubGlobal('HTMLButtonElement', StubButton);
  vi.stubGlobal('document', {
    createElement: (tag: string) => (tag === 'button' ? new StubButton(tag) : new StubEl(tag)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const snap = (over: Partial<SeqmemSnapshot> = {}): SeqmemSnapshot => ({
  size: 3,
  cells: 9,
  phase: 'show',
  dir: 'fwd',
  span: 3,
  capSpan: 9,
  spanNo: 1,
  correct: 0,
  litIndex: null,
  tapped: [],
  wrongIndex: null,
  elapsedMs: 0,
  done: false,
  ...over,
});

interface Mounted {
  host: StubEl;
  info: StubEl;
  grid: StubEl;
  inputs: InputEvent[];
  view: GameView<SeqmemSnapshot>;
}

// view.ts 的结构固定是 root > [info, grid]，grid 的直接子节点就是 cells 个空格按钮
function mount(s: SeqmemSnapshot, fx?: Fx): Mounted {
  installDom();
  const host = new StubEl('div');
  const inputs: InputEvent[] = [];
  const view = createSeqmemView(host as unknown as HTMLElement, (e) => inputs.push(e), fx);
  view.render(s);
  const root = host.children[0];
  return { host, info: root.children[0], grid: root.children[1], inputs, view };
}

describe('createSeqmemView', () => {
  it('pointerdown 命中格子时 emit 事件时间戳，并 preventDefault', () => {
    const { grid, inputs } = mount(snap());
    const state = grid.fire('pointerdown', { target: grid.children[4], timeStamp: 2345.25 });
    // t 必须取 timeStamp（与 rAF 同域），不是 Date.now()：引擎的 recallMs 直接吃它
    expect(inputs).toEqual([{ kind: 'cell', index: 4, t: 2345.25 }]);
    expect(state.defaultPrevented).toBe(true);
  });

  it('命中容器自身（不是格子）时不 emit、也不 preventDefault', () => {
    const { grid, inputs } = mount(snap());
    const state = grid.fire('pointerdown', { target: grid, timeStamp: 10 });
    expect(inputs).toEqual([]);
    expect(state.defaultPrevented).toBe(false);
  });

  it('视图不看相位：idle/show/replay 里的点击照样 emit（判定权在引擎，裁定 R-8）', () => {
    for (const phase of ['idle', 'show', 'recall', 'reveal', 'replay', 'done'] as const) {
      const { grid, inputs } = mount(snap({ phase }));
      grid.fire('pointerdown', { target: grid.children[0], timeStamp: 100 });
      expect(inputs).toEqual([{ kind: 'cell', index: 0, t: 100 }]);
    }
  });

  it('lit / picked / wrong 三个态跟着快照走', () => {
    const { grid, view } = mount(snap({ phase: 'show', litIndex: 5 }));
    expect(grid.children[5].classes.has('lit')).toBe(true);
    expect(grid.children[4].classes.has('lit')).toBe(false);
    view.render(snap({ phase: 'recall', tapped: [2, 7], litIndex: null }));
    expect(grid.children[2].classes.has('picked')).toBe(true);
    expect(grid.children[7].classes.has('picked')).toBe(true);
    expect(grid.children[5].classes.has('lit')).toBe(false);
    view.render(snap({ phase: 'reveal', tapped: [2, 7], wrongIndex: 3 }));
    expect(grid.children[3].classes.has('wrong')).toBe(true);
  });

  it('新快照没带的态一定被清掉：上一轮的亮格/错格不会残留', () => {
    const { grid, view } = mount(snap({ litIndex: 5 }));
    expect(grid.children.filter((c) => c.classes.has('lit'))).toHaveLength(1);
    view.render(snap({ phase: 'recall', tapped: [5], wrongIndex: 1 }));
    expect(grid.children.filter((c) => c.classes.has('lit'))).toHaveLength(0);
    view.render(snap({ phase: 'show', spanNo: 2 }));
    expect(grid.children.filter((c) => c.classes.has('picked'))).toHaveLength(0);
    expect(grid.children.filter((c) => c.classes.has('wrong'))).toHaveLength(0);
  });

  it('轮结束后不再残留亮格与红格（SessionRunner 停止喂帧）', () => {
    const { grid, view } = mount(snap({ phase: 'replay', litIndex: 5, wrongIndex: 6 }));
    view.render(snap({ phase: 'done', litIndex: 5, wrongIndex: 6, done: true }));
    expect(grid.children[5].classes.has('lit')).toBe(false);
    expect(grid.children[6].classes.has('wrong')).toBe(false);
  });

  it('网格列数与格子数跟着 size/cells 走；cells 不变时复用同一批节点', () => {
    const { grid, view } = mount(snap());
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    expect(grid.children).toHaveLength(9);
    const first = grid.children[0];
    view.render(snap({ litIndex: 1 }));
    expect(grid.children[0]).toBe(first); // 同一布局不重建，只切 class
    view.render(snap({ size: 4, cells: 16, span: 4, capSpan: 10 }));
    expect(grid.style.gridTemplateColumns).toBe('repeat(4, 1fr)');
    expect(grid.children).toHaveLength(16);
    expect(grid.children[0]).not.toBe(first);
    view.render(snap({ size: 5, cells: 25, span: 6, capSpan: 12 }));
    expect(grid.children).toHaveLength(25);
  });

  it('顶部文案跟着相位换', () => {
    const { info, view } = mount(snap({ spanNo: 2, span: 4 }));
    expect(info.textContent).toBe('记住顺序 · 第 2 条 · 4 格');
    view.render(snap({ phase: 'recall', spanNo: 2, span: 4, tapped: [1] }));
    expect(info.textContent).toBe('按原顺序点回 4 格 · 已点 1');
    view.render(snap({ dir: 'rev', phase: 'recall', span: 4 }));
    expect(info.textContent).toBe('倒着点回 4 格 · 已点 0');
    view.render(snap({ phase: 'reveal', span: 4, correct: 1 }));
    expect(info.textContent).toBe('第 4 格对了 · 下一条更长');
    view.render(snap({ phase: 'reveal', span: 4, correct: 1, wrongIndex: 2 }));
    expect(info.textContent).toBe('点错了 · 本轮结束（答对 1 条）');
    view.render(snap({ phase: 'replay' }));
    expect(info.textContent).toBe('正确顺序回放 · 看清它');
    view.render(snap({ phase: 'done', done: true, correct: 3 }));
    expect(info.textContent).toBe('本轮结束 · 答对 3 条');
  });

  it('destroy 摘掉监听并移除根节点，之后点击不再 emit', () => {
    const { host, grid, inputs, view } = mount(snap());
    view.destroy();
    expect(host.children).toHaveLength(0);
    expect(grid.handlerCount('pointerdown')).toBe(0);
    grid.fire('pointerdown', { target: grid.children[0], timeStamp: 1 });
    expect(inputs).toHaveLength(0);
  });

  it('进入 reveal 的上升沿按对错触发，回放后再错一次仍会 miss', () => {
    const calls: string[] = [];
    const fx = { tap: () => calls.push('tap'), hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    view.render(snap({ phase: 'reveal', tapped: [0, 1, 2], wrongIndex: null }));
    view.render(snap({ phase: 'reveal', tapped: [0, 1, 2], wrongIndex: null }));
    expect(calls).toEqual(['hit']);
    view.render(snap({ phase: 'replay' }));
    view.render(snap({ phase: 'reveal', wrongIndex: 4 }));
    expect(calls).toEqual(['hit', 'miss']);
  });
});
