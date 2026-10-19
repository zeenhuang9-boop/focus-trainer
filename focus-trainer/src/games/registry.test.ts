import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../core/types';
import { GAMES, getGame } from './registry';
import { SchulteEngine, type SchulteSnapshot } from './schulte/engine';
import { StroopEngine } from './stroop/engine';
import type { StroopSnapshot } from './stroop/engine';

describe('registry', () => {
  it('M2-1 注册舒尔特与颜色认知，id 都在 GAME_IDS 里', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['schulte', 'stroop']);
    expect(GAMES.every((g) => GAME_IDS.includes(g.id))).toBe(true);
    // 保序子序列：注册顺序必须等于 GAME_IDS 的声明顺序
    expect(GAMES.map((g) => g.id)).toEqual(GAME_IDS.filter((id) => GAMES.some((g) => g.id === id)));
  });

  it('按 id 查找，未实现或未知的 id 返回 undefined', () => {
    expect(getGame('schulte')?.name).toBe('舒尔特方格');
    expect(getGame('stroop')?.name).toBe('颜色认知');
    expect(getGame('seqmem')).toBeUndefined();
    expect(getGame('nope')).toBeUndefined();
  });

  it('两个模块的元数据都符合 spec', () => {
    const s = getGame('schulte')!;
    expect(s).toMatchObject({
      ability: '持续注意',
      maxLevel: 10,
      roundsPerSession: 3,
      roundBreak: 'tap',
      staircase: { upAfter: 1, downAfter: 1 },
    });
    const c = getGame('stroop')!;
    expect(c).toMatchObject({
      ability: '抑制控制',
      maxLevel: 10,
      roundsPerSession: 4,
      roundBreak: 'tap',
      staircase: { upAfter: 1, downAfter: 1 },
    });
    expect(s.instructions.length).toBeGreaterThan(0);
    expect(c.instructions.length).toBeGreaterThan(0);
    expect(s.createEngine()).toBeInstanceOf(SchulteEngine);
    expect(c.createEngine()).toBeInstanceOf(StroopEngine);
  });

  it('每个模块都能被 SessionRunner 用三参数 configure 驱动', () => {
    for (const m of GAMES) {
      const eng = m.createEngine();
      eng.configure(1, 3, 1);
      eng.start(0);
      expect(eng.isDone()).toBe(false);
      expect(eng.result.bind(eng)).toThrow();
      expect(m.formatSummary(m.summarize([])).length).toBeGreaterThan(0);
    }
  });

  it('舒尔特模块的 judge、summarize、formatSummary 能处理引擎产出的结果', () => {
    const m = getGame('schulte')!;
    const eng = m.createEngine();
    eng.configure(1, 3, 1);
    eng.start(0);
    for (let k = 1; k <= 9; k++) {
      const snap = eng.snapshot() as SchulteSnapshot;
      eng.input({ kind: 'cell', index: snap.cells.findIndex((c) => c.label === String(k)), t: 400 * k });
    }
    const r = eng.result();
    expect(m.judge(r)).toEqual({ outcome: 'pass', score01: 1 });
    const summary = m.summarize([{ ...r, roundNo: 1, outcome: 'pass', score01: 1, counted: true }]);
    expect(summary).toEqual({ bestTimeMs: 3600, avgCellMs: 400, errors: 0 });
    expect(m.formatSummary(summary).map((i) => i.label)).toEqual(['最佳用时', '平均每格', '总误点']);
  });

  it('颜色认知模块的 judge、summarize、formatSummary 能处理引擎产出的结果', () => {
    const m = getGame('stroop')!;
    const eng = m.createEngine();
    eng.configure(1, 3, 1);
    eng.start(0);
    for (let step = 1; step <= 200; step++) {
      const now = step * 100;
      const snap = eng.snapshot() as StroopSnapshot;
      if (snap.phase === 'respond' && snap.onsetMs !== null && now - snap.onsetMs >= 100) {
        const target = snap.rule === 'color' ? snap.ink : snap.word;
        eng.input({ kind: 'choice', index: snap.options.findIndex((o) => o.colorIdx === target), t: now });
      }
      if (eng.isDone()) break;
      eng.tick(now);
    }
    expect(eng.isDone()).toBe(true);
    const r = eng.result();
    expect(r.metrics).toEqual({ correct: 12, timeouts: 0, trials: 12, timeMs: 7200 });
    expect(m.judge(r)).toEqual({ outcome: 'pass', score01: 1 });
    const summary = m.summarize([{ ...r, roundNo: 1, outcome: 'pass', score01: 1, counted: true }]);
    expect(summary.accuracy).toBe(1);
    expect(m.formatSummary(summary).map((i) => i.label)).toEqual(['正确率', '平均反应时', '干扰效应']);
  });
});
