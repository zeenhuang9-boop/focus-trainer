import { describe, expect, it } from 'vitest';
import { FLASH_MS, SchulteEngine, TINTS } from './engine';
import { judgeSchulte, schulteLevel, targetSequence } from './rules';

// 按标签找格子下标，相当于用户在方格里找到这个数
function indexOf(eng: SchulteEngine, label: string): number {
  return eng.snapshot().cells.findIndex((c) => c.label === label);
}

function tap(eng: SchulteEngine, label: string, t: number): void {
  eng.input({ kind: 'cell', index: indexOf(eng, label), t });
}

function fresh(level: number, seed = 7, start = 0): SchulteEngine {
  const eng = new SchulteEngine();
  eng.configure(level, seed, 1);
  eng.start(start);
  return eng;
}

const labels = (eng: SchulteEngine): string[] => eng.snapshot().cells.map((c) => c.label);

describe('SchulteEngine 布局', () => {
  it('同种子布局相同，换种子布局不同', () => {
    expect(labels(fresh(3, 42))).toEqual(labels(fresh(3, 42)));
    expect(labels(fresh(3, 42))).not.toEqual(labels(fresh(3, 43)));
  });

  it('每一档的布局都是目标序列的一个排列', () => {
    for (let level = 1; level <= 10; level++) {
      const eng = fresh(level);
      const lv = schulteLevel(level);
      expect(eng.snapshot().size).toBe(lv.size);
      expect([...labels(eng)].sort()).toEqual([...targetSequence(lv)].sort());
    }
  });

  it('干扰色档每格取 0–3 的底色，其他档没有底色', () => {
    const tints = fresh(6).snapshot().cells.map((c) => c.tint);
    expect(tints.every((t) => t !== null && Number.isInteger(t) && t >= 0 && t < TINTS)).toBe(true);
    expect(fresh(1).snapshot().cells.every((c) => c.tint === null)).toBe(true);
  });
});

describe('SchulteEngine 作答', () => {
  it('按顺序点完结束本轮，记录每次命中的反应时', () => {
    const eng = fresh(1, 7, 1000);
    for (let k = 1; k <= 9; k++) tap(eng, String(k), 1000 + 500 * k);
    expect(eng.isDone()).toBe(true);
    const snap = eng.snapshot();
    expect(snap.done).toBe(true);
    expect(snap.nextLabel).toBeNull();
    expect(snap.elapsedMs).toBe(4500);
    const r = eng.result();
    expect(r.level).toBe(1);
    expect(r.seed).toBe(7);
    expect(r.timingValid).toBe(true);
    expect(r.metrics).toEqual({ timeMs: 4500, errors: 0, cells: 9 });
    expect(r.trials).toHaveLength(9);
    expect(r.trials[0]).toEqual({ onset: 1000, rt: 500, correct: true, label: '1', misses: 0 });
    expect(r.trials[8]).toEqual({ onset: 5000, rt: 500, correct: true, label: '9', misses: 0 });
    expect(judgeSchulte(r)).toEqual({ outcome: 'pass', score01: 1 });
  });

  it('点错计误点并闪烁 150ms，下一次命中记下之前的误点数', () => {
    const eng = fresh(1);
    tap(eng, '2', 100);
    const snap = eng.snapshot();
    expect(snap.errors).toBe(1);
    expect(snap.nextLabel).toBe('1');
    expect(snap.flashIndex).toBe(indexOf(eng, '2'));
    eng.tick(100 + FLASH_MS - 1);
    expect(eng.snapshot().flashIndex).toBe(indexOf(eng, '2'));
    eng.tick(100 + FLASH_MS);
    expect(eng.snapshot().flashIndex).toBeNull();
    tap(eng, '1', 300);
    expect(eng.snapshot().nextLabel).toBe('2');
    for (let k = 2; k <= 9; k++) tap(eng, String(k), 300 + 100 * k);
    const r = eng.result();
    expect(r.metrics.errors).toBe(1);
    expect(r.trials[0]).toEqual({ onset: 0, rt: 300, correct: true, label: '1', misses: 1 });
    expect(r.trials[1].misses).toBe(0);
  });

  it('已点过的格子再点不算误点', () => {
    const eng = fresh(1);
    tap(eng, '1', 100);
    tap(eng, '1', 200);
    const snap = eng.snapshot();
    expect(snap.errors).toBe(0);
    expect(snap.nextLabel).toBe('2');
    expect(snap.cells[indexOf(eng, '1')].done).toBe(true);
  });

  it('倒序档从最大数开始，字母档从 A 开始', () => {
    const desc = fresh(4);
    expect(desc.snapshot().nextLabel).toBe('25');
    tap(desc, '1', 100);
    expect(desc.snapshot().errors).toBe(1);
    tap(desc, '25', 200);
    expect(desc.snapshot().nextLabel).toBe('24');
    const letters = fresh(5);
    expect(letters.snapshot().nextLabel).toBe('A');
    expect(labels(letters)).toContain('Y');
    expect(labels(letters)).not.toContain('Z');
  });

  it('非方格输入与结束后的输入都被忽略', () => {
    const eng = fresh(1);
    eng.input({ kind: 'choice', index: 0, t: 50 });
    expect(eng.snapshot().errors).toBe(0);
    expect(eng.snapshot().nextLabel).toBe('1');
    for (let k = 1; k <= 9; k++) tap(eng, String(k), 100 * k);
    const before = eng.result();
    eng.input({ kind: 'cell', index: 0, t: 2000 });
    expect(eng.result()).toEqual(before);
  });

  it('tick 推进 elapsedMs；未结束时取结果会抛错', () => {
    const eng = fresh(1, 7, 1000);
    eng.tick(1600);
    expect(eng.snapshot().elapsedMs).toBe(600);
    expect(() => eng.result()).toThrow();
  });

  it('重新 configure 会清空上一轮状态', () => {
    const eng = fresh(1);
    tap(eng, '2', 100);
    for (let k = 1; k <= 9; k++) tap(eng, String(k), 200 + 100 * k);
    expect(eng.isDone()).toBe(true);
    eng.configure(2, 8, 2);
    eng.start(5000);
    const snap = eng.snapshot();
    expect(snap.done).toBe(false);
    expect(snap.errors).toBe(0);
    expect(snap.size).toBe(4);
    expect(snap.nextLabel).toBe('1');
    expect(snap.flashIndex).toBeNull();
    expect(snap.elapsedMs).toBe(0);
  });
});
