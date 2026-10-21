// 纪律扫描要读源码文本；node 类型由 @capacitor/cli 传递带入，仓库不直接声明
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Fx, GameView, InputEvent } from '../../core/types';
import type { GestaltChoiceView, GestaltSnapshot } from './engine';
import type { Segment } from './fragment';
import { SVG_NS, createGestaltView, pointsAttr, segmentPoints } from './view';

class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly attrs: Record<string, string> = {};
  readonly styleVars = new Map<string, string>();
  readonly style = {
    setProperty: (k: string, v: string) => {
      this.styleVars.set(k, v);
    },
  };
  textContent = '';
  parent: StubEl | null = null;
  readonly ns: string | null;
  private readonly handlers: Array<{ type: string; fn: (ev: unknown) => void }> = [];

  constructor(readonly tag: string, ns: string | null = null) {
    this.ns = ns;
  }

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  get classList() {
    const classes = this.classes;
    return {
      add: (c: string) => void classes.add(c),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on: boolean) => {
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    };
  }

  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }

  getAttribute(k: string): string | undefined {
    return this.attrs[k];
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

  /** 测试辅助：递归收集所有指定 tag 的后代节点 */
  findAll(tag: string): StubEl[] {
    const out: StubEl[] = [];
    const walk = (e: StubEl): void => {
      for (const c of e.children) {
        if (c.tag === tag) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
}

class StubButton extends StubEl {}

function installDom(): void {
  vi.stubGlobal('Element', StubEl);
  vi.stubGlobal('HTMLButtonElement', StubButton);
  vi.stubGlobal('document', {
    createElement: (tag: string) => (tag === 'button' ? new StubButton(tag) : new StubEl(tag)),
    createElementNS: (ns: string, tag: string) => new StubEl(tag, ns),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const seg = (x1: number, y1: number, x2: number, y2: number): Segment => ({
  a: [x1, y1],
  b: [x2, y2],
});

const choice = (id: GestaltChoiceView['id']): GestaltChoiceView => ({
  id,
  strokes: [{ pts: [[-1, -1], [1, -1], [1, 1]] as [number, number][], closed: true }],
});

const snap = (over: Partial<GestaltSnapshot> = {}): GestaltSnapshot => ({
  phase: 'fixation',
  elapsedMs: 0,
  fragments: [],
  mask: [],
  choices: [],
  answeredIndex: null,
  correctIndex: null,
  rtMs: 0,
  exposureMs: 0,
  timingValid: true,
  done: false,
  ...over,
});

interface Mounted {
  host: StubEl;
  stage: StubEl;
  inputs: InputEvent[];
  view: GameView<GestaltSnapshot>;
}

// view.ts 的结构固定为 root > [info, stage]，stage 的直接子节点随阶段整体替换
function mount(s: GestaltSnapshot, fx?: Fx): Mounted {
  installDom();
  const host = new StubEl('div');
  const inputs: InputEvent[] = [];
  const view = createGestaltView(host as unknown as HTMLElement, (e) => inputs.push(e), fx);
  view.render(s);
  const root = host.children[0];
  return { host, stage: root.children[1], inputs, view };
}

describe('阶段渲染互斥（答案阵列不得在暴露期出现）', () => {
  it('注视期：只有注视标记，没有碎片、掩蔽、选项', () => {
    const { stage } = mount(snap());
    expect(stage.findAll('polyline')).toHaveLength(0);
    expect(stage.children.filter((c) => c.tag === 'button')).toHaveLength(0);
    expect(stage.children[0].classes.has('gestalt-fixation')).toBe(true);
  });

  it('暴露期：一个 svg，polyline 段数 === fragments 段数，且没有选项按钮', () => {
    const fragments = [seg(0, 0, 0.08, 0), seg(0.1, 0.2, 0.18, 0.2), seg(-0.5, 0, -0.42, 0.05)];
    const { stage } = mount(snap({ phase: 'exposure', fragments }));
    expect(stage.findAll('button')).toHaveLength(0);
    const lines = stage.findAll('polyline');
    expect(lines).toHaveLength(fragments.length);
    expect(lines[0].attrs['points']).toBe(segmentPoints(fragments[0]));
  });

  it('掩蔽期：polyline 段数 === mask 段数，且没有选项按钮', () => {
    const mask = [seg(-1, -1, 1, 1), seg(0, 0, 0.08, 0)];
    const { stage } = mount(snap({ phase: 'mask', mask }));
    expect(stage.findAll('polyline')).toHaveLength(2);
    expect(stage.findAll('button')).toHaveLength(0);
  });

  it('作答期：4 个按钮（2×2），碎片与掩蔽全部撤掉', () => {
    const choices = [choice('circle'), choice('bolt'), choice('star5'), choice('house')];
    const { stage } = mount(
      snap({ phase: 'answer', choices, fragments: [seg(0, 0, 1, 1)], mask: [seg(0, 0, 1, 1)] }),
    );
    const buttons = stage.children.filter((c) => c.tag === 'button');
    expect(buttons).toHaveLength(4);
    expect(buttons.map((b) => b.dataset.i)).toEqual(['0', '1', '2', '3']);
    expect(buttons[0].classes.has('gestalt-choice')).toBe(true);
    expect(stage.findAll('polyline').length).toBeGreaterThan(0); // 完整图形的轮廓
    expect(stage.findAll('polyline')).toHaveLength(4); // 每个选项一笔
  });

  it('阶段切换会整体替换 stage 子节点：残留的暴露碎片不会跟着进作答期', () => {
    const fragments = [seg(0, 0, 0.08, 0), seg(0.1, 0.2, 0.18, 0.2)];
    const { stage, view } = mount(snap({ phase: 'exposure', fragments }));
    const firstLine = stage.findAll('polyline')[0];
    view.render(snap({ phase: 'answer', choices: [choice('circle'), choice('bolt'), choice('star5'), choice('house')] }));
    expect(stage.findAll('polyline')).not.toContain(firstLine);
    view.render(snap({ phase: 'fixation' }));
    expect(stage.findAll('button')).toHaveLength(0);
    expect(stage.children[0].classes.has('gestalt-fixation')).toBe(true);
  });

  it('反馈期：正确项加 right、误选加 wrong；未选中的不加 wrong', () => {
    const choices = [choice('circle'), choice('bolt'), choice('star5'), choice('house')];
    const { stage, view } = mount(snap({ phase: 'answer', choices }));
    const buttons = stage.children.filter((c) => c.tag === 'button');
    view.render(snap({ phase: 'feedback', choices, answeredIndex: 1, correctIndex: 2 }));
    expect(buttons[2].classes.has('right')).toBe(true);
    expect(buttons[1].classes.has('wrong')).toBe(true);
    expect(buttons[0].classes.has('wrong')).toBe(false);
    expect(buttons[0].classes.has('right')).toBe(false);
  });

  it('进入 feedback 的上升沿按对错各触发一次', () => {
    const calls: string[] = [];
    const fx = { tap: () => calls.push('tap'), hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    const choices = [choice('circle'), choice('bolt'), choice('star5'), choice('house')];
    view.render(snap({ phase: 'feedback', choices, answeredIndex: 1, correctIndex: 1 }));
    view.render(snap({ phase: 'feedback', choices, answeredIndex: 1, correctIndex: 1 }));
    expect(calls).toEqual(['hit']);
    view.render(snap({ phase: 'answer', choices }));
    view.render(snap({ phase: 'feedback', choices, answeredIndex: 0, correctIndex: 1 }));
    expect(calls).toEqual(['hit', 'miss']);
  });
});

describe('事件与时钟', () => {
  it('pointerdown 命中选项时 emit choice + timeStamp，并 preventDefault', () => {
    const choices = [choice('circle'), choice('bolt'), choice('star5'), choice('house')];
    const { stage, inputs } = mount(snap({ phase: 'answer', choices }));
    const buttons = stage.children.filter((c) => c.tag === 'button');
    const state = stage.fire('pointerdown', { target: buttons[2], timeStamp: 2048.75 });
    expect(inputs).toEqual([{ kind: 'choice', index: 2, t: 2048.75 }]);
    expect(state.defaultPrevented).toBe(true);
  });

  it('命中 stage 自身或注视标记时不 emit、不 preventDefault', () => {
    const { stage, inputs } = mount(snap({ phase: 'fixation' }));
    const state = stage.fire('pointerdown', { target: stage, timeStamp: 7 });
    expect(inputs).toEqual([]);
    expect(state.defaultPrevented).toBe(false);
  });

  it('destroy 摘掉监听并移走根节点，之后再点不 emit', () => {
    const choices = [choice('circle'), choice('bolt'), choice('star5'), choice('house')];
    const { host, stage, inputs, view } = mount(snap({ phase: 'answer', choices }));
    view.destroy();
    expect(host.children).toHaveLength(0);
    expect(stage.handlerCount('pointerdown')).toBe(0);
    stage.fire('pointerdown', { target: stage.children[0], timeStamp: 1 });
    expect(inputs).toHaveLength(0);
  });
});

describe('字符串与纪律', () => {
  it('svg 一律用 SVG 命名空间创建；points 是 y 取反后的三位小数字符串', () => {
    const { stage } = mount(snap({ phase: 'exposure', fragments: [seg(0.5, 0.25, -1, 0)] }));
    const svgs = stage.findAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0].ns).toBe(SVG_NS);
    expect(svgs[0].attrs['viewBox']).toBe('-1.15 -1.15 2.3 2.3');
    expect(stage.findAll('polyline')[0].attrs['points']).toBe('0.500,-0.250 -1.000,0.000');
  });

  it('pointsAttr：闭合笔补回首点，开放笔不补', () => {
    expect(pointsAttr([[-1, -1], [1, -1], [1, 1]], true)).toBe('-1.000,1.000 1.000,1.000 1.000,-1.000 -1.000,1.000');
    expect(pointsAttr([[0, 0], [1, 1]], false)).toBe('0.000,0.000 1.000,-1.000');
  });

  it('view.ts 不做任何计时：源码里不许出现 setTimeout/setInterval/Date.now/rAF', () => {
    const src = readFileSync(new URL('./view.ts', import.meta.url), 'utf8');
    for (const banned of ['setTimeout', 'setInterval', 'Date.now', 'requestAnimationFrame', 'performance.now']) {
      expect(src.includes(banned), `view.ts 出现了 ${banned}`).toBe(false);
    }
    expect(src.includes('getContext')).toBe(false);
    expect(src.includes('canvas')).toBe(false);
  });
});
