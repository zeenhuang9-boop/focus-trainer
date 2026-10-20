import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../core/storage';
import type { DayPlan, GameId, SessionRecord } from '../../core/types';
import { GAMES } from '../../games/registry';
import type { AppContext } from '../context';
import { renderHome, WARMUP_CELLS, WARMUP_SIZE } from './home';

// node 环境没有 jsdom，DOM 全靠这套手写桩（风格照 src/ui/pages/play.test.ts 与 trends.test.ts）：
// createElement / append / replaceChildren / textContent / className / classList(add|contains|toggle|remove)
// / setAttribute / style / add|removeEventListener，加 location.hash 与 document.body。
// 首页方格的点亮与跳转是 setTimeout 驱动的，所以用例统一走 vi 的假定时器 + 假系统时钟。
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

  /** 真浏览器点一次格子会派发 click；桩只管把同类型监听全跑一遍 */
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

// 固定系统时钟：dayKey 与唤醒格的种子都从 Date.now() 取，钉死后用例可复现。
// 10:00 在 04:00 分界之后 → 今天是 2026-10-19（星期一）。
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

function setup(opts: { plan?: DayPlan; completedDays?: string[] } = {}) {
  const view = new StubEl('main');
  const body = new StubEl('body');
  const repo = new MemoryRepository();
  if (opts.plan) void repo.putPlan(opts.plan);
  // 昨天起把 3 项打满，streak 才有非零值可断（计划项固定是 GAMES 前三，与 scheduler 的 PLAN_SIZE 一致）
  for (const day of opts.completedDays ?? []) {
    void repo.saveSession(
      rec('schulte', day),
      { gameId: 'schulte', level: 1, passStreak: 0, failStreak: 0, lastPlayedDayKey: day },
      { dayKey: day, games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte', 'stroop', 'seqmem'] },
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
  const requireEl = (el: StubEl | null | undefined, what: string): StubEl => {
    if (!el) throw new Error(`桩里找不到${what}`);
    return el;
  };

  return {
    view,
    body,
    repo,
    ctx,
    ac,
    hashSet,
    hash: (): string => hashValue,
    render: (): Promise<void> => renderHome(view as unknown as HTMLElement, ctx, ac.signal),
    /** 唤醒格里标签为 n 的那个格子 */
    cell: (n: number): StubEl => {
      const grid = requireEl(view.find((x) => x.hasClass('warmup-grid')), 'warmup-grid');
      const hit = grid.children.find((c) => c.textContent === String(n));
      if (!hit) throw new Error(`唤醒格里没有标签 ${n}`);
      return hit;
    },
    grid: (): StubEl => requireEl(view.find((x) => x.hasClass('warmup-grid')), 'warmup-grid'),
    warmup: (): StubEl => requireEl(view.find((x) => x.hasClass('warmup')), 'warmup 卡片'),
    hint: (): StubEl => requireEl(view.find((x) => x.hasClass('warmup-hint')), 'warmup-hint'),
    button: (label: string): StubEl => requireEl(view.find((x) => x.tag === 'button' && x.textContent === label), `按钮「${label}」`),
    findButton: (label: string): StubEl | null => view.find((x) => x.tag === 'button' && x.textContent === label),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('renderHome 的日志本抬头', () => {
  it('抬头给出应用名与「星期一 · 10 月 20 日」这一式的日期行', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    await h.render();
    expect(h.view.textContent).toContain('专注力训练');
    expect(h.view.byClass('home-date')[0].textContent).toBe('星期一 · 10 月 19 日');
  });

  it('连续天数来自 scheduler.streak，页面不自己重算', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup({ completedDays: ['2026-10-18', '2026-10-17'] });
    await h.render();
    expect(h.view.byClass('big')[0].textContent).toBe('2');
    expect(h.view.byClass('home-streak')[0].textContent).toBe('2天连续打卡');
  });

  it('signal 已 abort 时一个字都不写', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    h.ac.abort();
    await h.render();
    expect(h.view.children).toHaveLength(0);
  });
});

describe('首页活体舒尔特招牌', () => {
  it('5×5 一共 25 格，1→25 每个标签恰好出现一次', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    await h.render();
    const cells = h.grid().children;
    expect(cells).toHaveLength(WARMUP_CELLS);
    expect(WARMUP_SIZE).toBe(5);
    expect(cells.map((c) => c.textContent).sort((a, b) => Number(a) - Number(b))).toEqual(
      Array.from({ length: 25 }, (_, i) => String(i + 1)),
    );
    // 招牌方格必须是独立类名：.schulte-grid 那套 gap 1px + 满宽负边距是给 7×7 的 48px 算式用的
    expect(h.grid().hasClass('schulte-grid')).toBe(false);
    expect(h.view.byClass('schulte-grid')).toHaveLength(0);
  });

  it('按 1→25 顺序点：一路点亮，最后一格后整面填充并跳进今日第一项', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup({ plan: { dayKey: TODAY, games: ['stroop', 'schulte', 'seqmem'], completed: [] } });
    await h.render();
    for (let n = 1; n <= WARMUP_CELLS; n++) {
      h.cell(n).fire('click');
      expect(h.cell(n).hasClass('done')).toBe(true);
      // 点亮到第 n 格，提示就该指向 n+1；最后一格换成整面填充的文案
      if (n < WARMUP_CELLS) expect(h.hint().textContent).toBe(`下一个 ${n + 1}`);
    }
    expect(h.warmup().hasClass('filled')).toBe(true);
    // 200ms 的整面填充是动效的一部分，不许当场跳走
    expect(h.hashSet).toEqual([]);
    vi.advanceTimersByTime(200);
    // 顺序里第一项未练的是 stroop（plan.games 的顺序，不是注册表顺序）
    expect(h.hashSet).toEqual(['#/play/stroop/plan']);
  });

  it('点错只抖一下：不点亮、不计 done、提示不变', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    await h.render();
    const before = h.hint().textContent;
    const wrong = h.grid().children.find((c) => c.textContent !== '1');
    if (!wrong) throw new Error('找不到非 1 号格');
    wrong.fire('click');
    expect(wrong.hasClass('shake')).toBe(true);
    expect(wrong.hasClass('done')).toBe(false);
    expect(h.grid().children.filter((c) => c.hasClass('done'))).toHaveLength(0);
    expect(h.hint().textContent).toBe(before);
    // 抖动是瞬时的：200ms 后自己收掉，不留残留类
    vi.advanceTimersByTime(200);
    expect(wrong.hasClass('shake')).toBe(false);
    // 抖完还能正常点亮，说明点错真没被惩罚
    h.cell(1).fire('click');
    expect(h.cell(1).hasClass('done')).toBe(true);
  });

  it('已点亮的格再点一次不推进序列', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    await h.render();
    h.cell(1).fire('click');
    h.cell(1).fire('click');
    expect(h.hint().textContent).toBe('下一个 2');
    expect(h.grid().children.filter((c) => c.hasClass('done'))).toHaveLength(1);
  });

  it('今日计划已打完时点满 25 格不跳转，只停在原地说清状态', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup({ plan: { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte', 'stroop', 'seqmem'] } });
    await h.render();
    for (let n = 1; n <= WARMUP_CELLS; n++) h.cell(n).fire('click');
    vi.advanceTimersByTime(1000);
    expect(h.hashSet).toEqual([]);
  });

  it('点满之后换页 abort：定时器被摘掉，不会再跳第二次路由', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    await h.render();
    for (let n = 1; n <= WARMUP_CELLS; n++) h.cell(n).fire('click');
    expect(h.hashSet).toEqual([]);
    h.ac.abort();
    vi.advanceTimersByTime(5000);
    expect(h.hashSet).toEqual([]);
  });
});

