export type Family = 'polygon' | 'star' | 'curve' | 'arrow' | 'symbol' | 'object';

export const FAMILIES: readonly Family[] = ['polygon', 'star', 'curve', 'arrow', 'symbol', 'object'];

export const FAMILY_NAMES: Record<Family, string> = {
  polygon: '多边形', star: '星形', curve: '曲线', arrow: '箭头', symbol: '符号', object: '物体',
};

export type FigureId =
  | 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'octagon'
  | 'star4' | 'star5' | 'star6' | 'star8'
  | 'circle' | 'ellipse' | 'heart' | 'teardrop' | 'crescent'
  | 'arrowRight' | 'arrowDouble' | 'chevron' | 'uTurn'
  | 'cross' | 'xShape' | 'bolt' | 'check'
  | 'house' | 'fish' | 'tree' | 'umbrella' | 'cup';

export type Pt = readonly [number, number];

export interface FigureStroke {
  readonly pts: readonly Pt[];
  readonly closed: boolean;
}

export interface FigureGeometry {
  readonly id: FigureId;
  readonly family: Family;
  readonly strokes: readonly FigureStroke[];
}

/** 声明式描述：新增图形只加一行数据，不写新的形状代码。 */
type Shape =
  | { readonly kind: 'regular'; readonly n: number; readonly rotDeg: number }
  | { readonly kind: 'star'; readonly n: number; readonly inner: number; readonly rotDeg: number }
  | { readonly kind: 'ellipse'; readonly rx: number; readonly ry: number }
  | { readonly kind: 'named'; readonly which: 'heart' | 'teardrop' }
  | { readonly kind: 'crescent'; readonly ri: number; readonly cx: number }
  | { readonly kind: 'strokes'; readonly strokes: readonly FigureStroke[] };

export interface FigureSpec {
  readonly id: FigureId;
  readonly family: Family;
  readonly name: string;
  readonly shape: Shape;
}

const stroke = (pts: readonly (readonly [number, number])[], closed: boolean): FigureStroke => ({
  pts: pts.map((p) => [p[0], p[1]] as [number, number]),
  closed,
});

