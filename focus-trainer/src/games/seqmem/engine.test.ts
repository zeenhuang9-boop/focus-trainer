import { describe, expect, it } from 'vitest';
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
function tickUntil(
  eng: SeqmemEngine,
  from: number,
  cond: (s: SeqmemSnapshot) => boolean,
  limit = 120000,
): { t: number; s: SeqmemSnapshot } {
  let t = from;
  for (;;) {
    eng.tick(t);
    const s = eng.snapshot();
    if (cond(s)) return { t, s };
    if (t >= from + limit) return { t, s };
    t += STEP;
  }
}

// 观察播放：把亮过的格按顺序收集起来，直到相位变成 recall。
// 「与上一个不同就记录」之所以等价于播放顺序，是因为 makeSpan 保证相邻两项不同（裁定 R-2）。
function watchShow(eng: SeqmemEngine, from: number): { seq: number[]; t: number; s: SeqmemSnapshot } {
  const seq: number[] = [];
  let t = from;
  for (;;) {
    eng.tick(t);
    const s = eng.snapshot();
    if (s.litIndex !== null && s.litIndex !== seq[seq.length - 1]) seq.push(s.litIndex);
    if (s.phase === 'recall') return { seq, t, s };
    t += STEP;
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
      for (let t = 0; t <= 3000; t += 20) {
        eng.tick(t);
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
