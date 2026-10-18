import type { Outcome, RoundRecord, RoundResult, SummaryItem, TrialRecord } from '../../core/types';

export type StroopRule = 'color' | 'word';
export type StroopRuleMode = 'fixedColor' | 'perRound' | 'perTrial';

export interface StroopColor {
  name: string;
  css: string;
}

// spec 3.2：色集 红#E53935、绿#43A047、蓝#1E88E5、黄#FDD835，显示在中性深色底上
export const STROOP_COLORS: readonly StroopColor[] = [
  { name: '红', css: '#E53935' },
  { name: '绿', css: '#43A047' },
  { name: '蓝', css: '#1E88E5' },
  { name: '黄', css: '#FDD835' },
];

export const TRIALS_PER_ROUND = 12;
export const WHITE_TEXT = '#FFFFFF';

export interface StroopLevel {
  options: number;
  timeoutMs: number;
  ruleMode: StroopRuleMode;
  switchProb: number;
  conflictRatio: number;
  shuffleSlots: boolean;
  distractorText: boolean;
}

export const STROOP_LEVELS: readonly StroopLevel[] = [
  { options: 2, timeoutMs: 2000, ruleMode: 'fixedColor', switchProb: 0, conflictRatio: 0.5, shuffleSlots: false, distractorText: false },
  { options: 3, timeoutMs: 1800, ruleMode: 'fixedColor', switchProb: 0, conflictRatio: 0.5, shuffleSlots: false, distractorText: false },
  { options: 4, timeoutMs: 1600, ruleMode: 'fixedColor', switchProb: 0, conflictRatio: 0.6, shuffleSlots: false, distractorText: false },
  { options: 4, timeoutMs: 1500, ruleMode: 'perRound', switchProb: 0, conflictRatio: 0.6, shuffleSlots: false, distractorText: false },
  { options: 4, timeoutMs: 1400, ruleMode: 'perTrial', switchProb: 0.25, conflictRatio: 0.65, shuffleSlots: false, distractorText: false },
  { options: 4, timeoutMs: 1250, ruleMode: 'perTrial', switchProb: 0.35, conflictRatio: 0.7, shuffleSlots: false, distractorText: false },
  { options: 4, timeoutMs: 1100, ruleMode: 'perTrial', switchProb: 0.5, conflictRatio: 0.7, shuffleSlots: false, distractorText: false },
  { options: 4, timeoutMs: 1000, ruleMode: 'perTrial', switchProb: 0.5, conflictRatio: 0.75, shuffleSlots: true, distractorText: false },
  { options: 4, timeoutMs: 850, ruleMode: 'perTrial', switchProb: 0.5, conflictRatio: 0.75, shuffleSlots: true, distractorText: true },
  { options: 4, timeoutMs: 700, ruleMode: 'perTrial', switchProb: 0.5, conflictRatio: 0.8, shuffleSlots: true, distractorText: true },
];

export const STROOP_MAX_LEVEL = STROOP_LEVELS.length;

export function stroopLevel(level: number): StroopLevel {
  if (!Number.isInteger(level) || level < 1 || level > STROOP_MAX_LEVEL) {
    throw new RangeError(`stroop level out of range: ${level}`);
  }
  return STROOP_LEVELS[level - 1];
}

export function conflictCount(level: number): number {
  return Math.round(stroopLevel(level).conflictRatio * TRIALS_PER_ROUND);
}

export function roundRule(lv: StroopLevel, roundNo: number): StroopRule {
  if (!Number.isInteger(roundNo) || roundNo < 1) {
    throw new RangeError(`stroop roundNo out of range: ${roundNo}`);
  }
  if (lv.ruleMode !== 'perRound') return 'color';
  return roundNo % 2 === 1 ? 'color' : 'word';
}

export function judgeStroop(r: RoundResult): { outcome: Outcome; score01: number } {
  const correct = r.metrics.correct;
  let outcome: Outcome = 'hold';
  if (correct >= 10) outcome = 'pass';
  else if (correct <= 7) outcome = 'fail';
  return { outcome, score01: correct / TRIALS_PER_ROUND };
}

interface StroopTrialView {
  correct: boolean;
  rt: number | null;
  rule: StroopRule | undefined;
  conflict: boolean | undefined;
}

// TrialRecord 的额外字段走索引签名，类型是 unknown；这里一次性收窄成本游戏的视图，
// 免得在 filter 里反复对 unknown 做 === 比较。
function view(t: TrialRecord): StroopTrialView {
  return {
    correct: t.correct,
    rt: t.rt,
    rule: t['rule'] as StroopRule | undefined,
    conflict: t['conflict'] as boolean | undefined,
  };
}

function mean(list: number[]): number {
  if (list.length === 0) return Number.NaN;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

export function summarizeStroop(rounds: readonly RoundRecord[]): Record<string, number> {
  const cells = rounds.filter((r) => r.counted).flatMap((r) => r.trials.map(view));
  const correct = cells.filter((c) => c.correct);
  const rtOf = (list: StroopTrialView[]): number[] =>
    list.map((c) => c.rt).filter((v): v is number => typeof v === 'number');
  const colorCorrect = correct.filter((c) => c.rule === 'color');
  const conflict = rtOf(colorCorrect.filter((c) => c.conflict === true));
  const consistent = rtOf(colorCorrect.filter((c) => c.conflict === false));
  const meanRtMs = mean(rtOf(correct));
  return {
    accuracy: cells.length === 0 ? 0 : correct.length / cells.length,
    meanRtMs,
    interferenceMs: conflict.length === 0 || consistent.length === 0 ? Number.NaN : mean(conflict) - mean(consistent),
  };
}

function msText(v: number): string {
  return Number.isFinite(v) ? `${Math.round(v)} 毫秒` : '—';
}

export function formatStroopSummary(s: Record<string, number>): SummaryItem[] {
  const interference = s.interferenceMs;
  const interferenceText = Number.isFinite(interference)
    ? `${Math.round(interference) > 0 ? '+' : ''}${Math.round(interference)} 毫秒`
    : '—';
  return [
    { label: '正确率', value: `${Math.round(s.accuracy * 100)}%` },
    { label: '平均反应时', value: msText(s.meanRtMs) },
    { label: '干扰效应', value: interferenceText },
  ];
}
