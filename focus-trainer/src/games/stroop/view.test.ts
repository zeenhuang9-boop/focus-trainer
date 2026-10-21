import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fx, GameView, InputEvent } from '../../core/types';
import type { StroopSnapshot } from './engine';
import { STROOP_COLORS, WHITE_TEXT } from './rules';
import { createStroopView } from './view';

// node 环境没有 DOM，这里手写 view.ts 用到的那一小撮 API 的最小桩：createElement / append /
// replaceChildren / add|removeEventListener / classList / style.setProperty / dataset /
// textContent / remove / closest。目的不是模拟浏览器，而是让这段代码在 CI 里有守卫；
// 手感、布局与真实事件时间戳仍由 Task 8 的浏览器验收负责。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly styleVars = new Map<string, string>();
  readonly style = {
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

const option = (colorIdx: number, textInk: number | null = null) => ({
  colorIdx,
  label: STROOP_COLORS[colorIdx].name,
  textInk,
});

const snap = (over: Partial<StroopSnapshot> = {}): StroopSnapshot => ({
  rule: 'color',
  phase: 'respond',
  word: 0,
  ink: 1,
  conflict: true,
  onsetMs: 300,
  options: [option(0), option(1), option(2), option(3)],
  trialNo: 1,
  trialsTotal: 12,
  correctCount: 0,
  timeoutCount: 0,
  feedbackChoice: null,
  feedbackOk: false,
  elapsedMs: 300,
  done: false,
  ...over,
});

interface Mounted {
  host: StubEl;
  banner: StubEl;
  word: StubEl;
  options: StubEl;
  info: StubEl;
  inputs: InputEvent[];
  view: GameView<StroopSnapshot>;
}

function mount(s: StroopSnapshot, fx?: Fx): Mounted {
  installDom();
  const host = new StubEl('div');
  const inputs: InputEvent[] = [];
  const view = createStroopView(host as unknown as HTMLElement, (e) => inputs.push(e), fx);
  view.render(s);
  const root = host.children[0];
  const find = (cls: string): StubEl => root.children.find((c) => c.classes.has(cls)) ?? new StubEl('missing');
  return {
    host,
    banner: find('stroop-rule'),
    word: find('stroop-word'),
    options: find('stroop-options'),
    info: find('stroop-info'),
    inputs,
    view,
  };
}

describe('createStroopView', () => {
  it('pointerdown 命中按钮时 emit choice 事件并 preventDefault', () => {
    const { options, inputs } = mount(snap());
    const state = options.fire('pointerdown', { target: options.children[2], timeStamp: 987.25 });
    // t 取 timeStamp（与 rAF 同域）而不是 Date.now()：引擎的 rt 与 Task 4 的 durationMs 都吃它
    expect(inputs).toEqual([{ kind: 'choice', index: 2, t: 987.25 }]);
    expect(state.defaultPrevented).toBe(true);
  });

  it('命中容器自身时既不 emit 也不 preventDefault', () => {
    const { options, inputs } = mount(snap());
    const state = options.fire('pointerdown', { target: options, timeStamp: 10 });
    expect(inputs).toEqual([]);
    expect(state.defaultPrevented).toBe(false);
  });

  it('规则横幅常驻顶部，注视期就已跟着 rule 更新', () => {
    const m = mount(snap({ rule: 'color', phase: 'fixation', word: null, ink: null, conflict: null, onsetMs: null }));
    expect(m.banner.textContent).toBe('按颜色');
    m.view.render(snap({ rule: 'word' }));
    expect(m.banner.textContent).toBe('按字义');
    m.view.render(snap({ rule: 'color' }));
    expect(m.banner.textContent).toBe('按颜色');
  });

  it('词：反应窗显示色名并按墨色上色，注视期显示「＋」且用白字', () => {
    const m = mount(snap({ word: 2, ink: 2 }));
    expect(m.word.textContent).toBe('蓝');
    expect(m.word.styleVars.get('--ink')).toBe('#1E88E5');
    m.view.render(snap({ word: 3, ink: 0 }));
    expect(m.word.textContent).toBe('黄');
    expect(m.word.styleVars.get('--ink')).toBe('#E53935');
    m.view.render(snap({ phase: 'fixation', word: null, ink: null, conflict: null, onsetMs: null }));
    expect(m.word.textContent).toBe('＋');
    expect(m.word.styleVars.get('--ink')).toBe(WHITE_TEXT);
  });

  it('按钮：标签是颜色名，字色默认白，干扰色档按 textInk 上色', () => {
    const m = mount(snap());
    expect(m.options.children.map((b) => b.textContent)).toEqual(['红', '绿', '蓝', '黄']);
    expect(m.options.children.map((b) => b.styleVars.get('--ink'))).toEqual([
      WHITE_TEXT,
      WHITE_TEXT,
      WHITE_TEXT,
      WHITE_TEXT,
    ]);
    expect(m.options.children[0].dataset.i).toBe('0');
    m.view.render(snap({ options: [option(0, 2), option(1, 3), option(2, 1), option(3, 0)] }));
    expect(m.options.children.map((b) => b.styleVars.get('--ink'))).toEqual(['#1E88E5', '#FDD835', '#43A047', '#E53935']);
  });

  it('选项数跟着快照走（第 1 档只有 2 个按钮）', () => {
    const m = mount(snap({ options: [option(1), option(3)] }));
    expect(m.options.children).toHaveLength(2);
    expect(m.options.children.map((b) => b.textContent)).toEqual(['绿', '黄']);
  });

  it('right / wrong / locked 每次渲染重算，不累积上一次的类名', () => {
    const m = mount(snap({ options: [option(0), option(1)] }));
    expect(m.options.children.every((b) => !b.classes.has('right') && !b.classes.has('wrong'))).toBe(true);
    expect(m.options.children.every((b) => !b.classes.has('locked'))).toBe(true);
    m.view.render(snap({ options: [option(0), option(1)], phase: 'feedback', feedbackChoice: 1, feedbackOk: true }));
    expect(m.options.children[1].classes.has('right')).toBe(true);
    expect(m.options.children[0].classes.has('right')).toBe(false);
    m.view.render(snap({ options: [option(0), option(1)], phase: 'feedback', feedbackChoice: 0, feedbackOk: false }));
    expect(m.options.children[1].classes.has('right')).toBe(false);
    expect(m.options.children[0].classes.has('wrong')).toBe(true);
    m.view.render(
      snap({ options: [option(0), option(1)], phase: 'fixation', word: null, ink: null, conflict: null, onsetMs: null }),
    );
    expect(m.options.children.every((b) => b.classes.has('locked'))).toBe(true);
    expect(m.options.children.every((b) => !b.classes.has('wrong'))).toBe(true);
  });

  it('重建键同时含按钮顺序与文字墨色，destroy 摘监听并移除根节点', () => {
    const flat = [option(0), option(1), option(2), option(3)];
    const m = mount(snap({ options: flat }));
    const first = m.options.children[0];
    m.view.render(snap({ options: [option(0), option(1), option(2), option(3)], trialNo: 5 }));
    // 位置与墨色都没变（固定档同一轮内就是这样）：复用节点，避免每帧重建
    expect(m.options.children[0]).toBe(first);
    // 只有墨色变化（第 9/10 档每试次重排位置与位移）：必须重建，否则残留上一次的文字颜色
    m.view.render(snap({ options: [option(0, 1), option(1, 2), option(2, 3), option(3, 0)] }));
    expect(m.options.children[0]).not.toBe(first);
    m.view.destroy();
    expect(m.host.children).toHaveLength(0);
    expect(m.options.handlerCount('pointerdown')).toBe(0);
    m.options.fire('pointerdown', { target: m.options.children[0], timeStamp: 1 });
    expect(m.inputs).toHaveLength(0);
  });

  it('信息行显示试次进度与正确、超时计数', () => {
    const m = mount(snap({ trialNo: 7, correctCount: 5, timeoutCount: 1 }));
    expect(m.info.textContent).toBe('第 7/12 试次　正确 5　超时 1');
  });

  it('进入 feedback 的上升沿按对错各触发一次', () => {
    const calls: string[] = [];
    const fx = { tap: () => calls.push('tap'), hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    view.render(snap({ phase: 'feedback', feedbackChoice: 1, feedbackOk: true }));
    view.render(snap({ phase: 'feedback', feedbackChoice: 1, feedbackOk: true }));
    expect(calls).toEqual(['hit']);
    view.render(snap());
    view.render(snap({ phase: 'feedback', feedbackChoice: null, feedbackOk: false }));
    expect(calls).toEqual(['hit', 'miss']);
  });
});
