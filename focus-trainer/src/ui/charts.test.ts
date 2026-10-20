import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '../core/daykey';
import { abilityWindow, calendarCells, type RadarAxis, type TrendGame } from '../core/stats';
import type { DayPlan } from '../core/types';
import { calendarGrid, lineChart, radarChart, SVG_NS } from './charts';

class StubSvg {
  readonly attrs = new Map<string, string>();
  readonly kids: StubSvg[] = [];
  text = '';
  constructor(readonly tag: string) {}

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }

  append(...items: Array<StubSvg | string>): void {
    for (const item of items) {
      if (typeof item !== 'string') this.kids.push(item);
      else this.text += item;
    }
  }

  get fullText(): string {
    return this.text + this.kids.map((k) => k.fullText).join('');
  }

  all(pred: (el: StubSvg) => boolean): StubSvg[] {
    const out: StubSvg[] = [];
    if (pred(this)) out.push(this);
    for (const k of this.kids) out.push(...k.all(pred));
    return out;
  }

  byClass(cls: string): StubSvg[] {
    return this.all((el) => (el.getAttribute('class') ?? '').split(' ').includes(cls));
  }

  everyAttr(): string[] {
    return this.all(() => true).flatMap((el) => [...el.attrs.values()]);
  }
}

const seen: Array<string | null> = [];
const made: StubSvg[] = [];

