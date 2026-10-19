import { describe, expect, it } from 'vitest';
import type { InputEvent, RoundResult, TrialRecord } from '../../core/types';
import { FEEDBACK_MS, FIXATION_MS, StroopEngine, correctSlot, type StroopSnapshot } from './engine';
import { STROOP_COLORS, TRIALS_PER_ROUND, conflictCount } from './rules';
import type { StroopRule } from './rules';

type StroopTrial = {
  onset: number;
  rt: number | null;
  correct: boolean;
  rule: StroopRule;
  conflict: boolean;
  word: number;
  ink: number;
  choice: number;
  slots: number[];
  textInk: (number | null)[];
};

const tr = (t: TrialRecord): StroopTrial => t as unknown as StroopTrial;
const SEEDS = Array.from({ length: 40 }, (_, i) => 101 + i);
const choiceAt = (index: number, t: number): InputEvent => ({ kind: 'choice', index, t });

function configured(level: number, seed: number, roundNo = 1): StroopEngine {
  const e = new StroopEngine();
  e.configure(level, seed, roundNo);
  e.start(0);
  e.tick(FIXATION_MS); // 第 1 试次进入反应窗，onset = 300
  return e;
}

// 从已 start 的引擎继续跑到 done。每 100ms 一帧，先取快照再喂帧，
// 于是「作答帧」总比 onset 晚一帧，rt 恰为 delayOf 给的毫秒数。
function finishRound(e: StroopEngine, delayOf: (s: StroopSnapshot) => number): RoundResult {
  let now = 0;
  while (!e.isDone()) {
    now += 100;
    const s = e.snapshot();
    if (s.phase === 'respond' && s.onsetMs !== null && now - s.onsetMs >= delayOf(s)) {
      e.input(choiceAt(correctSlot(s), now));
    }
    e.tick(now);
  }
  return e.result();
}

function playRound(level: number, seed: number, roundNo: number, delayOf: (s: StroopSnapshot) => number): RoundResult {
  const e = new StroopEngine();
  e.configure(level, seed, roundNo);
  e.start(0);
  return finishRound(e, delayOf);
}

const fast = (): number => 100;
const slowIf = (pred: (s: StroopSnapshot) => boolean): ((s: StroopSnapshot) => number) => (s) => (pred(s) ? 300 : 100);
const isConflict = (s: StroopSnapshot): boolean => s.conflict === true;
const switchCount = (rounds: RoundResult[]): number =>
  rounds.reduce((sum, r) => {
    let inner = 0;
    for (let i = 1; i < r.trials.length; i++) {
      if (tr(r.trials[i]).rule !== tr(r.trials[i - 1]).rule) inner += 1;
    }
    return sum + inner;
  }, 0);

