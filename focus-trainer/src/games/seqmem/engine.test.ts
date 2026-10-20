import { describe, expect, it } from 'vitest';
import type { RoundResult } from '../../core/types';
import { FRAME_MS, REVEAL_MS, SeqmemEngine } from './engine';
import type { SeqmemSnapshot } from './engine';
import { capSpan, seqmemLevel, soaMs } from './rules';

// 帧网格 10ms：既 <= FRAME_MS（不触发作废），又能精确踩中所有档位边界（spec 表的 d/g 全是 10 的倍数）
const STEP = 10;

function fresh(level: number, seed = 42, roundNo = 1, start = 0): SeqmemEngine {
  const eng = new SeqmemEngine();
  eng.configure(level, seed, roundNo);
  eng.start(start);
  return eng;
}

// 从 from 起按帧网格推进，返回相位第一次满足 cond 的那一帧
// F-1：帧时刻一律整数下标换算（from + i * STEP），不许 t += STEP 累加。
// epoch 毫秒原点（1.7e12，ulp = 2^-12 ≈ 0.000244）配分数步长时累加必带漂移，
// 末帧会落在边界之前、永远喂不到断言依赖的那一帧（见下方 F-1 用例的实测数字）。
function tickUntil(
  eng: SeqmemEngine,
  from: number,
  cond: (s: SeqmemSnapshot) => boolean,
  limit = 120000,
): { t: number; s: SeqmemSnapshot } {
  const maxI = Math.ceil(limit / STEP);
  for (let i = 0; ; i++) {
    const t = from + i * STEP;
    eng.tick(t);
    const s = eng.snapshot();
    if (cond(s)) return { t, s };
    if (i >= maxI) return { t, s };
  }
}

// 观察播放：把亮过的格按顺序收集起来，直到相位变成 recall。
// 「与上一个不同就记录」之所以等价于播放顺序，是因为 makeSpan 保证相邻两项不同（裁定 R-2）。
function watchShow(eng: SeqmemEngine, from: number): { seq: number[]; t: number; s: SeqmemSnapshot } {
  const seq: number[] = [];
  for (let i = 0; ; i++) {
    const t = from + i * STEP; // F-1：整数下标，不累加
    eng.tick(t);
    const s = eng.snapshot();
    if (s.litIndex !== null && s.litIndex !== seq[seq.length - 1]) seq.push(s.litIndex);
    if (s.phase === 'recall') return { seq, t, s };
  }
}

// 按当前档位方向给出「正确应答顺序」：逆序档要倒着点（spec:96）
function answerOrder(seq: readonly number[], dir: 'fwd' | 'rev'): number[] {
  return dir === 'fwd' ? [...seq] : [...seq].reverse();
}

