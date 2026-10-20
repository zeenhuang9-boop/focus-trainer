import { describe, expect, it } from 'vitest';
import { SessionRunner } from '../../core/session';
import type { GameState, SessionRecord } from '../../core/types';
import { GAME_IDS } from '../../core/types';
import { SeqmemEngine } from './engine';
import type { SeqmemSnapshot } from './engine';
import { seqmem } from './index';
import { seqmemLevel } from './rules';

const STEP = 10;
const INIT: GameState = { gameId: 'seqmem', level: 1, passStreak: 0, failStreak: 0, lastPlayedDayKey: null };

// 裁定 F-1：帧序列用整数下标算时间，绝不写 for (let t = from; t <= to; t += STEP) 的浮点累加
// ——累加误差会让末帧落到 to 之前，而本文件的回放收尾帧（6450）恰好就是终结帧。
function range(from: number, to: number): number[] {
  const out: number[] = [];
  const n = Math.floor((to - from) / STEP);
  for (let i = 0; i <= n; i++) out.push(from + i * STEP);
  return out;
}

const snapOf = (runner: SessionRunner): SeqmemSnapshot => runner.engine.snapshot() as SeqmemSnapshot;

// 只在 runner 处于 playing 时才真正转发帧；phase 一旦离开 playing，tick 就是 no-op（session.ts:77）
function frames(runner: SessionRunner, list: readonly number[]): number[] {
  const lit: number[] = [];
  for (const t of list) {
    runner.tick(t);
    const s = snapOf(runner);
    if (s.litIndex !== null && s.litIndex !== lit[lit.length - 1]) lit.push(s.litIndex);
  }
  return lit;
}

// 采样到「相位离开 show」为止：亮格顺序 + 那一帧的时刻
function watchOnce(runner: SessionRunner, from: number): { seq: number[]; t: number } {
  const seq: number[] = [];
  for (let i = 0; ; i++) {
    const t = from + i * STEP; // F-1：按下标算，不累加
    runner.tick(t);
    const s = snapOf(runner);
    if (s.litIndex !== null && s.litIndex !== seq[seq.length - 1]) seq.push(s.litIndex);
    if (s.phase !== 'show') return { seq, t };
  }
}

// 推进到下一条序列开播（或本轮结束）
function advance(runner: SessionRunner, from: number): number {
  for (let i = 0; ; i++) {
    const t = from + i * STEP; // F-1：按下标算，不累加
    runner.tick(t);
    const s = snapOf(runner);
    if (s.phase === 'show' || s.done) return t;
    if (t >= from + 200000) return t;
  }
}

function playRound(runner: SessionRunner, from: number, mode: 'clean' | 'wrong-first'): void {
  const lv = seqmemLevel(runner.snapshot().level);
  const total = lv.size * lv.size;
  let t = from;
  while (runner.snapshot().phase === 'playing') {
    const shown = watchOnce(runner, t);
    // 「必定错」的第一击：逆序档的期望首格是 seq 的末格，不能拿 seq[0] 去 +1
    const expectFirst = lv.dir === 'fwd' ? shown.seq[0] : shown.seq[shown.seq.length - 1];
    const order = mode === 'clean' ? lv.dir === 'fwd' ? [...shown.seq] : [...shown.seq].reverse() : [(expectFirst + 1) % total];
    let at = shown.t + 50;
    for (const cell of order) {
      if (runner.snapshot().phase !== 'playing') break; // 上一击已经把本轮结束掉了
      runner.input({ kind: 'cell', index: cell, t: at });
      at += 50;
    }
    t = advance(runner, at);
  }
}

// 一整次训练：轮间是 'tap'，所以由测试自己 beginRound 并把绝对时刻往前推
function session(
  seed: number,
  level: number,
  modes: readonly ('clean' | 'wrong-first')[],
): { record: SessionRecord; state: GameState } {
  const runner = new SessionRunner(seqmem, { ...INIT, level }, 'plan', seed, seed);
  let t = 0;
  runner.beginRound(t);
  for (const mode of modes) {
    playRound(runner, t, mode);
    t += 1000000;
    if (!runner.isFinished()) runner.beginRound(t);
  }
  // finish() 只能调一次（session.ts:102 的 saved 闸门），所以取一份再拆
  const out = runner.finish('2026-10-19');
  return { record: out.record, state: out.state };
}