describe('试次时间线（K6）', () => {
  it('注视 300ms 的两侧：299 不出词，300 出词并记下 onset', () => {
    const e = new StroopEngine();
    e.configure(1, 7, 1);
    e.start(0);
    e.tick(299);
    expect(e.snapshot().phase).toBe('fixation');
    expect(e.snapshot().word).toBeNull();
    expect(e.snapshot().onsetMs).toBeNull();
    e.tick(300);
    const s = e.snapshot();
    expect(s.phase).toBe('respond');
    expect(s.word).not.toBeNull();
    expect(s.ink).not.toBeNull();
    expect(s.onsetMs).toBe(300);
  });

  it('反应时 = 作答帧时间戳减 onset', () => {
    const e = configured(1, 7);
    expect(e.snapshot().onsetMs).toBe(300);
    e.input(choiceAt(correctSlot(e.snapshot()), 400));
    expect(e.snapshot().phase).toBe('feedback');
    const r = finishRound(e, fast);
    expect(tr(r.trials[0]).rt).toBe(100);
    expect(r.metrics.correct).toBe(12);
  });

  it('反馈 200ms 的两侧：199 毫秒还在反馈，200 毫秒进入下一试次注视', () => {
    const e = configured(1, 7);
    e.input(choiceAt(correctSlot(e.snapshot()), 400));
    e.tick(599);
    expect(e.snapshot().phase).toBe('feedback');
    expect(e.snapshot().trialNo).toBe(1);
    e.tick(600);
    const s = e.snapshot();
    expect(s.phase).toBe('fixation');
    expect(s.trialNo).toBe(2);
    expect(s.onsetMs).toBeNull();
    expect(s.correctCount).toBe(1);
    expect(s.feedbackChoice).toBeNull();
  });

  it('超时判定在 onset + timeoutMs 那一帧：2299 还在等，2300 记一次超时', () => {
    const e = configured(1, 7);
    e.tick(2299);
    expect(e.snapshot().phase).toBe('respond');
    expect(e.snapshot().timeoutCount).toBe(0);
    e.tick(2300);
    const s = e.snapshot();
    expect(s.phase).toBe('feedback');
    expect(s.timeoutCount).toBe(1);
  });

  it('注视期与反馈期的作答一律吞掉', () => {
    const e = new StroopEngine();
    e.configure(1, 7, 1);
    e.start(0);
    e.input(choiceAt(0, 100)); // 注视期
    expect(e.snapshot().correctCount).toBe(0);
    e.tick(300);
    e.input(choiceAt(correctSlot(e.snapshot()), 400));
    expect(e.snapshot().correctCount).toBe(1);
    e.input(choiceAt(0, 450)); // 反馈期
    expect(e.snapshot().correctCount).toBe(1);
    expect(e.snapshot().trialNo).toBe(1);
  });

  it('越界下标与非 choice 事件不改变状态', () => {
    const e = configured(1, 7);
    const before = e.snapshot();
    e.input(choiceAt(-1, 350));
    e.input(choiceAt(4, 350));
    e.input(choiceAt(99, 350));
    e.input({ kind: 'cell', index: 0, t: 350 });
    e.input({ kind: 'point', x: 1, y: 1, t: 350 });
    const after = e.snapshot();
    expect(after.phase).toBe('respond');
    expect(after.correctCount).toBe(0);
    expect(after.timeoutCount).toBe(0);
    expect(after.onsetMs).toBe(before.onsetMs);
    expect(after.options.length).toBe(2);
  });

  it('一轮 12 试次：全答对时 timeMs 6000 + Σdelay，第 12 次反馈结束才 done', () => {
    expect(playRound(1, 101, 1, fast).metrics.timeMs).toBe(7200);
    expect(playRound(1, 101, 1, slowIf(isConflict)).metrics.timeMs).toBe(8400);
    expect(playRound(1, 101, 1, () => 300).metrics.timeMs).toBe(9600);
    const r = playRound(1, 101, 1, fast);
    expect(r.trials.length).toBe(TRIALS_PER_ROUND);
    expect(r.metrics).toEqual({ correct: 12, timeouts: 0, trials: 12, timeMs: 7200 });
  });

  it('全程不作答：12 次超时，timeMs 由档位 1 的 2000ms 超时决定', () => {
    const r = playRound(1, 101, 1, () => Number.POSITIVE_INFINITY);
    expect(r.metrics).toEqual({ correct: 0, timeouts: 12, trials: 12, timeMs: 30000 });
    expect(r.trials.every((t) => tr(t).rt === null && t.correct === false)).toBe(true);
  });

  it('未跑完就取 result 会抛错', () => {
    const e = configured(1, 7);
    expect(() => e.result()).toThrow('stroop round is not finished');
  });

  it('时间戳单调：更晚取的 result 不受迟到帧影响', () => {
    const e = configured(1, 7);
    e.tick(2300); // 第 1 试次超时，反馈起点 2300
    const mid = e.snapshot();
    expect(mid.timeoutCount).toBe(1);
    e.tick(2000); // 迟到的帧
    const after = e.snapshot();
    expect(after.timeoutCount).toBe(1);
    expect(after.elapsedMs).toBe(mid.elapsedMs);
    expect(after.phase).toBe('feedback');
  });
});

