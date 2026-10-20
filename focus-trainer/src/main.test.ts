import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from './core/storage';
import type { AppContext } from './ui/context';

// spec §6 第一条（IndexedDB 打开失败 → 顶部提示 + 改用内存仓库 + 游戏照常可玩）的执行证据。
// 这条分支此前一次都没跑过：没有任何测试 import 过 main.ts（grep -rn "from '.*main'" src --include=*.test.ts 为空），
// 所以文案写错、banner 为 null、内存仓库少实现一个方法这三种情况现在都不会被发现。
//
// 环境是 vitest 的 node、没有 jsdom，DOM 全靠下面这套手写桩（风格照 src/ui/pages/play.test.ts）：
// document.getElementById('banner'|'view') / createElement / addEventListener(带 signal 摘监听) /
// visibilityState、Element 与 HTMLButtonElement（instanceof 判定用）、window 的 hashchange 监听与
// dispatchEvent、location.hash、history.replaceState、navigator.storage.persist、
// requestAnimationFrame / cancelAnimationFrame、confirm、HashChangeEvent，外加 console.error 与
// Date.now 打桩。AbortController / structuredClone / performance.now 在 node 24 是真全局，不桩；
// indexedDB 也不桩 —— openIdbRepository 整个被框架级 mock 换成可编程的假实现。
type StorageModule = typeof import('./core/storage');
type MainModule = typeof import('./main');

// 两条 mock 通道：
// 1) openIdbRepository 换成可编程的假实现。./core/storage 的其余导出保持真身（importOriginal 展开），
//    否则 `ctx.repo instanceof MemoryRepository` 就成了拿假类自证。
// 2) renderHome 只是路过记一笔实参，真实实现照常执行 —— 页面真正拿到的 ctx 长什么样必须能读到，
//    storageOk 没有任何页面把它渲染出来（全仓 grep 只见 main.ts 与两个测试自己造 ctx），别处观测不到。
//    renderLibrary 开的是同一条形状的第二支：show() 里 games 分支走没走到库页，
//    光看视图文本会被「renderHome 的第 4 参有默认值」这种误写骗过去（tsc 与其余用例全绿）。
const recorder = vi.hoisted(() => ({
  openIdbRepository: vi.fn(),
  home: [] as Array<{ view: HTMLElement; ctx: AppContext; signal: AbortSignal }>,
  library: [] as Array<{ view: HTMLElement; ctx: AppContext; signal: AbortSignal }>,
}));

vi.mock('./core/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./core/storage')>();
  return { ...actual, openIdbRepository: recorder.openIdbRepository };
});

vi.mock('./ui/pages/home', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ui/pages/home')>();
  return {
    ...actual,
    renderHome: (view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> => {
      recorder.home.push({ view, ctx, signal });
      return actual.renderHome(view, ctx, signal);
    },
  };
});

vi.mock('./ui/pages/library', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ui/pages/library')>();
  return {
    ...actual,
    renderLibrary: (view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> => {
      recorder.library.push({ view, ctx, signal });
      return actual.renderLibrary(view, ctx, signal);
    },
  };
});

