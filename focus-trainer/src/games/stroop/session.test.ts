import { describe, expect, it } from 'vitest';
import { SessionRunner } from '../../core/session';
import { MemoryRepository } from '../../core/storage';
import type { GameState, Mode, TrialRecord } from '../../core/types';
import { correctSlot, type StroopSnapshot } from './engine';
import { stroop } from './index';

const NOW = new Date(2026, 9, 18, 10, 0).getTime();
const st = (level: number): GameState => ({
  gameId: 'stroop',
  level,
  passStreak: 0,
  failStreak: 0,
  lastPlayedDayKey: null,
});

interface Cell {
  onset: number;
  rt: number | null;
  correct: boolean;
  rule: 'color' | 'word';
  conflict: boolean;
}

const tr = (t: TrialRecord): Cell => t as unknown as Cell;

const fast = (): number => 100;
// 「难题」= 按颜色时的冲突试次 + 按字义时的一致试次；难题慢 200ms
const slowIfHard = (s: StroopSnapshot): number => {
  const hard = s.rule === 'color' ? s.conflict === true : s.conflict === false;
  return hard ? 300 : 100;
};

// ink/word 在注视期是 null；这里只在 phase==='respond' 的快照上调用，故 ! 有真实前提。
const target = (s: StroopSnapshot): number | null => (s.rule === 'color' ? s.ink : s.word);
const wrongSlot = (s: StroopSnapshot): number => s.options.findIndex((o) => o.colorIdx !== target(s)!);

interface Play {
  delayOf?: (s: StroopSnapshot) => number;
  slotOf?: (s: StroopSnapshot) => number;
  answer?: boolean;
  // 命中一次就作废当轮（只作废一次），用于验证补轮沿用轮号
  voidOnce?: (roundNo: number, answeredInRound: number) => boolean;
}

// 固定 100ms 帧率驱动整次训练：先取快照再喂帧，所以「作答帧」总比 onset 晚一帧，
// rt 恰好等于 delayOf 给的毫秒数。轮结束或作废后在同一帧立即 beginRound。
function playSession(state: GameState, seed: number, p: Play, mode: Mode = 'plan'): SessionRunner {
  const delayOf = p.delayOf ?? fast;
  const slotOf = p.slotOf ?? correctSlot;
  const answer = p.answer ?? true;
  const runner = new SessionRunner(stroop, state, mode, seed, NOW);
  let t = 0;
  let voided = false;
  while (!runner.isFinished()) {
    runner.beginRound(t);
    let answered = 0;
    for (;;) {
      t += 100;
      // 作废只对「正在玩」的一轮有意义：completeRound 在结束的同一帧就把 roundNo 推进到下一轮，
      // 不校验 phase 的话，上一轮攒下的 answered 会在新轮 beginRound 之前误触发一次空作废。
      const sess = runner.snapshot();
      if (p.voidOnce && !voided && sess.phase === 'playing' && p.voidOnce(sess.roundNo, answered)) {
        runner.voidCurrentRound();
        voided = true;
        break;
      }
      const s = runner.engine.snapshot() as StroopSnapshot;
      if (s.done) break;
      if (answer && s.phase === 'respond' && s.onsetMs !== null && t - s.onsetMs >= delayOf(s)) {
        runner.input({ kind: 'choice', index: slotOf(s), t });
        answered += 1;
      }
      runner.tick(t);
    }
  }
  return runner;
}

