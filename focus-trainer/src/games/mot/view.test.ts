// focus-trainer/src/games/mot/view.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fx, GameView, InputEvent } from '../../core/types';
import type { MotDotView, MotSnapshot } from './engine';
import { createMotView } from './view';

// node 环境没有 DOM：沿用 schulte/stroop view.test.ts 的手写零依赖桩范式，只实现本视图真正用到的那几件 ——
// createElement / append / replaceChildren / remove / add|removeEventListener / className /
// textContent / style.transform / getBoundingClientRect。目的不是模拟浏览器，而是让单位换算、
// class 残留与监听摘除这三件事在 CI 里有守卫；手感与真实时间戳仍由浏览器验收负责。
// 桩里刻意不提供 setTimeout / requestAnimationFrame / performance：视图若偷用计时 API 会当场 ReferenceError，
// 「谁拥有时间」的答案是引擎，视图一次都不该调用它们。
const SIDE = 360; // 桩里固定的场地边长；所有像素断言都以它为基准

class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly style: Record<string, string> = {};
  textContent = '';
  parent: StubEl | null = null;
  rect = { left: 0, top: 0, width: SIDE, height: SIDE };
  private readonly handlers: Array<{ type: string; fn: (ev: unknown) => void }> = [];

  constructor(readonly tag: string) {}

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  get className(): string {
    return [...this.classes].join(' ');
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
    const p = this.parent;
    if (p) p.children.splice(p.children.indexOf(this), 1);
    this.parent = null;
  }

  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return this.rect;
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
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

