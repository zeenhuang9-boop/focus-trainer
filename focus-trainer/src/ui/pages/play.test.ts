import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionRunner } from '../../core/session';
import { MemoryRepository } from '../../core/storage';
import type { GameId, Mode } from '../../core/types';
import type { SchulteSnapshot } from '../../games/schulte/engine';
import type { AppContext } from '../context';
import { renderPlay } from './play';

// node 环境没有 DOM，这里手写 play.ts + 舒尔特视图用到的那一小撮 API 的最小桩：
// createElement / append / replaceChildren / textContent / className / dataset / style /
// add|removeEventListener / closest / remove / classList，外加 requestAnimationFrame /
// cancelAnimationFrame / document.addEventListener 与 visibilitychange 派发 / confirm /
// history.replaceState / location.hash 赋值 / window.dispatchEvent / HashChangeEvent。
// 目的不是模拟浏览器，而是钉住「喂进 runner 的只有帧时间戳与事件时间戳」这条时钟契约
// （spec 4.3，Task 5 裁定 durationMs 不做兜底）；手感与真实时间戳仍由 Task 10 浏览器验收。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly styleVars = new Map<string, string>();
  readonly style = {
    gridTemplateColumns: '',
    setProperty: (k: string, v: string): void => {
      this.styleVars.set(k, v);
    },
    getPropertyValue: (k: string): string => this.styleVars.get(k) ?? '',
  };
  parent: StubEl | null = null;
  removed = false;
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
    this.removed = true;
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

  count(type: string): number {
    return this.handlers.filter((x) => x.type === type).length;
  }

  hasClass(name: string): boolean {
    return this.classes.has(name);
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

// Date.now() 打桩后的固定值：它只允许进 startedAt、种子和日期键。漏进轮内计时的话
// durationMs 会变成 1.7e12 量级，下面的断言全部会炸。
const EPOCH = new Date(2026, 9, 19, 10, 0).getTime();
const EPOCH_DAY = '2026-10-19';

function setup() {
  const view = new StubEl('main');
  const repo = new MemoryRepository();
  const ctx: AppContext = { repo, storageOk: true, settings: { dayStartHour: 4 } };
  const ac = new AbortController();

  // 假时钟：帧时间戳与事件时间戳都从它取，基准抹掉小数部分，期望值不用跟浮点误差较真。
  // 倒计时用真实 performance.now()，与本时钟同源，只影响倒计时占几帧。
  let clock = Math.floor(performance.now());
  const fed: number[] = [];
  const queue: Array<{ id: number; cb: (t: number) => void }> = [];
  const docHandlers: Array<{ type: string; fn: (ev: never) => void }> = [];
  const confirmResults: boolean[] = [];
  const hashSet: string[] = [];
  let lastFrameCb: ((t: number) => void) | null = null;
  let hashValue = '#/';
  let seq = 1;

  const requestAnimationFrame = (cb: (t: number) => void): number => {
    const id = seq++;
    queue.push({ id, cb });
    lastFrameCb = cb;
    return id;
  };
  const cancelAnimationFrame = (id: number): void => {
    const i = queue.findIndex((f) => f.id === id);
    if (i >= 0) queue.splice(i, 1);
  };

  const doc = {
    visibilityState: 'visible',
    createElement: (tag: string) => (tag === 'button' ? new StubButton(tag) : new StubEl(tag)),
    addEventListener: (type: string, fn: (ev: never) => void, opts?: { signal?: AbortSignal }): void => {
      const entry = { type, fn };
      docHandlers.push(entry);
      // 浏览器在 signal 触发时自动摘监听，这里照做，abort 路径才可观测
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
    count: (type: string): number => docHandlers.filter((x) => x.type === type).length,
  };

  const replaceState = vi.fn();
  const dispatchEvent = vi.fn();
  const location = {
    get hash(): string {
      return hashValue;
    },
    set hash(v: string) {
      hashValue = v;
      hashSet.push(v);
    },
  };
  class FakeHashChangeEvent {
    constructor(readonly type: string) {}
  }

  vi.stubGlobal('Element', StubEl);
  vi.stubGlobal('HTMLButtonElement', StubButton);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { dispatchEvent });
  vi.stubGlobal('HashChangeEvent', FakeHashChangeEvent);
  vi.stubGlobal('history', { replaceState });
  vi.stubGlobal('location', location);
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
  vi.stubGlobal('confirm', () => confirmResults.shift() ?? false);
  vi.spyOn(Date, 'now').mockReturnValue(EPOCH);
  const getGameState = vi.spyOn(repo, 'getGameState');

  // runner 的四个入口都在原型上打桩：vi.spyOn 默认照常执行原实现，只记录实参与调用者，
  // 这是从外部看到 play.ts 闭包里那个 runner 的唯一入口。
  const begin = vi.spyOn(SessionRunner.prototype, 'beginRound');
  const tick = vi.spyOn(SessionRunner.prototype, 'tick');
  const input = vi.spyOn(SessionRunner.prototype, 'input');
  const finish = vi.spyOn(SessionRunner.prototype, 'finish');
  // 下面的断言全靠 calls / contexts 的下标，一旦用例间泄漏就会看到上一个 runner
  if (begin.mock.calls.length + tick.mock.calls.length + finish.mock.calls.length > 0) {
    throw new Error('原型桩状态泄漏');
  }

  const requireEl = (el: StubEl | null | undefined, what: string): StubEl => {
    if (!el) throw new Error(`桩里找不到${what}`);
    return el;
  };
  const frameAt = (t: number): void => {
    clock = t;
    fed.push(t);
    for (const f of queue.splice(0, queue.length)) f.cb(t);
  };
  const step = (): number => {
    clock += 100;
    return clock;
  };
  const advance = (ms: number): number => {
    clock += ms;
    return clock;
  };
  const button = (label: string): StubEl =>
    requireEl(view.find((x) => x.tag === 'button' && x.textContent === label), `按钮「${label}」`);
  const stageGame = (): StubEl => requireEl(view.find((x) => x.hasClass('stage-game')), 'stage-game');
  const overlay = (): StubEl => requireEl(view.find((x) => x.hasClass('overlay')), 'overlay');
  const grid = (): StubEl => {
    const root = requireEl(stageGame().children[0], '游戏视图根节点');
    return requireEl(root.children[1], '方格容器');
  };
  const session = (): SessionRunner => {
    const runner = begin.mock.contexts[0] as unknown as SessionRunner | undefined;
    if (!runner) throw new Error('runner 还没开过轮');
    return runner;
  };
  const snapshot = (): SchulteSnapshot => session().engine.snapshot() as SchulteSnapshot;
  /** 监听挂在网格容器上（事件委托），所以必须在 grid 上派发、把格子当 target */
  const clickCell = (index: number, t: number): void => {
    if (index < 0) throw new Error('快照里找不到该标签');
    const cell = requireEl(grid().children[index], `第 ${index} 格`);
    grid().fire('pointerdown', { target: cell, timeStamp: t });
  };
  /** 点完当前这一轮（每格间隔 300ms），返回最后一格的时间戳 */
  const playRound = (): number => {
    let last = 0;
    // 上限只是防止桩跑飞；正常一轮最多 25 格
    for (let guard = 0; guard < 60; guard++) {
      const s = snapshot();
      if (s.done) return last;
      const index = s.cells.findIndex((c) => c.label === s.nextLabel);
      const cell = grid().children[index];
      if (!cell || cell.textContent !== s.nextLabel) {
        throw new Error(`DOM 与快照不一致：nextLabel=${s.nextLabel} index=${index} 桩里是 ${cell?.textContent}`);
      }
      clickCell(index, (clock += 300));
      last = clock;
    }
    throw new Error('这一轮点不完');
  };
  /** 跑帧直到 runner 开出第 expected 轮（3 秒倒计时按 1000ms 一步喂） */
  const framesUntilRound = (expected: number): void => {
    for (let i = 0; i < 12; i++) {
      frameAt(advance(1000));
      if (begin.mock.calls.length === expected) return;
    }
    throw new Error(`第 ${expected} 轮没有开始`);
  };

  return {
    view,
    repo,
    ctx,
    ac,
    begin,
    tick,
    input,
    finish,
    getGameState,
    replaceState,
    dispatchEvent,
    confirm: (v: boolean) => confirmResults.push(v),
    hashSet,
    doc,
    queue,
    frameAt,
    step,
    button,
    stageGame,
    overlay,
    grid,
    session,
    snapshot,
    clickCell,
    playRound,
    framesUntilRound,
    beginTimes: (): number[] => begin.mock.calls.map((c) => c[0]),
    runnerTimes: (): number[] => [...begin.mock.calls, ...tick.mock.calls].map((c) => c[0]),
    fed: (): number[] => [...fed],
    lastFrame: (): ((t: number) => void) | null => lastFrameCb,
    render: (gameId: GameId = 'schulte', mode: Mode = 'plan'): Promise<void> =>
      renderPlay(view as unknown as HTMLElement, ctx, gameId, mode, ac.signal),
  };
}

/** 说明层 → 倒计时 → 第 round 轮开轮，再补一帧让视图把格子建出来 */
function toRound(h: ReturnType<typeof setup>, round: number): void {
  h.button(round === 1 ? '开始' : '继续').fire('click');
  h.framesUntilRound(round);
  h.frameAt(h.step());
}

afterEach(() => {
  // 先清状态再还原原型：桩测全靠原型上的调用记录，跨用例残留会让断言看到上一个 runner
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderPlay 的时钟契约', () => {
  it('beginRound 与 tick 只收帧时间戳，durationMs 与假时钟一致', async () => {
    const h = setup();
    await h.render();
    expect(h.runnerTimes()).toEqual([]);

    toRound(h, 1);
    h.playRound();
    h.frameAt(h.step());
    toRound(h, 2);
    h.playRound();
    h.frameAt(h.step());
    toRound(h, 3);
    const lastClick = h.playRound();
    h.frameAt(h.step());
    await vi.waitFor(() => expect(h.replaceState).toHaveBeenCalled());

    const begins = h.beginTimes();
    expect(begins).toHaveLength(3);
    const times = h.runnerTimes();
    const fed = h.fed();
    // 每个实参都必须是被喂进 frame 的帧时间戳本身
    expect(times.every((t) => fed.includes(t))).toBe(true);
    expect(fed).not.toContain(EPOCH);
    expect(times).not.toContain(EPOCH);
    // 混进 Date.now() 的话这里就是 1.7e12 量级
    expect(Math.max(...times)).toBeLessThan(1e9);

    const [record] = await h.repo.listSessions();
    expect(record.startedAt).toBe(EPOCH);
    expect(record.dayKey).toBe(EPOCH_DAY);
    expect(record.durationMs).toBe(lastClick - begins[0]);
    expect(record.rounds.map((r) => [r.level, r.outcome])).toEqual([
      [1, 'pass'],
      [2, 'pass'],
      [3, 'pass'],
    ]);
  });

  it('InputEvent.t 原样是 PointerEvent.timeStamp，用时只跟假时钟走', async () => {
    const h = setup();
    await h.render();
    toRound(h, 1);

    const s0 = h.snapshot();
    const index = s0.cells.findIndex((c) => c.label === s0.nextLabel);
    h.clickCell(index, 1234.5);
    expect(h.input.mock.calls.map((c) => c[0])).toEqual([{ kind: 'cell', index, t: 1234.5 }]);
    expect(h.snapshot().cells[index].done).toBe(true);

    // 其余格子在假时钟上继续点，最终用时恰好等于「最后一格 − 开轮帧」
    const start = h.beginTimes()[0];
    let offset = 2000;
    let lastOffset = 0;
    for (let guard = 0; guard < 60 && !h.snapshot().done; guard++) {
      const s = h.snapshot();
      h.clickCell(s.cells.findIndex((c) => c.label === s.nextLabel), start + offset);
      lastOffset = offset;
      offset += 1000;
    }
    const s = h.snapshot();
    expect(s.done).toBe(true);
    expect(s.cells.every((c) => c.done)).toBe(true);
    expect(s.errors).toBe(0);
    expect(s.elapsedMs).toBe(lastOffset);
  });

  it('切到后台时作废当前轮，不扣分也不改档位', async () => {
    const h = setup();
    await h.render();
    toRound(h, 1);
    const s0 = h.snapshot();
    h.clickCell(s0.cells.findIndex((c) => c.label === s0.nextLabel), h.beginTimes()[0] + 300);
    expect(h.session().snapshot().phase).toBe('playing');

    h.doc.visibilityState = 'hidden';
    h.doc.fire('visibilitychange');

    const s = h.session().snapshot();
    expect(s.phase).toBe('voided');
    expect(s.roundNo).toBe(1);
    expect(s.level).toBe(1);
    expect(h.overlay().textContent).toContain('本轮已作废');

    // 点继续重开同一轮：轮号仍是第 1 轮，本轮不计分
    h.button('继续').fire('click');
    h.frameAt(h.step());
    expect(h.beginTimes()).toHaveLength(2);
    expect(h.session().snapshot().roundNo).toBe(1);
    expect(await h.repo.listSessions()).toHaveLength(0);
  });

  it('一次训练只结算一次，重复触发结束路径不会多写记录', async () => {
    const h = setup();
    await h.render();
    for (let round = 1; round <= 3; round++) {
      toRound(h, round);
      h.playRound();
      h.frameAt(h.step());
    }
    await vi.waitFor(() => expect(h.replaceState).toHaveBeenCalledWith(null, '', '#/result/1'));

    expect(h.finish.mock.calls).toEqual([[EPOCH_DAY]]);
    expect(await h.repo.listSessions()).toHaveLength(1);

    // 再补几帧并乱点一格：结束路径已被 ui === 'saving' 关掉，finish 不许第二次进来
    const cb = h.lastFrame();
    if (cb) cb(h.step());
    h.frameAt(h.step());
    const stray = h.grid().children[0];
    if (stray) h.grid().fire('pointerdown', { target: stray, timeStamp: h.step() });
    // saveFinishedSession 在 finish() 之前有 await 链，微任务跑完再断言
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.finish.mock.calls).toHaveLength(1);
    expect(h.overlay().textContent).not.toContain('保存失败');
    expect(await h.repo.listSessions()).toHaveLength(1);
  });

  it('退出先确认：不同意留在原地，同意后摘监听且不落库', async () => {
    const h = setup();
    await h.render();
    toRound(h, 1);
    const mounted = h.stageGame().children.length;

    h.confirm(false);
    h.button('退出').fire('click');
    expect(h.hashSet).toEqual([]);
    expect(h.replaceState).not.toHaveBeenCalled();
    expect(h.doc.count('visibilitychange')).toBe(1);
    expect(h.queue).toHaveLength(1);
    expect(h.stageGame().children).toHaveLength(mounted);

    h.confirm(true);
    h.button('退出').fire('click');
    expect(h.hashSet).toEqual(['#/']);
    // 真实换页由 router 触发 abort，这里照做
    h.ac.abort();
    expect(h.stageGame().children).toHaveLength(0);
    expect(h.queue).toHaveLength(0);
    expect(h.doc.count('visibilitychange')).toBe(0);
    expect(await h.repo.listSessions()).toHaveLength(0);
  });

  it('游戏未注册时先返回首页，不读库也不渲染', async () => {
    const h = setup();
    await expect(h.render('stroop')).resolves.toBeUndefined();
    expect(h.replaceState).toHaveBeenCalledTimes(1);
    expect(h.replaceState).toHaveBeenCalledWith(null, '', '#/');
    expect(h.getGameState).not.toHaveBeenCalled();
    expect(h.view.children).toHaveLength(0);
    expect(h.fed()).toEqual([]);
  });
});
