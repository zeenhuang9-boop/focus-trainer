import { createRng, randInt, shuffle } from '../../core/rng';
import type { GameEngine, InputEvent, RoundResult, TrialRecord } from '../../core/types';
import { schulteLevel, targetSequence } from './rules';

export const TINTS = 4;
export const FLASH_MS = 150;

export interface SchulteCell {
  label: string;
  done: boolean;
  tint: number | null;
}

export interface SchulteSnapshot {
  size: number;
  cells: SchulteCell[];
  nextLabel: string | null;
  errors: number;
  elapsedMs: number;
  flashIndex: number | null;
  done: boolean;
}

export class SchulteEngine implements GameEngine<SchulteSnapshot> {
  private level = 1;
  private seed = 0;
  private size = 3;
  private targets: string[] = [];
  private cells: SchulteCell[] = [];
  private nextIdx = 0;
  private errors = 0;
  private missesSinceHit = 0;
  private startAt = 0;
  private lastHitAt = 0;
  private now = 0;
  private endAt: number | null = null;
  private flashIndex: number | null = null;
  private flashUntil = 0;
  private trials: TrialRecord[] = [];

  // 形参与 GameEngine.configure 逐字一致（必填轮号）。舒尔特的题面与判定都不依赖轮号，
  // 它只是 SessionRunner 的记账字段。
  configure(level: number, seed: number, roundNo: number): void {
    const lv = schulteLevel(level);
    const rng = createRng(seed);
    this.level = level;
    this.seed = seed;
    this.size = lv.size;
    this.targets = targetSequence(lv);
    this.cells = shuffle(rng, this.targets).map((label) => ({
      label,
      done: false,
      tint: lv.distractor ? randInt(rng, 0, TINTS - 1) : null,
    }));
    this.nextIdx = 0;
    this.errors = 0;
    this.missesSinceHit = 0;
    this.endAt = null;
    this.flashIndex = null;
    this.trials = [];
    // 作废契约（spec 5.1）：SessionRunner.voidCurrentRound() 不通知引擎，重开轮只调 configure + start。
    // 时间基准也必须在这里归零，否则 start() 之前的 snapshot().elapsedMs 会漏出上一轮的用时。
    this.startAt = 0;
    this.lastHitAt = 0;
    this.now = 0;
  }

  start(now: number): void {
    this.startAt = now;
    this.lastHitAt = now;
    this.now = now;
  }

  input(e: InputEvent): void {
    if (e.kind !== 'cell' || this.endAt !== null) return;
    const cell = this.cells[e.index];
    if (cell === undefined || cell.done) return;
    this.now = Math.max(this.now, e.t);
    if (cell.label === this.targets[this.nextIdx]) {
      cell.done = true;
      this.trials.push({
        onset: this.lastHitAt,
        rt: e.t - this.lastHitAt,
        correct: true,
        label: cell.label,
        misses: this.missesSinceHit,
      });
      this.lastHitAt = e.t;
      this.missesSinceHit = 0;
      this.nextIdx += 1;
      if (this.nextIdx === this.targets.length) this.endAt = e.t;
    } else {
      this.errors += 1;
      this.missesSinceHit += 1;
      this.flashIndex = e.index;
      this.flashUntil = e.t + FLASH_MS;
    }
  }

  tick(now: number): void {
    this.now = Math.max(this.now, now);
    if (this.flashIndex !== null && this.now >= this.flashUntil) this.flashIndex = null;
  }

  snapshot(): SchulteSnapshot {
    const end = this.endAt ?? this.now;
    return {
      size: this.size,
      cells: this.cells.map((c) => ({ ...c })),
      nextLabel: this.endAt === null ? this.targets[this.nextIdx] : null,
      errors: this.errors,
      elapsedMs: Math.max(0, end - this.startAt),
      flashIndex: this.flashIndex,
      done: this.endAt !== null,
    };
  }

  isDone(): boolean {
    return this.endAt !== null;
  }

  result(): RoundResult {
    if (this.endAt === null) throw new Error('schulte round is not finished');
    return {
      level: this.level,
      seed: this.seed,
      trials: this.trials.map((t) => ({ ...t })),
      metrics: { timeMs: Math.round(this.endAt - this.startAt), errors: this.errors, cells: this.targets.length },
      timingValid: true,
    };
  }
}
