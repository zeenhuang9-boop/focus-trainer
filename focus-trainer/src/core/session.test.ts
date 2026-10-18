import { describe, expect, it } from 'vitest';
import { AUTO_BREAK_MS, MAX_RETRIES, SessionRunner } from './session';
import { defaultGameState } from './storage';
import type { GameEngine, GameModule, GameState, InputEvent, RoundResult } from './types';

// 测试替身：只用来驱动 SessionRunner 的轮次编排，不代表任何真实游戏。
// 事件里的 index 是本轮结果编码：1=pass，0=fail，2=hold，9=时序无效。
// choice 事件让本轮立即结束；cell 事件让本轮在下一次 tick 时结束。
class FakeEngine implements GameEngine<null> {
  readonly configured: Array<{ level: number; seed: number; roundNo: number }> = [];
  private level = 1;
  private seed = 0;
  private code = -1;
  private pending: number | null = null;
  private done = false;

  configure(level: number, seed: number, roundNo: number): void {
    this.configured.push({ level, seed, roundNo });
    this.level = level;
    this.seed = seed;
    this.code = -1;
    this.pending = null;
    this.done = false;
  }

  start(): void {}

  input(e: InputEvent): void {
    if (e.kind === 'choice') {
      this.code = e.index;
      this.done = true;
    } else if (e.kind === 'cell') {
      this.pending = e.index;
    }
  }

  tick(): void {
    if (this.pending !== null) {
      this.code = this.pending;
      this.pending = null;
      this.done = true;
    }
  }

  snapshot(): null {
    return null;
  }

  isDone(): boolean {
    return this.done;
  }

  result(): RoundResult {
    return { level: this.level, seed: this.seed, trials: [], metrics: { code: this.code }, timingValid: this.code !== INVALID };
  }
}

const PASS = 1;
const FAIL = 0;
const HOLD = 2;
const INVALID = 9;
const SEED = 1000;
const EPOCH = 1_700_000_000_000;

function makeModule(overrides: Partial<GameModule>): GameModule {
  return {
    id: 'schulte',
    name: '测试',
    ability: '测试',
    maxLevel: 10,
    roundsPerSession: 3,
    roundBreak: 'tap',
    staircase: { upAfter: 1, downAfter: 1 },
    instructions: '',
    createEngine: () => new FakeEngine(),
    createView: () => {
      throw new Error('测试中不创建 view');
    },
    // INVALID 必须显式映射成 pass：若与 HOLD 共用兜底的 hold，「补满配额后强制 hold」这条
    // 分支的两种实现会产出完全相同的记录，测试就钉不住 spec 5.1（评审变异 V9 存活）。
    judge: (r) =>
      r.metrics.code === PASS
        ? { outcome: 'pass', score01: 1 }
        : r.metrics.code === FAIL
          ? { outcome: 'fail', score01: 0 }
          : r.metrics.code === INVALID
            ? { outcome: 'pass', score01: 0.6 }
            : { outcome: 'hold', score01: 0.6 },
    summarize: (rounds) => ({ counted: rounds.filter((r) => r.counted).length }),
    formatSummary: () => [],
    ...overrides,
  };
}

function make(overrides: Partial<GameModule> = {}, level = 1) {
  const state: GameState = { ...defaultGameState('schulte'), level };
  const runner = new SessionRunner(makeModule(overrides), state, 'free', SEED, EPOCH);
  return { runner, engine: runner.engine as FakeEngine };
}

function play(runner: SessionRunner, code: number, at: number): void {
  runner.beginRound(at);
  runner.input({ kind: 'choice', index: code, t: at + 100 });
}

