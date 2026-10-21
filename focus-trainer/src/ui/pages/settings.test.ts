import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../core/storage';
import type { Settings } from '../../core/types';
import type { AppContext } from '../context';
import { renderSettings } from './settings';

// node 环境没有 jsdom，DOM 全靠这套手写桩（风格照 src/ui/pages/home.test.ts）：
// createElement / append / replaceChildren / textContent / className / classList /
// setAttribute / add|removeEventListener，外加 documentElement 与 matchMedia(=undefined)。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly attrs = new Map<string, string>();
  parent: StubEl | null = null;
  hidden = false;
  disabled = false;
  checked = false;
  selected = false;
  value = '';
  text = '';
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; contains(c: string): boolean; toggle(c: string, on: boolean): boolean } {
    const classes = this.classes;
    return {
      add: (c: string): void => {
        classes.add(c);
      },
      contains: (c: string): boolean => classes.has(c),
      toggle: (c: string, on: boolean): boolean => {
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    };
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(v: string) {
    this.text = v;
    this.children.length = 0;
  }

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  get className(): string {
    return [...this.classes].join(' ');
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }

  append(...items: Array<StubEl | string>): void {
    for (const item of items) {
      if (typeof item === 'string') this.text += item;
      else {
        item.parent = this;
        this.children.push(item);
      }
    }
  }

  replaceChildren(...items: Array<StubEl | string>): void {
    this.text = '';
    this.children.length = 0;
    this.append(...items);
  }

  addEventListener(type: string, fn: (ev: never) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: never) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  /** 真浏览器改下拉/勾选框后会派发 change；桩只管把同类型监听全跑一遍 */
  fire(type: string): void {
    for (const h of this.handlers.filter((x) => x.type === type)) (h.fn as (e: unknown) => void)({ type });
  }

  all(pred: (el: StubEl) => boolean): StubEl[] {
    const out: StubEl[] = [];
    if (pred(this)) out.push(this);
    for (const c of this.children) out.push(...c.all(pred));
    return out;
  }

  find(pred: (el: StubEl) => boolean): StubEl | null {
    return this.all(pred)[0] ?? null;
  }
}

const BASE: Settings = { dayStartHour: 4, theme: 'auto', hapticsEnabled: true, soundEnabled: false };

async function setup(initial: Settings = BASE) {
  const view = new StubEl('main');
  const documentElement = new StubEl('html');
  const repo = new MemoryRepository();
  await repo.putSettings(initial);
  const ctx: AppContext = { repo, storageOk: true, settings: { ...initial } };
  const ac = new AbortController();
  // 桩里明确没有 matchMedia：auto 必须解析为浅色，不依赖宿主环境碰巧如何。
  vi.stubGlobal('matchMedia', undefined);
  vi.stubGlobal('document', {
    createElement: (tag: string) => new StubEl(tag),
    documentElement,
  });
  const requireEl = (el: StubEl | null, what: string): StubEl => {
    if (!el) throw new Error(`桩里找不到${what}`);
    return el;
  };
  return {
    view,
    repo,
    ctx,
    ac,
    documentElement,
    render: (): Promise<void> => renderSettings(view as unknown as HTMLElement, ctx, ac.signal),
    themeSelect: (): StubEl => requireEl(view.find((x) => x.tag === 'select' && x.getAttribute('aria-label') === '主题'), '主题下拉'),
    haptics: (): StubEl => requireEl(view.find((x) => x.tag === 'input' && x.getAttribute('aria-label') === '震动反馈'), '震动反馈复选框'),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderSettings 的主题下拉', () => {
  it('直接选深色：四字段完整落库，html 的 dataset.theme 同步为 dark', async () => {
    const h = await setup();
    await h.render();
    const select = h.themeSelect();
    // 初始选中项跟 ctx.settings.theme 对齐（auto）
    expect(select.children.map((o) => o.getAttribute('value'))).toEqual(['auto', 'light', 'dark']);
    expect(select.children.find((o) => o.selected)?.getAttribute('value')).toBe('auto');

    select.value = 'dark';
    select.fire('change');
    await vi.waitFor(async () => {
      expect(await h.repo.getSettings()).toEqual({
        dayStartHour: 4,
        theme: 'dark',
        hapticsEnabled: true,
        soundEnabled: false,
      });
    });
    expect(h.documentElement.dataset.theme).toBe('dark');
  });

  it('选回 auto：落库保留其它三个字段，桩里无 matchMedia 时 dataset 解析为 light', async () => {
    const h = await setup({ dayStartHour: 2, theme: 'dark', hapticsEnabled: false, soundEnabled: true });
    await h.render();
    const select = h.themeSelect();
    select.value = 'auto';
    select.fire('change');
    await vi.waitFor(async () => {
      expect(await h.repo.getSettings()).toEqual({
        dayStartHour: 2,
        theme: 'auto',
        hapticsEnabled: false,
        soundEnabled: true,
      });
    });
    expect(h.documentElement.dataset.theme).toBe('light');
  });
});

describe('renderSettings 的震动开关', () => {
  it('只改 hapticsEnabled：落库保留 theme 与另外两字段（theme 不被回退成默认值）', async () => {
    const h = await setup({ dayStartHour: 6, theme: 'dark', hapticsEnabled: true, soundEnabled: true });
    await h.render();
    const checkbox = h.haptics();
    expect(checkbox.checked).toBe(true);

    checkbox.checked = false;
    checkbox.fire('change');
    await vi.waitFor(async () => {
      expect(await h.repo.getSettings()).toEqual({
        dayStartHour: 6,
        theme: 'dark',
        hapticsEnabled: false,
        soundEnabled: true,
      });
    });
    // 主题没被这次保存顺手重写：页面上的 dataset 仍是打开设置页前的深色
    expect(h.ctx.settings.theme).toBe('dark');
  });
});
