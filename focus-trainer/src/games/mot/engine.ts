// focus-trainer/src/games/mot/engine.ts
import { createRng } from '../../core/rng';
import type { Rng } from '../../core/rng';
import type { InputEvent } from '../../core/types';
import { MAX_FRAME_INTERVAL_MS, MOT_LEVELS, PROMPT_MS, motLevel } from './rules';
import type { MotLevel } from './rules';
import { STEPS_PER_SECOND, frameSteps, hitTest, spawnDots, stepOnce } from './physics';
import type { DotState } from './physics';

export type MotPhase = 'prompt' | 'motion' | 'answer' | 'feedback';
export type MotMark = 'none' | 'hit' | 'wrong' | 'missed';

export interface MotDotView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly target: boolean;
  readonly selected: boolean;
  readonly mark: MotMark;
}

export interface MotSnapshot {
  readonly phase: MotPhase;
  readonly dots: readonly MotDotView[];
  readonly k: number;
  readonly selectedCount: number;
  readonly remainMs: number;
  readonly simSteps: number;
  readonly timingValid: boolean;
  readonly done: boolean;
}

// 本 Task 起 MotEngine 还只是「一个类」；Task 5 补上 result() 之后才声明
// implements GameEngine<MotSnapshot>，index.ts 也才可能引用它。
export class MotEngine {
  private lv: MotLevel = MOT_LEVELS[0];
  private rng: Rng = createRng(0);
  private dots: DotState[] = [];
  private selections: number[] = [];
  private phase: MotPhase = 'prompt';
  private startAt = 0;
  private promptEndAt = 0;
  private motionEndAt = 0;
  private now = 0;
  private lastTickAt = 0;
  private baselined = false;
  private steps = 0;
  private timingValid = true;
  private endAt: number | null = null;

  // 形参与 GameEngine.configure 逐字一致。roundNo 与舒尔特同口径：只是 SessionRunner 的记账字段，
  // mot 的题面与判分都不看它（看了就会破坏「同 (level, seed) 同轨迹」的复现契约）。
  configure(level: number, seed: number, roundNo: number): void {
    const lv = motLevel(level);
    this.lv = lv;
    this.rng = createRng(seed);
    this.dots = spawnDots(this.rng, lv);
    this.selections = [];
    this.phase = 'prompt';
    // 作废契约（spec §5.1）：SessionRunner.voidCurrentRound() 不通知引擎，重开轮只调 configure + start。
    // 时间基准、步数、rng、timingValid 必须在这里一起归零，否则作废轮会带着上一轮的轨迹残留开跑。
    this.startAt = 0;
    this.promptEndAt = 0;
    this.motionEndAt = 0;
    this.now = 0;
    this.lastTickAt = 0;
    this.baselined = false;
    this.steps = 0;
    this.timingValid = true;
    this.endAt = null;
    void roundNo;
  }

  start(now: number): void {
    this.startAt = now;
    this.promptEndAt = now + PROMPT_MS;
    this.motionEndAt = this.promptEndAt + this.lv.durationSec * 1000;
    this.now = now;
    this.lastTickAt = now;
    this.baselined = false;
    this.phase = 'prompt';
    this.steps = 0;
  }

  tick(now: number): void {
    if (this.endAt !== null) return;
    // 基准必须来自第一帧而非 start()：start 的 now 常来自点击，与首个 rAF 帧天生差 > 50ms，
    // 拿 start 当基准会把每一轮开局都误判成帧饥饿。
    const gap = now - this.lastTickAt;
    if (this.baselined && (this.phase === 'prompt' || this.phase === 'motion') && gap > MAX_FRAME_INTERVAL_MS) {
      this.timingValid = false;
    }
    this.lastTickAt = now;
    this.baselined = true;
    this.now = now;

    if (this.phase === 'prompt' && now >= this.promptEndAt) this.phase = 'motion';
    if (this.phase === 'motion') {
      // elapsed 的起点是 promptEndAt 而不是 startAt：定长步只该数运动期内的时间。
      // 上限钉死在 D × 120：越过运动结束点的那一帧最坏溢出 15ms，不加限制就会多模拟一步，
      // 曝光时长就不再等于档位表的 D 秒（这是规格量，不是时钟量，所以这里必须有上限）。
      const target = Math.min(
        frameSteps(now - this.promptEndAt),
        this.lv.durationSec * STEPS_PER_SECOND,
      );
      while (this.steps < target) {
        this.dots = stepOnce(this.dots, this.rng, this.lv, this.steps);
        this.steps += 1;
      }
      if (now >= this.motionEndAt) this.phase = 'answer';
    }
  }

  input(e: InputEvent): void {
    if (e.kind !== 'point') return;
    if (this.phase !== 'answer') return; // 提示与运动阶段拒绝一切点选
    if (this.endAt !== null) return;
    const id = hitTest(this.dots, e.x, e.y);
    if (id === null) return; // 容差外的空点：忽略。spec §3.4 只有「命中/误选」，没有误点罚分
    const i = this.selections.indexOf(id);
    if (i >= 0) this.selections.splice(i, 1); // 「再点一次取消」
    else this.selections.push(id);
  }

  snapshot(): MotSnapshot {
    const reveal = this.phase === 'prompt' || this.phase === 'feedback';
    return {
      phase: this.phase,
      // 每次新建数组与元素：视图会长期持有上一帧快照，共享引用会让旧帧被新帧悄悄改写。
      dots: this.dots.map((d) => ({
        id: d.id,
        x: d.x,
        y: d.y,
        // 身份只在提示与反馈阶段出快照。若在运动/作答阶段把 target 写进 DOM，
        // 读一次 class 就能作弊，判分当场失效 —— 这条泄漏不会有类型错误。
        target: reveal ? d.target : false,
        selected: this.selections.includes(d.id),
        mark: 'none' as MotMark,
      })),
      k: this.lv.k,
      selectedCount: this.selections.length,
      remainMs: this.remainMs(),
      // simSteps / timingValid 不进视图，但它们是「帧饥饿」与「时序作废」唯一可观测的出口
      simSteps: this.steps,
      timingValid: this.timingValid,
      done: this.endAt !== null,
    };
  }

  isDone(): boolean {
    return this.endAt !== null;
  }

  // 原始差值，可以为负（tick 落后于阶段边界是常态）。视图显示时才 Math.max(0, …) ——
  // 判分路径上的任何时间量都不钳（M1 裁定 N-5）。
  private remainMs(): number {
    if (this.phase === 'prompt') return this.promptEndAt - this.now;
    if (this.phase === 'motion') return this.motionEndAt - this.now;
    return 0; // answer 不限时；feedback 分支由 Task 5 加
  }
}
