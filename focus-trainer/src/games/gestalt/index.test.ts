import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import type { RoundRecord } from '../../core/types';
import { GESTALT_CHOICE_COUNT, buildTrialSpec, gestaltLevel } from './rules';
import type { GestaltSnapshot } from './engine';
import { gestalt } from './index';

/** 把一轮跑到作答期，返回进入作答期那一帧 */
function toAnswer(eng: ReturnType<typeof gestalt.createEngine>, dt: number): number {
  eng.start(0);
  for (let t = dt; t < 60000; t += dt) {
    eng.tick(t);
    // createEngine() 的返回类型是 GameEngine（S = unknown），必须显式收成 GestaltSnapshot 才读得到 phase
    if ((eng.snapshot() as GestaltSnapshot).phase === 'answer') return t;
  }
  throw new Error('never reached answer phase');
}

describe('gestalt 模块元数据', () => {
  it('id / 名称 / 维度 / 曲线参数符合 spec §3.5 与 §5.2', () => {
    expect(gestalt).toMatchObject({
      id: 'gestalt',
      name: '视觉完型整合',
      ability: '完型整合',
      maxLevel: 12,
      roundsPerSession: 16,
      roundBreak: 'auto',
      staircase: { upAfter: 2, downAfter: 1 },
    });
    expect(gestalt.instructions).toContain('碎片');
    expect(gestalt.instructions.length).toBeGreaterThan(40);
    expect(typeof gestalt.createView).toBe('function'); // 不在 node 里调用它
  });

  // 控制器裁定：index.ts 必须满足 registry.test.ts 对每个已注册模块施加的通用契约。
  // 本任务不改 registry.ts / registry.test.ts（S-1），故在此按同一契约自证。
  it('通用契约：三参数 configure + start(0) 后 result() 必须抛错、isDone 为 false、空结算可格式化', () => {
    const eng = gestalt.createEngine();
    eng.configure(1, 3, 1); // (level, seed, roundNo)
    eng.start(0);
    expect(eng.isDone()).toBe(false);
    expect(eng.result.bind(eng)).toThrow();
    expect(gestalt.formatSummary(gestalt.summarize([])).length).toBeGreaterThan(0);
  });
});

describe('整轮端到端（模拟时钟 + 脚本化输入）', () => {
  it('选对的一轮：下标取自 rules 层回放，judge 恰为 pass/1，summarize 恰为 100% / 420ms', () => {
    const eng = gestalt.createEngine();
    eng.configure(3, 21, 1);
    const t = toAnswer(eng, 10);
    const s = eng.snapshot() as GestaltSnapshot;
    expect(s.choices).toHaveLength(GESTALT_CHOICE_COUNT);
    // 正确下标不能从快照读（反馈期才揭晓），只能在 rules 层重放 configure 的 rng 消费顺序：
    // engine.ts:68-69 就是 createRng(seed) → buildTrialSpec(rng, gestaltLevel(level))，
    // rng 是确定性序列，同 (level, seed) 必得同一份题面。先核对选项序列，确认回放出来的
    // 就是引擎这一轮的题面，再用它的 correctIndex 作答 —— 上一版盲写 index:0 加 || 析取，
    // 选错也能「通过」，这条断言等于没有（终审 SF-1）。
    const replay = buildTrialSpec(createRng(21), gestaltLevel(3));
    expect(s.choices.map((c) => c.id)).toEqual([...replay.choices]);
    eng.input({ kind: 'choice', index: replay.correctIndex, t: t + 100 });
    eng.tick(t + 100 + 600);
    expect(eng.isDone()).toBe(true);
    const r = eng.result();
    expect(r.trials).toHaveLength(1);
    expect(r.trials[0].correct).toBe(true);
    // 10ms 网格：fixation 500 → exposure 920（实测暴露 420）→ mask 1120 进作答，
    // 作答落在 1220 ⇒ rt = 1220 - 500 = 720。逐字段钉死，不用 || 也不用 >=。
    expect(r.metrics).toEqual({ correct: 1, rtMs: 720, exposureMs: 420, requestedExposureMs: 420 });
    expect(r.timingValid).toBe(true);
    expect(gestalt.judge(r)).toEqual({ outcome: 'pass', score01: 1 });
    const rec: RoundRecord = { ...r, roundNo: 1, outcome: 'pass', score01: 1, counted: true };
    expect(gestalt.summarize([rec])).toEqual({ accuracy: 1, thresholdMs: 420 });
    expect(gestalt.formatSummary(gestalt.summarize([rec])).map((i) => i.label)).toEqual(['正确率', '识别阈值']);
  });

  it('可复现：同 (level, seed, roundNo) 两次跑，result() 逐字段相等且 judge/summarize 也相等', () => {
    const once = (level: number, seed: number) => {
      const eng = gestalt.createEngine();
      eng.configure(level, seed, 7);
      const t = toAnswer(eng, 16);
      eng.input({ kind: 'choice', index: 2, t: t + 240 });
      eng.tick(t + 240 + 600);
      const r = eng.result();
      return { r, j: gestalt.judge(r), s: gestalt.summarize([{ ...r, roundNo: 7, outcome: 'hold', score01: 0, counted: true }]) };
    };
    for (const [level, seed] of [[1, 5], [7, 5], [12, 999]] as const) {
      expect(once(level, seed)).toEqual(once(level, seed));
    }
  });
});
