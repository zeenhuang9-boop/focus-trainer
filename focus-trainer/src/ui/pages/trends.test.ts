import { afterEach, describe, expect, it, vi } from 'vitest';
import { abilityWindow } from '../../core/stats';
import { defaultGameState, type Repository } from '../../core/storage';
import type { DayPlan, GameId, GameState, SessionRecord } from '../../core/types';
import { GAMES } from '../../games/registry';
import type { AppContext } from '../context';
import { renderTrends } from './trends';

class StubEl {
  readonly children: StubEl[] = [];
  readonly attrs = new Map<string, string>();
  text = '';
  value = '';
  selected = false;
  parent: StubEl | null = null;
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; contains(c: string): boolean } {
    const self = this;
    return {
      add: (c: string): void => {
        const cur = self.attrs.get('class') ?? '';
        self.attrs.set('class', cur ? `${cur} ${c}` : c);
      },
      contains: (c: string): boolean => (self.attrs.get('class') ?? '').split(' ').includes(c),
    };
  }

  set className(v: string) {
    this.attrs.set('class', v);
  }

  get className(): string {
    return this.attrs.get('class') ?? '';
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(v: string) {
    this.text = v;
    this.children.length = 0;
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

  byClass(cls: string): StubEl[] {
    return this.all((el) => (el.attrs.get('class') ?? '').split(' ').includes(cls));
  }

  section(cls: string): StubEl {
    const el = this.find((x) => x.tag === 'section' && x.attrs.get('class') === cls);
    if (!el) throw new Error(`找不到 ${cls}`);
    return el;
  }
}

// Date.now() 打桩后的固定值：只允许进日期键推导。10:00 在 04:00 之后 → 今天就是 2026-10-19。
const NOW = new Date(2026, 9, 19, 10, 0).getTime();
const TODAY = '2026-10-19';
// 同一天的凌晨 02:30 属于前一天（spec §5.4）
const LATE_NIGHT = new Date(2026, 9, 19, 2, 30).getTime();

// 夹具里的记录用 'schulte' / 'stroop' 两个字面 id：这两个游戏在 M1/M2 已注册，
// `registry.test.ts` 的保序断言保证它们是 `GAMES` 的前两项（`pickTrendGame` 只认注册表里的 id）。
// 但**行数类断言一律走 `GAMES.length`**，绝不抄一份硬编码数组——
// 否则就复刻 K-11 那种「M2 每注册一个游戏就弄红一条用例」的脆弱。

function rec(gameId: GameId, startedAt: number, day: string, ability: number): SessionRecord {
  return { gameId, mode: 'free', dayKey: day, startedAt, durationMs: 1000, startLevel: 1, endLevel: 1, rounds: [], summary: {}, ability };
}

function makeRepo(sessions: SessionRecord[], plans: DayPlan[], states: GameState[]): { repo: Repository; calls: string[] } {
  const calls: string[] = [];
  const boom = (name: string) => async (): Promise<never> => {
    throw new Error(`趋势页不该调用 ${name}`);
  };
  const repo: Repository = {
    listSessions: async (gameId?: GameId) => {
      calls.push('listSessions');
      return gameId === undefined ? sessions : sessions.filter((s) => s.gameId === gameId);
    },
    listPlans: async () => {
      calls.push('listPlans');
      return plans;
    },
    listGameStates: async () => {
      calls.push('listGameStates');
      return states;
    },
    getSettings: async () => ({ dayStartHour: 4 }),
    getGameState: async () => {
      calls.push('getGameState');
      return states[0] ?? defaultGameState('schulte');
    },
    getPlan: async () => {
      calls.push('getPlan');
      return plans[0] ?? null;
    },
    getSession: async () => {
      calls.push('getSession');
      return null;
    },
    lastSession: async () => {
      calls.push('lastSession');
      return null;
    },
    putPlan: boom('putPlan') as Repository['putPlan'],
    saveSession: boom('saveSession') as Repository['saveSession'],
    putSettings: boom('putSettings') as Repository['putSettings'],
    clearAll: boom('clearAll') as Repository['clearAll'],
  };
  return { repo, calls };
}

function setup(sessions: SessionRecord[] = [], plans: DayPlan[] = [], states: GameState[] = []) {
  const view = new StubEl('main');
  const { repo, calls } = makeRepo(sessions, plans, states);
  const ctx: AppContext = { repo, storageOk: true, settings: { dayStartHour: 4 } };
  const ac = new AbortController();
  let hashValue = '#/trend';
  const hashSet: string[] = [];
  const location = {
    get hash(): string {
      return hashValue;
    },
    set hash(v: string) {
      hashValue = v;
      hashSet.push(v);
    },
  };
  vi.stubGlobal('document', {
    createElement: (tag: string) => new StubEl(tag),
    createElementNS: (_ns: string, tag: string) => new StubEl(tag),
  });
  vi.stubGlobal('location', location);
  return {
    view,
    repo,
    ctx,
    ac,
    calls,
    hashSet,
    render: (now = NOW): Promise<void> => renderTrends(view as unknown as HTMLElement, ctx, ac.signal, now),
    select: (): StubEl => {
      const el = view.find((x) => x.tag === 'select');
      if (!el) throw new Error('找不到 select');
      return el;
    },
    button: (label: string): StubEl => {
      const el = view.find((x) => x.tag === 'button' && x.textContent === label);
      if (!el) throw new Error(`找不到按钮「${label}」`);
      return el;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('renderTrends', () => {
  it('只读三个方法，一个写方法都不碰', async () => {
    const h = setup();
    await h.render();
    expect([...new Set(h.calls)].sort()).toEqual(['listGameStates', 'listPlans', 'listSessions']);
  });

  it('三个 section 依次是雷达 / 曲线 / 日历，标题文案定死', async () => {
    const h = setup();
    await h.render();
    expect(h.view.section('trend-radar').find((x) => x.tag === 'h2')?.textContent).toBe('能力雷达（近 3 次训练均值）');
    expect(h.view.section('trend-curve').find((x) => x.tag === 'h2')?.textContent).toBe('能力曲线（近 30 天）');
    expect(h.view.section('trend-calendar').find((x) => x.tag === 'h2')?.textContent).toBe('打卡日历（近 5 周）');
    expect(h.view.section('trend-radar').byClass('radar-svg')).toHaveLength(1);
    expect(h.view.section('trend-calendar').byClass('calendar-cell')).toHaveLength(35);
  });

  it('图例行数 = 注册表长度，数值与 radarAxes 一致，没练过的写「未练」', async () => {
    const h = setup([rec('schulte', 1_000, '2026-10-17', 20), rec('schulte', 2_000, '2026-10-18', 30), rec('schulte', 3_000, '2026-10-19', 40)]);
    await h.render();
    const items = h.view.section('trend-radar').find((x) => x.tag === 'ul');
    if (!items) throw new Error('找不到 ul.radar-legend');
    expect(items.children).toHaveLength(GAMES.length);
    expect(items.children[0].textContent).toContain('持续注意');
    expect(items.children[0].textContent).toContain('30');
    expect(items.children[1].textContent).toContain('未练');
  });

  // 控制器的 Task 1 遗留裁定：20/30/40 的均值恰为整数，round 与 ceil 同值，杀不掉 stats.ts 的取整变异。
  // 这里改用 Task 1 brief 的原始夹具数字（40/10/11 → 20.333），round 得 20、ceil 得 21，断 20 才锁死口径。
  it('雷达均值是四舍五入，不是向上取整', async () => {
    const h = setup([rec('schulte', 3_000, '2026-10-17', 40), rec('schulte', 1_000, '2026-10-18', 10), rec('schulte', 2_000, '2026-10-19', 11)]);
    await h.render();
    const items = h.view.section('trend-radar').find((x) => x.tag === 'ul');
    if (!items) throw new Error('找不到 ul.radar-legend');
    expect(items.children[0].textContent).toContain('20');
    expect(items.children[0].textContent).not.toContain('21');
  });

  it('默认选中最近练过的游戏，切换只重画曲线区、不再读库', async () => {
    const sessions = [rec('schulte', 1, '2026-10-18', 20), rec('stroop', 2, '2026-10-18', 40), rec('stroop', 3, TODAY, 60)];
    const states = [
      { ...defaultGameState('schulte'), lastPlayedDayKey: '2026-10-18' },
      { ...defaultGameState('stroop'), lastPlayedDayKey: TODAY },
    ] as GameState[];
    const h = setup(sessions, [], states);
    await h.render();
    const select = h.select();
    expect(select.getAttribute('aria-label')).toBe('选择游戏');
    expect(select.children.find((o) => o.getAttribute('value') === 'stroop')?.selected).toBe(true);
    expect(h.calls).toHaveLength(3);
    // 2026-10-18 落在 30 天窗口的 index 28：x=28+284×28/29=302.2，y(40)=140−132×0.4=87.2
    expect(h.view.section('trend-curve').byClass('curve-line')[0].getAttribute('points')).toBe('302.2,87.2 312.0,60.8');

    select.value = 'schulte';
    select.fire('change');
    expect(h.calls).toHaveLength(3);
    expect(h.view.section('trend-curve').byClass('curve-line')).toHaveLength(0);
    expect(h.view.section('trend-curve').byClass('trend-empty')).toHaveLength(0);
    // 单点不连线，只留一个点：y(20)=140−26.4=113.6
    expect(h.view.section('trend-curve').byClass('curve-dot').map((d) => `${d.getAttribute('cx')},${d.getAttribute('cy')}`)).toEqual(['302.2,113.6']);
  });

  it('选中的游戏近 30 天没记录时，曲线区换成空态文案而不是空坐标轴', async () => {
    const h = setup([rec('schulte', 1, '2026-05-01', 20)]);
    await h.render();
    const empty = h.view.section('trend-curve').byClass('trend-empty');
    expect(empty).toHaveLength(1);
    expect(empty[0].textContent).toBe('近 30 天还没有训练记录');
    expect(h.view.section('trend-curve').byClass('curve-svg')).toHaveLength(0);
  });

  it('凌晨 02:30 打开时，日历最后一格是昨天的日期键', async () => {
    const h = setup();
    await h.render(LATE_NIGHT);
    const cells = h.view.section('trend-calendar').byClass('calendar-cell');
    expect(cells[34].getAttribute('data-day')).toBe('2026-10-18');
    expect(cells[0].getAttribute('data-day')).toBe('2026-09-14');
  });

  // 控制器的 Task 2 遗留裁定 #7：只钉 rects[0]/rects[8] 时 Math.floor(i/cols)→Math.floor(i/5) 全绿，
  // 行距没被钉住。第 8 格（index 7）与第 35 格（index 34）把「7 列换行」两头都锁死。
  it('日历按 7 列换行：行距由列数推出，末格落在第 5 行第 7 列', async () => {
    const h = setup();
    await h.render();
    const cells = h.view.section('trend-calendar').byClass('calendar-cell');
    expect(cells).toHaveLength(35);
    // 步长 44 = cellPx 40 + gap 4；index 7 = 第 2 行首列，index 34 = 第 5 行末列
    expect([cells[7].getAttribute('x'), cells[7].getAttribute('y')]).toEqual(['0.0', '44.0']);
    expect([cells[34].getAttribute('x'), cells[34].getAttribute('y')]).toEqual(['264.0', '176.0']);
  });

  it('连续打卡天数来自 scheduler.streak，页面不重算', async () => {
    const plans: DayPlan[] = [
      { dayKey: '2026-10-18', games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte', 'stroop', 'seqmem'] },
      { dayKey: '2026-10-17', games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte'] },
    ];
    const h = setup([], plans, []);
    await h.render();
    expect(h.view.byClass('trend-streak')[0].textContent).toBe('1天连续打卡');
  });

  it('signal 已 abort 时一个字都不写', async () => {
    const h = setup();
    h.ac.abort();
    await h.render();
    expect(h.view.children).toHaveLength(0);
  });

  it('趋势页不再自带返回首页的按钮：页签常驻，重复出口就是噪声', async () => {
    const h = setup();
    await h.render();
    expect(h.view.textContent).not.toContain('返回');
    expect(h.view.all((e) => e.tag === 'button' && e.textContent === '返回')).toHaveLength(0);
  });

  it('记录再多也不改变渲染上限：600 条记录仍是 35 格 + ≤30 点 + 2 轴', async () => {
    const many: SessionRecord[] = [];
    for (let i = 0; i < 600; i++) many.push(rec(i % 2 === 0 ? 'schulte' : 'stroop', 1_000 + i, TODAY, (i % 100) + 1));
    const h = setup(many);
    await h.render();
    expect(h.view.section('trend-calendar').byClass('calendar-cell')).toHaveLength(35);
    expect(h.view.section('trend-curve').byClass('curve-dot').length).toBeLessThanOrEqual(30);
    expect(h.view.section('trend-radar').byClass('radar-axis')).toHaveLength(GAMES.length);
    expect(abilityWindow('schulte', many, TODAY).points).toHaveLength(1);
  });
});