export const FIGURES: readonly FigureSpec[] = [
  // 多边形
  { id: 'triangle', family: 'polygon', name: '三角形', shape: { kind: 'regular', n: 3, rotDeg: -90 } },
  { id: 'square', family: 'polygon', name: '正方形', shape: { kind: 'regular', n: 4, rotDeg: 45 } },
  { id: 'pentagon', family: 'polygon', name: '五边形', shape: { kind: 'regular', n: 5, rotDeg: -90 } },
  { id: 'hexagon', family: 'polygon', name: '六边形', shape: { kind: 'regular', n: 6, rotDeg: 0 } },
  { id: 'octagon', family: 'polygon', name: '八边形', shape: { kind: 'regular', n: 8, rotDeg: 22.5 } },
  // 星形
  { id: 'star4', family: 'star', name: '四角星', shape: { kind: 'star', n: 4, inner: 0.38, rotDeg: -90 } },
  { id: 'star5', family: 'star', name: '五角星', shape: { kind: 'star', n: 5, inner: 0.42, rotDeg: -90 } },
  { id: 'star6', family: 'star', name: '六角星', shape: { kind: 'star', n: 6, inner: 0.55, rotDeg: -90 } },
  { id: 'star8', family: 'star', name: '八角星', shape: { kind: 'star', n: 8, inner: 0.58, rotDeg: -90 } },
  // 曲线
  { id: 'circle', family: 'curve', name: '圆', shape: { kind: 'ellipse', rx: 1, ry: 1 } },
  { id: 'ellipse', family: 'curve', name: '椭圆', shape: { kind: 'ellipse', rx: 1, ry: 0.42 } },
  { id: 'heart', family: 'curve', name: '心形', shape: { kind: 'named', which: 'heart' } },
  { id: 'teardrop', family: 'curve', name: '水滴', shape: { kind: 'named', which: 'teardrop' } },
  { id: 'crescent', family: 'curve', name: '月牙', shape: { kind: 'crescent', ri: 0.72, cx: 0.42 } },
  // 箭头
  { id: 'arrowRight', family: 'arrow', name: '右箭头', shape: { kind: 'strokes', strokes: [
    stroke([[-1, 0], [0.4, 0], [0.4, -0.5], [1, 0], [0.4, 0.5], [0.4, 0]], false)] } },
  { id: 'arrowDouble', family: 'arrow', name: '双向箭头', shape: { kind: 'strokes', strokes: [
    stroke([[-1, 0], [1, 0]], false),
    stroke([[-0.45, 0.45], [-1, 0], [-0.45, -0.45]], false),
    stroke([[0.45, 0.45], [1, 0], [0.45, -0.45]], false)] } },
  { id: 'chevron', family: 'arrow', name: 'V 形折线', shape: { kind: 'strokes', strokes: [
    stroke([[-1, 0.7], [0, -0.7], [1, 0.7]], false),
    stroke([[-1, 0.15], [0, -1.0], [1, 0.15]], false)] } },
  { id: 'uTurn', family: 'arrow', name: '掉头箭头', shape: { kind: 'strokes', strokes: [
    stroke([[-0.6, -1], [-0.6, 0.45], [0, 0.45], [0, -1], [0.6, -1]], false),
    stroke([[-0.25, -0.6], [0, 0], [0.25, -0.6]], false)] } },
  // 符号
  { id: 'cross', family: 'symbol', name: '十字', shape: { kind: 'strokes', strokes: [
    stroke([[0, -1], [0, 1]], false), stroke([[-1, 0], [1, 0]], false)] } },
  { id: 'xShape', family: 'symbol', name: 'X 形', shape: { kind: 'strokes', strokes: [
    stroke([[-1, -1], [1, 1]], false), stroke([[-1, 1], [1, -1]], false)] } },
  { id: 'bolt', family: 'symbol', name: '闪电', shape: { kind: 'strokes', strokes: [
    stroke([[0.45, -1], [-0.45, 0.1], [0.15, 0.1], [-0.45, 1]], false)] } },
  { id: 'check', family: 'symbol', name: '对勾', shape: { kind: 'strokes', strokes: [
    stroke([[-0.9, 0.1], [-0.2, 0.85], [0.9, -0.8]], false)] } },
  // 物体
  { id: 'house', family: 'object', name: '房子', shape: { kind: 'strokes', strokes: [
    stroke([[-1, -0.15], [0, -1], [1, -0.15]], false),
    stroke([[-0.72, -0.15], [-0.72, 1], [0.72, 1], [0.72, -0.15]], false),
    stroke([[-0.2, 1], [-0.2, 0.35], [0.2, 0.35], [0.2, 1]], false)] } },
  { id: 'fish', family: 'object', name: '鱼', shape: { kind: 'strokes', strokes: [
    stroke([[-0.35, 0], [0.15, -0.6], [0.85, -0.35], [0.85, 0.35], [0.15, 0.6], [-0.35, 0]], true),
    stroke([[-0.35, 0], [-0.9, -0.5], [-0.62, 0], [-0.9, 0.5], [-0.35, 0]], true)] } },
  { id: 'tree', family: 'object', name: '树', shape: { kind: 'strokes', strokes: [
    stroke([[0, -1], [-0.8, -0.1], [-0.4, -0.1], [-1, 0.7], [-0.5, 0.7], [0, 1]], false),
    stroke([[0, 1], [0.5, 0.7], [1, 0.7], [0.4, -0.1], [0.8, -0.1], [0, -1]], true)] } },
  { id: 'umbrella', family: 'object', name: '伞', shape: { kind: 'strokes', strokes: [
    stroke([[-1, 0.1], [-0.5, -0.75], [0, -1], [0.5, -0.75], [1, 0.1]], false),
    stroke([[-1, 0.1], [-0.5, 0.1], [0, 0.1], [0.5, 0.1], [1, 0.1]], false),
    stroke([[0, 0.1], [0, 0.9], [0.35, 1]], false)] } },
  { id: 'cup', family: 'object', name: '杯子', shape: { kind: 'strokes', strokes: [
    stroke([[-0.8, -0.6], [-0.6, 0.9], [0.45, 0.9], [0.65, -0.6]], false),
    stroke([[-0.8, -0.6], [0.65, -0.6]], false),
    stroke([[0.65, -0.35], [1, -0.35], [1, 0.25], [0.55, 0.45]], false)] } },
];

const FIGURE_INDEX: Map<FigureId, FigureSpec> = new Map(FIGURES.map((f) => [f.id, f]));

/** 曲线族折线段数；spec 只要求「按弧长采样」，段数由这里定死以保证碎片切段可复现。 */
export const CURVE_SAMPLES = 96;
const DENSE = 768;

const rad = (deg: number): number => (deg * Math.PI) / 180;

function regularPts(n: number, rotDeg: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rad(rotDeg) + (2 * Math.PI * i) / n;
    return [Math.cos(a), Math.sin(a)] as Pt;
  });
}

function starPts(n: number, inner: number, rotDeg: number): Pt[] {
  return Array.from({ length: 2 * n }, (_, i) => {
    const a = rad(rotDeg) + (Math.PI * i) / n;
    const r = i % 2 === 0 ? 1 : inner;
    return [r * Math.cos(a), r * Math.sin(a)] as Pt;
  });
}

