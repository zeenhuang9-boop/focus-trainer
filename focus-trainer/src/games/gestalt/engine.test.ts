import { describe, expect, it } from 'vitest';
import type { InputEvent } from '../../core/types';
import { GESTALT_CHOICE_COUNT } from './rules';
import { FEEDBACK_MS, FIXATION_MS, MASK_MS, GestaltEngine, type GestaltSnapshot } from './engine';

const step = (eng: GestaltEngine, from: number, to: number, dt: number): number[] => {
  const frames: number[] = [];
  for (let t = from; t <= to; t += dt) {
    eng.tick(t);
    frames.push(t);
  }
  return frames;
};

// 走完注视 + 暴露 + 掩蔽，停在「刚进入作答」的那一帧
const toAnswer = (eng: GestaltEngine, dt: number): number => {
  let t = dt;
  while (eng.snapshot().phase !== 'answer') {
    eng.tick(t);
    t += dt;
  }
  return t - dt;
};

const answer = (eng: GestaltEngine, index: number, t: number): InputEvent => ({ kind: 'choice', index, t });

describe('曝光时序（帧时间戳，不是墙上时钟）', () => {
  it('10ms 网格 + 档 1（T=600）：暴露恰好占满 500→1100，共 600ms', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 1, 1);
    eng.start(0);
    expect(eng.snapshot().phase).toBe('fixation');
    eng.tick(490);
    expect(eng.snapshot().phase).toBe('fixation');
    eng.tick(500); // 第一帧 >= 0 + FIXATION_MS
    expect(eng.snapshot().phase).toBe('exposure');
    eng.tick(1090);
    expect(eng.snapshot().phase).toBe('exposure');
    eng.tick(1100); // 第一帧 >= 500 + 600
    expect(eng.snapshot().phase).toBe('mask');
    eng.tick(1290);
    expect(eng.snapshot().phase).toBe('mask');
    eng.tick(1300); // 1100 + MASK_MS
    expect(eng.snapshot().phase).toBe('answer');
    const r = (() => {
      eng.input(answer(eng, 0, 1400));
      eng.tick(1400 + FEEDBACK_MS);
      return eng.result();
    })();
    expect(r.metrics.exposureMs).toBe(600);
    expect(r.metrics.requestedExposureMs).toBe(600);
  });

  it('16ms 网格 + 档 1：曝光被量化到 512→1120（608ms），断言的是可预测的帧边界', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 2, 1);
    eng.start(0);
    step(eng, 16, 496, 16);
    expect(eng.snapshot().phase).toBe('fixation');
    eng.tick(512);
    expect(eng.snapshot().phase).toBe('exposure');
    step(eng, 528, 1104, 16);
    expect(eng.snapshot().phase).toBe('exposure');
    eng.tick(1120);
    expect(eng.snapshot().phase).toBe('mask');
    // 进入作答期必须由一帧宣布（一个 tick 只推进一个阶段），否则 1400ms 的作答落在掩蔽期被丢弃
    eng.tick(1400);
    eng.input(answer(eng, 1, 1400));
    eng.tick(1400 + FEEDBACK_MS);
    const m = eng.result().metrics;
    expect(m.exposureMs).toBe(608); // 1120 - 512
    expect(m.exposureMs).toBeGreaterThanOrEqual(m.requestedExposureMs);
    expect(m.exposureMs).toBeLessThan(m.requestedExposureMs + 16);
  });

  it('档 12（T=80）在 16ms 网格上曝光 80ms：短于一帧也不会退化成 0', () => {
    const eng = new GestaltEngine();
    eng.configure(12, 5, 1);
    eng.start(0);
    eng.tick(496);
    expect(eng.snapshot().phase).toBe('fixation');
    eng.tick(512);
    expect(eng.snapshot().phase).toBe('exposure');
    eng.tick(528); // 512 + 80 = 592 > 528，仍在暴露
    expect(eng.snapshot().phase).toBe('exposure');
    eng.tick(592);
    expect(eng.snapshot().phase).toBe('mask');
    // 进入作答期必须由一帧宣布（一个 tick 只推进一个阶段），否则 900ms 的作答落在掩蔽期被丢弃
    eng.tick(900);
    eng.input(answer(eng, 2, 900));
    eng.tick(900 + FEEDBACK_MS);
    expect(eng.result().metrics.exposureMs).toBe(80);
  });

  it('没有任何 setTimeout：configure 之后不 tick 就永远停在 idle', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 1, 1);
    expect(eng.snapshot().phase).toBe('idle');
    expect(eng.isDone()).toBe(false);
    eng.start(0);
    expect(eng.snapshot().phase).toBe('fixation');
    expect(eng.isDone()).toBe(false);
  });
});

