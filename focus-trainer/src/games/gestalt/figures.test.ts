import { describe, expect, it } from 'vitest';
import { CURVE_SAMPLES, FAMILIES, FIGURES, buildFigure, type Family, type Pt } from './figures';

// 每个图形的点都是有限、落在 [-1,1]²、且至少触一次边界（证明归一化真的跑过）
function assertNormalized(id: string, pts: readonly Pt[]): void {
  expect(pts.length).toBeGreaterThan(1);
  let touched = false;
  for (const [x, y] of pts) {
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);
    expect(Math.abs(x)).toBeLessThanOrEqual(1);
    expect(Math.abs(y)).toBeLessThanOrEqual(1);
    if (Math.abs(Math.abs(x) - 1) < 1e-9 || Math.abs(Math.abs(y) - 1) < 1e-9) touched = true;
  }
  expect(touched, `${id} 未归一化到边界`).toBe(true);
}

describe('figures 描述表', () => {
  it('27 个图形、id 唯一、族分布为 5/4/5/4/4/5', () => {
    expect(FIGURES).toHaveLength(27);
    expect(new Set(FIGURES.map((f) => f.id)).size).toBe(27);
    expect(FAMILIES).toHaveLength(6);
    const byFamily = Object.fromEntries(
      FAMILIES.map((fam) => [fam, FIGURES.filter((f) => f.family === fam).length]),
    ) as Record<Family, number>;
    expect(byFamily).toEqual({ polygon: 5, star: 4, curve: 5, arrow: 4, symbol: 4, object: 5 });
    expect(FIGURES.every((f) => FAMILIES.includes(f.family))).toBe(true);
  });

  it('每个图形都能展开成合法折线', () => {
    for (const spec of FIGURES) {
      const g = buildFigure(spec.id);
      expect(g.family).toBe(spec.family);
      expect(g.strokes.length).toBeGreaterThan(0);
      for (const s of g.strokes) {
        expect(s.pts.length).toBeGreaterThanOrEqual(s.closed ? 3 : 2);
        assertNormalized(spec.id, s.pts);
      }
    }
  });

  it('正多边形 n 个顶点、星形 2n 个顶点、闭合首尾不重复存', () => {
    expect(buildFigure('pentagon').strokes[0].pts).toHaveLength(5);
    expect(buildFigure('octagon').strokes[0].pts).toHaveLength(8);
    expect(buildFigure('star6').strokes[0].pts).toHaveLength(12);
    expect(buildFigure('triangle').strokes[0].closed).toBe(true);
    // 闭合折线不重复存第一个点：重复会让弧长切段多出一个零长段
    const p = buildFigure('square').strokes[0].pts;
    expect(p[0]).not.toEqual(p[p.length - 1]);
  });

  it('曲线按弧长等距采样成 96 段（椭圆是变异探针）', () => {
    const ellipse = buildFigure('ellipse').strokes[0].pts;
    expect(ellipse).toHaveLength(CURVE_SAMPLES);
    const chords = ellipse.map((p, i) => {
      const q = ellipse[(i + 1) % ellipse.length];
      return Math.hypot(q[0] - p[0], q[1] - p[1]);
    });
    const max = Math.max(...chords);
    const min = Math.min(...chords);
    // 纯按参数角采样的椭圆长短轴处弦长差 2.6 倍；按弧长重采样后必须 < 1.08
    expect(max / min).toBeLessThan(1.08);
  });

  it('十字与 X 是两笔、对勾是一笔开放折线', () => {
    expect(buildFigure('cross').strokes).toHaveLength(2);
    expect(buildFigure('xShape').strokes).toHaveLength(2);
    expect(buildFigure('check').strokes).toHaveLength(1);
    expect(buildFigure('check').strokes[0].closed).toBe(false);
  });

  it('纯函数：同一 id 两次调用逐字段相等', () => {
    expect(buildFigure('house')).toEqual(buildFigure('house'));
  });
});
