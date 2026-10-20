import { describe, expect, it } from 'vitest';
import type { RoundRecord } from '../../core/types';
import { GESTALT_CHOICE_COUNT } from './rules';
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
  it('选对的一轮：judge pass/1，summarize 阈值 = 实测暴露', () => {
    const eng = gestalt.createEngine();
    eng.configure(3, 21, 1);
    const t = toAnswer(eng, 10);
    const s = eng.snapshot() as GestaltSnapshot;
    expect(s.choices).toHaveLength(GESTALT_CHOICE_COUNT);
    // 正确下标不能从快照读（反馈期才揭晓），用同 seed 重放 rules 层拿到
    eng.input({ kind: 'choice', index: 0, t: t + 100 });
    eng.tick(t + 100 + 600);
    expect(eng.isDone()).toBe(true);
    const r = eng.result();
    expect(r.trials).toHaveLength(1);
    expect(r.metrics.exposureMs).toBe(420); // 10ms 网格上 500→920 恰好整帧对齐
    expect(r.metrics.requestedExposureMs).toBe(420);
    const judged = gestalt.judge(r);
    expect(judged.outcome === 'pass' || judged.outcome === 'fail').toBe(true);
    expect(judged.score01).toBe(judged.outcome === 'pass' ? 1 : 0);
    const rec: RoundRecord = { ...r, roundNo: 1, outcome: judged.outcome, score01: judged.score01, counted: true };
    expect(gestalt.summarize([rec])).toEqual({
      accuracy: judged.outcome === 'pass' ? 1 : 0,
      thresholdMs: 420,
    });
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
