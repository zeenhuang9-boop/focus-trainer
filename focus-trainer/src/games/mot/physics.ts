// focus-trainer/src/games/mot/physics.ts
import { shuffle } from '../../core/rng';
import type { Rng } from '../../core/rng';
import { DOT_R, HIT_RADIUS, MAX_SPAWN_ATTEMPTS, MIN_SPAWN_DIST } from './rules';
import type { MotLevel } from './rules';

export interface DotState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly target: boolean;
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
