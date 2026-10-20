// focus-trainer/src/games/mot/session.test.ts
import { describe, expect, it } from 'vitest';
import { SessionRunner } from '../../core/session';
import type { GameState } from '../../core/types';
import { FEEDBACK_MS, MOT_MAX_LEVEL, PROMPT_MS, motLevel } from './rules';
import type { MotDotView, MotPhase, MotSnapshot } from './engine';
import { mot } from './index';

// 桩里没有 requestAnimationFrame / setTimeout / performance —— 模块装配路径若偷读时钟会当场炸。
// 本文件全部时刻来自常量 T0 与 FRAME，这是测试脚手架喂虚拟时钟，不是被测代码在计时。
const FRAME = 16;
const T0 = 1_700_000_000_000;
const state = (level: number): GameState => ({ gameId: 'mot', level, passStreak: 0, failStreak: 0, lastPlayedDayKey: null });

const enginePhase = (r: SessionRunner): MotPhase | null =>
  r.snapshot().phase === 'playing' ? (r.engine.snapshot() as MotSnapshot).phase : null;

function tickUntil(r: SessionRunner, from: number, pred: () => boolean): number {
  let t = from;
  for (let i = 0; i < 4000 && !pred(); i++) {
    t += FRAME;
    r.tick(t);
  }
  expect(pred()).toBe(true); // 驱动器没走到条件就是测试自身失效，绝不能静默返回
  return t;
}

// 玩完「当前已开的那一轮」，返回轮结束（引擎 isDone、runner 进 between/finished）后的时刻。
// gap !== null 时在提示阶段凭空插入一个长空档，模拟切后台：本轮 timingValid 必为 false。
// FRAME/gap 全为整数：T0 在 double 的精确整数域内且始终整除 16，t += FRAME 不产生累加误差（F-1 无命中）。
function playRound(r: SessionRunner, from: number, hitCount: number, gap: number | null): number {
  let t = from;
  const s0 = r.engine.snapshot() as MotSnapshot; // 此刻是 prompt 相位，能看到目标身份
  const k = s0.k;
  const targets = s0.dots.filter((d) => d.target).map((d) => d.id);
  if (gap !== null) {
    t += FRAME;
    r.tick(t);
    t += FRAME;
    r.tick(t);
    t += gap; // 第三个帧间隔：远超 50ms ⇒ 作废（首帧只建基准，不会误伤）
    r.tick(t);
  }
  t = tickUntil(r, t, () => enginePhase(r) === 'answer');
  const frozen = r.engine.snapshot() as MotSnapshot;
  const others = frozen.dots.map((d) => d.id).filter((id) => !targets.includes(id));
  const hits = Math.min(hitCount, k);
  const chosen = [...targets.slice(0, hits), ...others.slice(0, k - hits)];
  for (const id of chosen) {
    const d = frozen.dots.find((x) => x.id === id) as MotDotView;
    t += FRAME;
    r.input({ kind: 'point', x: d.x, y: d.y, t });
  }
  return tickUntil(r, t, () => r.snapshot().phase !== 'playing');
}

// 按 16ms 网格预算「全中轮」的 runner 观察结束时刻（测试自身失效时由 tickUntil 的守卫报错，不会假绿）：
// 相位切换帧 → K 次点选（每点间隔 1 帧，第 K 点触发自动提交）→ 首个越过 feedbackEndAt 的帧。
// 引擎的 endAt 落在逻辑边界（submitAt + FEEDBACK_MS），runner 的 completeRound 落在该帧，
// tickUntil 返回的就是这一帧的时刻。n 相对 start 取网格（start 恒为 beginRound 的时刻）。
const roundEnd = (start: number, motionPlusPromptMs: number, k: number): number => {
  const n = (x: number): number => start + Math.ceil((x - start) / FRAME) * FRAME;
  const answerFrame = n(start + motionPlusPromptMs);
  return n(answerFrame + k * FRAME + FEEDBACK_MS);
};

