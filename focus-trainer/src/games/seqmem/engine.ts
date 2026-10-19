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
    // 裁定 R-8：非回忆相位、非 cell、已结束的点击一律忽略（不记错、不进 trial、不推进 now）。
    if (this.phase !== 'recall' || e.kind !== 'cell' || this.endAt !== null) return;
    this.now = Math.max(this.now, e.t);
    const total = this.lv.size * this.lv.size;
    // 视图发不出越界下标，这一行只是挡住手工构造的 InputEvent，免得 expectedAt 拿到 undefined
    if (!Number.isInteger(e.index) || e.index < 0 || e.index >= total) return;
    const recallMs = e.t - this.showEndAt;
    if (e.index === this.expectedAt(this.pos)) {
      this.tapped.push(e.index);
      this.pos += 1;
      if (this.pos < this.seq.length) return;
      this.correctSpans += 1;
      this.bestSpan = Math.max(this.bestSpan, this.span);
      this.recallSumMs += recallMs;
      this.trials.push({
        onset: this.showStartAt,
        rt: recallMs,
        correct: true,
        span: this.span,
        dir: this.lv.dir,
        taps: this.tapped.length,
      });
      // 到上限且答对 → 本轮立刻结束（spec:96），endAt 用最后一次点击的帧时间戳，无需再播
      if (this.span >= capSpan(this.lv)) {
        this.endAt = e.t;
        this.phase = 'done';
        return;
      }
      this.phase = 'reveal';
      this.revealUntil = e.t + REVEAL_MS;
      return;
    }
    // 点错任一格 → 本轮结束，但先把正确序列回放一次（裁定 R-6）
    this.trials.push({
      onset: this.showStartAt,
      rt: recallMs,
      correct: false,
      span: this.span,
      dir: this.lv.dir,
      taps: this.pos,
    });
    this.wrongIndex = e.index;
    this.phase = 'reveal';
    this.revealUntil = e.t + REVEAL_MS;
  }

  tick(now: number): void {
    // spec:361 把「序列的高亮播放」列为时序关键阶段，只有 show / replay 参与帧间隔判定（裁定 R-7）。
    // recall / reveal 是用户在想、在定格，帧稀疏不是卡顿；一旦判为不可信就不再翻回来。
    // lastFrameAt 只由 tick 写，input() 的点击时间戳碰不到它（Task 2 起 input 只动 this.now）。
    const playing = this.phase === 'show' || this.phase === 'replay';
    if (playing && now - this.lastFrameAt > FRAME_MS) this.timingOk = false;
    this.lastFrameAt = now;
    // rAF 时间戳单调递增（play.ts:148），这里只是把播放游标钳在「见过的最新帧」，
    // 不是给时钟差做负值/NaN 处理（M1 裁定 N-5）。
    this.now = Math.max(this.now, now);
    if (this.endAt !== null) return;
    if ((this.phase === 'show' || this.phase === 'replay') && this.now >= this.showEndAt) {
      if (this.phase === 'replay') {
        // 回放按预定的 showEndAt 落点结束，而不是按「发现时已经过了多久的那一帧」，
        // 这样 result().metrics.timeMs 不受掉帧影响。
        this.endAt = this.showEndAt;
        this.phase = 'done';
        return;
      }
      this.phase = 'recall';
      return;
    }
    if (this.phase === 'reveal' && this.now >= this.revealUntil) {
      if (this.wrongIndex !== null) this.beginReplay(now);
      else {
        this.newSeq(this.span + 1);
        this.beginShow(now);
      }
    }
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
    if (this.endAt === null) throw new Error('seqmem round is not finished');
    return {
      level: this.level,
      seed: this.seed,
      // 裁定 R-3：trials 的自定义字段全是标量（span/dir/taps），所以 {...t} 就是完整拷贝；
      // 播放内容与点击序列这些数组只活在 snapshot().tapped 里，绝不进 TrialRecord。
      trials: this.trials.map((t) => ({ ...t })),
      metrics: {
        timeMs: Math.round(this.endAt - this.startAt),
        spans: this.trials.length,
        spansCorrect: this.correctSpans,
        bestSpan: this.bestSpan,
        fwdSpan: this.lv.dir === 'fwd' ? this.bestSpan : 0,
        revSpan: this.lv.dir === 'rev' ? this.bestSpan : 0,
        recallSumMs: Math.round(this.recallSumMs),
        cap: capSpan(this.lv),
      },
      timingValid: this.timingOk,
    };
  }

  // 答错后按「播放顺序」重播一次（不再倒放），到点才结束本轮
  private beginReplay(at: number): void {
    this.phase = 'replay';
    this.wrongIndex = null;
    this.showStartAt = at;
    this.showEndAt = at + (this.span - 1) * soaMs(this.lv) + this.lv.onMs;
  }

  private expectedAt(i: number): number {
    return this.lv.dir === 'fwd' ? this.seq[i] : this.seq[this.seq.length - 1 - i];
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