describe('颜色认知跑完一次训练', () => {
  it('4 轮全对：档位 1→2→3→4，轮号 1..4，种子逐个 +1，末尾升到 5 档', () => {
    const { record } = playSession(st(1), 1000, { delayOf: slowIfHard }).finish('2026-10-18');
    expect(record.gameId).toBe('stroop');
    expect(record.mode).toBe('plan');
    expect(record.rounds.map((r) => [r.level, r.outcome, r.counted])).toEqual([
      [1, 'pass', true],
      [2, 'pass', true],
      [3, 'pass', true],
      [4, 'pass', true],
    ]);
    expect(record.rounds.map((r) => r.roundNo)).toEqual([1, 2, 3, 4]);
    expect(record.rounds.map((r) => r.seed)).toEqual([1000, 1001, 1002, 1003]);
    expect(record.startLevel).toBe(1);
    expect(record.endLevel).toBe(5);
    // 最后 ⌈4/2⌉=2 个计分轮是第 3、4 轮：mean(3-1+1, 4-1+1) = 3.5 → 35
    expect(record.ability).toBe(35);
    expect(record.rounds.every((r) => r.trials.length === 12)).toBe(true);
  });

  it('4 轮全对的结算指标：平均 200ms、干扰效应 +200ms（规则过滤漏掉会变成 +101ms）', () => {
    const { record } = playSession(st(1), 1000, { delayOf: slowIfHard }).finish('2026-10-18');
    expect(record.summary).toEqual({ accuracy: 1, meanRtMs: 200, interferenceMs: 200 });
    expect(stroop.formatSummary(record.summary)).toEqual([
      { label: '正确率', value: '100%' },
      { label: '平均反应时', value: '200 毫秒' },
      { label: '干扰效应', value: '+200 毫秒' },
    ]);
  });

  it('4 轮全对的 durationMs 就是帧模型算出来的 33900ms', () => {
    // 每轮 endAt = 6000 + Σdelay：第 1/2 轮（6 冲突）Σdelay = 6*300+6*100 = 2400 → 8400；
    // 第 3 轮（7 冲突）2600 → 8600；第 4 轮（按字义，5 个慢）2200 → 8200。
    // 轮结束后在 endAt 的下一帧（+100ms）重开，3 个间隔共 300ms：
    // R1 0→8400，R2 8500→16900，R3 17000→25600，R4 25700→33900；firstStartAt = 0。
    const { record } = playSession(st(1), 1000, { delayOf: slowIfHard }).finish('2026-10-18');
    expect(record.rounds.map((r) => r.metrics.timeMs)).toEqual([8400, 8400, 8600, 8200]);
    expect(record.durationMs).toBe(33900);
    expect(record.startedAt).toBe(NOW);
  });

  it('作废第 2 轮：补轮沿用轮号，规则与种子都对，且不漏一题', () => {
    const runner = playSession(st(3), 1000, {
      delayOf: fast,
      voidOnce: (roundNo, answered) => roundNo === 2 && answered >= 4,
    });
    const { record, state } = runner.finish('2026-10-18');
    // 作废的一轮不入记录：只有 4 个计分轮，轮号 1..4
    expect(record.rounds.length).toBe(4);
    expect(record.rounds.map((r) => r.roundNo)).toEqual([1, 2, 3, 4]);
    expect(record.rounds.map((r) => r.level)).toEqual([3, 4, 5, 6]);
    // attempt 被作废的那次消耗掉了：1000, (1001 作废), 1002, 1003, 1004
    expect(record.rounds.map((r) => r.seed)).toEqual([1000, 1002, 1003, 1004]);
    // spec 3.2：「补轮沿用被补那一轮的轮号」，第 4 档偶数轮必须是按字义
    expect(record.rounds[1].trials.every((t) => tr(t).rule === 'word')).toBe(true);
    // 没有任何试次从作废的那一轮漏进来：每轮正好 12 个，rt 全是 100
    expect(record.rounds.map((r) => r.trials.length)).toEqual([12, 12, 12, 12]);
    expect(record.rounds.every((r) => r.trials.every((t) => t.rt === 100 && t.correct))).toBe(true);
    expect(record.summary).toEqual({ accuracy: 1, meanRtMs: 100, interferenceMs: 0 });
    expect(state.level).toBe(7);
    expect(record.endLevel).toBe(7);
    expect(record.durationMs).toBeLessThan(40000);
  });

  it('全答错：4 轮 fail，档位 3→2→1 后钳在 1，指标退化成 NaN/NaN', () => {
    const { record } = playSession(st(3), 500, { slotOf: wrongSlot }).finish('2026-10-18');
    expect(record.rounds.map((r) => [r.level, r.outcome])).toEqual([
      [3, 'fail'],
      [2, 'fail'],
      [1, 'fail'],
      [1, 'fail'],
    ]);
    expect(record.startLevel).toBe(3);
    expect(record.endLevel).toBe(1);
    expect(record.ability).toBe(0);
    expect(record.rounds.every((r) => r.trials.every((t) => t.correct === false))).toBe(true);
    expect(record.summary.accuracy).toBe(0);
    // K5：没有正确试次 → NaN，而不是 0 或 -1
    expect(Number.isNaN(record.summary.meanRtMs)).toBe(true);
    expect(Number.isNaN(record.summary.interferenceMs)).toBe(true);
    expect(stroop.formatSummary(record.summary).map((i) => i.value)).toEqual(['0%', '—', '—']);
  });

  it('全程不作答：每轮 12 次超时、rt 全 null，档位停在 1', () => {
    const { record } = playSession(st(1), 700, { answer: false }).finish('2026-10-18');
    expect(record.rounds.map((r) => r.level)).toEqual([1, 1, 1, 1]);
    expect(record.rounds.map((r) => r.outcome)).toEqual(['fail', 'fail', 'fail', 'fail']);
    expect(record.endLevel).toBe(1);
    expect(record.rounds[0].metrics).toEqual({ correct: 0, timeouts: 12, trials: 12, timeMs: 30000 });
    expect(record.rounds.every((r) => r.trials.every((t) => t.rt === null && t.correct === false))).toBe(true);
    expect(record.summary.accuracy).toBe(0);
  });

  it('跨日续档：第二天从第 5 档接着练，轮号重新从 1 起', async () => {
    const repo = new MemoryRepository();
    const day1 = playSession(st(1), 1000, { delayOf: slowIfHard });
    const { record: a, state: s1 } = day1.finish('2026-10-18');
    expect(s1.level).toBe(5);
    await repo.saveSession(a, s1, null);

    const saved = await repo.getGameState('stroop');
    expect(saved).toMatchObject({ gameId: 'stroop', level: 5, lastPlayedDayKey: '2026-10-18' });

    const day2 = playSession(saved, 2000, { delayOf: fast });
    const { record: b, state: s2 } = day2.finish('2026-10-19');
    await repo.saveSession(b, s2, null);
    expect(b.dayKey).toBe('2026-10-19');
    expect(b.startLevel).toBe(5);
    expect(b.rounds.map((r) => r.level)).toEqual([5, 6, 7, 8]);
    expect(b.rounds.map((r) => r.roundNo)).toEqual([1, 2, 3, 4]);
    expect(b.rounds.map((r) => r.seed)).toEqual([2000, 2001, 2002, 2003]);
    // K1：每试次切换模式下第 1 试次恒为按颜色，与轮号、种子无关
    expect(b.rounds.every((r) => tr(r.trials[0]).rule === 'color')).toBe(true);
    expect(b.endLevel).toBe(9);
    // mean(7-1+1, 8-1+1) = 7.5 → 75
    expect(b.ability).toBe(75);
    expect(b.summary).toEqual({ accuracy: 1, meanRtMs: 100, interferenceMs: 0 });
    expect((await repo.lastSession('stroop'))?.dayKey).toBe('2026-10-19');
  });

  it('自由练：同一条 finish 路径，mode 记 free，传 null 计划时不写当天计划', async () => {
    const repo = new MemoryRepository();
    const runner = playSession(st(1), 1000, { delayOf: fast }, 'free');
    const { record, state } = runner.finish('2026-10-18');
    expect(record.mode).toBe('free');
    expect(record.endLevel).toBe(5);
    await repo.saveSession(record, state, null);
    expect(await repo.getPlan('2026-10-18')).toBeNull();
    expect(await repo.getGameState('stroop')).toMatchObject({ level: 5 });
  });
});