describe('题面生成（spec 3.2 括注）', () => {
  it('选项数按档位，且选项标签取自色集', () => {
    expect(configured(1, 101).snapshot().options.length).toBe(2);
    expect(configured(3, 101).snapshot().options.length).toBe(4);
    const s = configured(2, 103).snapshot();
    expect(s.options.map((o) => o.label)).toEqual(s.options.map((o) => STROOP_COLORS[o.colorIdx].name));
    expect(new Set(s.options.map((o) => o.colorIdx)).size).toBe(3);
  });

  it('词和墨色都只在本轮调色板里取（选项数小于 4 时也一样）', () => {
    for (const seed of SEEDS) {
      const s = configured(2, seed).snapshot();
      const palette = new Set(s.options.map((o) => o.colorIdx));
      expect(palette.size).toBe(3);
      const r = playRound(2, seed, 1, fast);
      for (const t of r.trials) {
        expect(palette.has(tr(t).word)).toBe(true);
        expect(palette.has(tr(t).ink)).toBe(true);
      }
    }
  });

  it('冲突试次是每轮配额（K2），逐种子精确', () => {
    for (const seed of SEEDS) {
      expect(playRound(1, seed, 1, fast).trials.filter((t) => tr(t).conflict).length).toBe(conflictCount(1));
      expect(playRound(5, seed, 1, fast).trials.filter((t) => tr(t).conflict).length).toBe(conflictCount(5));
    }
    expect(conflictCount(5)).toBe(8);
  });

  it('一致试次词等于墨色，冲突试次两者不同', () => {
    const r = playRound(3, 101, 1, fast);
    for (const t of r.trials) {
      const c = tr(t);
      expect(c.conflict).toBe(c.word !== c.ink);
    }
  });

  it('正确选项：按颜色取墨色，按字义取词义', () => {
    const colorRound = configured(1, 101).snapshot();
    expect(colorRound.options[correctSlot(colorRound)].colorIdx).toBe(colorRound.ink);
    const wordRound = configured(4, 101, 2).snapshot();
    expect(wordRound.rule).toBe('word');
    expect(wordRound.options[correctSlot(wordRound)].colorIdx).toBe(wordRound.word);
  });

  it('correctSlot 在刺激未出现时抛错', () => {
    const e = new StroopEngine();
    e.configure(1, 5, 1);
    e.start(0);
    expect(() => correctSlot(e.snapshot())).toThrow('stroop stimulus is not visible');
  });
});

describe('规则模式与布局', () => {
  it('第 1/3 档整轮按颜色，第 4 档按轮号奇偶交替', () => {
    for (const level of [1, 3]) {
      for (const roundNo of [1, 2, 3, 4]) {
        expect(playRound(level, 101, roundNo, fast).trials.every((t) => tr(t).rule === 'color')).toBe(true);
      }
    }
    expect(playRound(4, 101, 1, fast).trials.every((t) => tr(t).rule === 'color')).toBe(true);
    expect(playRound(4, 101, 2, fast).trials.every((t) => tr(t).rule === 'word')).toBe(true);
    expect(playRound(4, 101, 3, fast).trials.every((t) => tr(t).rule === 'color')).toBe(true);
    expect(playRound(4, 101, 4, fast).trials.every((t) => tr(t).rule === 'word')).toBe(true);
  });

  it('每试次切换（K1）：第 1 试次恒按颜色，按字义占比落在 0.35–0.65', () => {
    let word = 0;
    let total = 0;
    for (const seed of SEEDS) {
      const r = playRound(5, seed, 1, fast);
      expect(tr(r.trials[0]).rule).toBe('color');
      for (const t of r.trials) {
        total += 1;
        if (tr(t).rule === 'word') word += 1;
      }
    }
    const share = word / total;
    expect(share).toBeGreaterThanOrEqual(0.35);
    expect(share).toBeLessThanOrEqual(0.65);
  });

  it('每试次切换（K1）：切换频率随 switchProb 上升，第 5 档明显少于第 7 档', () => {
    const l5 = SEEDS.map((seed) => playRound(5, seed, 1, fast));
    const l7 = SEEDS.map((seed) => playRound(7, seed, 1, fast));
    const c5 = switchCount(l5);
    const c7 = switchCount(l7);
    // 期望值约 40*11*0.25=110 与 40*11*0.5=220；差 60 是宽余量，种子固定所以完全确定
    expect(c5).toBeLessThan(c7);
    expect(c7 - c5).toBeGreaterThan(60);
  });

  it('按钮位置「固定」是一轮一次乱序并沿用 12 试次，且不是死板的红绿蓝黄（K3）', () => {
    for (const seed of [101, 102, 103]) {
      const r = playRound(7, seed, 1, fast);
      const first = JSON.stringify(tr(r.trials[0]).slots);
      expect(r.trials.every((t) => JSON.stringify(tr(t).slots) === first)).toBe(true);
    }
    const orders = new Set(SEEDS.map((seed) => JSON.stringify(tr(playRound(7, seed, 1, fast).trials[0]).slots)));
    // 只要求「不是每次都同一份顺序」，不要求某个特定排列出现（那是概率而不是契约）
    expect(orders.size).toBeGreaterThan(1);
  });

  it('按钮位置「每试次打乱」：一轮内至少出现两种顺序', () => {
    for (const seed of [101, 102]) {
      const r = playRound(8, seed, 1, fast);
      const orders = new Set(r.trials.map((t) => JSON.stringify(tr(t).slots)));
      expect(orders.size).toBeGreaterThan(1);
      expect(r.trials.every((t) => tr(t).slots.length === 4)).toBe(true);
    }
  });

  it('干扰色是循环置换：没有自匹配、四色各出现一次（K4）', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const level of [9, 10]) {
        const r = playRound(level, seed, 1, fast);
        for (const t of r.trials) {
          const c = tr(t);
          expect(c.textInk.length).toBe(4);
          expect(c.textInk.every((v) => v !== null)).toBe(true);
          expect(c.textInk.every((v, j) => v !== c.slots[j])).toBe(true);
          expect(new Set(c.textInk).size).toBe(4);
        }
      }
    }
  });

  it('第 1 到第 8 档按钮字色为白（textInk 全 null）', () => {
    const r8 = playRound(8, 101, 1, fast);
    expect(r8.trials.every((t) => tr(t).textInk.every((v) => v === null))).toBe(true);
    const r1 = playRound(1, 101, 1, fast);
    expect(tr(r1.trials[0]).textInk).toEqual([null, null]);
  });
});