/** 按弧长等距重采样。closed 时把「末点→首点」那一跳也算进总长。 */
function resample(raw: readonly Pt[], count: number, closed: boolean): Pt[] {
  const loop = closed ? [...raw, raw[0]] : [...raw];
  const cum: number[] = [0];
  for (let i = 1; i < loop.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  const out: Pt[] = [];
  let seg = 1;
  for (let j = 0; j < count; j++) {
    const target = closed ? (total * j) / count : (total * j) / (count - 1);
    while (seg < cum.length - 1 && cum[seg] < target) seg += 1;
    const span = cum[seg] - cum[seg - 1] || 1;
    const f = (target - cum[seg - 1]) / span;
    out.push([
      loop[seg - 1][0] + (loop[seg][0] - loop[seg - 1][0]) * f,
      loop[seg - 1][1] + (loop[seg][1] - loop[seg - 1][1]) * f,
    ]);
  }
  return out;
}

function paramPts(f: (t: number) => Pt, closed: boolean): Pt[] {
  return Array.from({ length: DENSE }, (_, i) => f((2 * Math.PI * i) / (DENSE - (closed ? 0 : 1))));
}

/** 等比缩放到 [-1,1]²：逐笔取该笔的最大绝对坐标做分母，保每笔自身长宽比。
 *  注意（对 brief 原文的唯一偏离）：描述表里 uTurn 的箭头、cup 的杯身/杯口、fish 的
 *  鱼身都不含全图极值点，而测试是「逐笔」断言至少触一次边界 —— 全图统一分母在数学上
 *  无法同时满足两者，故分母按笔取；表数据与测试均保持原文。 */
function normalize(strokes: readonly FigureStroke[]): readonly FigureStroke[] {
  return strokes.map((s) => {
    let m = 0;
    for (const [x, y] of s.pts) m = Math.max(m, Math.abs(x), Math.abs(y));
    if (m === 0 || m === 1) return { pts: s.pts.map((p) => [p[0], p[1]] as Pt), closed: s.closed };
    return { pts: s.pts.map((p) => [p[0] / m, p[1] / m] as Pt), closed: s.closed };
  });
}

function expand(shape: Shape): readonly FigureStroke[] {
  switch (shape.kind) {
    case 'regular':
      return [{ pts: regularPts(shape.n, shape.rotDeg), closed: true }];
    case 'star':
      return [{ pts: starPts(shape.n, shape.inner, shape.rotDeg), closed: true }];
    case 'ellipse':
      return [{
        pts: resample(paramPts((t) => [shape.rx * Math.cos(t), shape.ry * Math.sin(t)], true), CURVE_SAMPLES, true),
        closed: true,
      }];
    case 'named':
      return [{
        pts: resample(
          shape.which === 'heart'
            ? paramPts((t) => [
                16 * Math.pow(Math.sin(t), 3),
                13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
              ], true)
            : paramPts((t) => [Math.cos(t), Math.sin(t) * Math.pow(Math.sin(t / 2), 2)], true),
          CURVE_SAMPLES,
          true,
        ),
        closed: true,
      }];
    case 'crescent': {
      const a0 = rad(38);
      const a1 = rad(322);
      const outer = paramPtsOn((i) => i / (DENSE - 1), a0, a1, (a) => [Math.cos(a), Math.sin(a)]);
      const innerRaw: Pt[] = [];
      for (let i = 0; i < DENSE; i++) {
        const a = a1 + ((a0 - a1) * i) / (DENSE - 1);
        const x = shape.cx + shape.ri * Math.cos(a);
        const y = shape.ri * Math.sin(a);
        if (x * x + y * y <= 1.0000001) innerRaw.push([x, y]);
      }
      if (innerRaw.length < 2) throw new Error('crescent 内弧退化了');
      return [{ pts: resample([...outer, ...innerRaw], CURVE_SAMPLES, true), closed: true }];
    }
    case 'strokes':
      return shape.strokes.map((s) => ({ pts: s.pts.map((p) => [p[0], p[1]] as Pt), closed: s.closed }));
  }
}

function paramPtsOn(
  frac: (i: number) => number,
  a0: number,
  a1: number,
  f: (a: number) => Pt,
): Pt[] {
  return Array.from({ length: DENSE }, (_, i) => f(a0 + (a1 - a0) * frac(i)));
}

const CACHE = new Map<FigureId, FigureGeometry>();

export function buildFigure(id: FigureId): FigureGeometry {
  const hit = CACHE.get(id);
  if (hit) return hit;
  const spec = FIGURE_INDEX.get(id);
  if (spec === undefined) throw new RangeError(`未知的完型图形 id: ${id}`);
  const geom: FigureGeometry = { id, family: spec.family, strokes: normalize(expand(spec.shape)) };
  CACHE.set(id, geom);
  return geom;
}
