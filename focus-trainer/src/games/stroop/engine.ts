import { createRng, pick, randInt, shuffle } from '../../core/rng';
import type { GameEngine, InputEvent, RoundResult, TrialRecord } from '../../core/types';
import {
  STROOP_COLORS,
  TRIALS_PER_ROUND,
  conflictCount,
  roundRule,
  stroopLevel,
  type StroopLevel,
  type StroopRule,
} from './rules';

export const FIXATION_MS = 300;
export const FEEDBACK_MS = 200;

export type StroopPhase = 'fixation' | 'respond' | 'feedback' | 'done';

export interface StroopOption {
  colorIdx: number;
  label: string;
  textInk: number | null;
}

export interface StroopSnapshot {
  rule: StroopRule;
  phase: StroopPhase;
  word: number | null;
  ink: number | null;
  conflict: boolean | null;
  onsetMs: number | null;
  options: StroopOption[];
  trialNo: number;
  trialsTotal: number;
  correctCount: number;
  timeoutCount: number;
  feedbackChoice: number | null;
  feedbackOk: boolean;
  elapsedMs: number;
  done: boolean;
}

// 用 type 而不是 interface：要能隐式索引签名，才赋得进 TrialRecord（它带 [field: string]: unknown）。
type StroopTrialRec = {
  onset: number;
  rt: number | null;
  correct: boolean;
  rule: StroopRule;
  conflict: boolean;
  word: number;
  ink: number;
  choice: number;
  slots: number[];
  textInk: (number | null)[];
};

// 正确选项下标：按颜色取墨色，按字义取词义。刺激没出现的注视期没有正确答案。
export function correctSlot(s: StroopSnapshot): number {
  if (s.word === null || s.ink === null) throw new Error('stroop stimulus is not visible');
  return s.options.findIndex((o) => o.colorIdx === (s.rule === 'color' ? s.ink : s.word));
}

type RoundPlan = {
  rules: StroopRule[];
  words: number[];
  inks: number[];
  optionSets: StroopOption[][];
};

function buildPlan(level: number, seed: number, roundNo: number): RoundPlan {
  const lv = stroopLevel(level);
  const rng = createRng(seed);
  const n = lv.options;
  const palette = shuffle(rng, [0, 1, 2, 3]).slice(0, n);
  const conflicts = new Set(
    shuffle(rng, Array.from({ length: TRIALS_PER_ROUND }, (_, i) => i)).slice(0, conflictCount(level)),
  );

  const rules: StroopRule[] = [];
  let cur: StroopRule = 'color';
  for (let k = 0; k < TRIALS_PER_ROUND; k++) {
    if (lv.ruleMode === 'perTrial') {
      // K1：切换发生在试次边界，第 1 试次恒按颜色。平稳分布是 50/50，switchProb 管的是切换频率而非配比。
      if (k > 0 && rng() < lv.switchProb) cur = cur === 'color' ? 'word' : 'color';
      rules.push(cur);
    } else {
      rules.push(roundRule(lv, roundNo));
    }
  }

  const fixedSlots = lv.shuffleSlots ? null : shuffle(rng, palette);
  const words: number[] = [];
  const inks: number[] = [];
  const optionSets: StroopOption[][] = [];
  for (let k = 0; k < TRIALS_PER_ROUND; k++) {
    const ink = pick(rng, palette);
    words.push(conflicts.has(k) ? pick(rng, palette.filter((c) => c !== ink)) : ink);
    inks.push(ink);
    const slots = lv.shuffleSlots ? shuffle(rng, palette) : (fixedSlots ?? palette.slice());
    const shift = lv.distractorText ? randInt(rng, 1, n - 1) : 0;
    optionSets.push(
      slots.map((colorIdx, j) => ({
        colorIdx,
        label: STROOP_COLORS[colorIdx].name,
        textInk: lv.distractorText ? slots[(j + shift) % n] : null,
      })),
    );
  }
  return { rules, words, inks, optionSets };
}

export class StroopEngine implements GameEngine<StroopSnapshot> {
  private level = 1;
  private seed = 0;
  private roundNo = 1;
  private plan: RoundPlan = { rules: [], words: [], inks: [], optionSets: [] };
  private trialIdx = 0;
  private phase: StroopPhase = 'fixation';
  private phaseStart = 0;
  private onset: number | null = null;
  private startAt = 0;
  private now = 0;
  private endAt: number | null = null;
  private correctCount = 0;
  private timeoutCount = 0;
  private feedbackChoice: number | null = null;
  private feedbackOk = false;
  private trials: StroopTrialRec[] = [];