function installDom(): void {
  vi.stubGlobal('document', { createElement: (tag: string) => new StubEl(tag) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const vd = (over: Partial<MotDotView> = {}): MotDotView => ({
  id: 0,
  x: 0.5,
  y: 0.5,
  target: false,
  selected: false,
  mark: 'none',
  ...over,
});

const snap = (over: Partial<MotSnapshot> = {}): MotSnapshot => ({
  phase: 'prompt',
  dots: [vd({ id: 0, x: 0.5, y: 0.5 }), vd({ id: 1, x: 0.25, y: 0.75, target: true }), vd({ id: 2, x: 0.9, y: 0.1 })],
  k: 2,
  selectedCount: 0,
  remainMs: 2000,
  simSteps: 0,
  timingValid: true,
  done: false,
  ...over,
});

interface Mounted {
  host: StubEl;
  field: StubEl;
  inputs: InputEvent[];
  view: GameView<MotSnapshot>;
}

// view.ts 的结构固定为 root > [info, field]，field 的直接子节点就是点
function mount(s: MotSnapshot, fx?: Fx): Mounted {
  installDom();
  const host = new StubEl('div');
  const inputs: InputEvent[] = [];
  const view = createMotView(host as unknown as HTMLElement, (e) => inputs.push(e), fx);
  view.render(s);
  const root = host.children[0];
  return { host, field: root.children[1], inputs, view };
}

describe('createMotView', () => {
  it('pointerdown 把客户端坐标反归一化后 emit，t 取 timeStamp，并 preventDefault', () => {
    const { field, inputs } = mount(snap({ phase: 'answer' }));
    const state = field.fire('pointerdown', { clientX: 90, clientY: 180, timeStamp: 1234.5 });
    expect(inputs).toEqual([{ kind: 'point', x: 0.25, y: 0.5, t: 1234.5 }]);
    expect(state.defaultPrevented).toBe(true);
  });

  it('场地边长为 0（未布局或父级隐藏）时不吃这一枪：不 emit、不 preventDefault', () => {
    const m = mount(snap({ phase: 'answer' }));
    m.field.rect = { left: 0, top: 0, width: 0, height: 0 };
    const state = m.field.fire('pointerdown', { clientX: 1, clientY: 1, timeStamp: 5 });
    expect(m.inputs).toEqual([]);
    expect(state.defaultPrevented).toBe(false);
  });

  it('归一化坐标 × 边长 = translate3d 的像素值（圆心对齐）', () => {
    const { field } = mount(snap());
    expect(field.children[0].style.transform).toBe('translate3d(180px, 180px, 0)');
    expect(field.children[1].style.transform).toBe('translate3d(90px, 270px, 0)');
  });

  it('只有点数变化才重建节点，同点数逐帧只改 transform 与 class', () => {
    const { field, view } = mount(snap());
    const first = field.children[0];
    view.render(snap({ dots: [vd({ x: 0.1, y: 0.2 }), vd({ x: 0.3, y: 0.4 }), vd({ x: 0.5, y: 0.6 })] }));
    expect(field.children[0]).toBe(first);
    expect(field.children[0].style.transform).toBe('translate3d(36px, 72px, 0)');
    view.render(snap({ dots: [vd({ x: 0.1, y: 0.2 }), vd({ x: 0.3, y: 0.4 })] }));
    expect(field.children[0]).not.toBe(first);
    expect(field.children).toHaveLength(2);
  });

  it('class 跟着快照走：target / sel / hit / wrong / missed 各自落到对应节点', () => {
    const dots = [
      vd({ id: 0, mark: 'hit', selected: true, target: true }),
      vd({ id: 1, mark: 'wrong', selected: true }),
      vd({ id: 2, mark: 'missed', target: true }),
    ];
    const { field } = mount(snap({ phase: 'feedback', dots, k: 2, selectedCount: 2 }));
    expect(field.children[0].classes.has('target')).toBe(true);
    expect(field.children[0].classes.has('hit')).toBe(true);
    expect(field.children[0].classes.has('sel')).toBe(true);
    expect(field.children[1].classes.has('wrong')).toBe(true);
    expect(field.children[1].classes.has('target')).toBe(false);
    expect(field.children[2].classes.has('missed')).toBe(true);
  });

  it('相位 class 写在 field 上，供 CSS 决定运动期不闪烁', () => {
    const { field, view } = mount(snap({ phase: 'prompt' }));
    expect(field.classes.has('prompt')).toBe(true);
    view.render(snap({ phase: 'motion', remainMs: 1500 }));
    expect(field.className).toContain('motion');
    expect(field.classes.has('prompt')).toBe(false);
  });

  it('换轮不留残留：feedback 之后按新档位重开，标记与选中全清、点数跟着新布局', () => {
    const dots = [vd({ id: 0, mark: 'hit', selected: true, target: true }), vd({ id: 1, mark: 'wrong', selected: true })];
    const { field, view } = mount(snap({ phase: 'feedback', dots, k: 2, selectedCount: 2, done: true }));
    const fresh = snap({
      phase: 'prompt',
      dots: Array.from({ length: 8 }, (_, i) => vd({ id: i })),
      k: 3,
      selectedCount: 0,
      done: false,
      remainMs: 2000,
    });
    view.render(fresh);
    expect(field.children).toHaveLength(8);
    for (const el of field.children) {
      expect(el.classes.has('hit')).toBe(false);
      expect(el.classes.has('wrong')).toBe(false);
      expect(el.classes.has('missed')).toBe(false);
      expect(el.classes.has('sel')).toBe(false);
      expect(el.classes.has('target')).toBe(false); // 新布局的 target 由提示阶段的快照给，这里快照全 false
    }
  });

  it('四相位的说明文案与中文标签逐字固定，负 remainMs 只在显示时钳 0', () => {
    const m = mount(snap({ phase: 'prompt', remainMs: 2000, k: 2 }));
    const root = m.host.children[0];
    const info = root.children[0];
    expect(info.textContent).toBe('盯住 2 个橙色点　2.0 秒');
    m.view.render(snap({ phase: 'motion', remainMs: 1500 }));
    expect(info.textContent).toBe('追踪目标　剩余 1.5 秒');
    m.view.render(snap({ phase: 'answer', remainMs: -37, selectedCount: 1, k: 2 }));
    expect(info.textContent).toBe('点出 2 个目标　已选 1'); // 负值显示成 0，且 answer 阶段不显示倒计时
    m.view.render(
      snap({
        phase: 'feedback',
        remainMs: 600,
        k: 2,
        selectedCount: 2,
        dots: [vd({ id: 0, mark: 'hit', target: true, selected: true }), vd({ id: 1, mark: 'wrong', selected: true }), vd({ id: 2, mark: 'missed', target: true })],
      }),
    );
    expect(info.textContent).toBe('命中 1 / 2');
  });

  // 变异自查补位：brief 的负值断言落在不显示倒计时的 answer 相位，删掉 Math.max(0,…) 钳制测不出来。
  // 这条把负 remainMs 放进真正显示倒计时的 prompt/motion 相位，钳制缺失当场变红（-0.0 ≠ 0.0）。
  it('prompt/motion 相位的负 remainMs 同样只显示 0.0，不出现 -0.0', () => {
    const m = mount(snap({ phase: 'prompt', remainMs: -37, k: 2 }));
    const info = m.host.children[0].children[0];
    expect(info.textContent).toBe('盯住 2 个橙色点　0.0 秒');
    m.view.render(snap({ phase: 'motion', remainMs: -1 }));
    expect(info.textContent).toBe('追踪目标　剩余 0.0 秒');
  });

  it('destroy 摘掉监听并移走根节点，之后 fire 不再 emit', () => {
    const { host, field, inputs, view } = mount(snap({ phase: 'answer' }));
    view.destroy();
    expect(host.children).toHaveLength(0);
    expect(field.handlerCount('pointerdown')).toBe(0);
    field.fire('pointerdown', { clientX: 10, clientY: 10, timeStamp: 1 });
    expect(inputs).toHaveLength(0);
  });

  it('进入 feedback 时按标记触发：有漏选/错选就 miss，全中才 hit', () => {
    const calls: string[] = [];
    const fx = { tap: () => calls.push('tap'), hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    const mixed = [vd({ id: 0, target: true, mark: 'hit' }), vd({ id: 1, target: true, mark: 'missed' })];
    view.render(snap({ phase: 'feedback', dots: mixed }));
    view.render(snap({ phase: 'feedback', dots: mixed }));
    expect(calls).toEqual(['miss']);
    view.render(snap({ phase: 'motion', dots: mixed }));
    view.render(snap({ phase: 'feedback', dots: [vd({ id: 0, target: true, mark: 'hit' })] }));
    expect(calls).toEqual(['miss', 'hit']);
  });
});