describe('阶段可见性（答案阵列不得提前泄底）', () => {
  it('暴露期只见碎片、无选项；作答期只见 4 个选项、碎片清空', () => {
    const eng = new GestaltEngine();
    eng.configure(7, 3, 1);
    eng.start(0);
    const duringFixation = eng.snapshot();
    expect(duringFixation.choices).toHaveLength(0);
    expect(duringFixation.fragments).toHaveLength(0);
    eng.tick(500);
    const duringExposure = eng.snapshot();
    expect(duringExposure.phase).toBe('exposure');
    expect(duringExposure.fragments.length).toBeGreaterThan(0);
    expect(duringExposure.choices).toHaveLength(0);
    expect(duringExposure.correctIndex).toBeNull();
    eng.tick(1000);
    const duringMask = eng.snapshot();
    expect(duringMask.phase).toBe('mask');
    expect(duringMask.fragments).toHaveLength(0);
    expect(duringMask.mask.length).toBeGreaterThan(0);
    expect(duringMask.choices).toHaveLength(0);
    eng.tick(1200);
    const duringAnswer = eng.snapshot();
    expect(duringAnswer.phase).toBe('answer');
    expect(duringAnswer.choices).toHaveLength(GESTALT_CHOICE_COUNT);
    expect(duringAnswer.mask).toHaveLength(0);
    expect(duringAnswer.correctIndex).toBeNull(); // 反馈前不给出正确项
  });

  it('反馈期给出 correctIndex，并一直保留到 done', () => {
    const eng = new GestaltEngine();
    eng.configure(3, 8, 1);
    eng.start(0);
    const t = toAnswer(eng, 10);
    eng.input(answer(eng, 0, t + 100));
    const fb = eng.snapshot();
    expect(fb.phase).toBe('feedback');
    expect(fb.answeredIndex).toBe(0);
    expect(typeof fb.correctIndex).toBe('number');
    expect(fb.rtMs).toBe(t + 100 - FIXATION_MS); // rt 从曝光起点算：10ms 网格上曝光起点是 500，作答发生在 1120 + 100
    expect(fb.done).toBe(false);
    eng.tick(t + 100 + FEEDBACK_MS - 1);
    expect(eng.snapshot().done).toBe(false);
    eng.tick(t + 100 + FEEDBACK_MS);
    expect(eng.snapshot().done).toBe(true);
    expect(eng.isDone()).toBe(true);
  });

  it('非 choice 事件、越界下标、提前作答全部被忽略且不落笔', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 4, 1);
    eng.start(0);
    eng.input({ kind: 'cell', index: 2, t: 10 });
    eng.input({ kind: 'point', x: 0.5, y: 0.5, t: 20 });
    expect(eng.snapshot().answeredIndex).toBeNull();
    const t = toAnswer(eng, 10);
    eng.input(answer(eng, GESTALT_CHOICE_COUNT, t)); // 越界
    eng.input({ kind: 'choice', index: -1, t: t + 5 });
    expect(eng.snapshot().answeredIndex).toBeNull();
    // 反馈期再点一次无效
    eng.input(answer(eng, 1, t + 20));
    expect(eng.snapshot().answeredIndex).toBe(1);
    eng.input(answer(eng, 0, t + 30));
    expect(eng.snapshot().answeredIndex).toBe(1);
    eng.tick(t + 30 + FEEDBACK_MS);
    expect(eng.result().trials).toHaveLength(1);
  });

  it('暴露期作答不生效（不给「还没看完就提交」留后门）', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 9, 1);
    eng.start(0);
    eng.tick(500);
    eng.input(answer(eng, 0, 700));
    expect(eng.snapshot().answeredIndex).toBeNull();
    expect(eng.snapshot().phase).toBe('exposure');
  });
});

describe('帧间隔判定（spec §6）', () => {
  const withGap = (gapAt: number, dt: number, gap: number): GestaltSnapshot => {
    const eng = new GestaltEngine();
    eng.configure(1, 11, 1);
    eng.start(0);
    for (let t = dt; ; t += dt) {
      if (t === gapAt) {
        // gapAt 本身是一帧真实帧，卡顿发生在它之后：间隔必须从它量起，
        // 否则 gap=50 实际量到 60ms，「严格大于 50」的边界永远测不到。
        eng.tick(t);
        eng.tick(t + gap);
        t += gap;
      }
      eng.tick(t);
      if (eng.snapshot().phase === 'answer') return eng.snapshot();
    }
  };

  it('暴露期内 51ms 帧间隔 → timingValid=false；恰好 50ms → 仍为 true', () => {
    expect(withGap(600, 10, 51).timingValid).toBe(false);
    expect(withGap(600, 10, 50).timingValid).toBe(true);
  });

  it('掩蔽期内 60ms 帧间隔 → timingValid=false', () => {
    expect(withGap(1200, 10, 60).timingValid).toBe(false);
  });

  it('注视期与作答期的长间隔不算（关键阶段之外不判）', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 12, 1);
    eng.start(0);
    eng.tick(400);
    eng.tick(1400); // 注视期一次跳 1000ms
    expect(eng.snapshot().timingValid).toBe(true);
    const t = toAnswer(eng, 16);
    eng.input(answer(eng, 0, t + 5000)); // 思考 5 秒
    expect(eng.snapshot().timingValid).toBe(true);
  });
});

