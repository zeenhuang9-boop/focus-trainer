import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { buildFigure } from './figures';
import {
  MASK_SEGMENTS, SEG_LEN,
  cutSegments, fragmentFigure, makeMask, rotate, type FragmentOptions,
} from './fragment';

const len = (s: { a: readonly [number, number]; b: readonly [number, number] }) =>
  Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const same = (s: { a: readonly [number, number]; b: readonly [number, number] }, x: number, y: number) =>
  Math.abs(s.a[0] - x) < 1e-12 && Math.abs(s.a[1] - y) < 1e-12;
const opts = (over: Partial<FragmentOptions> = {}): FragmentOptions => ({
  retention: 0.5, noise: 0, rotationDeg: 0, ...over,
});

describe('cutSegments', () => {
  it('每段长 ≤ 0.08 且 ≥ 0.04，圆上首尾相接（零头规则）', () => {
    const segs = cutSegments(buildFigure('circle'));
    expect(segs.length).toBeGreaterThan(20);
    for (const s of segs) {
      expect(len(s)).toBeLessThanOrEqual(SEG_LEN + 1e-9);
      expect(len(s)).toBeGreaterThanOrEqual(SEG_LEN / 2);
    }
    for (let i = 0; i < segs.length - 1; i++) {
      expect(same(segs[i + 1], segs[i].b[0], segs[i].b[1])).toBe(true);
    }
    // 闭合轮廓：最后一段的终点回到第一段的起点
    expect(same(segs[0], segs[segs.length - 1].b[0], segs[segs.length - 1].b[1])).toBe(true);
  });

  it('多笔图形（十字）每笔独立切段，笔与笔之间不连线', () => {
    const segs = cutSegments(buildFigure('cross'));
    const breaks = segs.filter((s, i) => i > 0 && !same(s, segs[i - 1].b[0], segs[i - 1].b[1]));
    expect(breaks.length).toBe(1); // 2 笔 → 恰好 1 处断开
  });
});

describe('fragmentFigure', () => {
  it('保留率 k=1 全留、k=0 全丢（精确边界，卡死「独立伯努利」的实现）', () => {
    const g = buildFigure('octagon');
    const total = cutSegments(g).length;
    const all = fragmentFigure(g, createRng(1), opts({ retention: 1 }));
    expect(all.totalSegs).toBe(total);
    expect(all.keptSegs).toBe(total);
    expect(all.segments).toHaveLength(total);
    const none = fragmentFigure(g, createRng(1), opts({ retention: 0 }));
    expect(none.keptSegs).toBe(0);
    expect(none.segments).toHaveLength(0);
  });

  it('实际保留率在 ±0.15 内（spec:373「实际保留率接近 k」）', () => {
    for (const k of [0.35, 0.5, 0.75]) {
      const f = fragmentFigure(buildFigure('circle'), createRng(202), opts({ retention: k }));
      expect(Math.abs(f.actualRetention - k)).toBeLessThanOrEqual(0.15);
      expect(f.actualRetention).toBe(f.keptSegs / f.totalSegs);
    }
  });

  it('噪声段数量精确、等长、端点在 [-1,1]² 内', () => {
    const f = fragmentFigure(buildFigure('heart'), createRng(9), opts({ retention: 1, noise: 17 }));
    expect(f.noise).toHaveLength(17);
    for (const s of f.noise) {
      expect(len(s)).toBeCloseTo(SEG_LEN, 9);
      expect(Math.abs(s.a[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(s.b[1])).toBeLessThanOrEqual(1);
    }
    expect(fragmentFigure(buildFigure('heart'), createRng(9), opts({ noise: 0 })).noise).toHaveLength(0);
  });

  it('θ 同时作用于碎片与噪声（整体旋转）', () => {
    const g = buildFigure('square');
    const flat = fragmentFigure(g, createRng(5), opts({ retention: 1, noise: 4, rotationDeg: 0 }));
    const spun = fragmentFigure(g, createRng(5), opts({ retention: 1, noise: 4, rotationDeg: 90 }));
    expect(spun.segments).toEqual(rotate(flat.segments, 90));
    expect(spun.noise).toEqual(rotate(flat.noise, 90));
    expect(spun.rotationDeg).toBe(90);
    expect(fragmentFigure(g, createRng(5), opts({ noise: 4 })).rotationDeg).toBe(0);
  });

  it('rotate：0 度恒等、90 度精确到 1e-12', () => {
    const seg = [{ a: [0, 0] as [number, number], b: [1, 0] as [number, number] }];
    expect(rotate(seg, 0)).toEqual(seg);
    const q = rotate(seg, 90);
    expect(q[0].b[0]).toBeCloseTo(0, 12);
    expect(q[0].b[1]).toBeCloseTo(1, 12);
  });

  it('同 (geom, rng, opt) 两次调用逐字段相等（可复现底座）', () => {
    const g = buildFigure('fish');
    const o = opts({ retention: 0.58, noise: 15, rotationDeg: 12 });
    expect(fragmentFigure(g, createRng(77), o)).toEqual(fragmentFigure(g, createRng(77), o));
  });
});

describe('makeMask', () => {
  it('掩蔽是纯噪声：段数与方向多样性', () => {
    const m = makeMask(createRng(3), MASK_SEGMENTS);
    expect(m).toHaveLength(MASK_SEGMENTS);
    const angles = new Set(
      m.map((s) => Math.round((Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) * 180) / Math.PI) / 10),
    );
    expect(angles.size).toBeGreaterThan(6);
    expect(makeMask(createRng(3), 0)).toHaveLength(0);
  });
});