class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
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
  text = '';
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; contains(c: string): boolean; toggle(c: string, on: boolean): boolean } {
    const classes = this.classes;
    return {
      add: (c: string): void => {
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

  remove(): void {
    const p = this.parent;
    if (p) p.children.splice(p.children.indexOf(this), 1);
  }

  addEventListener(type: string, fn: (ev: never) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: never) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  closest(selector: string): StubEl | null {
    return selector === 'button[data-i]' && this.tag === 'button' && this.dataset.i !== undefined ? this : null;
  }

  fire(type: string, ev: Record<string, unknown> = {}): void {
    for (const h of this.handlers.filter((x) => x.type === type)) {
      (h.fn as (e: unknown) => void)({ ...ev, preventDefault: (): void => undefined });
    }
  }

  hasClass(name: string): boolean {
    return this.classes.has(name);
  }

  /** 与 nav.test.ts 的桩同名同义：按 class 收集子树（页签与库页的行数都靠它数） */
  byClass(cls: string): StubEl[] {
    const out: StubEl[] = [];
    if (this.classes.has(cls)) out.push(this);
    for (const c of this.children) out.push(...c.byClass(cls));
    return out;
  }

  find(pred: (el: StubEl) => boolean): StubEl | null {
    if (pred(this)) return this;
    for (const c of this.children) {
      const hit = c.find(pred);
      if (hit) return hit;
    }
    return null;
  }
}

class StubButton extends StubEl {}

class FakeHashChangeEvent {
  constructor(readonly type: string) {}
}

// Date.now() 打桩后的固定值：只允许进 startedAt、种子和日期键（与 play.test.ts 同一套约定）。
const EPOCH = new Date(2026, 9, 19, 10, 0).getTime();
const EPOCH_DAY = '2026-10-19';

function setupDom(initialHash = '#/') {
  const banner = new StubEl('div');
  // index.html 里是 <div id="banner" hidden>，桩的初始状态必须是隐藏的，
  // 否则用例 3「正常路径不出现这条提示」就退化成断言一个恒真的值。
  banner.hidden = true;
  const view = new StubEl('main');
  const byId: Record<string, StubEl> = { banner, view, tabbar: new StubEl('nav') };

  // 假时钟：只喂给 rAF 回调。基准取真实 performance.now()，与 play.ts 的倒计时同源。
  let clock = Math.floor(performance.now());
  let hashValue = initialHash;
  let seq = 1;
  const queue: Array<{ id: number; cb: (t: number) => void }> = [];
  const docHandlers: Array<{ type: string; fn: (ev: never) => void }> = [];
  const winHandlers: Array<{ type: string; fn: (ev: { type: string }) => void }> = [];

  const requestAnimationFrame = (cb: (t: number) => void): number => {
    const id = seq++;
    queue.push({ id, cb });
    return id;
  };
  const cancelAnimationFrame = (id: number): void => {
    const i = queue.findIndex((f) => f.id === id);
    if (i >= 0) queue.splice(i, 1);
  };

  const dispatchWindow = (ev: { type: string }): boolean => {
    for (const h of [...winHandlers]) if (h.type === ev.type) (h.fn as (e: unknown) => void)(ev);
    return true;
  };

  const doc = {
    visibilityState: 'visible',
    getElementById: (id: string): StubEl | null => byId[id] ?? null,
    createElement: (tag: string): StubEl => (tag === 'button' ? new StubButton(tag) : new StubEl(tag)),
    addEventListener: (type: string, fn: (ev: never) => void, opts?: { signal?: AbortSignal }): void => {
      const entry = { type, fn };
      docHandlers.push(entry);
      // 浏览器在 signal 触发时自动摘监听，这里照做，换页 abort 路径才可观测
      opts?.signal?.addEventListener('abort', () => {
        const i = docHandlers.indexOf(entry);
        if (i >= 0) docHandlers.splice(i, 1);
      });
    },
    removeEventListener: (type: string, fn: (ev: never) => void): void => {
      const i = docHandlers.findIndex((h) => h.type === type && h.fn === fn);
      if (i >= 0) docHandlers.splice(i, 1);
    },
    fire(type: string): void {
      for (const h of docHandlers.filter((x) => x.type === type)) (h.fn as (e: unknown) => void)({ type });
    },
  };

  const windowStub = {
    addEventListener: (type: string, fn: (ev: { type: string }) => void): void => {
      winHandlers.push({ type, fn });
    },
    removeEventListener: (type: string, fn: (ev: { type: string }) => void): void => {
      const i = winHandlers.findIndex((h) => h.type === type && h.fn === fn);
      if (i >= 0) winHandlers.splice(i, 1);
    },
    dispatchEvent: dispatchWindow,
  };

  const locationStub = {
    get hash(): string {
      return hashValue;
    },
    // 浏览器在 location.hash 被赋值后派发 hashchange；桩里当场同步派发（真机是下一个任务）。
    // 这是本桩唯一一处顺序简化：它只影响「渲染发生在点击的同一条任务里」，
    // router / parseRoute / show / renderPlay / saveFinishedSession 全是真代码在跑。
    set hash(v: string) {
      hashValue = v;
      dispatchWindow(new FakeHashChangeEvent('hashchange'));
    },
  };

  const replaceState = vi.fn((_state: unknown, _title: string, url: string): void => {
    // replaceState 改 URL 但不派发 hashchange（浏览器语义），紧随其后的 dispatchEvent 才驱动 router
    hashValue = url;
  });

  vi.stubGlobal('Element', StubEl);
  vi.stubGlobal('HTMLButtonElement', StubButton);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', windowStub);
  vi.stubGlobal('HashChangeEvent', FakeHashChangeEvent);
  vi.stubGlobal('history', { replaceState, back: vi.fn(), length: 1 });
  vi.stubGlobal('location', locationStub);
  const persist = vi.fn(async (): Promise<boolean> => true);
  vi.stubGlobal('navigator', { storage: { persist } });
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
  vi.stubGlobal('confirm', vi.fn(() => false));
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Date, 'now').mockReturnValue(EPOCH);

  const requireEl = (el: StubEl | null | undefined, what: string): StubEl => {
    if (!el) throw new Error(`桩里找不到${what}`);
    return el;
  };
  const frameAt = (t: number): void => {
    clock = t;
    for (const f of queue.splice(0, queue.length)) f.cb(t);
  };
  // 舒尔特不判帧间隔（spec §6 只对完型/序列/MOT 计时序阶段生效），所以 1000ms 一步喂是安全的，
  // 而且必须这么大：3 秒倒计时按 performance.now() 起算，小步喂要喂满 30 帧。
  const step = (): number => {
    clock += 1000;
    return clock;
  };
  const findButton = (label: string): StubEl | null => view.find((x) => x.tag === 'button' && x.textContent === label);
  const button = (label: string): StubEl => requireEl(findButton(label), `按钮「${label}」`);
  const info = (): StubEl => requireEl(view.find((x) => x.hasClass('schulte-info')), 'schulte-info');
  const grid = (): StubEl => requireEl(view.find((x) => x.hasClass('schulte-grid')), 'schulte-grid');

  /** 顶部「下一个 X」里的那个 X；本轮点完显示「下一个 —」 */
  const nextLabel = (): string => {
    const m = /下一个 (\S+)　/.exec(info().textContent);
    if (!m) throw new Error(`顶部提示读不出「下一个」：${info().textContent}`);
    return m[1] ?? '—';
  };

  /** 喂帧直到这一轮的格子真的建出来：新布局的格子一律没打 done，旧布局残留是全 done */
  const framesUntilRoundGrid = (): void => {
    for (let i = 0; i < 24; i++) {
      frameAt(step());
      const cells = grid().children;
      if (cells.length > 0 && cells.some((c) => !c.hasClass('done'))) return;
    }
    throw new Error('这一轮的格子没有建出来');
  };

  /** 完全按用户在屏幕上看到的东西点完一轮：读「下一个」→ 找同标签的格子 → 派发 pointerdown → 补一帧 */
  const clickRoundByInfo = (): number => {
    let clicks = 0;
    for (let guard = 0; guard < 80; guard++) {
      const label = nextLabel();
      if (label === '—') return clicks;
      const cell = grid().children.find((c) => c.textContent === label);
      if (!cell) throw new Error(`格子里找不到标签「${label}」`);
      if (cell.hasClass('done')) throw new Error(`标签「${label}」已经是 done，DOM 与引擎不同步`);
      grid().fire('pointerdown', { target: cell, timeStamp: (clock += 300) });
      clicks += 1;
      frameAt(clock);
    }
    throw new Error('这一轮点不完');
  };

  return {
    banner,
    view,
    tabbar: byId.tabbar,
    doc,
    queue,
    consoleError,
    consoleWarn,
    replaceState,
    persist,
    frameAt,
    step,
    button,
    findButton,
    info,
    grid,
    nextLabel,
    framesUntilRoundGrid,
    clickRoundByInfo,
    hash: (): string => locationStub.hash,
    text: (): string => view.textContent,
    /** 等首页真的渲染完：boot() 的异步尾巴（renderHome 末尾那次 replaceChildren）落定，才允许再装配一次 */
    waitForHome: (): Promise<void> => vi.waitFor(() => expect(view.textContent).toContain('专注力训练'), { timeout: 2000 }),
  };
}

/**
 * main.ts 末尾的 `boot().catch(...)` 是模块级自调，导入即执行，测试跳不过去（本任务只允许加 export）。
 * 所以每个用例的顺序是：resetModules → 先取 storage 模块（拿到与 main 同代际的 MemoryRepository 类对象）
 * → 配好 openIdbRepository → 再导入 main。resetModules 会让 ./core/storage 的 mock 工厂重跑一次，
 * MemoryRepository 是个新类；先导入它、后导入 main，两者才落在同一个模块代际里，
 * `instanceof` 比的才是 boot() 内部真的 new 出来的那个类。
 */
async function freshStorage(): Promise<StorageModule> {
  vi.resetModules();
  return await import('./core/storage');
}

async function importMain(): Promise<MainModule> {
  return await import('./main');
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  recorder.home.length = 0;
  recorder.library.length = 0;
  recorder.openIdbRepository.mockReset();
});