describe('整轮结算与纪律', () => {
  it('选对 → correct=1 且 rt 从曝光起点算；选错 → correct=0', () => {
    const right = new GestaltEngine();
    right.configure(1, 13, 1);
    right.start(0);
    const t = toAnswer(right, 10);
    right.input(answer(right, 0, t + 300));
    const fb = right.snapshot(); // 反馈期才揭晓正确下标，作答前读不到
    right.tick(t + 300 + FEEDBACK_MS);
    const rr = right.result();
    expect(rr.trials).toHaveLength(1);
    expect(rr.trials[0].correct).toBe(fb.correctIndex === 0);
    expect(rr.trials[0].onset).toBe(500);
    expect(rr.trials[0].rt).toBe(t + 300 - 500);
    expect(rr.metrics.rtMs).toBe(t + 300 - 500);

    const wrong = new GestaltEngine();
    wrong.configure(1, 13, 1);
    wrong.start(0);
    toAnswer(wrong, 10);
    // 下标由 right 揭晓的 correctIndex 反推（同 level+seed 即同一试次），保证「必定选错」且不绑定 seed 值
    wrong.input(answer(wrong, fb.correctIndex === 0 ? 1 : 0, 2000));
    wrong.tick(2000 + FEEDBACK_MS);
    expect(wrong.result().trials[0].correct).toBe(false);
  });

  it('result() 之前必须完成；拷贝出来的 trials 改了不影响引擎', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 1, 1);
    eng.start(0);
    expect(() => eng.result()).toThrow(/not finished/);
    const t = toAnswer(eng, 10);
    eng.input(answer(eng, 0, t + 50));
    eng.tick(t + 50 + FEEDBACK_MS);
    const a = eng.result();
    a.trials[0].rt = -1;
    a.metrics.correct = 42;
    a.trials.push({ onset: 0, rt: 0, correct: true });
    const b = eng.result();
    expect(b.trials).toHaveLength(1);
    expect(b.trials[0].rt).not.toBe(-1);
    expect(b.metrics.correct).toBeLessThanOrEqual(1);
  });

  it('snapshot() 的数组是拷贝：外部 push 不改内部，且连续两帧给的是不同数组对象', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 1, 1);
    eng.start(0);
    eng.tick(500);
    const s1 = eng.snapshot();
    const arr = s1.fragments as unknown as [];
    arr.push({} as never);
    expect(eng.snapshot().fragments).toHaveLength(s1.fragments.length - 1);
    expect(eng.snapshot().fragments).not.toBe(s1.fragments);
  });

  it('重新 configure 清掉上一轮的一切残留（作废契约）', () => {
    const eng = new GestaltEngine();
    eng.configure(1, 1, 1);
    eng.start(0);
    const t = toAnswer(eng, 10);
    eng.input(answer(eng, 2, t + 1000));
    eng.tick(t + 1000 + MASK_MS);
    eng.tick(t + 1000 + FEEDBACK_MS);
    expect(eng.isDone()).toBe(true);
    // 同档位重开（SessionRunner 的作废重开 = 同 level + 新 seed）
    eng.configure(1, 2, 2);
    const s = eng.snapshot();
    expect(s.phase).toBe('idle');
    expect(s.done).toBe(false);
    expect(s.elapsedMs).toBe(0); // 时间基准归零，否则 start 前会漏出上一轮用时
    expect(s.answeredIndex).toBeNull();
    expect(s.correctIndex).toBeNull();
    expect(s.rtMs).toBe(0);
    expect(s.exposureMs).toBe(0);
    expect(s.fragments).toHaveLength(0);
    expect(s.mask).toHaveLength(0);
    expect(s.choices).toHaveLength(0);
    expect(s.timingValid).toBe(true);
    expect(() => eng.result()).toThrow(/not finished/);
  });

  it('reconfigure 之后必须换新图形：seed 参与目标与碎片生成', () => {
    const a = new GestaltEngine();
    a.configure(6, 100, 1);
    a.start(0);
    toAnswer(a, 10);
    const b = new GestaltEngine();
    b.configure(6, 101, 1);
    b.start(0);
    toAnswer(b, 10);
    expect(a.snapshot().choices.map((c) => c.id)).not.toEqual(b.snapshot().choices.map((c) => c.id));
  });

  it('复现性：同 (level, seed, roundNo) 两次 → snapshot 与 result 逐字段相等', () => {
    const run = (level: number, seed: number) => {
      const eng = new GestaltEngine();
      eng.configure(level, seed, 3);
      eng.start(0);
      const snaps: GestaltSnapshot[] = [];
      for (let t = 10; t <= 2000; t += 10) {
        eng.tick(t);
        snaps.push(eng.snapshot());
        if (eng.snapshot().phase === 'answer') {
          eng.input({ kind: 'choice', index: 1, t });
          break;
        }
      }
      eng.tick(2600);
      return { snaps, result: eng.result() };
    };
    for (const level of [1, 6, 12]) {
      const x = run(level, 2026);
      const y = run(level, 2026);
      expect(x.result).toEqual(y.result);
      expect(x.snaps.length).toBe(y.snaps.length);
      for (let i = 0; i < x.snaps.length; i++) {
        expect(x.snaps[i]).toEqual(y.snaps[i]);
      }
    }
  });
});
