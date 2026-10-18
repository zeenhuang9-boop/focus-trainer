import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameView, InputEvent } from '../../core/types';
import { TINTS } from './engine';
import type { SchulteSnapshot } from './engine';
import { TINT_COLORS, createSchulteView } from './view';

// node 环境没有 DOM，这里手写 view.ts 用到的那一小撮 API 的最小桩：createElement / append /
// replaceChildren / add|removeEventListener / classList / style.setProperty / dataset /
// textContent / remove / closest。目的不是模拟浏览器，而是让这 55 行代码在 CI 里有守卫；
// 手感、布局与真实事件时间戳仍由 Task 10 的浏览器验收负责。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly styleVars = new Map<string, string>();
  readonly style = {
    gridTemplateColumns: '',
    setProperty: (k: string, v: string) => {
      this.styleVars.set(k, v);
    },
    getPropertyValue: (k: string) => this.styleVars.get(k) ?? '',
  };
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

const cell = (label: string, done = false, tint: number | null = null) => ({ label, done, tint });

const snap = (over: Partial<SchulteSnapshot> = {}): SchulteSnapshot => ({
  size: 3,
  cells: Array.from({ length: 9 }, (_, i) => cell(String(i + 1))),
  nextLabel: '1',
  errors: 0,
  elapsedMs: 0,
  flashIndex: null,
  done: false,
  ...over,
});

interface Mounted {
  host: StubEl;
  grid: StubEl;
  inputs: InputEvent[];
  view: GameView<SchulteSnapshot>;
}

// view.ts 的结构固定是 root > [info, grid]，grid 的直接子节点就是格子的 number of cells 个按钮
function mount(s: SchulteSnapshot): Mounted {
  installDom();
  const host = new StubEl('div');
  const inputs: InputEvent[] = [];
  const view = createSchulteView(host as unknown as HTMLElement, (e) => inputs.push(e));
  view.render(s);
  const root = host.children[0];
  return { host, grid: root.children[1], inputs, view };
}

describe('createSchulteView', () => {
  it('pointerdown 命中格子时 emit 事件时间戳，并 preventDefault', () => {
    const { grid, inputs } = mount(snap());
    const state = grid.fire('pointerdown', { target: grid.children[4], timeStamp: 1234.5 });
    // t 必须取 timeStamp（与 rAF 同域），不是 Date.now()：Task 5 的 durationMs 直接吃它
    expect(inputs).toEqual([{ kind: 'cell', index: 4, t: 1234.5 }]);
    expect(state.defaultPrevented).toBe(true);
  });

  it('命中容器自身（不是格子）时不 emit、也不 preventDefault', () => {
    const { grid, inputs } = mount(snap());
    const state = grid.fire('pointerdown', { target: grid, timeStamp: 10 });
    expect(inputs).toEqual([]);
    expect(state.defaultPrevented).toBe(false);
  });

  it('done 与 flash 跟着快照走；轮结束后不再残留闪烁', () => {
    const cells = [cell('1', true), cell('2'), cell('3'), cell('4'), cell('5'), cell('6'), cell('7'), cell('8'), cell('9')];
    const { grid, view } = mount(snap({ cells, flashIndex: 1 }));
    const buttons = grid.children;
    expect(buttons[0].classes.has('done')).toBe(true);
    expect(buttons[1].classes.has('flash')).toBe(true);
    expect(buttons[2].classes.has('flash')).toBe(false);
    // 最后一格是误点后立刻完成：SessionRunner 停止喂帧，flashIndex 不会被 tick 清掉，
    // 少了 !s.done 这一格会红到用户点「继续」为止（评审 M-4）。
    view.render(snap({ cells, flashIndex: 1, done: true, nextLabel: null }));
    expect(buttons[1].classes.has('flash')).toBe(false);
  });

  it('网格列数与格子数跟着 size 走', () => {
    const { grid, view } = mount(snap());
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    view.render(snap({ size: 5, cells: Array.from({ length: 25 }, (_, i) => cell(String(i + 1))) }));
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, 1fr)');
    expect(grid.children).toHaveLength(25);
  });

  it('干扰色按下标写进 --tint，非干扰档不写，且调色板长度等于 TINTS', () => {
    const tints = Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, i % 4));
    const { grid } = mount(snap({ cells: tints }));
    // engine.ts 用 randInt(rng, 0, TINTS - 1) 生成下标，这里按下标取色；两处各自硬编码时，
    // TINTS 改 5 会让 TINT_COLORS[4] === undefined，setProperty 静默 no-op 而测试仍绿（评审 I-1）。
    expect(TINT_COLORS.length).toBe(TINTS);
    expect(grid.children[0].styleVars.get('--tint')).toBe(TINT_COLORS[0]);
    expect(grid.children[5].styleVars.get('--tint')).toBe(TINT_COLORS[1]);
    expect(mount(snap()).grid.children[0].styleVars.has('--tint')).toBe(false);
  });

  it('标签与底色都没变时复用节点，只有底色变化也重建；destroy 摘监听并移根', () => {
    const a = Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, i % 4));
    const { host, grid, inputs, view } = mount(snap({ cells: a }));
    const first = grid.children[0];
    view.render(snap({ cells: Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, i % 4)) }));
    expect(grid.children[0]).toBe(first);
    // 作废重开同档位 + 新 seed 可能撞出相同排列；键里不含 tint 就会跳过重建，底色残留（评审 M-5）。
    view.render(snap({ cells: Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, (i + 1) % 4)) }));
    expect(grid.children[0]).not.toBe(first);
    view.destroy();
    expect(host.children).toHaveLength(0);
    expect(grid.handlerCount('pointerdown')).toBe(0);
    grid.fire('pointerdown', { target: grid.children[0], timeStamp: 1 });
    expect(inputs).toHaveLength(0);
  });
});
