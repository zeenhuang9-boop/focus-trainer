// focus-trainer/src/games/mot/physics.test.ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { MOT_LEVELS } from './rules';
import { DOT_R, HIT_RADIUS, MIN_SPAWN_DIST } from './rules';
import { hitTest, spawnDots } from './physics';
import type { DotState } from './physics';

const dot = (over: Partial<DotState> = {}): DotState => ({
  id: 0,
  x: 0.5,
  y: 0.5,
  vx: 0,
  vy: 0,
  target: false,
  ...over,
});

describe('spawnDots', () => {
  // 40 个种子 × 10 档：不重叠、不出界、目标数恰好 K、不抛 spawn failed
  it('每档 40 个种子都不重叠、都在安全区内、target 数 === K', () => {
    for (const lv of MOT_LEVELS) {
      for (let s = 0; s < 40; s++) {
        const dots = spawnDots(createRng(1000 + s * 7919), lv);
        expect(dots).toHaveLength(lv.dots);
        expect(dots.filter((d) => d.target)).toHaveLength(lv.k);
        expect(dots.map((d) => d.id)).toEqual(dots.map((_, i) => i));
        for (const d of dots) {
          expect(d.x >= DOT_R && d.x <= 1 - DOT_R).toBe(true);
          expect(d.y >= DOT_R && d.y <= 1 - DOT_R).toBe(true);
          expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(lv.v, 12);
        }
        for (let a = 0; a < dots.length; a++) {
          for (let b = a + 1; b < dots.length; b++) {
            expect(Math.hypot(dots[a].x - dots[b].x, dots[a].y - dots[b].y) >= MIN_SPAWN_DIST).toBe(true);
          }
        }
      }
    }
  });

  it('同一种子得到逐字段相同的布局，不同种子布局不同', () => {
    const lv = MOT_LEVELS[9];
    const a = spawnDots(createRng(42), lv);
    const b = spawnDots(createRng(42), lv);
    expect(a).toEqual(b);
    expect(a).not.toEqual(spawnDots(createRng(43), lv));
  });

  it('目标是随机下标而非前 K 个：200 个种子里每个 id 都当过目标', () => {
    const lv = MOT_LEVELS[0];
    const seen = new Set<number>();
    for (let s = 0; s < 200; s++) {
      for (const d of spawnDots(createRng(s), lv)) if (d.target) seen.add(d.id);
    }
    expect(seen.size).toBe(lv.dots);
  });
});

describe('hitTest', () => {
  it('落在容差圆内返回该 id，圆外返回 null', () => {
    const dots = [dot({ id: 0, x: 0.5, y: 0.5 })];
    expect(hitTest(dots, 0.5, 0.5)).toBe(0);
    // 边界必须落在「距离恰好等于 HIT_RADIUS」上，而 0.5 + HIT_RADIUS 这个加法会把结果抬到
    // 0.07000000000000000666 之上（ulp(0.57) = 1.11e-16），dist > HIT_RADIUS ⇒ 等号取不到。
    // 0 与 HIT_RADIUS 都是二进制可精确表示的，hypot(HIT_RADIUS, 0) 回的就是 HIT_RADIUS 本身。
    const edge = [dot({ id: 0, x: 0, y: 0 })];
    expect(hitTest(edge, HIT_RADIUS, 0)).toBe(0); // 边界含等号：<=
    expect(hitTest(dots, 0.5 + HIT_RADIUS + 0.001, 0.5)).toBeNull();
  });

  it('两点之间的点击给更近的那个；完全同距给 id 小的', () => {
    const dots = [dot({ id: 0, x: 0.4, y: 0.5 }), dot({ id: 1, x: 0.49, y: 0.5 })];
    expect(hitTest(dots, 0.47, 0.5)).toBe(1); // 距 1 号 0.02、距 0 号 0.07 ⇒ 近的赢
    expect(hitTest(dots, 0.445, 0.5)).toBe(0);
    // 同距必须用 2 的幂坐标：0.3/0.7 相对 0.5 的两个差在双精度下并不相等（0.20000000000000001
    // 与 0.19999999999999996），会退化成「近的赢」而不是同距。0.4375/0.5625 相对 0.5 都是 0.0625。
    const tie = [dot({ id: 3, x: 0.4375, y: 0.3 }), dot({ id: 4, x: 0.5625, y: 0.3 })];
    expect(hitTest(tie, 0.5, 0.3)).toBe(3);
  });

  it('两个都不在容差内时返回 null（空点不改判定）', () => {
    const dots = [dot({ id: 0, x: 0.1, y: 0.1 }), dot({ id: 1, x: 0.9, y: 0.9 })];
    expect(hitTest(dots, 0.5, 0.5)).toBeNull();
  });
});
