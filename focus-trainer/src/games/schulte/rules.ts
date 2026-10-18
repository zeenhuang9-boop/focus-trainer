import type { Outcome, RoundRecord, RoundResult, SummaryItem } from '../../core/types';

export interface SchulteLevel {
  size: number;
  order: 'asc' | 'desc';
  symbols: 'digits' | 'letters';
  distractor: boolean;
  targetSec: number;
}

export const SCHULTE_LEVELS: readonly SchulteLevel[] = [
  { size: 3, order: 'asc', symbols: 'digits', distractor: false, targetSec: 8 },
  { size: 4, order: 'asc', symbols: 'digits', distractor: false, targetSec: 15 },
  { size: 5, order: 'asc', symbols: 'digits', distractor: false, targetSec: 25 },
  { size: 5, order: 'desc', symbols: 'digits', distractor: false, targetSec: 28 },
  { size: 5, order: 'asc', symbols: 'letters', distractor: false, targetSec: 30 },
  { size: 5, order: 'asc', symbols: 'digits', distractor: true, targetSec: 30 },
  { size: 6, order: 'asc', symbols: 'digits', distractor: false, targetSec: 42 },
  { size: 6, order: 'desc', symbols: 'digits', distractor: true, targetSec: 48 },
  { size: 7, order: 'asc', symbols: 'digits', distractor: false, targetSec: 60 },
  { size: 7, order: 'desc', symbols: 'digits', distractor: true, targetSec: 70 },
];

export const SCHULTE_MAX_LEVEL = SCHULTE_LEVELS.length;

export function schulteLevel(level: number): SchulteLevel {
  if (!Number.isInteger(level) || level < 1 || level > SCHULTE_MAX_LEVEL) {
    throw new RangeError(`schulte level out of range: ${level}`);
  }
  return SCHULTE_LEVELS[level - 1];
}

export function targetSequence(lv: SchulteLevel): string[] {
  const labels = Array.from({ length: lv.size * lv.size }, (_, i) =>
    lv.symbols === 'letters' ? String.fromCharCode(65 + i) : String(i + 1),
  );
  return lv.order === 'desc' ? labels.reverse() : labels;
}

export function judgeSchulte(r: RoundResult): { outcome: Outcome; score01: number } {
  const T = schulteLevel(r.level).targetSec;
  const t = r.metrics.timeMs / 1000;
  const e = r.metrics.errors;
  let outcome: Outcome = 'hold';
  if (t <= T && e <= 2) outcome = 'pass';
  else if (t > 1.5 * T || e > 5) outcome = 'fail';
  const score01 = Math.min(1, Math.max(0, T / t)) * Math.max(0, 1 - 0.1 * e);
  return { outcome, score01 };
}

export function summarizeSchulte(rounds: readonly RoundRecord[]): Record<string, number> {
  const counted = rounds.filter((r) => r.counted);
  if (counted.length === 0) return { bestTimeMs: 0, avgCellMs: 0, errors: 0 };
  const totalTime = counted.reduce((sum, r) => sum + r.metrics.timeMs, 0);
  const totalCells = counted.reduce((sum, r) => sum + r.metrics.cells, 0);
  return {
    bestTimeMs: Math.min(...counted.map((r) => r.metrics.timeMs)),
    avgCellMs: Math.round(totalTime / totalCells),
    errors: counted.reduce((sum, r) => sum + r.metrics.errors, 0),
  };
}

export function formatSchulteSummary(s: Record<string, number>): SummaryItem[] {
  return [
    { label: '最佳用时', value: `${(s.bestTimeMs / 1000).toFixed(1)} 秒` },
    { label: '平均每格', value: `${s.avgCellMs} 毫秒` },
    { label: '总误点', value: `${s.errors} 次` },
  ];
}
