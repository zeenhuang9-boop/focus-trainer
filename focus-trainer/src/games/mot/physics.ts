// focus-trainer/src/games/mot/physics.ts
import { shuffle } from '../../core/rng';
import type { Rng } from '../../core/rng';
import { DOT_R, HIT_RADIUS, MAX_SPAWN_ATTEMPTS, MIN_SPAWN_DIST } from './rules';
import type { MotLevel } from './rules';

// 字段可变只服务本文件的定长步推进：每步新建对象后 resolvePair 需原地写，对外仍按只读使用
// （stepOnce 的入参声明成 readonly 数组，调用方无法把上一帧快照改脏）。
export interface DotState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  target: boolean;
}

// rng 的调用顺序是复现性的一部分：先按 id 顺序撒位置，再抽 K 个目标下标，最后逐点取方向角。
// 任何一步换了顺序，同 (level, seed) 的轨迹就变了 —— 改动前先跑 repro 测试。
export function spawnDots(rng: Rng, lv: MotLevel): DotState[] {
  const lo = DOT_R;
  const hi = 1 - DOT_R;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < lv.dots; i++) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_SPAWN_ATTEMPTS && !placed; attempt++) {
      const x = lo + rng() * (hi - lo);
      const y = lo + rng() * (hi - lo);
      if (pts.every((p) => Math.hypot(p.x - x, p.y - y) >= MIN_SPAWN_DIST)) {
        pts.push({ x, y });
        placed = true;
      }
    }
    if (!placed) {
      throw new Error(`mot spawn failed after ${MAX_SPAWN_ATTEMPTS} attempts (dots=${lv.dots})`);
    }
  }
  const targets = new Set(shuffle(rng, pts.map((_, i) => i)).slice(0, lv.k));
  return pts.map((p, i) => {
    const angle = rng() * Math.PI * 2;
    return {
      id: i,
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * lv.v,
      vy: Math.sin(angle) * lv.v,
      target: targets.has(i),
    };
  });
}

// 数组按 id 升序遍历 + 严格 <，所以「完全同距取 id 小的」是这条实现的性质，不是巧合。
export function hitTest(dots: readonly DotState[], x: number, y: number): number | null {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const d of dots) {
    const dist = Math.hypot(d.x - x, d.y - y);
    if (dist <= HIT_RADIUS && dist < bestDist) {
      best = d.id;
      bestDist = dist;
    }
  }
  return best;
}

export const STEPS_PER_SECOND = 120;
export const STEP_MS = 1000 / STEPS_PER_SECOND;
export const STEP_SEC = 1 / STEPS_PER_SECOND;
export const JITTER_DEG = 30;

// 步数必须由「距阶段逻辑起点的 elapsed」推导，不能靠帧间隔累加：
// 后者的浮点余量取决于 dt 序列，16ms 与 48ms 两种节奏会在步边界差一步，轨迹就不复现。
// 另外必须是 elapsed * 120 / 1000 —— 1000 / STEP_MS 的除法在整秒上会得 119（1000/120 是向上舍入的
// 双精度值，1000 / 8.333333333333334 = 119.99999999999999）。
// 负 elapsed 不钳制（N-5），while (steps < target) 对负 target 天然不动作。
export function frameSteps(elapsedMs: number): number {
  return Math.floor((elapsedMs * STEPS_PER_SECOND) / 1000);
}

const FIELD_LO = DOT_R;
const FIELD_HI = 1 - DOT_R;

// 几何钳制（点不能跑出场地）与时钟契约的「禁止负值/NaN 钳制」无关：后者管的是 now/dt/timeMs 这类
// 判分输入，这里管的是模拟状态必须在 [0,1]² 场地内，属于物理约束。
function clampField(p: number): number {
  return Math.min(FIELD_HI, Math.max(FIELD_LO, p));
}

function renormalize(d: DotState, speed: number): void {
  const s = Math.hypot(d.vx, d.vy);
  if (s === 0) {
    // 只有人为构造零速点才会到这里（spawnDots 恒给 |v| = speed）。确定性兜底：按 +x 方向重赋速率，
    // 不抛错也不留 NaN —— NaN 会一路污染后续所有位置，且复现测试只会看到「不相等」而说不出原因。
    d.vx = speed;
    d.vy = 0;
    return;
  }
  d.vx = (d.vx / s) * speed;
  d.vy = (d.vy / s) * speed;
}

function resolvePair(dots: DotState[], ai: number, bi: number, speed: number): void {
  const A = dots[ai];
  const B = dots[bi];
  const minDist = 2 * DOT_R;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= minDist) return;
  // dist === 0 只可能来自人为构造；给确定的法线，避免 NaN 方向。
  const nx = dist === 0 ? 1 : dx / dist;
  const ny = dist === 0 ? 0 : dy / dist;
  const van = A.vx * nx + A.vy * ny;
  const vbn = B.vx * nx + B.vy * ny;
  if (van - vbn > 0) {
    // 等质量完全弹性碰撞 = 交换沿法线的速度分量；切向分量不动。
    const dvn = van - vbn;
    A.vx -= dvn * nx;
    A.vy -= dvn * ny;
    B.vx += dvn * nx;
    B.vy += dvn * ny;
  }
  const push = (minDist - dist) / 2 + 0.0005;
  A.x = clampField(A.x - push * nx);
  A.y = clampField(A.y - push * ny);
  B.x = clampField(B.x + push * nx);
  B.y = clampField(B.y + push * ny);
  renormalize(A, speed);
  renormalize(B, speed);
}

// 每步：积分 → 反射 → 单遍成对碰撞（a < b 升序 = 确定顺序）→ 每满 120 步做 ±30° 方向偏转。
// rng 只在偏转时消费，所以「没有碰撞的 119 步不消耗随机数」是可测的（本 Task 有用例）。
export function stepOnce(dots: readonly DotState[], rng: Rng, lv: MotLevel, stepIndex: number): DotState[] {
  const next: DotState[] = dots.map((d) => {
    let { x, y, vx, vy } = d;
    x += vx * STEP_SEC;
    y += vy * STEP_SEC;
    // 出界用镜像（x = 2*边界 − x）而不是「钳到边界再反向」：钳位会把这一步越过边界的位移整段丢掉，
    // 丢多少取决于撞墙角度，等于给轨迹加了「帧序列相关」的自由度，同 (level, seed) 就不复现了。
    if (x < FIELD_LO) {
      x = 2 * FIELD_LO - x;
      vx = -vx;
    } else if (x > FIELD_HI) {
      x = 2 * FIELD_HI - x;
      vx = -vx;
    }
    if (y < FIELD_LO) {
      y = 2 * FIELD_LO - y;
      vy = -vy;
    } else if (y > FIELD_HI) {
      y = 2 * FIELD_HI - y;
      vy = -vy;
    }
    return { id: d.id, x, y, vx, vy, target: d.target };
  });
  for (let a = 0; a < next.length; a++) {
    for (let b = a + 1; b < next.length; b++) resolvePair(next, a, b, lv.v);
  }
  if ((stepIndex + 1) % STEPS_PER_SECOND === 0) {
    const rad = (JITTER_DEG * Math.PI) / 180;
    for (let i = 0; i < next.length; i++) {
      const theta = (rng() * 2 - 1) * rad;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const { vx, vy } = next[i];
      next[i] = { ...next[i], vx: vx * cos - vy * sin, vy: vx * sin + vy * cos };
    }
  }
  return next;
}
