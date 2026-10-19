import { createRng } from '../../core/rng';
import type { Rng } from '../../core/rng';
import type { GameEngine, InputEvent, RoundResult, TrialRecord } from '../../core/types';
import { capSpan, makeSpan, seqmemLevel, soaMs } from './rules';
import type { SeqmemLevel } from './rules';

// spec:240/361 帧间隔阈值（严格「大于」才作废）；REVEAL_MS 是答对/答错后的定格时长
export const FRAME_MS = 50;
export const REVEAL_MS = 400;

export type SeqmemPhase = 'idle' | 'show' | 'recall' | 'reveal' | 'replay' | 'done';

export interface SeqmemSnapshot {
  size: number;
  cells: number;
  phase: SeqmemPhase;
  dir: 'fwd' | 'rev';
  span: number;
  capSpan: number;
  spanNo: number;
  correct: number;
  litIndex: number | null;
  tapped: number[];
  wrongIndex: number | null;
  elapsedMs: number;
  done: boolean;
}

export class SeqmemEngine implements GameEngine<SeqmemSnapshot> {
  private level = 1;
  private seed = 0;
  private lv: SeqmemLevel = seqmemLevel(1);
  private rng: Rng = createRng(0);
  private seq: number[] = [];
  private span = 0;
  private pos = 0;
  private spanNo = 0;
  private correctSpans = 0;
  private bestSpan = 0;
  private recallSumMs = 0;
  private phase: SeqmemPhase = 'idle';
  private tapped: number[] = [];
  private wrongIndex: number | null = null;
  private startAt = 0;
  private now = 0;
  private lastFrameAt = 0;
  private showStartAt = 0;
  private showEndAt = 0;
  private revealUntil = 0;
  private endAt: number | null = null;
  private timingOk = true;
  private trials: TrialRecord[] = [];

  // 形参与 GameEngine.configure 逐字一致。roundNo 只进 SessionRunner 的记账，不参与出题（裁定 R-9）。
  configure(level: number, seed: number, roundNo: number): void {
    const lv = seqmemLevel(level);
    this.level = level;
    this.seed = seed;
    this.lv = lv;
    this.rng = createRng(seed);
    this.trials = [];
    this.correctSpans = 0;
    this.bestSpan = 0;
    this.recallSumMs = 0;
    this.spanNo = 0;
    this.wrongIndex = null;
    this.endAt = null;
    this.phase = 'idle';
    // 作废契约（spec:292）：SessionRunner.voidCurrentRound() 不通知引擎，重开轮只调 configure + start，
    // 所以帧计时基准、播放游标、定格窗口都必须在这里归零，否则上一轮的时间会漏进 snapshot.elapsedMs。
    this.startAt = 0;
    this.now = 0;
    this.lastFrameAt = 0;
    this.showStartAt = 0;
    this.showEndAt = 0;
    this.revealUntil = 0;
    this.timingOk = true;
    this.newSeq(lv.l0);
  }

  start(now: number): void {
    this.startAt = now;
    this.now = now;
    this.lastFrameAt = now;
    this.beginShow(now);
  }

  input(e: InputEvent): void {
    // 裁定 R-8：非回忆相位的点击一律忽略（不记错、不进 trial、不推进 now）。Task 3 在此门后填判定。
    if (this.phase !== 'recall' || e.kind !== 'cell' || this.endAt !== null) return;
  }

  tick(now: number): void {
    this.now = Math.max(this.now, now);
    if (this.phase === 'show' && this.now >= this.showEndAt) this.phase = 'recall';
  }

  snapshot(): SeqmemSnapshot {
    return {
      size: this.lv.size,
      cells: this.lv.size * this.lv.size,
      phase: this.phase,
      dir: this.lv.dir,
      span: this.span,
      capSpan: capSpan(this.lv),
      spanNo: this.spanNo,
      correct: this.correctSpans,
      litIndex: this.litAt(),
      tapped: this.tapped.slice(),
      wrongIndex: this.wrongIndex,
      elapsedMs: this.now - this.startAt,
      done: this.endAt !== null,
    };
  }

  isDone(): boolean {
    return this.endAt !== null;
  }

  result(): RoundResult {
    throw new Error('seqmem result() is implemented in Task 3');
  }

  // 一条 rng 流贯穿整轮：第 k 条序列的内容只取决于前面消费过多少次 randInt（裁定 R-9）。
  private newSeq(len: number): void {
    this.span = len;
    this.seq = makeSpan(this.rng, this.lv.size, len);
    this.spanNo += 1;
    this.pos = 0;
    this.tapped = [];
    this.wrongIndex = null;
  }

  private beginShow(at: number): void {
    this.phase = 'show';
    this.showStartAt = at;
    this.showEndAt = at + (this.span - 1) * soaMs(this.lv) + this.lv.onMs;
  }

  // 亮格由帧时间算出，不是存出来的：一帧内跨两个窗口也不会漏播。
  private litAt(): number | null {
    if (this.phase !== 'show' && this.phase !== 'replay') return null;
    const soa = soaMs(this.lv);
    const i = Math.floor((this.now - this.showStartAt) / soa);
    if (i < 0 || i >= this.seq.length) return null;
    return this.now < this.showStartAt + i * soa + this.lv.onMs ? this.seq[i] : null;
  }
}
