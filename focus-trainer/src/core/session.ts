import { step } from './adaptive';
import { abilityIndex } from './scoring';
import type { GameEngine, GameModule, GameState, InputEvent, Mode, Outcome, RoundRecord, SessionRecord } from './types';

export type SessionPhase = 'ready' | 'playing' | 'between' | 'voided' | 'finished';

export interface SessionSnapshot {
  phase: SessionPhase;
  roundNo: number;
  roundsTotal: number;
  level: number;
  lastOutcome: Outcome | null;
  lastLevelChange: -1 | 0 | 1;
  lastInvalid: boolean;
  waitingForTap: boolean;
}

export const MAX_RETRIES = 3;
export const AUTO_BREAK_MS = 600;

export class SessionRunner {
  readonly engine: GameEngine;
  private state: GameState;
  private readonly startLevel: number;
  private readonly rounds: RoundRecord[] = [];
  private phase: SessionPhase = 'ready';
  private roundNo = 1;
  private attempt = 0;
  private retriesUsed = 0;
  private lastOutcome: Outcome | null = null;
  private lastLevelChange: -1 | 0 | 1 = 0;
  private lastInvalid = false;
  private firstStartAt: number | null = null;
  private endAt = 0;
  private breakUntil: number | null = null;
  private saved = false;

  constructor(
    private readonly module: GameModule,
    state: GameState,
    private readonly mode: Mode,
    private readonly seed: number,
    private readonly startedAtEpoch: number,
  ) {
    this.engine = module.createEngine();
    this.state = { ...state };
    this.startLevel = state.level;
  }

  snapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      roundNo: this.roundNo,
      roundsTotal: this.module.roundsPerSession,
      level: this.state.level,
      lastOutcome: this.lastOutcome,
      lastLevelChange: this.lastLevelChange,
      lastInvalid: this.lastInvalid,
      waitingForTap:
        this.phase === 'ready' || this.phase === 'voided' || (this.phase === 'between' && this.breakUntil === null),
    };
  }

  beginRound(now: number): void {
    if (this.phase === 'playing' || this.phase === 'finished') {
      throw new Error(`cannot begin a round while ${this.phase}`);
    }
    this.engine.configure(this.state.level, this.seed + this.attempt, this.roundNo);
    this.attempt += 1;
    this.engine.start(now);
    if (this.firstStartAt === null) this.firstStartAt = now;
    this.breakUntil = null;
    this.phase = 'playing';
  }

  tick(now: number): void {
    if (this.phase === 'playing') {
      this.engine.tick(now);
      if (this.engine.isDone()) this.completeRound(now);
    } else if (this.phase === 'between' && this.breakUntil !== null && now >= this.breakUntil) {
      this.beginRound(now);
    }
  }

  input(e: InputEvent): void {
    if (this.phase !== 'playing') return;
    this.engine.input(e);
    if (this.engine.isDone()) this.completeRound(e.t);
  }

  voidCurrentRound(): void {
    if (this.phase === 'playing') this.phase = 'voided';
    else if (this.phase === 'between') this.breakUntil = null;
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  finish(dayKey: string): { record: SessionRecord; state: GameState } {
    if (this.saved) {
      throw new Error('session already finished');
    }
    if (this.phase !== 'finished' || this.firstStartAt === null) {
      throw new Error('session is not finished');
    }
    // 必须深拷贝：{ ...r } 只拷顶层，trials/metrics 会与 runner 内部共享引用；
    // 结算页一旦原地排序 trials 或就地换算 metrics.timeMs，就会同时改掉 runner 的状态。
    // summarize 也拿这份副本，不给它内部数组本体。
    const rounds = this.rounds.map((r) => ({
      ...r,
      trials: r.trials.map((t) => ({ ...t })),
      metrics: { ...r.metrics },
    }));
    const record: SessionRecord = {
      gameId: this.module.id,
      mode: this.mode,
      dayKey,
      startedAt: this.startedAtEpoch,
      durationMs: Math.round(this.endAt - this.firstStartAt),
      startLevel: this.startLevel,
      endLevel: this.state.level,
      rounds,
      summary: this.module.summarize(rounds),
      ability: abilityIndex(rounds, this.module.maxLevel),
    };
    this.saved = true;
    return { record, state: { ...this.state, lastPlayedDayKey: dayKey } };
  }

  private completeRound(now: number): void {
    const result = this.engine.result();
    const judged = this.module.judge(result);
    if (!result.timingValid && this.retriesUsed < MAX_RETRIES) {
      this.retriesUsed += 1;
      this.rounds.push({ ...result, roundNo: this.roundNo, outcome: judged.outcome, score01: judged.score01, counted: false });
      this.lastInvalid = true;
      this.lastOutcome = null;
      this.lastLevelChange = 0;
      this.enterBreak(now);
      return;
    }
    const outcome: Outcome = result.timingValid ? judged.outcome : 'hold';
    const before = this.state.level;
    this.state = { ...this.state, ...step(this.state, outcome, this.module.staircase, this.module.maxLevel) };
    this.rounds.push({ ...result, roundNo: this.roundNo, outcome, score01: judged.score01, counted: true });
    this.lastInvalid = false;
    this.lastOutcome = outcome;
    this.lastLevelChange = Math.sign(this.state.level - before) as -1 | 0 | 1;
    if (this.roundNo >= this.module.roundsPerSession) {
      this.endAt = now;
      this.phase = 'finished';
      return;
    }
    this.roundNo += 1;
    this.enterBreak(now);
  }

  private enterBreak(now: number): void {
    this.phase = 'between';
    this.breakUntil = this.module.roundBreak === 'auto' ? now + AUTO_BREAK_MS : null;
  }
}
