import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../core/storage';
import type { GameId, SessionRecord } from '../../core/types';
import { GAMES } from '../../games/registry';
import type { AppContext } from '../context';
import { renderLibrary } from './library';

// node 环境没有 jsdom，DOM 全靠这套手写桩（与 home.test.ts / play.test.ts / trends.test.ts 同源）：
// createElement / append / replaceChildren / textContent / className / classList(add|contains|toggle|remove)
// / setAttribute / style / add|removeEventListener，加 location.hash 与 document.body。
// 同一个仓库里每个页面测试各带一份手写桩是既有约定，不为去重去改别的文件。
// 这一页不读时钟、不动定时器、不排计划，所以 setup 比首页少一层假时钟。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly attrs = new Map<string, string>();
  readonly styleVars = new Map<string, string>();
  readonly style = {
    gridTemplateColumns: '',
    setProperty: (k: string, v: string): void => {
      this.styleVars.set(k, v);
    },
    getPropertyValue: (k: string): string => this.styleVars.get(k) ?? '',
  };
  parent: StubEl | null = null;
  hidden = false;
  disabled = false;
  value = '';
  text = '';
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): {
    add(c: string): void;
    remove(c: string): void;
    contains(c: string): boolean;
    toggle(c: string, on: boolean): boolean;
  } {
    const classes = this.classes;
    return {
      add: (c: string): void => {
        classes.add(c);
      },
      remove: (c: string): void => {
        classes.delete(c);
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

  /** 真浏览器点一次按钮会派发 click；桩只管把同类型监听全跑一遍 */
  fire(type: string): void {
    for (const h of this.handlers.filter((x) => x.type === type)) (h.fn as (e: unknown) => void)({ type });
  }

  hasClass(name: string): boolean {
    return this.classes.has(name);
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

  byClass(cls: string): StubEl[] {
    return this.all((el) => el.classes.has(cls));
  }
}

// 档位记录落库要 dayKey，这里钉一个固定日即可（这一页不读时钟，换日不影响断言）。
const EPOCH = new Date(2026, 9, 19, 10, 0).getTime();
const TODAY = '2026-10-19';

function rec(gameId: GameId, dayKey: string): SessionRecord {
  return {
    gameId,
    mode: 'plan',
    dayKey,
    startedAt: EPOCH,
    durationMs: 1000,
    startLevel: 1,
    endLevel: 1,
    rounds: [],
    summary: {},
    ability: 10,
  };
}

function setup(opts: { levels?: Array<[GameId, number]> } = {}) {
  const view = new StubEl('main');
  const body = new StubEl('body');
  const repo = new MemoryRepository();
  // 铺档位走 home.test.ts 同一条通路：saveSession(rec, state, plan)。
  // levels 省略时一个状态都不铺 —— 「第 1 档」那条断言测的正是库里没有这行记录时的兜底。
  for (const [gameId, level] of opts.levels ?? []) {
    void repo.saveSession(
      rec(gameId, TODAY),
      { gameId, level, passStreak: 0, failStreak: 0, lastPlayedDayKey: TODAY },
      { dayKey: TODAY, games: GAMES.map((g) => g.id), completed: [] },
    );
  }
  const ctx: AppContext = { repo, storageOk: true, settings: { dayStartHour: 4 } };
  const ac = new AbortController();
  const hashSet: string[] = [];
  let hashValue = '#/';
  vi.stubGlobal('document', {
    createElement: (tag: string) => new StubEl(tag),
    body,
  });
  vi.stubGlobal('location', {
    get hash(): string {
      return hashValue;
    },
    set hash(v: string) {
      hashValue = v;
      hashSet.push(v);
    },
  });

  return {
    view,
    body,
    repo,
    ctx,
    ac,
    hashSet,
    hash: (): string => hashValue,
    render: (): Promise<void> => renderLibrary(view as unknown as HTMLElement, ctx, ac.signal),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('训练库页', () => {
  it('列出注册表里的全部五款，顺序与 GAMES 一致', async () => {
    const h = setup();
    await h.render();
    const rows = h.view.byClass('plan-row');
    expect(rows).toHaveLength(5);
    // 三行都引用注册表对象本身：行内容若不是真的来自 GAMES，这里就红。
    expect(rows.map((r) => r.byClass('eyebrow')[0].textContent)).toEqual(GAMES.map((g) => g.id));
    expect(rows.map((r) => r.byClass('plan-name')[0].textContent)).toEqual(GAMES.map((g) => g.name));
    expect(rows.map((r) => r.byClass('plan-ability')[0].textContent)).toEqual(GAMES.map((g) => `练${g.ability}`));
    // 中文名再钉一份字面量：注册表被人改名时 GAMES 派生那几行会一起绿，只有这条会红，改名能被看见。
    expect(rows.map((r) => r.byClass('plan-name')[0].textContent)).toEqual(['舒尔特方格', '颜色认知', '序列记忆', '视觉动态感知', '视觉完型整合']);
  });

  it('每行的「练什么」直接取 GameModule.ability，页面不自己编文案', async () => {
    const h = setup();
    await h.render();
    expect(h.view.byClass('plan-ability').map((e) => e.textContent)).toEqual([
      '练持续注意',
      '练抑制控制',
      '练工作记忆',
      '练动态感知',
      '练完型整合',
    ]);
  });

  it('档位读 listGameStates；没有记录的游戏按第 1 档显示', async () => {
    const h = setup({ levels: [['schulte', 4]] });
    await h.render();
    const metas = h.view.byClass('plan-meta').map((e) => e.textContent);
    expect(metas[0]).toBe('第 4 档');
    expect(metas[1]).toBe('第 1 档');
  });

  it('点第三行的「去练」进 free 模式：路由写成 #/play/seqmem/free', async () => {
    const h = setup();
    await h.render();
    const row = h.view.byClass('plan-row')[2];
    const go = row.children.find((c) => c.tag === 'button');
    if (!go) throw new Error('计划行里没有按钮');
    go.fire('click');
    expect(h.hashSet).toEqual(['#/play/seqmem/free']);
  });

  it('signal 已 abort 时一个字都不写', async () => {
    const h = setup();
    h.ac.abort();
    await h.render();
    expect(h.view.children).toHaveLength(0);
  });

  it('这一页不带「去练」以外的按钮，也不自带返回首页的按钮', async () => {
    const h = setup();
    await h.render();
    // 个数 + 标签全等：只数个数的话，按钮文案换成别的（甚至 mode 写错导致语义变了）也不会红。
    const buttons = h.view.all((e) => e.tag === 'button');
    expect(buttons.map((b) => b.textContent)).toEqual(['去练', '去练', '去练', '去练', '去练']);
    expect(h.view.textContent).not.toContain('返回');
  });
});