describe('seqmem GameModule', () => {
  it('元数据符合 spec §3.3 与 §5.2', () => {
    expect(seqmem).toMatchObject({
      id: 'seqmem',
      name: '序列记忆',
      ability: '工作记忆',
      maxLevel: 10,
      roundsPerSession: 3,
      roundBreak: 'tap',
      staircase: { upAfter: 1, downAfter: 1 },
    });
    expect(GAME_IDS).toContain(seqmem.id);
    // 说明页必须把「倒着点」和「点错就结束」这两条说出来，否则玩家第一次碰到 8 档会以为是 bug
    expect(seqmem.instructions).toContain('倒着');
    expect(seqmem.instructions).toContain('回放');
    expect(seqmem.instructions.length).toBeGreaterThan(40);
  });

  it('createEngine 给一个未结束的新引擎；createView 是函数（DOM 行为见 view.test.ts）', () => {
    const eng = seqmem.createEngine();
    expect(eng).toBeInstanceOf(SeqmemEngine);
    expect(eng.isDone()).toBe(false);
    expect(typeof seqmem.createView).toBe('function');
  });

  it('正序档完整 3 轮（第 1 轮全对、后 2 轮首串就错）→ record 全字段字面可预测', () => {
    const { record, state } = session(2026, 1, ['clean', 'wrong-first', 'wrong-first']);
    expect(record.gameId).toBe('seqmem');
    expect(record.mode).toBe('plan');
    expect(record.dayKey).toBe('2026-10-19');
    expect(record.startLevel).toBe(1);
    expect(record.endLevel).toBe(1);
    expect(record.durationMs).toBeGreaterThan(0);
    // 三轮都是计分轮：pass → 升 2 档，fail → 降回 1，fail → 已在 1 档夹住
    expect(record.rounds.map((r) => r.roundNo)).toEqual([1, 2, 3]);
    expect(record.rounds.map((r) => r.level)).toEqual([1, 2, 1]);
    expect(record.rounds.map((r) => r.outcome)).toEqual(['pass', 'fail', 'fail']);
    expect(record.rounds.map((r) => r.counted)).toEqual([true, true, true]);
    expect(record.rounds.map((r) => r.score01)).toEqual([1, 0, 0]);
    // 第 1 轮把长度从 3 加到 9（L0+6），7 条全对；后两轮各 1 条、0 条对
    expect(record.rounds.map((r) => r.metrics.spans)).toEqual([7, 1, 1]);
    expect(record.rounds.map((r) => r.metrics.spansCorrect)).toEqual([7, 0, 0]);
    expect(record.rounds.map((r) => r.metrics.fwdSpan)).toEqual([9, 0, 0]);
    expect(record.rounds.map((r) => r.metrics.revSpan)).toEqual([0, 0, 0]);
    expect(record.rounds.every((r) => r.timingValid)).toBe(true);
    // 结算：正序广度 9；回忆用时 = 第 k 条最后一次点击比播放结束晚 50×长度 毫秒
    // → 3..9 长度的 rt 是 150..450，合计 2100 / 7 = 300
    expect(record.summary).toEqual({ fwdSpan: 9, revSpan: 0, spans: 9, spansCorrect: 7, avgRecallMs: 300 });
    expect(seqmem.formatSummary(record.summary)).toEqual([
      { label: '正序最大广度', value: '9 格' },
      { label: '逆序最大广度', value: '—' },
      { label: '答对序列', value: '7 / 9 条' },
      { label: '平均回忆用时', value: '0.3 秒' },
    ]);
    // abilityIndex：counted 三轮的后半（ceil(3/2)=2）→ 第 2、3 轮的 (level-1+score01) 是 1 与 0，
    // 均值 0.5 → round(100×0.5/10) = 5
    expect(record.ability).toBe(5);
    expect(state).toEqual({ gameId: 'seqmem', level: 1, passStreak: 0, failStreak: 0, lastPlayedDayKey: '2026-10-19' });
  });

  it('逆序档（8 档）走通：revSpan 有值、fwdSpan 恒 0', () => {
    const { record } = session(2026, 8, ['clean', 'wrong-first', 'wrong-first']);
    expect(record.rounds.map((r) => r.level)).toEqual([8, 9, 8]);
    expect(record.rounds.map((r) => r.outcome)).toEqual(['pass', 'fail', 'fail']);
    expect(record.rounds[0].metrics.spansCorrect).toBe(7);
    // 8 档 L0=4、上限 4+6=10；9 档 L0=5
    expect(record.rounds.map((r) => r.metrics.revSpan)).toEqual([10, 0, 0]);
    expect(record.rounds.map((r) => r.metrics.fwdSpan)).toEqual([0, 0, 0]);
    expect(record.summary.revSpan).toBe(10);
    expect(record.summary.fwdSpan).toBe(0);
  });

  it('播放期掉帧的那一轮：counted:false、档位不动、轮号复用、seed 递增', () => {
    const runner = new SessionRunner(seqmem, INIT, 'plan', 7, 7);
    runner.beginRound(0);
    // 0..750 正常，然后跳过 760..890 直接 900 → 150ms 间隔落在 show 相位
    const seq = frames(runner, [...range(0, 750), 900, ...range(910, 3000)]);
    expect(seq).toHaveLength(3);
    expect(runner.snapshot().phase).toBe('playing');
    runner.input({ kind: 'cell', index: (seq[0] + 1) % 9, t: 3050 });
    frames(runner, range(3450, 6450)); // 定格 + 回放 → 引擎结束 → runner 结算这一轮
    const s = runner.snapshot();
    expect(s.phase).toBe('between');
    expect(s.waitingForTap).toBe(true); // roundBreak 是 'tap'，不是 AUTO_BREAK_MS
    expect(s.lastInvalid).toBe(true);
    expect(s.lastOutcome).toBeNull();
    expect(s.lastLevelChange).toBe(0);
    expect(s.level).toBe(1);
    expect(s.roundNo).toBe(1);

    // 补轮：同 roundNo、新 seed（seed + attempt），引擎状态是干净的
    runner.beginRound(1000000);
    const fresh = snapOf(runner);
    expect(fresh.done).toBe(false);
    expect(fresh.spanNo).toBe(1);
    expect(fresh.elapsedMs).toBe(0);
    expect(fresh.phase).toBe('show');
    let t = 1000000;
    for (const mode of ['clean', 'wrong-first', 'wrong-first'] as const) {
      playRound(runner, t, mode);
      t += 1000000;
      if (!runner.isFinished()) runner.beginRound(t);
    }
    expect(runner.isFinished()).toBe(true);
    const { record } = runner.finish('2026-10-19');
    // 作废轮也在 rounds 里，但 counted:false；它存的 outcome 是 judge 的结果（那轮 0 条对 → fail），
    // 不是被强制改写的 hold —— 强制 hold 只发生在 retriesUsed 用尽之后（session.ts:143）。
    expect(record.rounds.map((r) => r.counted)).toEqual([false, true, true, true]);
    expect(record.rounds.map((r) => r.roundNo)).toEqual([1, 1, 2, 3]);
    expect(record.rounds.map((r) => r.outcome)).toEqual(['fail', 'pass', 'fail', 'fail']);
    expect(record.rounds.map((r) => r.level)).toEqual([1, 1, 2, 1]);
    // 作废轮的 seed 是 7 + attempt0，补轮是 7 + attempt1：同档位换题面
    expect(record.rounds.map((r) => r.seed)).toEqual([7, 8, 9, 10]);
    // 作废轮不参与结算：与上面「正序档完整 3 轮」的 summary 完全一致
    expect(record.summary).toEqual({ fwdSpan: 9, revSpan: 0, spans: 9, spansCorrect: 7, avgRecallMs: 300 });
  });
});
