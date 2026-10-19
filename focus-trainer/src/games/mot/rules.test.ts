// focus-trainer/src/games/mot/rules.test.ts
import { describe, expect, it } from 'vitest';
import type { RoundRecord, RoundResult } from '../../core/types';
import {
  DOT_R,
  FEEDBACK_MS,
  HIT_RADIUS,
  MAX_FRAME_INTERVAL_MS,
  MIN_SPAWN_DIST,
  MOT_LEVELS,
  MOT_MAX_LEVEL,
  PROMPT_MS,
  formatMotSummary,
  judgeMot,
  motLevel,
  summarizeMot,
} from './rules';

const round = (k: number, hits: number, counted = true): RoundRecord => {
  const r: RoundResult = {
    level: 1,
    seed: 1,
    trials: [{ onset: 0, rt: 1000, correct: hits === k, hits, k }],
    metrics: { k, hits, dots: 8, simSteps: 720, motionMs: 6000 },
    timingValid: true,
  };
  return { ...r, roundNo: 1, outcome: 'hold', score01: k === 0 ? 0 : hits / k, counted };
};

describe('MOT_LEVELS 档位表', () => {
  it('10 档逐格等于 spec §3.4:127–138', () => {
    expect(MOT_MAX_LEVEL).toBe(10);
    expect(MOT_LEVELS).toEqual([
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
    ]);
  });

  it('四个维度都随档位单调不降，且 K 恒 ≥ 2、K ≤ 总点数的一半', () => {
    for (let i = 1; i < MOT_LEVELS.length; i++) {
      const a = MOT_LEVELS[i - 1];
      const b = MOT_LEVELS[i];
      expect(b.dots >= a.dots).toBe(true);
      expect(b.k >= a.k).toBe(true);
      expect(b.v > a.v).toBe(true);
      expect(b.durationSec >= a.durationSec).toBe(true);
    }
    for (const lv of MOT_LEVELS) {
      // judgeMot 的 h / k 不做零保护，靠这条锁死「分母永不为 0」
      expect(lv.k).toBeGreaterThanOrEqual(2);
      expect(lv.k * 2).toBeLessThanOrEqual(lv.dots);
    }
  });

  it('motLevel 只接受 [1, 10] 的整数，越界与非整数抛 RangeError', () => {
    expect(motLevel(1)).toEqual(MOT_LEVELS[0]);
    expect(motLevel(10)).toEqual(MOT_LEVELS[9]);
    for (const bad of [0, 11, 1.5, Number.NaN, -1]) {
      expect(() => motLevel(bad)).toThrow(RangeError);
    }
  });

  it('几何常量与 spec §3.4:121 对齐：r = 0.035、容差 = 2r、最小间距 > 2r', () => {
    expect(DOT_R).toBe(0.035);
    expect(HIT_RADIUS).toBeCloseTo(2 * DOT_R, 12);
    expect(MIN_SPAWN_DIST).toBeGreaterThan(2 * DOT_R);
    expect(PROMPT_MS).toBe(2000);
    expect(FEEDBACK_MS).toBe(1000);
    expect(MAX_FRAME_INTERVAL_MS).toBe(50);
  });
});

describe('judgeMot', () => {
  const rows = [
    { name: '档 1 全中 2/2', level: 1, k: 2, hits: 2, outcome: 'pass', score01: 1 },
    { name: '档 1 中 1 个（K-1）', level: 1, k: 2, hits: 1, outcome: 'hold', score01: 0.5 },
    { name: '档 1 全错（≤ K-2）', level: 1, k: 2, hits: 0, outcome: 'fail', score01: 0 },
    { name: '档 8 中 4/5', level: 8, k: 5, hits: 4, outcome: 'hold', score01: 0.8 },
    { name: '档 10 中 3/5（= K-2）', level: 10, k: 5, hits: 3, outcome: 'fail', score01: 0.6 },
    { name: '档 10 中 5/5', level: 10, k: 5, hits: 5, outcome: 'pass', score01: 1 },
  ] as const;

  // 表里每一行都必须显式写 outcome/score01：h 与 k 的边界（h = K、h = K-1、h = K-2、h = 0）各覆盖一次
  for (const row of rows) {
    it(row.name, () => {
      const lv = motLevel(row.level);
      const result: RoundResult = {
        level: row.level,
        seed: 7,
        trials: [],
        metrics: { k: row.k, hits: row.hits, dots: lv.dots, simSteps: 0, motionMs: lv.durationSec * 1000 },
        timingValid: true,
      };
      expect(judgeMot(result)).toEqual({ outcome: row.outcome, score01: row.score01 });
    });
  }

  it('timingValid = false 不改判分：作废与重试是 SessionRunner 的职责', () => {
    const invalid: RoundResult = { level: 3, seed: 3, trials: [], metrics: { k: 3, hits: 3, dots: 8, simSteps: 0, motionMs: 6000 }, timingValid: false };
    expect(judgeMot(invalid)).toEqual({ outcome: 'pass', score01: 1 });
  });
});

describe('summarizeMot / formatMotSummary', () => {
  it('空轮与全作废轮给出全 0，不抛除零', () => {
    expect(summarizeMot([])).toEqual({ hitRate: 0, hits: 0, targets: 0, maxK: 0 });
    expect(summarizeMot([round(2, 1, false)])).toEqual({ hitRate: 0, hits: 0, targets: 0, maxK: 0 });
    expect(formatMotSummary(summarizeMot([]))).toEqual([
      { label: '命中率', value: '0%' },
      { label: '命中 / 目标', value: '0 / 0' },
      { label: '最高目标数', value: '0 个' },
    ]);
  });

  it('命中率 = 总命中 / 总目标（不是均值），maxK 取计分轮最大目标数', () => {
    // 简报原文此处为 round(2, 1)，与期望值 targets=12 / hitRate=7/12 矛盾（2+4+4=10）；
    // 按简报 0.5833 的推导注（7/12）修正为 round(4, 1)，期望值原样保留。
    const s = summarizeMot([round(4, 1), round(4, 4), round(4, 2)]);
    expect(s).toEqual({ hitRate: 0.5833, hits: 7, targets: 12, maxK: 4 });
    expect(formatMotSummary(s)).toEqual([
      { label: '命中率', value: '58%' },
      { label: '命中 / 目标', value: '7 / 12' },
      { label: '最高目标数', value: '4 个' },
    ]);
  });
});
