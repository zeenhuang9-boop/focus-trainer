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

// 默认画布比曲线图宽一档，是为了给 5 个轴标签留出文字区：320 宽的画布上标签锚点在
// x≈305，4 个 CJK 字（12px 字号约 44〜48px）从锚点向右排就直接越出 svg 边界（M3 浏览器验收
// 实测 5/5 标签被裁）。R 周围同样留 40 的余量，顶部标签基线才压得住字形上伸。
// 420 是「不裁」的下限而不是「可读」的下限：画布按 390 排版缩放后，12 用户单位的标签只剩
// ~10.0px，读者基本看不清（F1 副作用，R1）。字号提到 14（预留宽度按 4×14=56），画布再宽 20
// 单位把它换回裁切余量，两侧才同时成立；h 不动，所以 R 仍由 h 决定、等于 130。
export function radarChart(axes: readonly RadarAxis[], w = 440, h = 340): SVGSVGElement {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 40;
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
    const cos = Math.cos(rad);
    // SVG 默认 start（文字从锚点向右排），右侧轴会把字推出画布；左侧轴的锚点本身就在
    // 画布左缘之外。按象限锚定：右=start、左=end、正上/正下=middle。
    // |cos| ≤ 0.1 视为「正上/正下」，因为 cos(-Math.PI/2) 不是严格的 0 而是 6.1e-17。
    let anchor = 'middle';
    if (cos > 0.1) {
      anchor = 'start';
    }
    if (cos < -0.1) {
      anchor = 'end';
    }
    root.append(
      svg(
        'text',
        { class: 'radar-label', 'text-anchor': anchor, x: p(cx + (R + 20) * cos), y: p(cy + (R + 20) * Math.sin(rad)) },
        axis.ability,
      ),
    );
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