function installStub(): void {
  seen.length = 0;
  made.length = 0;
  vi.stubGlobal('document', {
    createElementNS: (ns: string | null, tag: string): StubSvg => {
      seen.push(ns);
      const el = new StubSvg(tag);
      made.push(el);
      return el;
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('radarChart', () => {
  const axes: RadarAxis[] = [
    { gameId: 'schulte', ability: '持续注意', value: 50, practiced: true },
    { gameId: 'stroop', ability: '抑制控制', value: 0, practiced: false },
  ];

  it('320×320 下画 4 圈、2 轴、1 多边形、2 个轴标签，坐标按 p() 保留一位小数', () => {
    installStub();
    const el = radarChart(axes) as unknown as StubSvg;
    expect(el.getAttribute('viewBox')).toBe('0 0 320 320');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('能力雷达图');
    expect(el.byClass('radar-ring').map((c) => c.getAttribute('r'))).toEqual(['33.0', '66.0', '99.0', '132.0']);
    expect(el.byClass('radar-axis').map((c) => `${c.getAttribute('x2')},${c.getAttribute('y2')}`)).toEqual([
      '160.0,28.0',
      '160.0,292.0',
    ]);
    expect(el.byClass('radar-area')).toHaveLength(1);
    expect(el.byClass('radar-area')[0].getAttribute('points')).toBe('160.0,94.0 160.0,160.0');
    expect(el.byClass('radar-label').map((c) => c.getAttribute('x') + '|' + c.getAttribute('y'))).toEqual([
      '160.0|8.0',
      '160.0|312.0',
    ]);
    expect(el.byClass('radar-label').map((c) => c.fullText)).toEqual(['持续注意', '抑制控制']);
  });

  it('超过 100 或负数的 value 被夹到 [0,100]，多边形不会捅出外圈', () => {
    installStub();
    const el = radarChart([{ gameId: 'schulte', ability: 'a', value: 120, practiced: true }]) as unknown as StubSvg;
    expect(el.byClass('radar-area')[0].getAttribute('points')).toBe('160.0,28.0');
    const el2 = radarChart([{ gameId: 'schulte', ability: 'a', value: -5, practiced: true }]) as unknown as StubSvg;
    expect(el2.byClass('radar-area')[0].getAttribute('points')).toBe('160.0,160.0');
  });

  it('轴数为 0 时只出一句降级文案，不画圈也不画轴', () => {
    installStub();
    const el = radarChart([]) as unknown as StubSvg;
    expect(el.byClass('radar-ring')).toHaveLength(0);
    expect(el.byClass('radar-axis')).toHaveLength(0);
    expect(el.byClass('radar-none').map((c) => c.fullText)).toEqual(['没有可显示的能力维度']);
  });

  it('只建 SVG 元素，命名空间恒为 w3.org（M4 离线审计的唯一放行字符串）', () => {
    installStub();
    radarChart(axes);
    lineChart(abilityWindow('schulte', [], '2026-10-19'));
    calendarGrid(calendarCells([{ id: 'schulte', ability: 'a' } as TrendGame], [], '2026-10-19'));
    expect(SVG_NS).toBe('http://www.w3.org/2000/svg');
    expect(seen.every((ns) => ns === SVG_NS)).toBe(true);
    expect(made.every((el) => el.tag !== 'image')).toBe(true);
  });
});

describe('lineChart', () => {
  const TODAY = '2026-10-19';

  it('两点曲线的坐标按 padL28/padR8/padT8/padB20 的算式落位', () => {
    installStub();
    const win = abilityWindow('schulte', [], TODAY);
    win.points.push({ index: 0, dayKey: win.keys[0], ability: 10 }, { index: 29, dayKey: win.keys[29], ability: 50 });
    const el = lineChart(win) as unknown as StubSvg;
    expect(el.getAttribute('viewBox')).toBe('0 0 320 160');
    expect(el.getAttribute('aria-label')).toBe('近 30 天能力曲线');
    expect(el.byClass('curve-axis').map((c) => `${c.getAttribute('x1')},${c.getAttribute('y1')} ${c.getAttribute('x2')},${c.getAttribute('y2')}`)).toEqual([
      '28.0,140.0 312.0,140.0',
    ]);
    expect(el.byClass('curve-line')[0].getAttribute('points')).toBe('28.0,126.8 312.0,74.0');
    expect(el.byClass('curve-dot').map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`)).toEqual([
      '28.0,126.8',
      '312.0,74.0',
    ]);
    expect(el.byClass('curve-edge').map((c) => c.fullText)).toEqual(['09-20', '10-19']);
  });

  it('零点和单点都不画 polyline（连不成线），但轴线和首尾日期标签仍在', () => {
    installStub();
    const empty = lineChart(abilityWindow('schulte', [], TODAY)) as unknown as StubSvg;
    expect(empty.byClass('curve-line')).toHaveLength(0);
    expect(empty.byClass('curve-dot')).toHaveLength(0);
    expect(empty.byClass('curve-axis')).toHaveLength(1);
    expect(empty.byClass('curve-edge')).toHaveLength(2);
    const one = lineChart({
      gameId: 'schulte',
      keys: ['2026-10-19'],
      points: [{ index: 0, dayKey: '2026-10-19', ability: 100 }],
    }) as unknown as StubSvg;
    expect(one.byClass('curve-line')).toHaveLength(0);
    expect(one.byClass('curve-dot').map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`)).toEqual(['28.0,8.0']);
    expect(one.byClass('curve-edge').map((c) => c.fullText)).toEqual(['10-19', '10-19']);
  });
});

describe('calendarGrid', () => {
  const TODAY = '2026-10-19';
  const games: TrendGame[] = [{ id: 'schulte', ability: '持续注意' }, { id: 'stroop', ability: '抑制控制' }];

  it('35 格 = 7 列 × 5 行，步长 44px，viewBox 308×216', () => {
    installStub();
    const el = calendarGrid(calendarCells(games, [], TODAY)) as unknown as StubSvg;
    expect(el.getAttribute('viewBox')).toBe('0 0 308 216');
    expect(el.getAttribute('aria-label')).toBe('近 5 周打卡日历');
    const rects = el.byClass('calendar-cell');
    expect(rects).toHaveLength(35);
    expect(rects[0].getAttribute('x')).toBe('0.0');
    expect(rects[0].getAttribute('y')).toBe('0.0');
    expect(rects[8].getAttribute('x')).toBe('44.0');
    expect(rects[8].getAttribute('y')).toBe('44.0');
    expect(rects[7].getAttribute('x')).toBe('0.0');
    expect(rects[7].getAttribute('y')).toBe('44.0');
    expect(rects[0].getAttribute('width')).toBe('40.0');
    expect(rects[0].getAttribute('rx')).toBe('6');
    expect(rects[34].getAttribute('class')).toBe('calendar-cell none');
  });

  it('格数不是 7 的倍数时按 ceil 补满一行（36 格 = 6 行，viewBox 308×260）', () => {
    installStub();
    const el = calendarGrid(calendarCells(games, [], TODAY, 36)) as unknown as StubSvg;
    expect(el.getAttribute('viewBox')).toBe('0 0 308 260');
    expect(el.getAttribute('aria-label')).toBe('近 6 周打卡日历');
    const rects = el.byClass('calendar-cell');
    expect(rects).toHaveLength(36);
    expect(rects[35].getAttribute('x')).toBe('0.0');
    expect(rects[35].getAttribute('y')).toBe('220.0');
  });

  it('三种状态各写进 class 与 <title>，数字取过滤后的 doneCount/planSize', () => {
    installStub();
    const all: DayPlan = { dayKey: '2026-10-18', games: ['schulte', 'stroop'], completed: ['schulte', 'stroop'] };
    const half: DayPlan = { dayKey: '2026-10-17', games: ['schulte', 'stroop'], completed: ['schulte'] };
    const el = calendarGrid(calendarCells(games, [all, half], TODAY)) as unknown as StubSvg;
    const byDay = new Map(el.byClass('calendar-cell').map((r) => [r.getAttribute('title'), r]));
    expect(byDay.get('2026-10-18 done')?.getAttribute('class')).toBe('calendar-cell done');
    expect(byDay.get('2026-10-18 done')?.kids[0].fullText).toBe('2026-10-18 已完成 2/2');
    expect(byDay.get('2026-10-17 partial')?.kids[0].fullText).toBe('2026-10-17 完成 1/2');
    expect(byDay.get(`${TODAY} none`)?.kids[0].fullText).toBe(`${TODAY} 未打卡`);
    expect(el.byClass('calendar-cell').map((r) => r.getAttribute('data-day'))).toEqual(
      calendarCells(games, [all, half], TODAY).map((c) => c.dayKey),
    );
  });

  it('属性里不许出现任何 http(s) 值（外链即违反离线红线）', () => {
    installStub();
    const el = calendarGrid(calendarCells(games, [], addDays(TODAY, 3))) as unknown as StubSvg;
    radarChart([{ gameId: 'schulte', ability: 'a', value: 1, practiced: true }]);
    expect(el.everyAttr().some((v) => /https?:\/\//.test(v))).toBe(false);
  });
});
