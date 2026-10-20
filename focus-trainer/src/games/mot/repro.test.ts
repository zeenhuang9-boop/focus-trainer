// focus-trainer/src/games/mot/repro.test.ts
import { describe, expect, it } from 'vitest';
import type { RoundResult } from '../../core/types';
import { FEEDBACK_MS, MOT_LEVELS, PROMPT_MS, judgeMot, motLevel } from './rules';
import { STEPS_PER_SECOND } from './physics';
import { MotEngine } from './engine';

interface Played {
  result: RoundResult;
  hits: number;
  feedbackMarks: string[];
}

// F-1（_m2-conventions）：喂帧一律用整数下标算时刻，绝不浮点累加。
// 语义与简报的 `for (let t = from; t < to; t += stepMs) tick(t); tick(to)` 逐字等价：
// 严格早于 to 的那些帧 + 一个正好落在 to 的帧（rAF 一定会在边界之后给出一帧，测试要模拟这件事）。
function feedUntil(e: MotEngine, from: number, to: number, stepMs: number): void {
  const n = Math.ceil((to - from) / stepMs);
  for (let i = 0; i < n; i++) e.tick(from + i * stepMs);
  e.tick(to);
}

// 复现驱动器：同 (level, seed, roundNo) + 同 hitCount + 同点击时刻表 ⇒ 逐字段相同的 result()
// 目标身份只能在提示阶段读快照（answer 阶段快照里的 target 恒 false，这是 Task 4 立的防作弊线），
// 所以先记下 target 的 id，再用 id 回到 answer 阶段的坐标上点。
function play(level: number, seed: number, roundNo: number, hitCount: number, frameMs: number): Played {
  const lv = motLevel(level);
  const e = new MotEngine();
  e.configure(level, seed, roundNo);
  e.start(0);

  const revealed = e.snapshot().dots.filter((d) => d.target).map((d) => d.id);
  const distractors = e.snapshot().dots.filter((d) => !d.target).map((d) => d.id);
  expect(revealed).toHaveLength(lv.k);
  // 提示阶段不许有任何标记：markOf 一旦去掉相位守卫，所有目标当场挂上 'missed'，答案就泄底了
  expect(e.snapshot().dots.every((d) => d.mark === 'none')).toBe(true);

  const motionEnd = PROMPT_MS + lv.durationSec * 1000;
  feedUntil(e, 0, motionEnd, frameMs);
  expect(e.snapshot().phase).toBe('answer');
  // 同理，作答阶段（选中了但还没提交）也不许泄底：这一刻 mark 必须整片 'none'
  expect(e.snapshot().dots.every((d) => d.mark === 'none')).toBe(true);

  const frozen = e.snapshot();
  const chosen = [...revealed.slice(0, hitCount), ...distractors.slice(0, lv.k - hitCount)];
  let t = motionEnd;
  for (const id of chosen) {
    const d = frozen.dots.find((x) => x.id === id);
    expect(d).toBeDefined();
    t += 16;
    e.input({ kind: 'point', x: (d as { x: number; y: number }).x, y: (d as { x: number; y: number }).y, t });
  }
  // 选满 K 当场自动提交：不需要任何额外动作就进入反馈
  expect(e.snapshot().phase).toBe('feedback');
  expect(e.isDone()).toBe(false);
  const marks = e.snapshot().dots.filter((d) => d.mark !== 'none').map((d) => d.mark);
  expect(e.snapshot().selectedCount).toBe(lv.k);

  // 一直喂到越过反馈边界的那一帧（t 此刻就是提交时刻，feedbackEndAt = t + FEEDBACK_MS）。
  // 简报里那条 `t < motionEnd + t + FEEDBACK_MS` 恒真的循环就是同一个意思，这里换成整数下标；
  // 结束时的 isDone() 断言保留 —— 它是整份复现测试的前提。
  const feedbackFrames = Math.ceil(FEEDBACK_MS / frameMs);
  for (let i = 1; i <= feedbackFrames; i++) e.tick(t + i * frameMs);
  expect(e.isDone()).toBe(true);
  return { result: e.result(), hits: hitCount, feedbackMarks: marks };
}

