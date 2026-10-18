import { randInt } from '../../core/rng';
import type { Rng } from '../../core/rng';
import type { Outcome, RoundRecord, RoundResult, SummaryItem } from '../../core/types';

export interface SeqmemLevel {
  size: number;
  dir: 'fwd' | 'rev';
  l0: number;
  onMs: number;
  gapMs: number;
}

// spec §3.3 第 103–112 行档位表：档 | 方向 | 起始长度 L0 | 网格 | 亮 d ms | 间隔 g ms
export const SEQMEM_LEVELS: readonly SeqmemLevel[] = [
  { size: 3, dir: 'fwd', l0: 3, onMs: 800, gapMs: 300 },
  { size: 3, dir: 'fwd', l0: 4, onMs: 750, gapMs: 280 },
  { size: 4, dir: 'fwd', l0: 4, onMs: 700, gapMs: 260 },
  { size: 4, dir: 'fwd', l0: 5, onMs: 650, gapMs: 240 },
  { size: 4, dir: 'fwd', l0: 6, onMs: 600, gapMs: 220 },
  { size: 5, dir: 'fwd', l0: 6, onMs: 550, gapMs: 200 },
  { size: 5, dir: 'fwd', l0: 7, onMs: 500, gapMs: 180 },
  { size: 4, dir: 'rev', l0: 4, onMs: 650, gapMs: 240 },
  { size: 4, dir: 'rev', l0: 5, onMs: 600, gapMs: 220 },
  { size: 5, dir: 'rev', l0: 6, onMs: 500, gapMs: 200 },
];

export const SEQMEM_MAX_LEVEL = SEQMEM_LEVELS.length;
export const SEQMEM_SPAN_GROWTH = 6;

export function seqmemLevel(level: number): SeqmemLevel {
  if (!Number.isInteger(level) || level < 1 || level > SEQMEM_MAX_LEVEL) {
    throw new RangeError(`seqmem level out of range: ${level}`);
  }
  return SEQMEM_LEVELS[level - 1];
}

// 刺激起始异步时间（SOA）= 亮 d + 间隔 g；每档字面值来自 spec 表，不在引擎里二次硬编码。
export function soaMs(lv: SeqmemLevel): number {
  return lv.onMs + lv.gapMs;
}

export function capSpan(lv: SeqmemLevel): number {
  return lv.l0 + SEQMEM_SPAN_GROWTH;
}

// 拒绝采样生成一条序列：只排除「相邻同格」（spec:97），隔位重复合法（裁定 R-2）。
// 每个候选恰好消费一次 randInt，所以一条 rng 流上第 k 条序列的内容与前面消费的次数无关紧要。
export function makeSpan(rng: Rng, size: number, len: number): number[] {
  const total = size * size;
  const out: number[] = [];
  while (out.length < len) {
    const c = randInt(rng, 0, total - 1);
    if (out.length > 0 && c === out[out.length - 1]) continue;
    out.push(c);
  }
  return out;
}

// spec:114–115：s ≥ 2 → pass；s = 0 → fail；s = 1 → hold。score01 = min(1, s / 3)。
export function judgeSeqmem(r: RoundResult): { outcome: Outcome; score01: number } {
  const s = r.metrics.spansCorrect;
  let outcome: Outcome = 'hold';
  if (s >= 2) outcome = 'pass';
  else if (s === 0) outcome = 'fail';
  return { outcome, score01: Math.min(1, s / 3) };
}

// 结算只统计 counted 轮（作废/补轮为 false）。fwdSpan/revSpan 每轮只有一侧非 0，
// 因为档位决定方向；取 max 就是「本次训练答对的最长序列长度，正序逆序分开」（spec:116）。
export function summarizeSeqmem(rounds: readonly RoundRecord[]): Record<string, number> {
  const counted = rounds.filter((round) => round.counted);
  if (counted.length === 0) return { fwdSpan: 0, revSpan: 0, spans: 0, spansCorrect: 0, avgRecallMs: 0 };
  const spansCorrect = counted.reduce((sum, round) => sum + round.metrics.spansCorrect, 0);
  const recallSumMs = counted.reduce((sum, round) => sum + round.metrics.recallSumMs, 0);
  return {
    fwdSpan: Math.max(...counted.map((round) => round.metrics.fwdSpan)),
    revSpan: Math.max(...counted.map((round) => round.metrics.revSpan)),
    spans: counted.reduce((sum, round) => sum + round.metrics.spans, 0),
    spansCorrect,
    avgRecallMs: spansCorrect === 0 ? 0 : Math.round(recallSumMs / spansCorrect),
  };
}

export function formatSeqmemSummary(s: Record<string, number>): SummaryItem[] {
  return [
    { label: '正序最大广度', value: s.fwdSpan > 0 ? `${s.fwdSpan} 格` : '—' },
    { label: '逆序最大广度', value: s.revSpan > 0 ? `${s.revSpan} 格` : '—' },
    { label: '答对序列', value: `${s.spansCorrect} / ${s.spans} 条` },
    { label: '平均回忆用时', value: s.avgRecallMs > 0 ? `${(s.avgRecallMs / 1000).toFixed(1)} 秒` : '—' },
  ];
}
