import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Route } from './router';
import { renderNav, TABS } from './nav';

class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly attrs = new Map<string, string>();
  hidden = false;
  text = '';

  constructor(readonly tag: string) {}

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  append(...items: Array<StubEl | string>): void {
    for (const item of items) {
      if (typeof item === 'string') this.text += item;
      else this.children.push(item);
    }
  }

  replaceChildren(...items: Array<StubEl | string>): void {
    this.text = '';
    this.children.length = 0;
    this.append(...items);
  }

  byClass(cls: string): StubEl[] {
    const out: StubEl[] = [];
    if (this.classes.has(cls)) out.push(this);
    for (const c of this.children) out.push(...c.byClass(cls));
    return out;
  }
}

function mount(route: Route): StubEl {
  vi.stubGlobal('document', { createElement: (tag: string) => new StubEl(tag) });
  const root = new StubEl('nav');
  renderNav(root as unknown as HTMLElement, route);
  return root;
}

describe('页签表', () => {
  it('四个页签按 今日 / 库 / 趋势 / 设置 排，标签与路由名一一对应', () => {
    expect(TABS.map((t) => t.label)).toEqual(['今日', '库', '趋势', '设置']);
    expect(TABS.map((t) => t.route.name)).toEqual(['home', 'games', 'trend', 'settings']);
  });
});

describe('renderNav', () => {
  it('先渲染常驻页再切进训练：容器被清空而不是留在旧页签上', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new StubEl(tag) });
    const root = new StubEl('nav');
    renderNav(root as unknown as HTMLElement, { name: 'home' });
    expect(root.children).toHaveLength(4);
    expect(root.textContent).toContain('今日');

    renderNav(root as unknown as HTMLElement, { name: 'play', gameId: 'schulte', mode: 'plan' });
    expect(root.hidden).toBe(true);
    expect(root.children).toHaveLength(0);
    expect(root.textContent).toBe('');
  });

  it('四种非常驻路由都走隐藏入口', () => {
    for (const r of [
      { name: 'play', gameId: 'schulte', mode: 'plan' },
      { name: 'play', gameId: 'mot', mode: 'free' },
      { name: 'result', sessionId: 7 },
    ] as Route[]) {
      expect(mount(r).hidden).toBe(true);
    }
  });

  it('四个常驻页各给一个链接，href 就是路由的 href', () => {
    for (const name of ['home', 'games', 'trend', 'settings'] as const) {
      const root = mount({ name });
      expect(root.hidden).toBe(false);
      // 标签名要钉死：styles.css 的 #tabbar .tab { min-height: var(--tap) } 只给 <a> 兜底，写成别的就没人守 48px
      expect(root.children.every((c) => c.tag === 'a')).toBe(true);
      expect(root.children.map((c) => c.attrs.get('href'))).toEqual(['#/', '#/games', '#/trend', '#/settings']);
    }
  });

  it('当前页只有一条带 aria-current，且用 class 而不是 opacity 区分', () => {
    const root = mount({ name: 'games' });
    const current = root.children.filter((c) => c.attrs.get('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('库');
    expect(root.byClass('active')).toHaveLength(1);
    expect(root.byClass('active')[0].attrs.get('aria-current')).toBe('page');
    // 非当前页不许靠降低不透明度变「次要」：那是 M1 遗留缺陷 1 的同一条纪律
    expect(root.children.some((c) => c.attrs.has('style'))).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