describe('复现性（本计划的命门）', () => {
  it('10 档各跑一遍：同 (level, seed, roundNo) 两次 result() 逐字段相等', () => {
    for (let level = 1; level <= MOT_LEVELS.length; level++) {
      const a = play(level, 50_000 + level * 13, 2, 1, 16).result;
      const b = play(level, 50_000 + level * 13, 2, 1, 16).result;
      expect(a).toEqual(b);
      expect(a.level).toBe(level);
      expect(a.seed).toBe(50_000 + level * 13);
      expect(a.timingValid).toBe(true);
      expect(a.trials).toHaveLength(1);
    }
  });

  it('换 roundNo 不改题面：mot 的 stimulus 与判分都不看轮号', () => {
    const r1 = play(3, 777, 1, 2, 16).result;
    const r2 = play(3, 777, 5, 2, 16).result;
    expect(r2).toEqual(r1);
  });

  it('换 seed 必换轨迹与判分依据（防止「随机数其实没被用上」这类静默退化）', () => {
    expect(play(8, 1, 1, 3, 16).result.trials).not.toEqual(play(8, 2, 1, 3, 16).result.trials);
  });

  it('16ms 与 48ms 喂帧：result() 逐字段相同（曝光时长是规格量，不是帧率的函数）', () => {
    const fast = play(7, 4242, 3, 2, 16).result;
    const slow = play(7, 4242, 3, 2, 48).result;
    expect(slow).toEqual(fast);
    expect(fast.metrics.simSteps).toBe(MOT_LEVELS[6].durationSec * STEPS_PER_SECOND);
  });

  it('result() 两次调用不共享可变引用：改第一次的 selections 不影响第二次', () => {
    const e = new MotEngine();
    e.configure(2, 9, 1);
    e.start(0);
    const ids = e.snapshot().dots.filter((d) => d.target).map((d) => d.id);
    const end = PROMPT_MS + motLevel(2).durationSec * 1000;
    e.tick(end);
    const s = e.snapshot();
    ids.forEach((id, i) => {
      const d = s.dots.find((x) => x.id === id) as { x: number; y: number };
      e.input({ kind: 'point', x: d.x, y: d.y, t: end + 16 * (i + 1) });
    });
    e.tick(end + 16 * ids.length + FEEDBACK_MS);
    const a = e.result();
    const snapshotOfA = JSON.stringify(a);
    (a.trials[0].selections as number[]).push(-1);
    (a.trials[0].targetIds as number[]).push(-1); // 两个数组都必须是现场拷贝，少 slice 一个就漏
    a.metrics.hits = 999;
    expect(JSON.stringify(e.result())).toBe(snapshotOfA);
  });
});

