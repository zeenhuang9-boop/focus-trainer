import { createRng } from '../../core/rng';
import type { GameEngine, InputEvent, RoundResult, TrialRecord } from '../../core/types';
import { buildFigure } from './figures';
import type { FigureId, FigureStroke } from './figures';
import { MASK_SEGMENTS, fragmentFigure, makeMask } from './fragment';
import type { Segment } from './fragment';
import { GESTALT_CHOICE_COUNT, buildTrialSpec, gestaltLevel, rotationDeg } from './rules';
import type { GestaltLevel, GestaltTrialSpec } from './rules';

export const FIXATION_MS = 500;
export const MASK_MS = 200;
export const FEEDBACK_MS = 600;
/** spec §6：时序关键阶段内任一帧间隔 > 50ms → timingValid = false。 */
export const FRAME_BUDGET_MS = 50;

export type GestaltPhase = 'idle' | 'fixation' | 'exposure' | 'mask' | 'answer' | 'feedback' | 'done';

export interface GestaltChoiceView {
  readonly id: FigureId;
  readonly strokes: readonly FigureStroke[];
}

export interface GestaltSnapshot {
  readonly phase: GestaltPhase;
  readonly elapsedMs: number;
  readonly fragments: readonly Segment[];
  readonly mask: readonly Segment[];
  readonly choices: readonly GestaltChoiceView[];
  readonly answeredIndex: number | null;
  readonly correctIndex: number | null;
  readonly rtMs: number;
  readonly exposureMs: number;
  readonly timingValid: boolean;
  readonly done: boolean;
}

export class GestaltEngine implements GameEngine<GestaltSnapshot> {
  private level = 1;
  private seed = 0;
  /** spec 4.2 的 configure 签名要求 roundNo；它是 SessionRunner 的记账字段，引擎本身不读它。 */
  private roundNo = 0;
  private lv: GestaltLevel = gestaltLevel(1);
  private trial: GestaltTrialSpec | null = null;
  private fragments: readonly Segment[] = [];
  private maskSegs: readonly Segment[] = [];
  private choiceViews: readonly GestaltChoiceView[] = [];

  private phase: GestaltPhase = 'idle';
  private phaseStartAt = 0;
  private phaseUntil = 0;
  private roundStartAt = 0;
  /** 显式「上一帧时间戳」字段：单调性靠它，不靠钳制。 */
  private lastFrameAt = 0;
  private exposureStartAt = 0;
  private exposureMs = 0;
  private answeredIndex: number | null = null;
  private answeredAt = 0;
  private correctIndex: number | null = null;
  private rt = 0;
  private timingValid = true;
  private now = 0;
  private endAt: number | null = null;
  private trials: TrialRecord[] = [];

  configure(level: number, seed: number, roundNo: number): void {
    // 先校验档位，越界时不改任何状态（configure 抛错不该留下半轮）
    const lv = gestaltLevel(level);
    const rng = createRng(seed);
    const trial = buildTrialSpec(rng, lv);
    const rotation = rotationDeg(rng, lv.rotation);
    const frag = fragmentFigure(buildFigure(trial.target), rng, {
      retention: lv.retention,
      noise: lv.noise,
      rotationDeg: rotation,
    });
    const mask = makeMask(rng, MASK_SEGMENTS);
    const choices = trial.choices.map((id) => ({ id, strokes: buildFigure(id).strokes }));

    this.level = level;
    this.seed = seed;
    this.roundNo = roundNo;
    this.lv = lv;
    this.trial = trial;
    // spec:155 碎片化 = 保留段 + n 段噪声，两段都已在构建器里按 θ 旋转。
    // 噪声是曝光期画面的一部分，必须与保留段一起进快照（构建器返回顺序：保留在前、噪声在后）。
    this.fragments = [...frag.segments, ...frag.noise];
    this.maskSegs = mask;
    this.choiceViews = choices;
    // 作废契约（spec 5.1）：SessionRunner.voidCurrentRound() 不通知引擎，重开只调 configure + start。
    // 下面每一行都是「清上一轮残留」，少一行就会漏出作废轮的作答、时序判定或阶段。
    this.phase = 'idle';
    this.phaseStartAt = 0;
    this.phaseUntil = 0;
    this.roundStartAt = 0;
    this.lastFrameAt = 0;
    this.exposureStartAt = 0;
    this.exposureMs = 0;
    this.answeredIndex = null;
    this.answeredAt = 0;
    this.correctIndex = null;
    this.rt = 0;
    this.timingValid = true;
    this.now = 0;
    this.endAt = null;
    this.trials = [];
  }

