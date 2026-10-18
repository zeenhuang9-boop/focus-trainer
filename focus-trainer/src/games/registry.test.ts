import { describe, expect, it } from 'vitest';
import { GAME_IDS } from '../core/types';
import { GAMES, getGame } from './registry';
import { SchulteEngine, type SchulteSnapshot } from './schulte/engine';

describe('registry', () => {
  it('M1 只注册舒尔特方格，id 都在 GAME_IDS 里', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['schulte']);
    expect(GAMES.every((g) => GAME_IDS.includes(g.id))).toBe(true);
    // 保序子序列：scheduler.ts 的 tie-break 用 GAME_IDS.indexOf，首页与 M3 的雷达图按 GAMES 迭代。
    // 现在注册表顺序无语义，M2 追加 4 个游戏时这条会强制「注册顺序 === 声明顺序」，
    // 避免 UI 顺序隐性依赖注册表里的书写先后。
    expect(GAMES.map((g) => g.id)).toEqual(GAME_IDS.filter((id) => GAMES.some((g) => g.id === id)));
  });

  it('按 id 查找，未实现或未知的 id 返回 undefined', () => {
    expect(getGame('schulte')?.name).toBe('舒尔特方格');
    expect(getGame('stroop')).toBeUndefined();
    expect(getGame('nope')).toBeUndefined();
  });

  it('舒尔特模块的元数据符合 spec', () => {
    const m = getGame('schulte')!;
    expect(m).toMatchObject({
      ability: '持续注意',
      maxLevel: 10,
      roundsPerSession: 3,
      roundBreak: 'tap',
      staircase: { upAfter: 1, downAfter: 1 },
    });
    expect(m.instructions.length).toBeGreaterThan(0);
    expect(m.createEngine()).toBeInstanceOf(SchulteEngine);
  });

  it('模块的 judge、summarize、formatSummary 能处理引擎产出的结果', () => {
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
});