describe('提交、反馈与判定接线', () => {
  it('未满 K 不提交、选满当场提交、反馈满 1000ms 才算 isDone', () => {
    const lv = MOT_LEVELS[0]; // 6 点 K=2 D=5
    const e = new MotEngine();
    e.configure(1, 42, 1);
    e.start(0);
    const end = PROMPT_MS + lv.durationSec * 1000;
    e.tick(end);
    const s = e.snapshot();
    const ids = s.dots.map((d) => d.id);
    e.input({ kind: 'point', x: s.dots[0].x, y: s.dots[0].y, t: end + 16 });
    expect(e.snapshot().phase).toBe('answer'); // 只选了 1 个，还没提交
    expect(e.isDone()).toBe(false);
    const second = s.dots.find((d) => d.id === ids[1]) as { x: number; y: number };
    e.input({ kind: 'point', x: second.x, y: second.y, t: end + 32 });
    expect(e.snapshot().phase).toBe('feedback');
    expect(e.isDone()).toBe(false);
    // 视图的真实序列是「rAF 帧 → 点选」，remainMs 的差值取自 this.now（上一帧的时刻）。
    // 简报在这里少喂了一帧：不喂的话 now 还停在 end，差值天然多 32ms（1032），
    // 与它自己写的 remainMs === FEEDBACK_MS 断言互相矛盾。这里补上提交那一帧，
    // 断言与期望值逐字未动，实现按简报原样（feedbackEndAt - now）。
    e.tick(end + 32);
    expect(e.snapshot().remainMs).toBe(FEEDBACK_MS);
    e.tick(end + 32 + FEEDBACK_MS - 1);
    expect(e.isDone()).toBe(false);
    e.tick(end + 32 + FEEDBACK_MS);
    expect(e.isDone()).toBe(true);
    expect(() => new MotEngine().result()).toThrow('mot round is not finished');
  });

  it('反馈标记三分类齐全：hit / wrong / missed，且 answer 阶段一个都没有', () => {
    const p = play(4, 313, 1, 1, 16); // 档 4：K=3，命中 1
    const counted = { hit: 0, wrong: 0, missed: 0 };
    for (const m of p.feedbackMarks) counted[m as keyof typeof counted] += 1;
    expect(counted).toEqual({ hit: 1, wrong: 2, missed: 2 });
    expect(p.result.trials[0].correct).toBe(false); // 只有「全中」才是 correct，命中 1/3 不是
    expect(p.result.metrics.hits).toBe(1); // hits 只数「选中且是目标」，不是选中数
    expect(judgeMot(p.result)).toEqual({ outcome: 'fail', score01: 1 / 3 }); // h=1 ≤ K-2=1
  });

  it('metrics 齐全且与判分自洽：hits / k / dots / simSteps / motionMs / answerMs', () => {
    const lv = MOT_LEVELS[5]; // 12 点 K=4 v=0.27 D=8
    const p = play(6, 8080, 4, 4, 16);
    expect(p.result.metrics).toMatchObject({ k: lv.k, hits: 4, dots: lv.dots, motionMs: lv.durationSec * 1000 });
    expect(p.result.metrics.simSteps).toBe(lv.durationSec * STEPS_PER_SECOND);
    expect(p.result.metrics.answerMs).toBe(16 * lv.k); // 点选时刻表由驱动器给定，不钳不凑
    expect(p.result.trials[0].rt).toBe(16 * lv.k);
    expect(p.result.trials[0].onset).toBe(PROMPT_MS + lv.durationSec * 1000);
    expect(p.result.trials[0].correct).toBe(true);
    expect(judgeMot(p.result)).toEqual({ outcome: 'pass', score01: 1 });
  });

  it('切后台造成的巨大帧间隔：result().timingValid = false，且判分不看它（作废归 runner）', () => {
    const e = new MotEngine();
    e.configure(2, 5, 1);
    e.start(0);
    // 身份必须在 prompt 相位读（answer/motion 快照的 target 恒 false），简报把这一行写在两次 tick
    // 之后，读到的恒是空数组 ⇒ 永远选不满 K ⇒ isDone 不可能为真。计划缺陷，期望值未动。
    const ids = e.snapshot().dots.filter((d) => d.target).map((d) => d.id);
    const end = PROMPT_MS + motLevel(2).durationSec * 1000;
    e.tick(1000);
    e.tick(1000 + 4000); // 4 秒空档
    e.tick(end);
    const s = e.snapshot();
    ids.forEach((id, i) => {
      const d = s.dots.find((x) => x.id === id) as { x: number; y: number };
      e.input({ kind: 'point', x: d.x, y: d.y, t: end + 16 * (i + 1) });
    });
    e.tick(end + 16 * ids.length + FEEDBACK_MS);
    expect(e.isDone()).toBe(true);
    const r = e.result();
    expect(r.timingValid).toBe(false);
    expect(judgeMot(r).outcome).toBe('pass'); // 全中照样 pass：作废与重试是 runner 的职责
  });
});