  start(now: number): void {
    this.phase = 'fixation';
    this.phaseStartAt = now;
    this.phaseUntil = now + FIXATION_MS;
    this.roundStartAt = now;
    this.lastFrameAt = now;
    this.now = now;
  }

  input(e: InputEvent): void {
    if (e.kind !== 'choice') return;
    this.now = Math.max(this.now, e.t);
    if (this.phase !== 'answer' || this.answeredIndex !== null || this.trial === null) return;
    if (e.index < 0 || e.index >= GESTALT_CHOICE_COUNT) return;
    const correct = e.index === this.trial.correctIndex;
    this.answeredIndex = e.index;
    this.answeredAt = e.t;
    this.rt = e.t - this.exposureStartAt;
    this.correctIndex = this.trial.correctIndex; // 反馈期才揭晓
    this.trials = [
      {
        onset: this.exposureStartAt,
        rt: this.rt,
        correct,
        target: this.trial.target,
        targetFamily: this.trial.targetFamily,
        choice: e.index,
        sameFamilyDistractors: this.trial.sameFamilyDistractors,
        exposureMs: this.exposureMs,
      },
    ];
    this.phase = 'feedback';
    this.phaseStartAt = e.t;
    this.phaseUntil = e.t + FEEDBACK_MS;
  }

  tick(now: number): void {
    this.now = Math.max(this.now, now);
    if (this.phase === 'idle' || this.phase === 'done') return;
    // 帧间隔只在「上一帧仍处于时序关键阶段」时判定
    if (this.phase === 'exposure' || this.phase === 'mask') {
      if (now - this.lastFrameAt > FRAME_BUDGET_MS) this.timingValid = false;
    }
    this.lastFrameAt = now;
    if (now < this.phaseUntil) return;
    // 一个 tick 最多推进一个阶段
    if (this.phase === 'fixation') {
      this.phase = 'exposure';
      this.exposureStartAt = now;
      this.phaseUntil = now + this.lv.exposureMs;
    } else if (this.phase === 'exposure') {
      this.exposureMs = now - this.exposureStartAt;
      this.phase = 'mask';
      this.phaseUntil = now + MASK_MS;
    } else if (this.phase === 'mask') {
      this.phase = 'answer';
      this.phaseUntil = Number.POSITIVE_INFINITY; // 作答期不设上限
    } else if (this.phase === 'feedback') {
      this.phase = 'done';
      this.endAt = now;
    }
    this.phaseStartAt = now;
  }

  snapshot(): GestaltSnapshot {
    const inExposure = this.phase === 'exposure';
    const inMask = this.phase === 'mask';
    const showChoices = this.phase === 'answer' || this.phase === 'feedback' || this.phase === 'done';
    const end = this.endAt ?? this.now;
    return {
      phase: this.phase,
      // 与舒尔特同口径（schulte/engine.ts:112）：不做 0 哨兵，start(0) 的轮次也要走真实用时；
      // 只允许这一处 Math.max(0, …)，不夹取负值/NaN 以外的时钟差（裁定 N-5）。
      elapsedMs: Math.max(0, end - this.roundStartAt),
      fragments: inExposure ? this.fragments.slice() : [],
      mask: inMask ? this.maskSegs.slice() : [],
      choices: showChoices ? this.choiceViews.slice() : [],
      answeredIndex: this.answeredIndex,
      correctIndex: this.phase === 'feedback' || this.phase === 'done' ? this.correctIndex : null,
      rtMs: this.rt,
      exposureMs: this.exposureMs,
      timingValid: this.timingValid,
      done: this.endAt !== null,
    };
  }

  isDone(): boolean {
    return this.endAt !== null;
  }

  result(): RoundResult {
    if (this.endAt === null) throw new Error('gestalt round is not finished');
    return {
      level: this.level,
      seed: this.seed,
      trials: this.trials.map((t) => ({ ...t })),
      metrics: {
        correct: this.trials.length === 1 && this.trials[0].correct ? 1 : 0,
        rtMs: Math.round(this.rt),
        exposureMs: this.exposureMs,
        requestedExposureMs: this.lv.exposureMs,
      },
      timingValid: this.timingValid,
    };
  }
}
