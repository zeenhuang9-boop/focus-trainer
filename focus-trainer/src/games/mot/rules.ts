// focus-trainer/src/games/mot/rules.ts
import type { Outcome, RoundRecord, RoundResult, SummaryItem } from '../../core/types';

export interface MotLevel {
  readonly dots: number;
  readonly k: number;
  readonly v: number;
  readonly durationSec: number;
}

// spec §3.4:127–138 逐格照抄，任何改动都是改判分难度，需控制器裁定。
export const MOT_LEVELS: readonly MotLevel[] = [
  { dots: 6, k: 2, v: 0.15, durationSec: 5 },
  { dots: 8, k: 2, v: 0.18, durationSec: 6 },
  { dots: 8, k: 3, v: 0.2, durationSec: 6 },
  { dots: 10, k: 3, v: 0.22, durationSec: 7 },
  { dots: 10, k: 4, v: 0.24, durationSec: 7 },
  { dots: 12, k: 4, v: 0.27, durationSec: 8 },
  { dots: 12, k: 4, v: 0.3, durationSec: 8 },
  { dots: 14, k: 5, v: 0.32, durationSec: 9 },
  { dots: 14, k: 5, v: 0.36, durationSec: 9 },
  { dots: 16, k: 5, v: 0.4, durationSec: 10 },
];

export const MOT_MAX_LEVEL = MOT_LEVELS.length;

// 几何常量：单位一律是「归一化场地边长」，与 CSS 像素无关（视图自己乘边长）。
export const DOT_R = 0.035;
// 点选容差 = 2r。有效触点直径 = 2 × HIT_RADIUS × 边长 = 0.14 × 边长；
// spec §5.8 要求触控目标 ≥ 48px ⇒ 场地边长需 ≥ 343px，真机实测见「需要执行时才能发现的事」1。
export const HIT_RADIUS = 2 * DOT_R;
// 撒点最小中心间距：2r 只是「不相切」，这里多留 0.02 让两点不会被一根手指同时盖住。
export const MIN_SPAWN_DIST = 0.09;
export const MAX_SPAWN_ATTEMPTS = 500;

export const PROMPT_MS = 2000;
export const FEEDBACK_MS = 1000;
// 超出 spec §6:361 的有意收紧：§6:361 只点名 MOT 的「运动阶段」，本实现把提示期一并纳入判定 ——
// 提示期与运动阶段任一帧间隔 > 50ms 都判 timingValid = false（engine.ts:100 的 phase 条件）。
// 理由：提示期卡顿同样说明这一帧序列不可信，运动期是接着提示期的时钟跑的。这是偏离规格而非引用
// 规格，收紧方向保守（只会多作废轮，不会把坏轮当 good 轮计分），终审 SF-2 裁定保留。
export const MAX_FRAME_INTERVAL_MS = 50;

export function motLevel(level: number): MotLevel {
  if (!Number.isInteger(level) || level < 1 || level > MOT_MAX_LEVEL) {
    throw new RangeError(`mot level out of range: ${level}`);
  }
  return MOT_LEVELS[level - 1];
}

export function judgeMot(r: RoundResult): { outcome: Outcome; score01: number } {
  const k = r.metrics.k;
  const h = r.metrics.hits;
  let outcome: Outcome = 'hold';
  if (h === k) outcome = 'pass';
  else if (h <= k - 2) outcome = 'fail';
  return { outcome, score01: h / k };
}

export function summarizeMot(rounds: readonly RoundRecord[]): Record<string, number> {
  const counted = rounds.filter((x) => x.counted);
  if (counted.length === 0) return { hitRate: 0, hits: 0, targets: 0, maxK: 0 };
  const hits = counted.reduce((sum, x) => sum + x.metrics.hits, 0);
  const targets = counted.reduce((sum, x) => sum + x.metrics.k, 0);
  return {
    hitRate: Math.round((hits / targets) * 10000) / 10000,
    hits,
    targets,
    maxK: Math.max(...counted.map((x) => x.metrics.k)),
  };
}

export function formatMotSummary(s: Record<string, number>): SummaryItem[] {
  return [
    { label: '命中率', value: `${Math.round(s.hitRate * 100)}%` },
    { label: '命中 / 目标', value: `${s.hits} / ${s.targets}` },
    { label: '最高目标数', value: `${s.maxK} 个` },
  ];
}