describe('SessionRunner', () => {
  it('按轮升降档，最后一轮结束后进入 finished', () => {
    const { runner } = make();
    expect(runner.snapshot()).toMatchObject({ phase: 'ready', roundNo: 1, roundsTotal: 3, level: 1, waitingForTap: true });
    play(runner, PASS, 0);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 2, level: 2, lastOutcome: 'pass', lastLevelChange: 1, waitingForTap: true });
    play(runner, PASS, 1000);
    expect(runner.snapshot()).toMatchObject({ roundNo: 3, level: 3 });
    play(runner, FAIL, 2000);
    expect(runner.snapshot()).toMatchObject({ phase: 'finished', roundNo: 3, level: 2, lastOutcome: 'fail', lastLevelChange: -1 });
    expect(runner.isFinished()).toBe(true);
    // finished 是 beginRound 的另一个禁止态（评审变异 V7：只拦 playing 也能全绿）
    expect(() => runner.beginRound(3000)).toThrow();
  });

  it('每轮用当前档位、seed + attempt 与计分轮号 configure', () => {
    const { runner, engine } = make();
    play(runner, PASS, 0);
    play(runner, HOLD, 1000);
    play(runner, FAIL, 2000);
    expect(engine.configured).toEqual([
      { level: 1, seed: SEED, roundNo: 1 },
      { level: 2, seed: SEED + 1, roundNo: 2 },
      { level: 2, seed: SEED + 2, roundNo: 3 },
    ]);
  });

  it('staircase 规则来自游戏模块：2 升 1 降时第一次 pass 不升档', () => {
    const { runner } = make({ staircase: { upAfter: 2, downAfter: 1 } });
    play(runner, PASS, 0);
    expect(runner.snapshot()).toMatchObject({ level: 1, lastLevelChange: 0 });
    play(runner, PASS, 1000);
    expect(runner.snapshot()).toMatchObject({ level: 2, lastLevelChange: 1 });
  });

  it('时序无效的轮不计分、不升降档，同轮号用新 seed 补一轮', () => {
    const { runner, engine } = make();
    play(runner, INVALID, 0);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 1, level: 1, lastInvalid: true, lastOutcome: null });
    play(runner, PASS, 1000);
    expect(engine.configured[1]).toEqual({ level: 1, seed: SEED + 1, roundNo: 1 });
    expect(runner.snapshot()).toMatchObject({ roundNo: 2, level: 2, lastInvalid: false });
  });

  it('补满 3 次后再出现时序无效，按 hold 计入', () => {
    const { runner } = make();
    for (let i = 0; i < MAX_RETRIES; i++) play(runner, INVALID, i * 1000);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 1 });
    play(runner, INVALID, 5000);
    expect(runner.snapshot()).toMatchObject({ roundNo: 2, level: 1, lastOutcome: 'hold', lastInvalid: false });
    play(runner, PASS, 6000);
    play(runner, PASS, 7000);
    const { record } = runner.finish('2026-10-18');
    expect(record.rounds.map((r) => [r.roundNo, r.counted, r.outcome])).toEqual([
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, true, 'hold'],
      [2, true, 'pass'],
      [3, true, 'pass'],
    ]);
    expect(record.rounds[3].score01).toBe(0.6);
  });

  it('补轮配额是整次训练共享的，不是每个轮号各自 3 次', () => {
    // spec 5.1「一次训练最多补 3 次」是整场训练的配额，不是每个轮号各自 3 次。
    // 若实现按轮号计数（评审变异 V19：计分后把 retriesUsed 归零），本用例第 2 轮遇到无效会
    // 再补一轮而不是立即 hold —— seqmem/mot/gestalt 的轮数是 3/8/16，每轮口径会把上限
    // 放大成 9/24/48 次，整场题面与时长失控而测试仍绿。
    const { runner } = make({ roundsPerSession: 2 });
    for (let i = 0; i < MAX_RETRIES; i++) play(runner, INVALID, i * 1000);
    play(runner, PASS, 4000);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 2, level: 2 });
    play(runner, INVALID, 5000);
    expect(runner.snapshot()).toMatchObject({ phase: 'finished', roundNo: 2, level: 2, lastOutcome: 'hold' });
    const { record } = runner.finish('2026-10-18');
    expect(record.rounds.map((r) => [r.roundNo, r.counted, r.outcome])).toEqual([
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, true, 'pass'],
      [2, true, 'hold'],
    ]);
  });

  it('切后台作废当前轮：不记录、同轮号新 seed 重开、不占补轮次数', () => {
    const { runner, engine } = make();
    runner.beginRound(0);
    runner.voidCurrentRound();
    expect(runner.snapshot()).toMatchObject({ phase: 'voided', roundNo: 1, waitingForTap: true });
    runner.input({ kind: 'choice', index: PASS, t: 50 });
    expect(runner.snapshot().phase).toBe('voided');
    play(runner, PASS, 1000);
    expect(engine.configured.map((c) => [c.roundNo, c.seed])).toEqual([
      [1, SEED],
      [1, SEED + 1],
    ]);
    for (let i = 0; i < MAX_RETRIES; i++) play(runner, INVALID, 2000 + i * 1000);
    expect(runner.snapshot()).toMatchObject({ roundNo: 2, lastInvalid: true });
    play(runner, PASS, 9000);
    play(runner, PASS, 10000);
    const { record } = runner.finish('2026-10-18');
    expect(record.rounds).toHaveLength(6);
    expect(record.rounds.filter((r) => r.counted)).toHaveLength(3);
  });

  it('auto 轮间：600ms 后由 tick 自动开下一轮', () => {
    const { runner, engine } = make({ roundBreak: 'auto' });
    // 下面的用例用「相对常量」取时间点，常量本身必须钉住（评审变异 V8：600 改 1000 仍全绿）
    expect(AUTO_BREAK_MS).toBe(600);
    play(runner, PASS, 0);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', waitingForTap: false });
    runner.tick(100 + AUTO_BREAK_MS - 1);
    expect(runner.snapshot().phase).toBe('between');
    runner.tick(100 + AUTO_BREAK_MS);
    expect(runner.snapshot().phase).toBe('playing');
    expect(engine.configured).toHaveLength(2);
  });

  it('auto 轮间切后台：取消自动衔接，改为等待点击', () => {
    const { runner } = make({ roundBreak: 'auto' });
    play(runner, PASS, 0);
    runner.voidCurrentRound();
    expect(runner.snapshot()).toMatchObject({ phase: 'between', waitingForTap: true });
    runner.tick(10_000);
    expect(runner.snapshot().phase).toBe('between');
    runner.beginRound(10_000);
    expect(runner.snapshot().phase).toBe('playing');
  });

  it('引擎在 tick 里结束时同样结算，结束时刻取该帧时间', () => {
    const { runner } = make({ roundsPerSession: 1 });
    runner.beginRound(0);
    runner.input({ kind: 'cell', index: PASS, t: 10 });
    expect(runner.snapshot().phase).toBe('playing');
    runner.tick(16);
    expect(runner.snapshot().phase).toBe('finished');
    expect(runner.finish('2026-10-18').record.durationMs).toBe(16);
    // finish 一次性（评审 N-4）：重复调用会多写一行同 startedAt 的记录，
    // 污染趋势页的「当天最高能力指数」与打卡判定，而 runner 是唯一能廉价拦住它的位置。
    expect(() => runner.finish('2026-10-18')).toThrow();
  });

  it('finish 生成记录：起止档位、能力指数、时长与 lastPlayedDayKey', () => {
    const { runner } = make({}, 4);
    play(runner, PASS, 0);
    play(runner, HOLD, 1000);
    play(runner, FAIL, 2000);
    const { record, state } = runner.finish('2026-10-18');
    expect(record).toMatchObject({
      gameId: 'schulte',
      mode: 'free',
      dayKey: '2026-10-18',
      startedAt: EPOCH,
      durationMs: 2100,
      startLevel: 4,
      endLevel: 4,
      summary: { counted: 3 },
    });
    expect(record.rounds.map((r) => r.level)).toEqual([4, 5, 5]);
    // 最后 2 个计分轮：(5-1+0.6) 与 (5-1+0)，均值 4.3，100*4.3/10 = 43
    expect(record.ability).toBe(43);
    expect(state).toEqual({ gameId: 'schulte', level: 4, passStreak: 0, failStreak: 0, lastPlayedDayKey: '2026-10-18' });
  });

  it('训练没结束时 finish 报错', () => {
    const { runner } = make();
    expect(() => runner.finish('2026-10-18')).toThrow();
    play(runner, PASS, 0);
    expect(() => runner.finish('2026-10-18')).toThrow();
  });

  it('非 playing 时输入被忽略；playing 时不能再开轮', () => {
    const { runner, engine } = make();
    runner.input({ kind: 'choice', index: PASS, t: 0 });
    expect(runner.snapshot().phase).toBe('ready');
    runner.beginRound(0);
    expect(() => runner.beginRound(1)).toThrow();
    expect(engine.configured).toHaveLength(1);
  });
});
