import type { Rng } from '../../core/rng';
import type { FigureGeometry, Pt } from './figures';

/** spec:155 —— 沿轮廓按弧长切成长 0.08 的小段。 */
export const SEG_LEN = 0.08;
/** 掩蔽帧铺满屏的随机线段数（spec 只说「满屏随机线段」，数量在这里定死）。 */
export const MASK_SEGMENTS = 48;

export interface Segment {
  readonly a: Pt;
  readonly b: Pt;
}

export interface FragmentOptions {
  readonly retention: number;
  readonly noise: number;
  readonly rotationDeg: number;
}

export interface FragmentedFigure {
  readonly segments: readonly Segment[];
  readonly noise: readonly Segment[];
  readonly totalSegs: number;
  readonly keptSegs: number;
  readonly actualRetention: number;
  readonly rotationDeg: number;
}

const dist = (p: Pt, q: Pt): number => Math.hypot(q[0] - p[0], q[1] - p[1]);

/**
 * 逐笔切段：闭合笔把「末点→首点」那一跳也算进去。
 * 一条笔的弧长一般不是 SEG_LEN 的整数倍，零头只在 ≥ SEG_LEN/2 时保留为最后一段。
 * 累计长度 `carry` 与段起点 `from` 都在笔循环内部重置 —— 零头是按「这一笔自己的弧长」
 * 结算的，跨笔不得继承，否则上一笔的零头会污染下一笔首段的长度，笔画之间还会被连出线。
 */
export function cutSegments(geom: FigureGeometry, segLen: number = SEG_LEN): Segment[] {
  const out: Segment[] = [];
  for (const st of geom.strokes) {
    const loop = st.closed ? [...st.pts, st.pts[0]] : [...st.pts];
    let from: Pt = loop[0];
    let carry = 0;
    for (let i = 0; i < loop.length - 1; i++) {
      const a = loop[i];
      const b = loop[i + 1];
      let cursor = a;
      let rest = dist(a, b);
      while (rest > 1e-12) {
        const need = segLen - carry;
        if (rest >= need) {
          const t = need / rest;
          const to: Pt = [cursor[0] + (b[0] - cursor[0]) * t, cursor[1] + (b[1] - cursor[1]) * t];
          out.push({ a: from, b: to });
          carry = 0;
          cursor = to;
          from = to;
          rest -= need;
        } else {
          carry += rest;
          rest = 0;
          if (carry >= segLen / 2) {
            out.push({ a: from, b });
            carry = 0;
            from = b;
          }
        }
      }
    }
  }
  return out;
}

export function rotate(segs: readonly Segment[], deg: number): Segment[] {
  const r = (deg * Math.PI) / 180;
  const rawC = Math.cos(r);
  const rawS = Math.sin(r);
  // 90/180/270 度把 6e-17 量级的尾巴抹成精确 0，否则等值断言与像素对齐都会飘
  const c = Math.abs(rawC) < 1e-15 ? 0 : rawC;
  const s = Math.abs(rawS) < 1e-15 ? 0 : rawS;
  const rot = (p: Pt): Pt => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  return segs.map((sg) => ({ a: rot(sg.a), b: rot(sg.b) }));
}

function noiseSegments(rng: Rng, n: number): Segment[] {
  const half = SEG_LEN / 2;
  const lim = 1 - half;
  const out: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const cx = -lim + rng() * 2 * lim;
    const cy = -lim + rng() * 2 * lim;
    const angle = rng() * Math.PI * 2;
    const dx = half * Math.cos(angle);
    const dy = half * Math.sin(angle);
    out.push({ a: [cx - dx, cy - dy], b: [cx + dx, cy + dy] });
  }
  return out;
}

/**
 * 每段恰好消耗一次 rng()，所以抽样序列只由种子决定；
 * 噪声必须在碎片之后抽，交换两者会让同种子产出不同的画面。
 */
export function fragmentFigure(geom: FigureGeometry, rng: Rng, opt: FragmentOptions): FragmentedFigure {
  const all = cutSegments(geom);
  const kept: Segment[] = [];
  for (const seg of all) if (rng() < opt.retention) kept.push(seg);
  const noise = noiseSegments(rng, opt.noise);
  return {
    segments: rotate(kept, opt.rotationDeg),
    noise: rotate(noise, opt.rotationDeg),
    totalSegs: all.length,
    keptSegs: kept.length,
    actualRetention: all.length === 0 ? 0 : kept.length / all.length,
    rotationDeg: opt.rotationDeg,
  };
}

/** 掩蔽帧：与目标无关的满屏随机线段。 */
export function makeMask(rng: Rng, n: number = MASK_SEGMENTS): Segment[] {
  return noiseSegments(rng, n);
}
