import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import type { RoundRecord, RoundResult } from '../../core/types';
import {
  SEQMEM_LEVELS,
  SEQMEM_MAX_LEVEL,
  SEQMEM_SPAN_GROWTH,
  capSpan,
  formatSeqmemSummary,
  judgeSeqmem,
  makeSpan,
  seqmemLevel,
  soaMs,
  summarizeSeqmem,
} from './rules';

// spec §3.3 第 103–112 行的 10 行表，逐格抄成字面量。表一变（档位/时长/网格）这条先红。
const SPEC_TABLE: readonly (readonly [number, 'fwd' | 'rev', number, number, number, number])[] = [
  [1, 'fwd', 3, 3, 800, 300],
  [2, 'fwd', 4, 3, 750, 280],
  [3, 'fwd', 4, 4, 700, 260],
  [4, 'fwd', 5, 4, 650, 240],
  [5, 'fwd', 6, 4, 600, 220],
  [6, 'fwd', 6, 5, 550, 200],
  [7, 'fwd', 7, 5, 500, 180],
  [8, 'rev', 4, 4, 650, 240],
  [9, 'rev', 5, 4, 600, 220],
  [10, 'rev', 6, 5, 500, 200],
];

const result = (spansCorrect: number, extra: Record<string, number> = {}): RoundResult => ({
  level: 1,
  seed: 1,
  trials: [],
  metrics: { spansCorrect, spans: spansCorrect, bestSpan: 0, fwdSpan: 0, revSpan: 0, recallSumMs: 0, timeMs: 0, ...extra },
  timingValid: true,
});

const record = (metrics: Record<string, number>, counted = true): RoundRecord => ({
  ...result(metrics.spansCorrect ?? 0, metrics),
  roundNo: 1,
  outcome: 'hold',
  score01: 0,
  counted,
});

describe('SEQMEM 档位表', () => {
  it('10 档的方向、起始长度、网格、亮/间隔逐格等于 spec 表', () => {
    expect(SEQMEM_MAX_LEVEL).toBe(10);
    expect(SEQMEM_LEVELS.length).toBe(SPEC_TABLE.length);
    expect(SEQMEM_LEVELS.map((lv) => [lv.dir, lv.l0, lv.size, lv.onMs, lv.gapMs])).toEqual(
      SPEC_TABLE.map(([, dir, l0, size, onMs, gapMs]) => [dir, l0, size, onMs, gapMs]),
    );
    // 顺带钉住 seqmemLevel(n) 与表下标的对应关系（1 起、非 0 起）
    expect(seqmemLevel(1)).toEqual({ size: 3, dir: 'fwd', l0: 3, onMs: 800, gapMs: 300 });
    expect(seqmemLevel(10)).toEqual({ size: 5, dir: 'rev', l0: 6, onMs: 500, gapMs: 200 });
  });

  it('SOA 与长度上限曲线是写死的字面量', () => {
    // 亮 d + 间隔 g：正序档逐档收紧，8–10 档切逆序后重新放宽（spec 表第 8 行起）
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => soaMs(seqmemLevel(n)))).toEqual([
      1100, 1030, 960, 890, 820, 750, 680, 890, 820, 700,
    ]);
    // L0 + 6（spec:96「单轮长度上限 L0 + 6」）
    expect(SEQMEM_SPAN_GROWTH).toBe(6);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => capSpan(seqmemLevel(n)))).toEqual([
      9, 10, 10, 11, 12, 12, 13, 10, 11, 12,
    ]);
  });

  it('档位越界与非整数抛 RangeError', () => {
    for (const bad of [0, 11, 1.5, Number.NaN, -1]) {
      expect(() => seqmemLevel(bad)).toThrow(RangeError);
    }
  });
});

