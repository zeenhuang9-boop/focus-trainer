import { describe, expect, it } from 'vitest';
import type { RoundRecord, RoundResult } from '../../core/types';
import {
  STROOP_COLORS,
  STROOP_LEVELS,
  STROOP_MAX_LEVEL,
  TRIALS_PER_ROUND,
  WHITE_TEXT,
  conflictCount,
  formatStroopSummary,
  judgeStroop,
  roundRule,
  stroopLevel,
  summarizeStroop,
} from './rules';

const round = (level: number, correct: number, trialsTotal = TRIALS_PER_ROUND): RoundResult => ({
  level,
  seed: 1,
  trials: [],
  metrics: { correct, timeouts: trialsTotal - correct, trials: trialsTotal },
  timingValid: true,
});

type Cell = { rule: 'color' | 'word'; conflict: boolean; correct: boolean; rt: number | null };

const cell = (rule: 'color' | 'word', conflict: boolean, correct: boolean, rt: number | null): Cell => ({
  rule,
  conflict,
  correct,
  rt,
});

// counted 默认 true；Task 4 之外这里只用来喂 summarizeStroop
const rec = (cells: Cell[], counted = true): RoundRecord => ({
  level: 3,
  seed: 1,
  timingValid: true,
  roundNo: 1,
  outcome: 'hold',
  score01: 0,
  counted,
  metrics: { correct: cells.filter((c) => c.correct).length, timeouts: 0, trials: cells.length },
  trials: cells.map((c) => ({ onset: 0, rt: c.rt, correct: c.correct, rule: c.rule, conflict: c.conflict })),
});