describe('renderHome 的计划行与入口', () => {
  it('计划行用拉丁 id 做眉标 + 档位读数 + 「去练」，点进去是 plan 模式', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup({ plan: { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'], completed: [] } });
    await h.render();
    const rows = h.view.byClass('plan-row').slice(0, 3);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.byClass('eyebrow')[0].textContent)).toEqual(['schulte', 'stroop', 'seqmem']);
    expect(rows.map((r) => r.byClass('plan-name')[0].textContent)).toEqual(GAMES.slice(0, 3).map((g) => g.name));
    expect(rows.map((r) => r.byClass('plan-meta')[0].textContent)).toEqual(['第 1 档', '第 1 档', '第 1 档']);
    for (const row of rows) expect(row.byClass('plan-mark')).toHaveLength(0);
    // 「去练」是行内唯一的按钮，动词照旧
    rows[0].find((x) => x.tag === 'button' && x.textContent === '去练')?.fire('click');
    expect(h.hashSet).toEqual(['#/play/schulte/plan']);
  });

  it('打完的项在行上标 ✓ 并把档位仍在原处，不靠透明度抹掉信息', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup({ plan: { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte'] } });
    await h.render();
    const first = h.view.byClass('plan-row')[0];
    expect(first.hasClass('done')).toBe(true);
    expect(first.byClass('plan-mark')[0].textContent).toBe('✓');
    expect(first.byClass('plan-meta')[0].textContent).toBe('第 1 档');
  });

  it('自由练已经搬走：首页只剩今日计划三行，也不再自带趋势/设置出口', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    await h.render();
    expect(h.view.byClass('plan-row')).toHaveLength(3);
    expect(h.view.byClass('list')).toHaveLength(1);
    expect(h.view.textContent).not.toContain('自由练');
    expect(h.view.textContent).not.toContain('趋势');
    expect(h.view.textContent).not.toContain('设置');
  });

  it('今日还有未练项时「开始训练」跳第一项，全打完后换成禁用的「今日完成」', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const open = setup({ plan: { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte'] } });
    await open.render();
    expect(open.findButton('开始训练')?.disabled).toBe(false);
    open.button('开始训练').fire('click');
    expect(open.hashSet).toEqual(['#/play/stroop/plan']);

    const done = setup({ plan: { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte', 'stroop', 'seqmem'] } });
    await done.render();
    expect(done.findButton('开始训练')).toBeNull();
    expect(done.button('今日完成').disabled).toBe(true);
  });
});
