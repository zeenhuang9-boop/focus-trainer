import type { AbilityWindow, CalendarCell, RadarAxis } from '../core/stats';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export type SvgAttrs = Record<string, string | number | undefined>;

// -0 会被 toFixed 写成 "-0.0"，先归正，期望值才不用跟负零较真
const p = (n: number): string => (n === 0 ? 0 : n).toFixed(1);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// SVGElement 的 className 是只读的 SVGAnimatedString，所以这里只能 setAttribute，
// 不能照搬 dom.ts 里 el.className = … 的写法。
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: SvgAttrs | null = null,
  ...kids: Array<SVGElement | string>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as unknown as SVGElementTagNameMap[K];
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined) el.setAttribute(key, String(value));
    }
  }
  for (const kid of kids) el.append(kid);
  return el;
}

export function radarChart(axes: readonly RadarAxis[], w = 320, h = 320): SVGSVGElement {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 28;
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'radar-svg', role: 'img', 'aria-label': '能力雷达图' });
  const n = axes.length;
  if (n === 0) {
    root.append(svg('text', { class: 'radar-none', x: p(cx), y: p(cy) }, '没有可显示的能力维度'));
    return root;
  }
  const angle = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  for (const k of [0.25, 0.5, 0.75, 1]) {
    root.append(svg('circle', { class: 'radar-ring', cx: p(cx), cy: p(cy), r: p(R * k) }));
  }
  axes.forEach((axis, i) => {
    const rad = angle(i);
    root.append(svg('line', { class: 'radar-axis', x1: p(cx), y1: p(cy), x2: p(cx + R * Math.cos(rad)), y2: p(cy + R * Math.sin(rad)) }));
  });
  root.append(
    svg('polygon', {
      class: 'radar-area',
      points: axes
        .map((axis, i) => {
          const rad = angle(i);
          const v = clamp01(axis.value / 100);
          return `${p(cx + R * v * Math.cos(rad))},${p(cy + R * v * Math.sin(rad))}`;
        })
        .join(' '),
    }),
  );
  axes.forEach((axis, i) => {
    const rad = angle(i);
    root.append(svg('text', { class: 'radar-label', x: p(cx + (R + 20) * Math.cos(rad)), y: p(cy + (R + 20) * Math.sin(rad)) }, axis.ability));
  });
  return root;
}

export function lineChart(win: AbilityWindow, w = 320, h = 160): SVGSVGElement {
  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const base = h - padB;
  const days = Math.max(1, win.keys.length);
  const denom = Math.max(1, days - 1);
  const xAt = (i: number): number => padL + (innerW * i) / denom;
  const yAt = (a: number): number => base - innerH * clamp01(a / 100);
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'curve-svg', role: 'img', 'aria-label': `近 ${days} 天能力曲线` });
  root.append(svg('line', { class: 'curve-axis', x1: p(padL), y1: p(base), x2: p(w - padR), y2: p(base) }));
  if (win.points.length >= 2) {
    root.append(svg('polyline', { class: 'curve-line', points: win.points.map((pt) => `${p(xAt(pt.index))},${p(yAt(pt.ability))}`).join(' ') }));
  }
  for (const pt of win.points) {
    root.append(svg('circle', { class: 'curve-dot', cx: p(xAt(pt.index)), cy: p(yAt(pt.ability)), r: 2.5 }));
  }
  const first = win.keys.length > 0 ? win.keys[0].slice(5) : '';
  const last = win.keys.length > 0 ? win.keys[win.keys.length - 1].slice(5) : '';
  root.append(svg('text', { class: 'curve-edge', x: p(padL), y: p(h - 4) }, first));
  root.append(svg('text', { class: 'curve-edge edge-end', x: p(w - padR), y: p(h - 4) }, last));
  return root;
}

const calendarLabel = (c: CalendarCell): string =>
  c.state === 'done'
    ? `${c.dayKey} 已完成 ${c.doneCount}/${c.planSize}`
    : c.state === 'partial'
      ? `${c.dayKey} 完成 ${c.doneCount}/${c.planSize}`
      : `${c.dayKey} 未打卡`;

export function calendarGrid(cells: readonly CalendarCell[], cellPx = 40, gap = 4): SVGSVGElement {
  const cols = 7;
  const rows = Math.ceil(cells.length / cols);
  // 宽按「列数 × 步长」算，右侧多留一个 gap 的内边距；高按「行数 × 步长 - 末个 gap」算，
  // 两个方向不对称是断言（308×216）钉死的口径，改它要连断言一起改。
  const w = cols * (cellPx + gap);
  const h = Math.max(0, rows * cellPx + (rows - 1) * gap);
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'calendar-svg', role: 'img', 'aria-label': `近 ${rows} 周打卡日历` });
  cells.forEach((c, i) => {
    const x = (i % cols) * (cellPx + gap);
    const y = Math.floor(i / cols) * (cellPx + gap);
    root.append(
      svg(
        'rect',
        { class: `calendar-cell ${c.state}`, 'data-day': c.dayKey, title: `${c.dayKey} ${c.state}`, x: p(x), y: p(y), width: p(cellPx), height: p(cellPx), rx: 6 },
        svg('title', null, calendarLabel(c)),
      ),
    );
  });
  return root;
}