describe('mot 跑通 SessionRunner', () => {
  it('8 轮全中 → 8 个 pass、按 upAfter 2 升 4 档、记录字段齐全', () => {
    const r = new SessionRunner(mot, state(1), 'free', 2026, T0);
    let t = T0;
    r.beginRound(t);
    for (let i = 0; i < mot.roundsPerSession; i++) {
      const s = playRound(r, t, 99, null);
      t = s;
      if (i < mot.roundsPerSession - 1) t = tickUntil(r, t, () => r.snapshot().phase === 'playing'); // auto break 600ms
    }
    expect(r.isFinished()).toBe(true);
    const { record, state: next } = r.finish('2026-10-19');
    expect(record.gameId).toBe('mot');
    expect(record.rounds).toHaveLength(8);
    expect(record.rounds.every((x) => x.counted && x.outcome === 'pass')).toBe(true);
    // 升档算术（adaptive.ts 升档后 passStreak 归零）：8 个连续 pass ÷ upAfter 2 = 升 4 档 ⇒ 终点 5。
    // 8 轮实际打的档位是 1,1,2,2,3,3,4,4 ⇒ K 依次 2,2,2,2,3,3,3,3 ⇒ 命中/目标都是 20，maxK 3。
    expect(next.level).toBe(5);
    expect(record.endLevel).toBe(5);
    expect(record.rounds.map((x) => x.metrics.k)).toEqual([2, 2, 2, 2, 3, 3, 3, 3]);
    expect(record.summary).toEqual({ hitRate: 1, hits: 20, targets: 20, maxK: 3 });
    expect(record.ability).toBeGreaterThan(0);
    expect(record.durationMs).toBeGreaterThan(0);
  });

  // brief 此用例只打 4 轮就 finish()，实测失效：finish 要求 runner 已到 finished（session.ts:104），
  // 而 roundsPerSession=8 由 spec §3.4 定死 ⇒ 校准为打满 8 轮（brief Step 4 预告的「按实测校正」处之一）。
  it('全失手 → fail 但不掉档（level 1 已是下限）', () => {
    const r = new SessionRunner(mot, state(1), 'free', 7, T0);
    let t = T0;
    r.beginRound(t);
    for (let i = 0; i < mot.roundsPerSession; i++) {
      t = playRound(r, t, 0, null);
      if (i < mot.roundsPerSession - 1) t = tickUntil(r, t, () => r.snapshot().phase === 'playing');
    }
    const { record, state: next } = r.finish('2026-10-19');
    expect(record.rounds.map((x) => x.outcome)).toEqual(['fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail', 'fail']);
    expect(next.level).toBe(1);
    expect(record.rounds.every((x) => x.score01 === 0)).toBe(true);
  });

  // brief 在 3 次作废后直接 finish()，实测失效：finish 要求 phase==='finished'（session.ts:104），
  // roundsPerSession=8 定死 ⇒ 重试后必须把 8 个记分轮打满才能结算（Step 4 预告的「按实测校正」处之二）。
  // 作废轮的三条断言（lastInvalid / roundNo 不前进 / 三次布局互不相同）一字未动。
  it('切后台造成的 INVALID：本轮不记分、重试且换 seed、roundNo 不前进', () => {
    const r = new SessionRunner(mot, state(2), 'free', 1000, T0);
    let t = T0;
    r.beginRound(t);
    // configure 用 this.seed + this.attempt（session.ts:68），attempt 每开一轮 +1，
    // 所以三次作废重试的 seed 依次是 1000 / 1001 / 1002，布局必须互不相同。
    const layouts: string[][] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      layouts.push((r.engine.snapshot() as MotSnapshot).dots.map((d) => d.x.toFixed(6)));
      t = playRound(r, t, 99, 4000);
      expect(r.snapshot().lastInvalid).toBe(true);
      expect(r.snapshot().roundNo).toBe(1); // 作废轮不推进轮号
      t = tickUntil(r, t, () => r.snapshot().phase === 'playing');
    }
    expect(layouts).toHaveLength(3);
    expect(layouts[0]).not.toEqual(layouts[1]);
    expect(layouts[1]).not.toEqual(layouts[2]);
    for (let i = 0; i < mot.roundsPerSession; i++) {
      t = playRound(r, t, 99, null);
      if (i < mot.roundsPerSession - 1) t = tickUntil(r, t, () => r.snapshot().phase === 'playing');
    }
    const { record } = r.finish('2026-10-19');
    expect(record.rounds).toHaveLength(11); // 3 次作废重试 + 8 个记分轮
    expect(record.rounds.filter((x) => !x.counted)).toHaveLength(3);
    expect(record.rounds.slice(0, 3).every((x) => x.counted === false && x.roundNo === 1)).toBe(true);
  });

  // 同上：第 4 次作废被强制 hold 记分后 roundNo 只到 2，再补 7 个记分轮打满 8 轮才能 finish。
  it('MAX_RETRIES 用尽后第 4 次作废轮按 hold 记分（session.ts:143 的强制 hold 路径）', () => {
    const r = new SessionRunner(mot, state(3), 'free', 5000, T0);
    let t = T0;
    r.beginRound(t);
    for (let attempt = 0; attempt < 3; attempt++) {
      t = playRound(r, t, 99, 4000);
      expect(r.snapshot().roundNo).toBe(1);
      t = tickUntil(r, t, () => r.snapshot().phase === 'playing');
    }
    t = playRound(r, t, 99, 4000); // 第 4 次仍 invalid，但重试额度已用完
    for (let round = 2; round <= mot.roundsPerSession; round++) {
      t = tickUntil(r, t, () => r.snapshot().phase === 'playing');
      t = playRound(r, t, 99, null);
    }
    const { record } = r.finish('2026-10-19');
    expect(record.rounds.filter((x) => !x.counted)).toHaveLength(3);
    expect(record.rounds[3].counted).toBe(true);
    expect(record.rounds[3].outcome).toBe('hold');
    expect(record.rounds[3].score01).toBe(1); // 全中：judge 不看 timingValid，强制 hold 是 runner 的动作
  });

  it('一轮的真实时长符合档位表：提示 2s + 运动 D + 反馈 1s（预算=实测，brief 的 3 帧上界对 16ms 网格不成立）', () => {
    const lv = motLevel(5); // 档 5：K=4、D=7
    const r = new SessionRunner(mot, state(5), 'free', 31, T0);
    r.beginRound(T0);
    const end = playRound(r, T0, 4, null);
    const expectMin = T0 + PROMPT_MS + lv.durationSec * 1000 + FEEDBACK_MS;
    expect(end).toBeGreaterThanOrEqual(expectMin); // 逻辑下界仍守住
    // brief 上界 expectMin + 3*FRAME = +48ms 被实测 +80ms 击穿：9000/16=562.5，answer 帧落在
    // +9008（+8ms），4 次点选 +64ms，1000/16=62.5 又溢出 +8ms ⇒ 结束帧 = +10080。
    // 换成按同一 16ms 网格预算的精确值（测试自身失效时由 tickUntil 的守卫报错，不会假绿）。
    expect(end).toBe(roundEnd(T0, PROMPT_MS + lv.durationSec * 1000, lv.k));
  });

  it('模块装配满足 registry.test.ts 对每个注册模块的通用契约（控制器裁定）', () => {
    expect(mot.id).toBe('mot');
    expect(mot.name).toBe('视觉动态感知');
    expect(mot.ability).toBe('动态感知');
    expect(mot.maxLevel).toBe(MOT_MAX_LEVEL);
    expect(mot.roundsPerSession).toBe(8);
    expect(mot.roundBreak).toBe('auto');
    expect(mot.staircase).toEqual({ upAfter: 2, downAfter: 1 });
    expect(mot.instructions.length).toBeGreaterThan(0);
    const eng = mot.createEngine();
    eng.configure(1, 3, 1); // 三参数 (level, seed, roundNo)，与 GameEngine 契约逐字一致
    eng.start(0);
    expect(eng.isDone()).toBe(false);
    expect(eng.result.bind(eng)).toThrow(); // 轮未完必须 throw（MotEngine.result 的 endAt 守卫）
    expect(mot.formatSummary(mot.summarize([])).length).toBeGreaterThan(0);
  });
});