describe('makeSpan 序列生成', () => {
  it('长度对、值域在 size² 内、相邻两项不同（10 档 × 200 种子）', () => {
    for (let n = 1; n <= SEQMEM_MAX_LEVEL; n++) {
      const lv = seqmemLevel(n);
      const total = lv.size * lv.size;
      for (let seed = 0; seed < 200; seed++) {
        const rng = createRng(seed * 31 + n);
        for (let len = lv.l0; len <= capSpan(lv); len++) {
          const seq = makeSpan(rng, lv.size, len);
          expect(seq).toHaveLength(len);
          expect(seq.every((c) => Number.isInteger(c) && c >= 0 && c < total)).toBe(true);
          // 裁定 R-2：拒绝采样必须把「相邻同格」彻底排除掉
          for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1]);
        }
      }
    }
  });

  it('同种子同参数产出同一条序列，换种子产出不同序列', () => {
    expect(makeSpan(createRng(42), 3, 3)).toEqual(makeSpan(createRng(42), 3, 3));
    expect(makeSpan(createRng(42), 3, 3)).not.toEqual(makeSpan(createRng(43), 3, 3));
    // 一条 rng 流上连出 7 条序列也要可复现（Task 2 起引擎就是这么用的：一轮只 createRng 一次）
    const stream = (seed: number): number[][] => {
      const rng = createRng(seed);
      return Array.from({ length: 7 }, () => makeSpan(rng, 4, 5));
    };
    expect(stream(9)).toEqual(stream(9));
    expect(stream(9)).not.toEqual(stream(10));
  });

  it('非相邻重复合法：9 格出 9 长的序列必然出现隔位重复', () => {
    // 只有「相邻不等」这一条约束时，size² === len 会触发鸽巢原理：9 格 9 项不可能两两不同。
    // 这条断言把 R-2 的「隔位重复合法」钉死：改成「全序列不重复」会在这里红。
    let sawRepeat = false;
    for (let seed = 0; seed < 50; seed++) {
      const seq = makeSpan(createRng(seed), 3, 9);
      if (new Set(seq).size < seq.length) sawRepeat = true;
    }
    expect(sawRepeat).toBe(true);
    expect(makeSpan(createRng(7), 3, 9)).toHaveLength(9);
  });
});

describe('judgeSeqmem', () => {
  it('答对条数 s → outcome/score01 全表（spec:114–115）', () => {
    const table: readonly (readonly [number, 'pass' | 'hold' | 'fail', number])[] = [
      [0, 'fail', 0],
      [1, 'hold', 1 / 3],
      [2, 'pass', 2 / 3],
      [3, 'pass', 1],
      [7, 'pass', 1],
    ];
    for (const [s, outcome, score01] of table) {
      const got = judgeSeqmem(result(s));
      expect(got.outcome).toBe(outcome);
      expect(got.score01).toBeCloseTo(score01, 10);
    }
  });

  it('边界：s=1 是 hold 不是 fail，s=2 才 pass；score01 封顶在 1', () => {
    expect(judgeSeqmem(result(1)).outcome).toBe('hold');
    expect(judgeSeqmem(result(2)).outcome).toBe('pass');
    expect(judgeSeqmem(result(6)).score01).toBe(1);
    expect(judgeSeqmem(result(7)).score01).toBe(1);
  });
});

describe('summarizeSeqmem / formatSeqmemSummary', () => {
  it('正序/逆序广度取 counted 轮的最大值，作废轮不参与', () => {
    const fwd = record({ fwdSpan: 5, revSpan: 0, spans: 3, spansCorrect: 2, recallSumMs: 3000 });
    const rev = record({ fwdSpan: 0, revSpan: 7, spans: 4, spansCorrect: 3, recallSumMs: 6000 });
    const voided = record({ fwdSpan: 9, revSpan: 0, spans: 9, spansCorrect: 9, recallSumMs: 1 }, false);
    expect(summarizeSeqmem([fwd, rev, voided])).toEqual({
      fwdSpan: 5,
      revSpan: 7,
      spans: 7,
      spansCorrect: 5,
      avgRecallMs: Math.round(9000 / 5),
    });
  });

  it('空数组与全零轮不炸，avgRecallMs 在 0 条正确时为 0', () => {
    expect(summarizeSeqmem([])).toEqual({ fwdSpan: 0, revSpan: 0, spans: 0, spansCorrect: 0, avgRecallMs: 0 });
    expect(summarizeSeqmem([record({ fwdSpan: 0, revSpan: 0, spans: 1, spansCorrect: 0, recallSumMs: 0 })])).toEqual({
      fwdSpan: 0,
      revSpan: 0,
      spans: 1,
      spansCorrect: 0,
      avgRecallMs: 0,
    });
  });

  it('四条中文指标的顺序与「—」占位文案', () => {
    expect(formatSeqmemSummary({ fwdSpan: 5, revSpan: 0, spans: 7, spansCorrect: 5, avgRecallMs: 1800 })).toEqual([
      { label: '正序最大广度', value: '5 格' },
      { label: '逆序最大广度', value: '—' },
      { label: '答对序列', value: '5 / 7 条' },
      { label: '平均回忆用时', value: '1.8 秒' },
    ]);
    expect(formatSeqmemSummary({ fwdSpan: 0, revSpan: 0, spans: 0, spansCorrect: 0, avgRecallMs: 0 }).map((i) => i.value)).toEqual([
      '—',
      '—',
      '0 / 0 条',
      '—',
    ]);
  });
});