describe('configure 的全量重置（作废契约）', () => {
  it('重开一轮不会漏出上一轮的试次数、计数与时间基准', () => {
    const e = new StroopEngine();
    e.configure(1, 1, 1);
    e.start(0);
    e.tick(300);
    e.input(choiceAt(correctSlot(e.snapshot()), 400));
    e.tick(600);
    e.tick(900);
    e.input(choiceAt(correctSlot(e.snapshot()), 1000));
    expect(e.snapshot().trialNo).toBe(2);
    expect(e.snapshot().correctCount).toBe(2);
    expect(e.snapshot().elapsedMs).toBe(1000);

    e.configure(1, 2, 1);
    const s = e.snapshot();
    expect(s.done).toBe(false);
    expect(s.phase).toBe('fixation');
    expect(s.trialNo).toBe(1);
    expect(s.word).toBeNull();
    expect(s.onsetMs).toBeNull();
    expect(s.correctCount).toBe(0);
    expect(s.timeoutCount).toBe(0);
    expect(s.feedbackChoice).toBeNull();
    expect(s.elapsedMs).toBe(0);
    expect(e.isDone()).toBe(false);

    e.start(0);
    const r = finishRound(e, fast);
    // 12 个试次而不是 13；12 次正确而不是 14
    expect(r.trials.length).toBe(12);
    expect(r.metrics).toEqual({ correct: 12, timeouts: 0, trials: 12, timeMs: 7200 });
    expect(tr(r.trials[0]).onset).toBe(300);
  });

  it('同 seed 换轮号时规则序列跟着变，不漏上轮的规则', () => {
    const e = new StroopEngine();
    e.configure(4, 9, 4);
    e.start(0);
    expect(playRound(4, 9, 4, fast).trials.every((t) => tr(t).rule === 'word')).toBe(true);
    expect(playRound(4, 9, 1, fast).trials.every((t) => tr(t).rule === 'color')).toBe(true);
    expect(e.snapshot().rule).toBe('word');
  });
});

describe('快照与结果的副本契约', () => {
  it('snapshot 返回嵌套副本，改写它不影响引擎', () => {
    const e = configured(9, 101);
    const s = e.snapshot();
    s.options[0].label = '篡改';
    s.options.push(s.options[0]);
    const again = e.snapshot();
    expect(again.options.length).toBe(4);
    expect(again.options[0].label).not.toBe('篡改');
  });

  it('result 每次返回独立副本，timeMs 与 timingValid 固定', () => {
    const e = new StroopEngine();
    e.configure(1, 101, 1);
    e.start(0);
    const first = finishRound(e, fast);
    expect(first.timingValid).toBe(true);
    expect(first.level).toBe(1);
    expect(first.seed).toBe(101);
    first.trials.push(first.trials[0]);
    (first.trials[0] as Record<string, unknown>)['word'] = 99;
    const second = e.result();
    expect(second.trials.length).toBe(12);
    expect(tr(second.trials[0]).word).not.toBe(99);
    second.metrics.correct = 0;
    expect(e.result().metrics.correct).toBe(12);
  });

  it('快照字段：注视期 elapsedMs 从 start 起算，done 后冻结', () => {
    const e = new StroopEngine();
    e.configure(1, 101, 1);
    expect(e.snapshot().elapsedMs).toBe(0);
    e.start(0);
    e.tick(150);
    expect(e.snapshot().elapsedMs).toBe(150);
    expect(e.snapshot().done).toBe(false);
    const r = finishRound(e, fast);
    expect(e.snapshot().done).toBe(true);
    expect(e.snapshot().trialNo).toBe(12);
    expect(r.metrics.timeMs).toBe(7200);
    expect(e.snapshot().elapsedMs).toBe(7200);
    e.tick(99999);
    expect(e.snapshot().elapsedMs).toBe(7200);
  });
});
