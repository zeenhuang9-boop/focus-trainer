import { describe, expect, it } from 'vitest';
import type { RoundRecord, RoundResult } from '../../core/types';
import {
  SCHULTE_LEVELS,
  SCHULTE_MAX_LEVEL,
  formatSchulteSummary,
  judgeSchulte,
  schulteLevel,
  summarizeSchulte,
  targetSequence,
} from './rules';

const res = (level: number, timeMs: number, errors: number): RoundResult => ({
  level,
  seed: 1,
  trials: [],
  metrics: { timeMs, errors, cells: 9 },
  timingValid: true,
});

const rec = (timeMs: number, errors: number, cells: number, counted = true): RoundRecord => ({
  level: 1,
  seed: 1,
  trials: [],
  metrics: { timeMs, errors, cells },
  timingValid: true,
  roundNo: 1,
  outcome: 'hold',
  score01: 0,
  counted,
});

describe('档位表', () => {
  it('10 档，与 spec 3.1 的表一致', () => {
    expect(SCHULTE_MAX_LEVEL).toBe(10);
    expect(SCHULTE_LEVELS.map((l) => [l.size, l.order, l.symbols, l.distractor, l.targetSec])).toEqual([
      [3, 'asc', 'digits', false, 8],
      [4, 'asc', 'digits', false, 15],
      [5, 'asc', 'digits', false, 25],
      [5, 'desc', 'digits', false, 28],
      [5, 'asc', 'letters', false, 30],
      [5, 'asc', 'digits', true, 30],
      [6, 'asc', 'digits', false, 42],
      [6, 'desc', 'digits', true, 48],
      [7, 'asc', 'digits', false, 60],
      [7, 'desc', 'digits', true, 70],
    ]);
  });

  it('档位越界抛 RangeError', () => {
    expect(() => schulteLevel(0)).toThrow(RangeError);
    expect(() => schulteLevel(11)).toThrow(RangeError);
    expect(() => schulteLevel(1.5)).toThrow(RangeError);
  });
});

describe('targetSequence', () => {
  it('正序数字 1→9', () => {
    expect(targetSequence(schulteLevel(1))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('倒序数字 25→1', () => {
    const seq = targetSequence(schulteLevel(4));
    expect(seq).toHaveLength(25);
    expect(seq[0]).toBe('25');
    expect(seq[24]).toBe('1');
  });

  it('字母 A→Y', () => {
    const seq = targetSequence(schulteLevel(5));
    expect(seq).toHaveLength(25);
    expect(seq[0]).toBe('A');
    expect(seq[24]).toBe('Y');
  });
});

describe('judgeSchulte（1 档 T = 8 秒）', () => {
  it('t ≤ T 且误点 ≤ 2 为 pass', () => {
    expect(judgeSchulte(res(1, 8000, 2)).outcome).toBe('pass');
  });

  it('超过 T、不超过 1.5T 为 hold；超过 1.5T 为 fail', () => {
    expect(judgeSchulte(res(1, 8001, 0)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 12000, 0)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 12001, 0)).outcome).toBe('fail');
  });

  it('误点 3–5 为 hold；超过 5 为 fail', () => {
    expect(judgeSchulte(res(1, 5000, 3)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 5000, 5)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 5000, 6)).outcome).toBe('fail');
  });

  it('score01 = clamp(T / t, 0, 1) × max(0, 1 − 0.1e)', () => {
    expect(judgeSchulte(res(1, 4000, 0)).score01).toBe(1);
    expect(judgeSchulte(res(1, 8000, 2)).score01).toBeCloseTo(0.8, 10);
    expect(judgeSchulte(res(1, 16000, 4)).score01).toBeCloseTo(0.3, 10);
    expect(judgeSchulte(res(1, 5000, 12)).score01).toBe(0);
  });
});

describe('summarizeSchulte 与 formatSchulteSummary', () => {
  it('只统计计分轮', () => {
    const input = [rec(9000, 1, 9), rec(16000, 2, 16), rec(1000, 0, 9, false)];
    const before = structuredClone(input);
    expect(summarizeSchulte(input)).toEqual({ bestTimeMs: 9000, avgCellMs: 1000, errors: 3 });
    // 只读契约：SessionRunner 把整场记录交给 summarize，结算页也复用同一份记录。
    // 原地排序或就地改写 metrics 会污染调用方的数据（评审 N-3 的真实风险面）。
    expect(input).toEqual(before);
  });

  it('没有计分轮时三项都为 0', () => {
    expect(summarizeSchulte([rec(1000, 0, 9, false)])).toEqual({ bestTimeMs: 0, avgCellMs: 0, errors: 0 });
  });

  it('平均每格用时按四舍五入取整', () => {
    // 原先三条用例全用整除输入，round 与 floor 同值，取整方向没人钉过（评审变异 T55）。
    // 裁定：保留 Math.round（结算页显示的就是这个数），1001/2 = 500.5 → 501。
    expect(summarizeSchulte([rec(1001, 0, 2)])).toEqual({ bestTimeMs: 1001, avgCellMs: 501, errors: 0 });
  });

  it('转成带单位的中文文案', () => {
    expect(formatSchulteSummary({ bestTimeMs: 9040, avgCellMs: 1000, errors: 3 })).toEqual([
      { label: '最佳用时', value: '9.0 秒' },
      { label: '平均每格', value: '1000 毫秒' },
      { label: '总误点', value: '3 次' },
    ]);
  });
});