  // 形参与 GameEngine.configure 逐字一致。roundNo 在颜色认知不是纯记账：第 4 档的「每轮交替」要读它。
  configure(level: number, seed: number, roundNo: number): void {
    this.plan = buildPlan(level, seed, roundNo);
    this.level = level;
    this.seed = seed;
    this.roundNo = roundNo;
    this.trialIdx = 0;
    this.phase = 'fixation';
    this.onset = null;
    this.endAt = null;
    this.correctCount = 0;
    this.timeoutCount = 0;
    this.feedbackChoice = null;
    this.feedbackOk = false;
    this.trials = [];
    // 作废契约（spec 5.1）：SessionRunner.voidCurrentRound() 不通知引擎，重开轮只调 configure + start。
    // 时间基准必须一起归零，否则 start() 之前的 elapsedMs 与 onset 会把上一轮的用时漏进补轮。
    this.startAt = 0;
    this.phaseStart = 0;
    this.now = 0;
  }

  start(now: number): void {
    this.startAt = now;
    this.phaseStart = now;
    this.now = now;
    this.phase = 'fixation';
    this.onset = null;
  }

  input(e: InputEvent): void {
    if (e.kind !== 'choice' || this.phase !== 'respond' || this.endAt !== null) return;
    const picked = this.plan.optionSets[this.trialIdx][e.index];
    if (picked === undefined) return;
    const target =
      this.plan.rules[this.trialIdx] === 'color'
        ? this.plan.inks[this.trialIdx]
        : this.plan.words[this.trialIdx];
    const correct = picked.colorIdx === target;
    this.now = Math.max(this.now, e.t);
    this.pushTrial(e.t - (this.onset ?? this.now), correct, e.index);
    this.feedbackChoice = e.index;
    this.feedbackOk = correct;
    this.phase = 'feedback';
    this.phaseStart = this.now;
  }

  tick(now: number): void {
    this.now = Math.max(this.now, now);
    if (this.endAt !== null) return;
    if (this.phase === 'fixation') {
      if (this.now - this.phaseStart >= FIXATION_MS) {
        this.phase = 'respond';
        this.onset = this.now;
      }
      return;
    }
    if (this.phase === 'respond') {
      if (this.now >= (this.onset ?? this.now) + stroopLevel(this.level).timeoutMs) {
        this.pushTrial(null, false, -1);
        this.phase = 'feedback';
        this.phaseStart = this.now;
      }
      return;
    }
    if (this.phase === 'feedback' && this.now - this.phaseStart >= FEEDBACK_MS) {
      this.feedbackChoice = null;
      this.feedbackOk = false;
      this.onset = null;
      if (this.trialIdx === TRIALS_PER_ROUND - 1) {
        this.endAt = this.now;
        this.phase = 'done';
        return;
      }
      this.trialIdx += 1;
      this.phase = 'fixation';
      this.phaseStart = this.now;
    }
  }

  snapshot(): StroopSnapshot {
    const k = this.trialIdx;
    const hasTrial = k < this.plan.optionSets.length;
    // 词只在反应窗可见：spec「颜色词以某种墨色出现，直到作答或超时」
    const visible = hasTrial && this.phase === 'respond';
    const end = this.endAt ?? this.now;
    return {
      rule: this.plan.rules[k] ?? 'color',
      phase: this.phase,
      word: visible ? this.plan.words[k] : null,
      ink: visible ? this.plan.inks[k] : null,
      conflict: visible ? this.plan.words[k] !== this.plan.inks[k] : null,
      onsetMs: visible ? this.onset : null,
      options: hasTrial ? this.plan.optionSets[k].map((o) => ({ ...o })) : [],
      trialNo: Math.min(k + 1, TRIALS_PER_ROUND),
      trialsTotal: TRIALS_PER_ROUND,
      correctCount: this.correctCount,
      timeoutCount: this.timeoutCount,
      feedbackChoice: this.feedbackChoice,
      feedbackOk: this.feedbackOk,
      elapsedMs: Math.max(0, end - this.startAt),
      done: this.endAt !== null,
    };
  }

  isDone(): boolean {
    return this.endAt !== null;
  }

  result(): RoundResult {
    if (this.endAt === null) throw new Error('stroop round is not finished');
    return {
      level: this.level,
      seed: this.seed,
      trials: this.trials.map((t) => ({ ...t, slots: t.slots.slice(), textInk: t.textInk.slice() })),
      metrics: {
        correct: this.correctCount,
        timeouts: this.timeoutCount,
        trials: this.trials.length,
        timeMs: Math.round(this.endAt - this.startAt),
      },
      // spec 第 6 节：舒尔特与颜色认知只测反应时，不做帧间隔判定
      timingValid: true,
    };
  }

  private pushTrial(rt: number | null, correct: boolean, choice: number): void {
    const k = this.trialIdx;
    const options = this.plan.optionSets[k];
    this.trials.push({
      onset: this.onset ?? this.now,
      rt,
      correct,
      rule: this.plan.rules[k],
      conflict: this.plan.words[k] !== this.plan.inks[k],
      word: this.plan.words[k],
      ink: this.plan.inks[k],
      choice,
      slots: options.map((o) => o.colorIdx),
      textInk: options.map((o) => o.textInk),
    });
    if (correct) this.correctCount += 1;
    if (rt === null) this.timeoutCount += 1;
  }
}