function rgbOf(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function linear(hex: string): number[] {
  return rgbOf(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
}

function relLum(hex: string): number {
  const c = linear(hex);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrastOf(a: string, b: string): number {
  const la = relLum(a);
  const lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// CIE76 ΔE：只用来证明「四色彼此不会看混」，不追求色差精度
function labOf(hex: string): number[] {
  const c = linear(hex);
  const x = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047;
  const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE(a: string, b: string): number {
  const p = labOf(a);
  const q = labOf(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

const BG = '#14161a';
const PANEL = '#1d2026';

describe('档位表（spec 3.2 逐字）', () => {
  it('10 档，选项数与超时毫秒与表格一致', () => {
    expect(STROOP_MAX_LEVEL).toBe(10);
    expect(STROOP_LEVELS.map((l) => l.options)).toEqual([2, 3, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(STROOP_LEVELS.map((l) => l.timeoutMs)).toEqual([2000, 1800, 1600, 1500, 1400, 1250, 1100, 1000, 850, 700]);
  });

  it('规则模式与切换概率：1-3 固定按颜色、4 每轮交替、5-10 每试次切换', () => {
    expect(STROOP_LEVELS.map((l) => l.ruleMode)).toEqual([
      'fixedColor',
      'fixedColor',
      'fixedColor',
      'perRound',
      'perTrial',
      'perTrial',
      'perTrial',
      'perTrial',
      'perTrial',
      'perTrial',
    ]);
    expect(STROOP_LEVELS.map((l) => l.switchProb)).toEqual([0, 0, 0, 0, 0.25, 0.35, 0.5, 0.5, 0.5, 0.5]);
  });

  it('冲突比例、按钮位置与按钮字色', () => {
    expect(STROOP_LEVELS.map((l) => l.conflictRatio)).toEqual([0.5, 0.5, 0.6, 0.6, 0.65, 0.7, 0.7, 0.75, 0.75, 0.8]);
    expect(STROOP_LEVELS.map((l) => l.shuffleSlots)).toEqual([
      false, false, false, false, false, false, false, true, true, true,
    ]);
    expect(STROOP_LEVELS.map((l) => l.distractorText)).toEqual([
      false, false, false, false, false, false, false, false, true, true,
    ]);
  });

  it('一轮 12 个试次', () => {
    expect(TRIALS_PER_ROUND).toBe(12);
  });

  it('色集四色的名字与十六进制逐字一致', () => {
    expect(STROOP_COLORS.map((c) => c.name)).toEqual(['红', '绿', '蓝', '黄']);
    expect(STROOP_COLORS.map((c) => c.css)).toEqual(['#E53935', '#43A047', '#1E88E5', '#FDD835']);
    expect(WHITE_TEXT).toBe('#FFFFFF');
  });

  it('色集在中性深色底上：大字号 AA 达标，四色两两可辨；红到不了正文 AA', () => {
    const ratios = STROOP_COLORS.map((c) => contrastOf(c.css, BG));
    // 词是 56-96px 大字号，走 AA-large 的 3.0；实测最小是红的 4.29
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(3);
    // 但红只有 4.29，够不到正文 4.5 —— 所以按钮文字必须用白色，不能用彩色（第 1-8 档）
    expect(contrastOf('#E53935', BG)).toBeLessThan(4.5);
    expect(contrastOf(WHITE_TEXT, PANEL)).toBeGreaterThanOrEqual(4.5);
    let minPair = Infinity;
    for (let i = 0; i < STROOP_COLORS.length; i++) {
      for (let j = i + 1; j < STROOP_COLORS.length; j++) {
        minPair = Math.min(minPair, deltaE(STROOP_COLORS[i].css, STROOP_COLORS[j].css));
      }
    }
    // 实测最小是绿↔黄的 65.9，四色不会看混
    expect(minPair).toBeGreaterThanOrEqual(50);
  });

  it('stroopLevel 取到两端', () => {
    expect(stroopLevel(1)).toEqual(STROOP_LEVELS[0]);
    expect(stroopLevel(10).timeoutMs).toBe(700);
  });

  it('stroopLevel 拒绝 0、11、非整数与 NaN', () => {
    expect(() => stroopLevel(0)).toThrow(RangeError);
    expect(() => stroopLevel(11)).toThrow(RangeError);
    expect(() => stroopLevel(1.5)).toThrow(RangeError);
    expect(() => stroopLevel(Number.NaN)).toThrow(RangeError);
    expect(() => stroopLevel(0)).toThrow('stroop level out of range: 0');
  });

  it('冲突配额逐档取整（K2：round 不是 floor）', () => {
    expect(Array.from({ length: 10 }, (_, i) => conflictCount(i + 1))).toEqual([6, 6, 7, 7, 8, 8, 8, 9, 9, 10]);
    // floor 会在第 5 档给 7（7.8）、第 10 档给 9（9.6）
    expect(conflictCount(5)).toBe(8);
    expect(conflictCount(10)).toBe(10);
  });
});

describe('轮号 → 规则', () => {
  it('每轮交替：奇数轮按颜色、偶数轮按字义', () => {
    const lv = stroopLevel(4);
    expect(roundRule(lv, 1)).toBe('color');
    expect(roundRule(lv, 2)).toBe('word');
    expect(roundRule(lv, 3)).toBe('color');
    expect(roundRule(lv, 4)).toBe('word');
  });

  it('固定按颜色与每试次切换模式下 roundRule 恒返回 color', () => {
    expect(roundRule(stroopLevel(1), 2)).toBe('color');
    expect(roundRule(stroopLevel(3), 4)).toBe('color');
    expect(roundRule(stroopLevel(5), 4)).toBe('color');
    expect(roundRule(stroopLevel(10), 2)).toBe('color');
  });

  it('roundRule 拒绝非法轮号', () => {
    expect(() => roundRule(stroopLevel(4), 0)).toThrow(RangeError);
    expect(() => roundRule(stroopLevel(4), 2.5)).toThrow(RangeError);
  });
});

describe('judgeStroop', () => {
  it('正确数边界：12/10 pass，9/8 hold，7/0 fail', () => {
    expect(judgeStroop(round(1, 12)).outcome).toBe('pass');
    expect(judgeStroop(round(1, 10)).outcome).toBe('pass');
    expect(judgeStroop(round(1, 9)).outcome).toBe('hold');
    expect(judgeStroop(round(1, 8)).outcome).toBe('hold');
    expect(judgeStroop(round(1, 7)).outcome).toBe('fail');
    expect(judgeStroop(round(1, 0)).outcome).toBe('fail');
  });

  it('轮得分 = 正确数 / 12', () => {
    expect(judgeStroop(round(1, 10)).score01).toBeCloseTo(0.8333333333333334, 10);
    expect(judgeStroop(round(1, 6)).score01).toBe(0.5);
    expect(judgeStroop(round(1, 12)).score01).toBe(1);
    expect(judgeStroop(round(1, 0)).score01).toBe(0);
  });

  it('判定只看 metrics.correct，与档位和 trials 长度无关', () => {
    expect(judgeStroop(round(10, 12))).toEqual({ outcome: 'pass', score01: 1 });
    expect(judgeStroop(round(1, 3))).toEqual({ outcome: 'fail', score01: 0.25 });
  });
});

describe('summarizeStroop', () => {
  it('只统计 counted 的轮', () => {
    const voided = rec(Array.from({ length: 12 }, () => cell('color', false, true, 10)), false);
    const scored = rec(Array.from({ length: 12 }, (_, i) => cell('color', i < 6, i < 6, 100)));
    expect(summarizeStroop([voided, scored]).accuracy).toBe(0.5);
    expect(summarizeStroop([voided]).accuracy).toBe(0);
    expect(summarizeStroop([rec(Array.from({ length: 12 }, (_, i) => cell('color', i < 6, true, 100)))]).accuracy).toBe(1);
  });

  it('平均反应时只算正确试次：超时与答错都不进分子', () => {
    const r = rec([
      cell('color', true, true, 1001),
      cell('color', false, true, 999),
      cell('color', true, false, 10),
      cell('color', false, false, null),
    ]);
    const s = summarizeStroop([r]);
    expect(s.meanRtMs).toBe(1000);
    expect(s.accuracy).toBe(0.5);
  });

  it('干扰效应 = 按颜色规则下冲突减一致的平均反应时，忽略按字义试次', () => {
    const r = rec([
      cell('color', true, true, 300),
      cell('color', false, true, 100),
      cell('word', true, true, 5000),
      cell('word', false, true, 10),
    ]);
    expect(summarizeStroop([r]).interferenceMs).toBe(200);
  });

  it('干扰效应可以是负数（按颜色下冲突反而更快）', () => {
    const r = rec([cell('color', true, true, 100), cell('color', false, true, 300)]);
    expect(summarizeStroop([r]).interferenceMs).toBe(-200);
  });

  it('任一组为空 → NaN（K5），没有正确试次 → 平均反应时也是 NaN', () => {
    expect(Number.isNaN(summarizeStroop([rec([cell('color', true, true, 100)])]).interferenceMs)).toBe(true);
    expect(Number.isNaN(summarizeStroop([rec([cell('color', false, true, 100)])]).interferenceMs)).toBe(true);
    const wordOnly = summarizeStroop([rec([cell('word', true, true, 100), cell('word', false, true, 200)])]);
    expect(Number.isNaN(wordOnly.interferenceMs)).toBe(true);
    expect(wordOnly.meanRtMs).toBe(150);
    const noCorrect = summarizeStroop([rec([cell('color', true, false, null), cell('color', false, false, 10)])]);
    expect(Number.isNaN(noCorrect.meanRtMs)).toBe(true);
    expect(noCorrect.accuracy).toBe(0);
    expect(summarizeStroop([]).accuracy).toBe(0);
  });

  it('不改动入参，也不返回内部数组的引用', () => {
    const rounds = [rec([cell('color', true, true, 300), cell('color', false, true, 100)])];
    const before = structuredClone(rounds);
    summarizeStroop(rounds);
    expect(rounds).toEqual(before);
  });
});

describe('formatStroopSummary', () => {
  it('三个指标的中文标签与顺序', () => {
    const items = formatStroopSummary({ accuracy: 1, meanRtMs: 150, interferenceMs: 100 });
    expect(items.map((i) => i.label)).toEqual(['正确率', '平均反应时', '干扰效应']);
    expect(items.map((i) => i.value)).toEqual(['100%', '150 毫秒', '+100 毫秒']);
  });

  it('正确率四舍五入到整数百分比（5/12 显示 42%，不是 41%）', () => {
    expect(formatStroopSummary({ accuracy: 5 / 12, meanRtMs: 0, interferenceMs: 0 })[0].value).toBe('42%');
    expect(formatStroopSummary({ accuracy: 1 / 3, meanRtMs: 0, interferenceMs: 0 })[0].value).toBe('33%');
  });

  it('平均反应时四舍五入：450.5 → 451', () => {
    expect(formatStroopSummary({ accuracy: 0, meanRtMs: 450.5, interferenceMs: 0 })[1].value).toBe('451 毫秒');
    expect(formatStroopSummary({ accuracy: 0, meanRtMs: 1000, interferenceMs: 0 })[1].value).toBe('1000 毫秒');
  });

  it('干扰效应带符号：正数加 +，0 与负数不加', () => {
    expect(formatStroopSummary({ accuracy: 1, meanRtMs: 0, interferenceMs: 100 })[2].value).toBe('+100 毫秒');
    expect(formatStroopSummary({ accuracy: 1, meanRtMs: 0, interferenceMs: 0 })[2].value).toBe('0 毫秒');
    expect(formatStroopSummary({ accuracy: 1, meanRtMs: 0, interferenceMs: -100 })[2].value).toBe('-100 毫秒');
    expect(formatStroopSummary({ accuracy: 1, meanRtMs: 0, interferenceMs: -0.4 })[2].value).toBe('0 毫秒');
  });

  it('NaN 渲染成「—」', () => {
    const items = formatStroopSummary({ accuracy: 0, meanRtMs: Number.NaN, interferenceMs: Number.NaN });
    expect(items[1].value).toBe('—');
    expect(items[2].value).toBe('—');
  });
});
