// focus-trainer/src/games/mot/physics.test.ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { MOT_LEVELS } from './rules';
import { DOT_R, HIT_RADIUS, MIN_SPAWN_DIST } from './rules';
import { frameSteps, hitTest, JITTER_DEG, spawnDots, STEPS_PER_SECOND, stepOnce } from './physics';
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

const freeDot = (over: Partial<DotState> = {}): DotState => ({
  id: 0, x: 0.5, y: 0.5, vx: 0.15, vy: 0, target: false, ...over,
});

describe('frameSteps —— 定长步计数', () => {
  it('整秒必须给满 120 步（用 elapsed*120/1000，不是 elapsed/STEP_MS）', () => {
    expect(frameSteps(0)).toBe(0);
    expect(frameSteps(1000)).toBe(120);
    expect(frameSteps(2000)).toBe(240);
    expect(frameSteps(6000)).toBe(720);
    expect(frameSteps(10000)).toBe(1200); // 档 10 的曝光 = D * 120
    expect(frameSteps(999.999)).toBe(119);
    expect(frameSteps(STEPS_PER_SECOND)).toBe(14); // 120ms → 14.4 步 → 14
    // 反例锚点：Math.floor(1000 / (1000 / 120)) === 119，这条断言把坑钉在测试里
    expect(Math.floor(1000 / (1000 / STEPS_PER_SECOND))).toBe(119);
  });

  it('负 elapsed 返回负数：时钟契约禁止钳制，靠 while 不动作兜住', () => {
    expect(frameSteps(-16)).toBe(-2);
    expect(frameSteps(-1)).toBe(-1);
  });
});

describe('stepOnce —— 定长步运动', () => {
  it('直线运动 119 步内不偏转，第 120 步偏转不超过 ±30°', () => {
    const lv = MOT_LEVELS[0];
    let dots = [freeDot({ x: 0.5, y: 0.5, vx: lv.v, vy: 0 })];
    const rng = createRng(7);
    for (let i = 0; i < STEPS_PER_SECOND - 1; i++) dots = stepOnce(dots, rng, lv, i);
    // 119 步 = 119/120 秒，位移 = v * t，方向仍是水平
    expect(dots[0].vy).toBeCloseTo(0, 12);
    expect(dots[0].vx).toBeCloseTo(lv.v, 12);
    expect(dots[0].x).toBeCloseTo(0.5 + lv.v * (119 / 120), 9);
    const before = Math.atan2(dots[0].vy, dots[0].vx);
    dots = stepOnce(dots, rng, lv, STEPS_PER_SECOND - 1);
    const after = Math.atan2(dots[0].vy, dots[0].vx);
    let delta = after - before;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    expect(Math.abs((delta * 180) / Math.PI)).toBeLessThanOrEqual(JITTER_DEG + 1e-9);
    expect(Math.hypot(dots[0].vx, dots[0].vy)).toBeCloseTo(lv.v, 12); // 旋转保模长
  });

  it('碰壁反射：点不会出安全区，且 x 方向反向', () => {
    const lv = MOT_LEVELS[9];
    let dots = [freeDot({ x: 0.98, y: 0.5, vx: lv.v, vy: 0 })];
    dots = stepOnce(dots, createRng(1), lv, 0);
    expect(dots[0].x).toBeLessThanOrEqual(1 - DOT_R);
    expect(dots[0].vx).toBeCloseTo(-lv.v, 12);
    let many = spawnDots(createRng(99), lv);
    for (let i = 0; i < 1200; i++) many = stepOnce(many, createRng(1000 + i), lv, i);
    for (const d of many) {
      expect(d.x >= DOT_R - 1e-9 && d.x <= 1 - DOT_R + 1e-9).toBe(true);
      expect(d.y >= DOT_R - 1e-9 && d.y <= 1 - DOT_R + 1e-9).toBe(true);
      expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(lv.v, 9); // 10 秒后每个点速率仍恒为 v
    }
  });

  // 成对循环只对 a < b 生效：若让点与自己配对，dist === 0 会走确定性法线 (1, 0) 并被 push
  // (2r/2 + ε) 沿 +x 抬起，贴墙的孤立点凭空地跳 0.0355 —— 这条锁住「不会自己推自己」。
  it('贴墙的孤立点不会被自己的成对循环推开', () => {
    const lv = MOT_LEVELS[0];
    const dots = [freeDot({ x: DOT_R, y: 0.5, vx: 0, vy: lv.v })];
    const out = stepOnce(dots, createRng(3), lv, 0);
    expect(out[0].x).toBe(DOT_R);
    expect(out[0].y).toBeCloseTo(0.5 + lv.v / STEPS_PER_SECOND, 12);
  });

  it('正面对撞：交换法向分量并推开到不相切，速率仍是 v', () => {
    const v = MOT_LEVELS[0].v;
    const dots = [
      freeDot({ id: 0, x: 0.4, y: 0.5, vx: v, vy: 0 }),
      freeDot({ id: 1, x: 0.44, y: 0.5, vx: -v, vy: 0, target: true }),
    ];
    const out = stepOnce(dots, createRng(5), MOT_LEVELS[0], 0);
    expect(out[0].vx).toBeCloseTo(-v, 9); // A 反弹
    expect(out[1].vx).toBeCloseTo(v, 9); // B 反弹
    expect(out[0].target).toBe(false);
    expect(out[1].target).toBe(true); // id 与 target 跟着点走，不串位
    expect(Math.hypot(out[1].x - out[0].x, out[1].y - out[0].y)).toBeGreaterThanOrEqual(2 * DOT_R - 1e-12);
    for (const d of out) expect(Math.hypot(d.vx, d.vy)).toBeCloseTo(v, 9);
  });

  it('同 (level, seed, 步数) 两次推进逐字段相同；stepIndex 决定是否偏转所以也必须同', () => {
    const lv = MOT_LEVELS[4];
    const run = () => {
      const rng = createRng(2026);
      let dots = spawnDots(rng, lv);
      for (let i = 0; i < 300; i++) dots = stepOnce(dots, rng, lv, i);
      return dots;
    };
    expect(run()).toEqual(run());
    expect(run()).not.toEqual(run().map((d) => ({ ...d, x: d.x + 0.001 })));
  });

  it('推进函数不修改入参数组（视图与引擎都可能留着上一帧的快照）', () => {
    const lv = MOT_LEVELS[2];
    const dots = spawnDots(createRng(8), lv);
    const copy = dots.map((d) => ({ ...d }));
    stepOnce(dots, createRng(9), lv, 0);
    expect(dots.map((d) => ({ ...d }))).toEqual(copy);
  });
});