describe('boot() 的存储失败分支（spec §6 第一条）', () => {
  beforeEach(() => {
    recorder.home.length = 0;
    recorder.library.length = 0;
    recorder.openIdbRepository.mockReset();
  });

  it('IndexedDB 打开失败时给出顶部提示「本次成绩无法保存」', async () => {
    const h = setupDom();
    await freshStorage();
    const err = new Error('IndexedDB blocked');
    recorder.openIdbRepository.mockRejectedValue(err);
    const { boot } = await importMain();
    await h.waitForHome();

    await expect(boot()).resolves.toBeUndefined();
    expect(h.banner.textContent).toBe('本次成绩无法保存');
    expect(h.banner.hidden).toBe(false);
    expect(h.consoleError).toHaveBeenCalledWith('IndexedDB 打开失败，改用内存仓库', err);
  });

  it('失败路径交给页面的 ctx 是 storageOk=false 的内存仓库', async () => {
    const h = setupDom();
    const storage = await freshStorage();
    recorder.openIdbRepository.mockRejectedValue(new Error('IndexedDB blocked'));
    const { boot } = await importMain();
    await h.waitForHome();

    await boot();
    const entry = recorder.home.at(-1);
    if (!entry) throw new Error('boot() 没有把首页渲染出来');
    expect(entry.ctx.storageOk).toBe(false);
    expect(entry.ctx.repo).toBeInstanceOf(storage.MemoryRepository);
    // settings 也是从这个内存仓库读出来的（main.ts:43）
    expect(entry.ctx.settings).toEqual({ dayStartHour: 4 });
    // 交给页面的容器就是 #view 那个节点
    expect(entry.view).toBe(h.view);
    expect(h.persist).toHaveBeenCalledTimes(2);
  });

  it('IndexedDB 正常打开时顶部提示保持隐藏，页面拿到的是 idb 仓库', async () => {
    const h = setupDom();
    const storage = await freshStorage();
    // 假 idb 仓库：12 个方法逐一转发给一个真 MemoryRepository，本身只用来做对象同一性判定
    const backing = new storage.MemoryRepository();
    const idbRepo: Repository = {
      getGameState: (g) => backing.getGameState(g),
      listGameStates: () => backing.listGameStates(),
      getPlan: (k) => backing.getPlan(k),
      putPlan: (p) => backing.putPlan(p),
      listPlans: () => backing.listPlans(),
      listSessions: (g) => backing.listSessions(g),
      lastSession: (g) => backing.lastSession(g),
      getSession: (i) => backing.getSession(i),
      saveSession: (r, s, p) => backing.saveSession(r, s, p),
      getSettings: () => backing.getSettings(),
      putSettings: (s) => backing.putSettings(s),
      clearAll: () => backing.clearAll(),
    };
    recorder.openIdbRepository.mockResolvedValue(idbRepo);
    const { boot } = await importMain();
    await h.waitForHome();

    await boot();
    expect(h.banner.hidden).toBe(true);
    expect(h.banner.textContent).toBe('');
    expect(h.text()).not.toContain('本次成绩无法保存');
    const entry = recorder.home.at(-1);
    if (!entry) throw new Error('boot() 没有把首页渲染出来');
    expect(entry.ctx.storageOk).toBe(true);
    expect(entry.ctx.repo).toBe(idbRepo);
  });

  it('存储不可用时舒尔特照常玩完整场训练并落进内存仓库', async () => {
    const h = setupDom();
    const storage = await freshStorage();
    recorder.openIdbRepository.mockRejectedValue(new Error('IndexedDB blocked'));
    // 用例 4 只用导入期那一次 boot()：显式再 boot() 会多挂一个 hashchange 监听，
    // 一次跳转双份渲染，router 那条链路就不是真机的形状了。
    await importMain();
    await h.waitForHome();

    expect(recorder.home).toHaveLength(1);
    const ctx = recorder.home[0]?.ctx;
    if (!ctx) throw new Error('boot() 没有把首页渲染出来');
    expect(ctx.storageOk).toBe(false);
    const repo = ctx.repo;
    expect(repo).toBeInstanceOf(storage.MemoryRepository);
    expect(await repo.listSessions()).toHaveLength(0);
    expect(await repo.getPlan(EPOCH_DAY)).toMatchObject({
      games: ['schulte', 'stroop', 'seqmem'],
      completed: [],
    });

    // 真点首页的「开始训练」：home.onclick → navigate → location.hash → hashchange → startRouter → renderPlay
    expect(() => h.button('开始训练').fire('click')).not.toThrow();
    await vi.waitFor(() => expect(h.findButton('开始')).not.toBeNull(), { timeout: 2000 });
    expect(h.text()).toContain('舒尔特方格');
    // 顶部提示不因换页消失
    expect(h.banner.hidden).toBe(false);

    // 说明层 → 3 秒倒计时 → 三轮舒尔特全点完
    expect(() => {
      h.button('开始').fire('click');
      for (let round = 1; round <= 3; round++) {
        h.framesUntilRoundGrid();
        h.clickRoundByInfo();
        h.frameAt(h.step());
        if (round < 3) h.button('继续').fire('click');
      }
    }).not.toThrow();

    await vi.waitFor(() => expect(h.replaceState).toHaveBeenCalledWith(null, '', '#/result/1'), { timeout: 2000 });
    const sessions = await repo.listSessions();
    expect(sessions).toHaveLength(1);
    const [record] = sessions;
    if (!record) throw new Error('内存仓库里没有落库记录');
    expect(record.id).toBe(1);
    expect(record.gameId).toBe('schulte');
    expect(record.mode).toBe('plan');
    expect(record.dayKey).toBe(EPOCH_DAY);
    expect(record.rounds.map((r) => [r.level, r.outcome])).toEqual([
      [1, 'pass'],
      [2, 'pass'],
      [3, 'pass'],
    ]);
    expect(await repo.getSession(1)).not.toBeNull();
    expect(await repo.getPlan(EPOCH_DAY)).toMatchObject({ completed: ['schulte'] });
    // saveSession 返回的自增 id 一路流进了路由
    expect(h.hash()).toBe('#/result/1');

    // 结算页也真的用同一个内存仓库渲染出来了
    await vi.waitFor(() => expect(h.text()).toContain('本次结果'), { timeout: 2000 });
    expect(h.text()).toContain('最佳用时');

    // 「boot() 全程没有 reject」的真实观测面（不是空断言）：
    // main.ts:60 的 .catch 会把「启动失败」写进 #view，main.ts:52-54 的页面级 catch 会 console.error
    // 并写「页面出错」——两者都没发生；整场装配 + 跳转 + 三轮训练 + 落库 + 结算页，
    // console.error 只留下存储失败那一条。
    expect(h.consoleError.mock.calls.map((c) => c[0])).toEqual(['IndexedDB 打开失败，改用内存仓库']);
    expect(h.text()).not.toContain('启动失败');
    expect(h.text()).not.toContain('页面出错');
    expect(h.text()).not.toContain('保存失败');
  });

  // 页签外壳的三条 boot 级判据（Task 3）。只断言 DOM 桩上真实发生的事：
  // nav.ts 的纯逻辑已由 src/ui/nav.test.ts 覆盖，这三条要证的是「main.ts 有没有把 renderNav 接上、
  // 接的顺序对不对、games 分支走的是不是库页」。
  it('#/ 时页签常驻：4 个链接、标签按今日/库/趋势/设置排、恰一条 aria-current=page', async () => {
    const h = setupDom('#/');
    const storage = await freshStorage();
    recorder.openIdbRepository.mockResolvedValue(new storage.MemoryRepository());
    await importMain();
    await h.waitForHome();

    expect(h.tabbar.hidden).toBe(false);
    expect(h.tabbar.children.map((c) => c.textContent)).toEqual(['今日', '库', '趋势', '设置']);
    expect(h.tabbar.children.filter((c) => c.attrs.get('aria-current') === 'page')).toHaveLength(1);
  });

  it('#/play/schulte/plan 时页签被隐藏并清空：训练中没有「离开这一轮」的入口', async () => {
    const h = setupDom('#/play/schulte/plan');
    const storage = await freshStorage();
    recorder.openIdbRepository.mockResolvedValue(new storage.MemoryRepository());
    await importMain();
    await vi.waitFor(() => expect(h.view.textContent).toContain('舒尔特方格'), { timeout: 2000 });

    expect(h.tabbar.hidden).toBe(true);
    expect(h.tabbar.children).toHaveLength(0);
    expect(h.tabbar.textContent).toBe('');
  });

  // T2 评审带出的补测：show() 里把 renderLibrary 误写成 renderHome(view, ctx, signal) 时，
  // renderHome 的第 4 参有默认值 ⇒ tsc 与其余全部用例都是绿的，只有这条能拦住。
  it('#/games 时 show() 真的走训练库那一支，页签的 aria-current 落在「库」上', async () => {
    const h = setupDom('#/games');
    const storage = await freshStorage();
    recorder.openIdbRepository.mockResolvedValue(new storage.MemoryRepository());
    await importMain();
    await vi.waitFor(() => expect(recorder.library).toHaveLength(1), { timeout: 2000 });

    const entry = recorder.library[0];
    if (!entry) throw new Error('boot() 没有把训练库渲染出来');
    expect(entry.ctx.storageOk).toBe(true);
    expect(entry.view).toBe(h.view);
    expect(entry.signal).toBeInstanceOf(AbortSignal);
    expect(entry.signal.aborted).toBe(false);
    expect(h.view.byClass('plan-row')).toHaveLength(5);
    expect(h.tabbar.hidden).toBe(false);
    const current = h.tabbar.children.filter((c) => c.attrs.get('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe('库');
    // games 分支若误走首页，recorder.home 就会多出一笔而库页为空
    expect(recorder.home).toHaveLength(0);
  });

  // Task 4 评审 S1 的补测：全仓没有 settings.test.ts，main.ts 也没对 renderSettings 做 vi.mock，
  // 所以这条 boot 级用例走的是真实实现 + 内存仓库，是「设置页不再自带返回按钮」唯一的测试面。
  // 渲染闸门用只有设置页才有的「每日分界时间」，确保断言落在真的设置页上而非任何回退首页。
  it('#/settings 时设置页不再自带返回按钮：抬头是「设置」，页签 aria-current 恰落在一条链接上', async () => {
    const h = setupDom('#/settings');
    const storage = await freshStorage();
    recorder.openIdbRepository.mockResolvedValue(new storage.MemoryRepository());
    await importMain();
    await vi.waitFor(() => expect(h.view.textContent).toContain('每日分界时间'), { timeout: 2000 });

    expect(h.view.textContent).not.toContain('返回');
    expect(h.view.textContent).toContain('设置');
    const current = h.tabbar.children.filter((c) => c.attrs.get('aria-current') === 'page');
    expect(current).toHaveLength(1);
  });
});