describe('SeqmemEngine 配置与播放', () => {
  it('FRAME_MS 与 REVEAL_MS 是 spec 字面值', () => {
    expect(FRAME_MS).toBe(50);
    expect(REVEAL_MS).toBe(400);
  });

  it('configure 后未 start 的快照是 idle 空态', () => {
    const eng = new SeqmemEngine();
    eng.configure(1, 42, 1);
    expect(eng.snapshot()).toEqual({
      size: 3,
      cells: 9,
      phase: 'idle',
      dir: 'fwd',
      span: 3,
      capSpan: 9,
      spanNo: 1,
      correct: 0,
      litIndex: null,
      tapped: [],
      wrongIndex: null,
      elapsedMs: 0,
      done: false,
    });
    expect(eng.isDone()).toBe(false);
  });

  it('level 1 的播放时刻表逐帧可预测：亮 800 停 300，三格后开回忆', () => {
    const known = watchShow(fresh(1, 42, 1, 0), 0);
    expect(known.seq).toHaveLength(3);
    expect(known.t).toBe(3000); // showEndAt = (3-1)*1100 + 800
    const eng = fresh(1, 42, 1, 0);
    const marks = [0, 790, 800, 1090, 1100, 1890, 1900, 2190, 2200, 2990, 3000];
    const snaps = marks.map((t) => {
      eng.tick(t);
      return eng.snapshot();
    });
    const [a, b, c] = known.seq;
    // brief 期望值勘误：spec:96「亮 d ms 间隔 g ms」→ 第 2 格点亮窗口是 [1100,1900)，
    // 所以 1890 仍在亮（b），1900 才灭。brief 此处误抄成 null（与它自己的 showEndAt=3000 也矛盾）。
    expect(snaps.map((s) => s.litIndex)).toEqual([a, a, null, null, b, b, null, null, c, c, null]);
    expect(snaps.map((s) => s.phase)).toEqual([
      'show', 'show', 'show', 'show', 'show', 'show', 'show', 'show', 'show', 'show', 'recall',
    ]);
    // 亮格下标两两不同，且都落在 3×3 内
    expect(new Set(known.seq).size).toBe(3);
    expect(known.seq.every((x) => x >= 0 && x < 9)).toBe(true);
  });

  it('每一档的回忆开口时刻 = (L0-1)*SOA + d，序列长度 = L0', () => {
    for (let level = 1; level <= 10; level++) {
      const lv = seqmemLevel(level);
      const eng = fresh(level, 555 + level, 1, 1000);
      const got = watchShow(eng, 1000);
      expect(got.seq).toHaveLength(lv.l0);
      expect(got.t).toBe(1000 + (lv.l0 - 1) * soaMs(lv) + lv.onMs);
      expect(got.s.phase).toBe('recall');
      expect(got.s.span).toBe(lv.l0);
      expect(got.s.capSpan).toBe(capSpan(lv));
      expect(got.s.dir).toBe(lv.dir);
      expect(got.s.size).toBe(lv.size);
      expect(got.s.cells).toBe(lv.size * lv.size);
    }
  });

  it('播放相位的任何点击都被忽略，且不推进时间基准、不留 trial', () => {
    const eng = fresh(1, 42, 1, 0);
    eng.tick(300);
    const before = eng.snapshot();
    for (const t of [320, 600, 900, 2500]) {
      eng.input({ kind: 'cell', index: t % 9, t });
    }
    eng.input({ kind: 'choice', index: 0, t: 700 });
    eng.input({ kind: 'point', x: 0.5, y: 0.5, t: 700 });
    expect(eng.snapshot()).toEqual(before);
    expect(eng.isDone()).toBe(false);
  });

  it('同 (level, seed, roundNo) 两次 configure 的播放帧序列一致，换 seed 不一致', () => {
    const run = (seed: number): (number | null)[] => {
      const eng = fresh(3, seed, 1, 0);
      const marks: (number | null)[] = [];
      const n = Math.floor(3000 / 20); // F-1：整数下标算帧时刻
      for (let i = 0; i <= n; i++) {
        eng.tick(i * 20);
        marks.push(eng.snapshot().litIndex);
      }
      return marks;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
    expect(run(42).filter((x) => x !== null).length).toBeGreaterThan(0);
  });

  it('snapshot 的 tapped 数组每次新建，视图拿到的是拷贝', () => {
    const eng = fresh(1, 42, 1, 0);
    eng.tick(0);
    const a = eng.snapshot();
    const b = eng.snapshot();
    expect(a.tapped).toEqual([]);
    expect(a.tapped).not.toBe(b.tapped);
    a.tapped.push(99);
    expect(eng.snapshot().tapped).toEqual([]);
  });
});

describe('SeqmemEngine 回忆判定', () => {
  it('按原顺序点回整串 → 记一条正确 trial，定格 400ms 后长度 +1 并播新序列', () => {
    const eng = fresh(1, 42, 1, 0);
    const first = watchShow(eng, 0);
    const order = answerOrder(first.seq, 'fwd');
    // 首击 3200、尾击 3300：revealUntil = 3700，正好踩在 10ms 帧网格上，
    // 让「3690 仍定格 / 3700 才开播」两条断言可判定（brief 原注释的 3050+2×50 与其期望落点矛盾）。
    let at = first.t + 200;
    for (const cell of order) {
      eng.input({ kind: 'cell', index: cell, t: at });
      at += 50;
    }
    expect(eng.snapshot().phase).toBe('reveal');
    expect(eng.snapshot().tapped).toEqual(order);
    expect(eng.snapshot().correct).toBe(1);
    expect(eng.snapshot().span).toBe(3);
    eng.tick(3690);
    expect(eng.snapshot().phase).toBe('reveal');
    eng.tick(3700);
    const s = eng.snapshot();
    expect(s.phase).toBe('show');
    expect(s.spanNo).toBe(2);
    expect(s.span).toBe(4);
    expect(s.tapped).toEqual([]);
    expect(s.wrongIndex).toBeNull();
    expect(s.correct).toBe(1);
    // 新序列的播放起点 = 跨过 revealUntil 的那一帧，所以 showEndAt 可以逐字算出来
    const second = watchShow(eng, 3700);
    expect(second.seq).toHaveLength(4);
    expect(second.t).toBe(3700 + 3 * 1100 + 800);
  });

  it('逆序档按倒序点回算对；按原序点回一定在本串内被判错', () => {
    const ok = fresh(8, 42, 1, 0); // 8 档：rev、4×4、L0=4、on 650、gap 240 → SOA 890
    const shown = watchShow(ok, 0);
    expect(shown.t).toBe(3 * 890 + 650);
    let at = shown.t + 40;
    for (const cell of answerOrder(shown.seq, 'rev')) {
      ok.input({ kind: 'cell', index: cell, t: at });
      at += 40;
    }
    expect(ok.snapshot().phase).toBe('reveal');
    expect(ok.snapshot().correct).toBe(1);
    expect(ok.snapshot().wrongIndex).toBeNull();

    const bad = fresh(8, 42, 1, 0);
    const again = watchShow(bad, 0);
    expect(again.seq).toEqual(shown.seq); // 同 (level, seed, roundNo) 出同一条序列
    // 正序点回逆序档一定被判错：长度 4 的回文要求 seq[1] === seq[2]，而那正好被「相邻不等」禁掉
    let t = again.t + 40;
    let flagged = false;
    for (const cell of again.seq) {
      bad.input({ kind: 'cell', index: cell, t });
      t += 40;
      if (bad.snapshot().wrongIndex !== null) {
        flagged = true;
        break;
      }
    }
    expect(flagged).toBe(true);
    expect(bad.snapshot().phase).toBe('reveal');
    expect(bad.snapshot().correct).toBe(0);
  });

  it('点错一格 → 定格 400ms → 原序回放一次 → 回放结束才 isDone，result 全字段可预测', () => {
    const eng = fresh(1, 42, 1, 0);
    const shown = watchShow(eng, 0);
    const wrong = (shown.seq[0] + 1) % 9; // 一定不等于期望的第一击，不依赖具体序列内容
    eng.input({ kind: 'cell', index: wrong, t: 3100 });
    expect(eng.snapshot().phase).toBe('reveal');
    expect(eng.snapshot().wrongIndex).toBe(wrong);
    expect(eng.snapshot().correct).toBe(0);
    expect(eng.isDone()).toBe(false);
    eng.tick(3490);
    expect(eng.snapshot().phase).toBe('reveal');
    eng.tick(3500);
    // 回放：按播放顺序重播，wrongIndex 在回放开始时清掉
    const replay: number[] = [];
    let t = 3500;
    for (let i = 0; eng.snapshot().phase === 'replay'; i++) {
      t = 3500 + i * STEP; // F-1：整数下标算帧时刻
      eng.tick(t);
      const lit = eng.snapshot().litIndex;
      if (lit !== null && lit !== replay[replay.length - 1]) replay.push(lit);
      if (eng.snapshot().phase !== 'replay') break;
    }
    expect(replay).toEqual(shown.seq);
    expect(eng.snapshot().wrongIndex).toBeNull();
    expect(eng.snapshot().phase).toBe('done');
    expect(eng.snapshot().done).toBe(true);
    expect(eng.isDone()).toBe(true);
    expect(t).toBe(3500 + 2 * 1100 + 800);
    const r = eng.result();
    expect(r).toEqual({
      level: 1,
      seed: 42,
      trials: [{ onset: 0, rt: 100, correct: false, span: 3, dir: 'fwd', taps: 0 }],
      metrics: {
        timeMs: 6500,
        spans: 1,
        spansCorrect: 0,
        bestSpan: 0,
        fwdSpan: 0,
        revSpan: 0,
        recallSumMs: 0,
        cap: 9,
      },
      timingValid: true,
    });
  });

  it('一路答对到长度上限 L0+6：第 7 条点对就立刻结束，不再播新序列', () => {
    const eng = fresh(1, 42, 1, 0);
    let t = 0;
    for (let k = 1; k <= 7; k++) {
      const shown = watchShow(eng, t);
      expect(shown.seq).toHaveLength(k + 2); // 1 档 L0 = 3，第 k 条长度 = k + 2
      let at = shown.t + 50;
      for (const cell of answerOrder(shown.seq, 'fwd')) {
        eng.input({ kind: 'cell', index: cell, t: at });
        at += 50;
      }
      if (k < 7) {
        const next = tickUntil(eng, at, (s) => s.phase === 'show');
        expect(next.s.spanNo).toBe(k + 1);
        t = next.t;
      } else {
        expect(eng.snapshot().phase).toBe('done');
        expect(eng.isDone()).toBe(true);
      }
    }
    const r = eng.result();
    expect(r.trials.map((x) => x.span)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(r.trials.every((x) => x.correct)).toBe(true);
    expect(r.trials.map((x) => x.taps)).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(r.metrics.spans).toBe(7);
    expect(r.metrics.spansCorrect).toBe(7);
    expect(r.metrics.bestSpan).toBe(9);
    expect(r.metrics.fwdSpan).toBe(9);
    expect(r.metrics.revSpan).toBe(0);
    expect(r.metrics.cap).toBe(9);
  });

  it('点错后追加的点击被忽略；未结束时 result() 抛错', () => {
    const eng = fresh(1, 42, 1, 0);
    const shown = watchShow(eng, 0);
    eng.input({ kind: 'cell', index: shown.seq[0], t: 3050 });
    eng.input({ kind: 'cell', index: shown.seq[0], t: 3060 });
    expect(eng.snapshot().tapped).toEqual([shown.seq[0]]);
    expect(() => eng.result()).toThrow('seqmem round is not finished');
    eng.input({ kind: 'cell', index: (shown.seq[0] + 1) % 9, t: 3070 });
    eng.input({ kind: 'cell', index: shown.seq[0], t: 3080 });
    expect(eng.snapshot().tapped).toEqual([shown.seq[0]]);
  });

  it('result() 给出的是拷贝：改一份不影响下一次调用', () => {
    const eng = fresh(1, 42, 1, 0);
    const shown = watchShow(eng, 0);
    eng.input({ kind: 'cell', index: (shown.seq[0] + 1) % 9, t: 3100 });
    tickUntil(eng, 3500, (s) => s.done);
    const a = eng.result();
    expect(a.trials).toHaveLength(1);
    a.trials[0].rt = -1;
    a.metrics.spans = 99;
    const b = eng.result();
    expect(b.trials[0].rt).toBe(100);
    expect(b.metrics.spans).toBe(1);
    expect(a.trials[0]).not.toBe(b.trials[0]);
  });

  it('result() 可复现：同 seed 同输入序列，两次完整跑出的 result 逐字段相等', () => {
    const play = () => {
      const eng = fresh(1, 42, 1, 0);
      const shown = watchShow(eng, 0);
      eng.input({ kind: 'cell', index: (shown.seq[0] + 1) % 9, t: 3100 });
      tickUntil(eng, 3500, (s) => s.done);
      return eng.result();
    };
    const r1 = play();
    const r2 = play();
    expect(r1).toEqual(r2);
    // 逐字段比对（toEqual 是深比较，这里再点名下每个字段的相等性，防止「整体相等但字段漂移」）
    expect(r1.level).toBe(r2.level);
    expect(r1.seed).toBe(r2.seed);
    expect(r1.trials).toEqual(r2.trials);
    expect(r1.metrics).toEqual(r2.metrics);
    expect(r1.timingValid).toBe(r2.timingValid);
    expect(r1.trials).not.toBe(r2.trials);
  });
});

const GRID = 50; // = FRAME_MS，恰好「等于」阈值，严格大于才作废

// F-1：整数下标算时刻，不许浮点累加。
// 旧写法 for (let t = from; t <= to; t += step) 在 epoch 毫秒原点（1.7e12，ulp = 2^-12 ≈ 0.000244）
// 配分数步长（如 rAF 的 1000/60）时误差逐步累积，末帧落在 1700000002983.348 < to，
// 断言依赖的边界帧（showEndAt / 超时判定）永远喂不到。下方 F-1 用例锁住这个行为。
function range(from: number, to: number, step = GRID): number[] {
  const out: number[] = [];
  const n = Math.floor((to - from) / step);
  for (let i = 0; i <= n; i++) out.push(from + i * step);
  return out;
}

// 按给定帧序列采样亮格（show / replay 都适用），返回实际亮过的格序
function collectShow(eng: SeqmemEngine, frames: readonly number[]): number[] {
  const seq: number[] = [];
  for (const t of frames) {
    eng.tick(t);
    const lit = eng.snapshot().litIndex;
    if (lit !== null && lit !== seq[seq.length - 1]) seq.push(lit);
  }
  return seq;
}

// 播放 → 点错一格 → 定格 → 回放 → 结束。播放帧由调用方给（用来造掉帧），其余按 50ms 网格走。
function finishByWrongTap(eng: SeqmemEngine, playFrames: readonly number[]): RoundResult {
  const seq = collectShow(eng, playFrames);
  const recallAt = playFrames[playFrames.length - 1];
  expect(eng.snapshot().phase).toBe('recall');
  eng.input({ kind: 'cell', index: (seq[0] + 1) % 9, t: recallAt + 50 });
  collectShow(eng, range(recallAt + 450, recallAt + 450 + 3000));
  expect(eng.isDone()).toBe(true);
  return eng.result();
}

// 一路答到底（7 条序列）的整轮剧本：输入完全由观察到的亮格与帧网格决定，不含任何随机性
function playCleanRound(level: number, seed: number): RoundResult {
  const eng = fresh(level, seed, 1, 0);
  const lv = seqmemLevel(level);
  let t = 0;
  for (;;) {
    const shown = watchShow(eng, t);
    let at = shown.t + 50;
    for (const cell of answerOrder(shown.seq, lv.dir)) {
      eng.input({ kind: 'cell', index: cell, t: at });
      at += 50;
    }
    if (eng.isDone()) break;
    t = tickUntil(eng, at, (s) => s.phase === 'show').t;
  }
  return eng.result();
}

describe('SeqmemEngine 帧间隔判定', () => {
  it('阈值是「严格大于 FRAME_MS」：50ms 网格不作废，51ms 间隔就作废', () => {
    expect(finishByWrongTap(fresh(1, 42, 1, 0), range(0, 3000)).timingValid).toBe(true);
    // 950 → 1001 是 51ms（一帧的抖动），其余仍是 50ms 网格
    const jitter = [...range(0, 950), ...range(1001, 3001)];
    expect(finishByWrongTap(fresh(1, 42, 1, 0), jitter).timingValid).toBe(false);
  });

  it('只判播放相位：回忆期与定格期的长间隔不作废，回放期的一帧超时照样作废', () => {
    // (a) 播放 50ms 网格正常，回忆期跳一大段（用户在想）→ 仍有效
    const thinking = fresh(1, 42, 1, 0);
    const seq = collectShow(thinking, range(0, 3000));
    thinking.input({ kind: 'cell', index: (seq[0] + 1) % 9, t: 3050 });
    expect(thinking.snapshot().phase).toBe('reveal');
    thinking.tick(20000); // 定格期被拉长到 16.5 秒：不是卡顿
    expect(thinking.snapshot().phase).toBe('replay');
    collectShow(thinking, range(20000, 23000));
    expect(thinking.result().timingValid).toBe(true);

    // (b) 回放（也是播放相位）掉一帧 → 作废
    const stalling = fresh(1, 42, 1, 0);
    const seq2 = collectShow(stalling, range(0, 3000));
    stalling.input({ kind: 'cell', index: (seq2[0] + 1) % 9, t: 3050 });
    stalling.tick(3450);
    expect(stalling.snapshot().phase).toBe('replay');
    // 3550 → 3701 是 151ms；尾部给到 6451 才能踩中 showEndAt = 6450
    collectShow(stalling, [...[3500, 3550, 3701], ...range(3751, 6500)]);
    expect(stalling.isDone()).toBe(true);
    expect(stalling.result().timingValid).toBe(false);
  });

  it('掉帧只影响 timingValid，不影响 result 的其他字面值（且标志不会被后续干净帧清掉）', () => {
    const clean = finishByWrongTap(fresh(1, 42, 1, 0), range(0, 3000));
    // 750 → 900 掉一帧，之后的回放帧仍是 50ms 网格：违规发生在过去，标志必须粘住
    const dirty = finishByWrongTap(fresh(1, 42, 1, 0), [...range(0, 750), ...range(900, 3000)]);
    expect(dirty.timingValid).toBe(false);
    expect({ ...dirty, timingValid: true }).toEqual(clean);
  });
});

describe('SeqmemEngine 帧网格夹具（F-1：整数下标算时刻）', () => {
  it('epoch 原点 + 分数步长：range 必须喂到名义末帧（浮点累加实测只喂到 180 帧、末帧差 16.65ms）', () => {
    const from = 1_700_000_000_000; // rAF 时间戳量级：ulp = 2^-12 ≈ 0.000244
    const step = 1000 / 60; // 60fps 帧长，二进制下是无限小数 → 累加必漂移
    const to = from + 3000;
    const frames = range(from, to, step);
    // 旧累加写法（node 实测）：180 帧，末帧 1700000002983.348 < to，第 181 帧永不喂出。
    expect(frames).toHaveLength(181);
    expect(frames[frames.length - 1]).toBe(from + 180 * step);
    expect(frames.every((t, i) => t === from + i * step)).toBe(true);
  });

  it('同一夹具喂引擎：末帧必须踩中 showEndAt 切到 recall，而不是差 16.65ms 卡在 show', () => {
    const E = 1_700_000_000_000;
    const eng = fresh(1, 42, 1, E); // 1 档：showEndAt = E + (3-1)*1100 + 800 = E + 3000
    collectShow(eng, range(E, E + 3000, 1000 / 60));
    expect(eng.snapshot().phase).toBe('recall');
  });
});

describe('SeqmemEngine 可复现性与 configure 全量重置', () => {
  it('同一 (level, seed, roundNo) 两次 configure：快照逐字段相等，整轮 result 逐字段相等', () => {
    for (const level of [1, 4, 8, 10]) {
      const a = new SeqmemEngine();
      const b = new SeqmemEngine();
      a.configure(level, 2026, 2);
      b.configure(level, 2026, 2);
      expect(a.snapshot()).toEqual(b.snapshot());
      const r1 = playCleanRound(level, 2026);
      const r2 = playCleanRound(level, 2026);
      expect(r1).toEqual(r2);
      expect(r1.trials.length).toBeGreaterThan(0);
      // brief 勘误：result() 不含播放内容（trial 只有标量字段），换 seed 的整轮 result 必然逐字段
      // 相同，原断言 not.toEqual(playCleanRound(level,2027)) 无法成立。防「恒同一串」的意图改由
      // 直接比对两个 seed 的首条播放序列来落实。
      const seq2026 = watchShow(fresh(level, 2026, 1, 0), 0).seq;
      const seq2027 = watchShow(fresh(level, 2027, 1, 0), 0).seq;
      expect(seq2027).not.toEqual(seq2026);
    }
  });

  it('跑到一半重新 configure：不留上一轮任何残留（时间、相位、trial、timing 标志全清）', () => {
    const dirty = new SeqmemEngine();
    dirty.configure(1, 42, 1);
    dirty.start(0);
    collectShow(dirty, [...range(0, 750), ...range(900, 3000)]); // 播放期掉一帧：timingOk 已脏
    dirty.input({ kind: 'cell', index: 0, t: 3050 });
    dirty.input({ kind: 'cell', index: 4, t: 3100 }); // 点对或点错都无所谓，只要状态被弄脏
    dirty.tick(9000);
    expect(dirty.snapshot().elapsedMs).toBeGreaterThan(0); // 确认它确实是「脏」的，别拿空引擎比

    const clean = new SeqmemEngine();
    clean.configure(1, 42, 3);
    dirty.configure(1, 42, 3); // roundNo 不参与出题（裁定 R-9），只有它跟上一轮不同
    expect(dirty.isDone()).toBe(false);
    expect(dirty.snapshot()).toEqual(clean.snapshot());

    dirty.start(0);
    clean.start(0);
    const frames = range(0, 3000);
    const seqA = collectShow(dirty, frames);
    const seqB = collectShow(clean, frames);
    expect(seqA).toEqual(seqB); // 帧采样序列一致：时间基准与 rng 流都归零了
    expect(dirty.snapshot()).toEqual(clean.snapshot());
    for (const eng of [dirty, clean]) eng.input({ kind: 'cell', index: (seqA[0] + 1) % 9, t: 3050 });
    for (const eng of [dirty, clean]) collectShow(eng, range(3450, 6450));
    expect(dirty.result()).toEqual(clean.result());
    expect(dirty.result().timingValid).toBe(true); // 上一轮的掉帧标志没漏进这一轮
  });
});
