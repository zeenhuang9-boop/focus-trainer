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
      // 「排列」这个名字本身要钉住：长度 = size²、无重复格（原标题是同义反复，只比了集合相等）
      expect(labels(eng)).toHaveLength(lv.size * lv.size);
      expect(new Set(labels(eng)).size).toBe(labels(eng).length);
    }
  });

  it('干扰色档每格取 0–3 的底色，其他档没有底色', () => {
    // spec:60 钉的是 4 种干扰色；`t < TINTS` 是自指断言，TINTS 改 5 也全绿（评审变异 T21）。
    expect(TINTS).toBe(4);
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
    // spec 第 4 节钉的是 150 这个数值；边界必须写字面值 —— 用 `100 + FLASH_MS` 的话
    // 常量被改成 151 也照样全绿（评审变异 T20 存活）。
    expect(FLASH_MS).toBe(150);
    const eng = fresh(1);
    tap(eng, '2', 100);
    const snap = eng.snapshot();
    expect(snap.errors).toBe(1);
    expect(snap.nextLabel).toBe('1');
    expect(snap.flashIndex).toBe(indexOf(eng, '2'));
    eng.tick(249); // 100 + 150 - 1
    expect(eng.snapshot().flashIndex).toBe(indexOf(eng, '2'));
    eng.tick(250); // 100 + 150
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
    tap(eng, '2', 100); // 先制造误点与闪烁
    for (let k = 1; k <= 9; k++) tap(eng, String(k), 200 + 100 * k);
    expect(eng.isDone()).toBe(true);
    // 作废重开：SessionRunner 只调 configure + start，不通知引擎（spec 5.1）
    eng.configure(1, 99, 1);
    // start() 之前也必须读到 0：少了这行，configure 忘记重置时间基准也能全绿。
    expect(eng.snapshot().elapsedMs).toBe(0);
    eng.start(0);
    expect(eng.snapshot().errors).toBe(0);
    expect(eng.snapshot().flashIndex).toBeNull();
    // 越界索引必须被吞掉，不能抛 TypeError（视图侧 dataset 解析不出数字时就是这个形状）
    eng.input({ kind: 'cell', index: 99, t: 50 });
    eng.input({ kind: 'cell', index: -1, t: 60 });
    expect(eng.snapshot().errors).toBe(0);
    for (let k = 1; k <= 9; k++) tap(eng, String(k), 100 * k);
    const r1 = eng.result();
    expect(r1.trials).toHaveLength(9); // 钉住 trials = []：残留会让作废轮的试次累加进重开轮并落库
    expect(r1.trials[0]).toEqual({ onset: 0, rt: 100, correct: true, label: '1', misses: 0 }); // 钉住 missesSinceHit = 0
    expect(r1.metrics).toEqual({ timeMs: 900, errors: 0, cells: 9 });
    // 再开一档：level / seed / size / cells 都要跟着走（level 记错会让 judgeSchulte 拿 1 档的 T 判 7 档）
    eng.configure(2, 8, 2);
    eng.start(0);
    const snap = eng.snapshot();
    expect([snap.done, snap.size, snap.nextLabel, snap.elapsedMs]).toEqual([false, 4, '1', 0]);
    for (let k = 1; k <= 16; k++) tap(eng, String(k), 100 * k);
    const r2 = eng.result();
    expect([r2.level, r2.seed]).toEqual([2, 8]);
    expect(r2.trials).toHaveLength(16);
    expect(r2.metrics).toEqual({ timeMs: 1600, errors: 0, cells: 16 });
  });

  it('结果用时锚在 endAt，结束后晚到的帧不改写已定局的用时', () => {
    const eng = fresh(1, 7, 0);
    for (let k = 1; k <= 8; k++) tap(eng, String(k), 100 * k);
    tap(eng, '9', 4500);
    expect(eng.isDone()).toBe(true);
    eng.tick(9999);
    expect(eng.snapshot().elapsedMs).toBe(4500);
    expect(eng.result().metrics.timeMs).toBe(4500);
  });

  it('snapshot 交出的是副本；倒退的时间戳不会把用时往回拉', () => {
    const eng = fresh(1, 7, 0);
    tap(eng, '1', 100);
    const idx = indexOf(eng, '1');
    const s = eng.snapshot();
    s.cells[idx].done = false; // 视图若拿到内部引用，这里就会污染引擎真实进度
    expect(eng.snapshot().cells[idx].done).toBe(true);
    expect(eng.snapshot().nextLabel).toBe('2');
    eng.tick(5000);
    eng.input({ kind: 'cell', index: indexOf(eng, '3'), t: 100 }); // 误点，事件时间戳比当前帧旧
    expect(eng.snapshot().elapsedMs).toBe(5000);
    eng.tick(500); // 晚到的旧帧同样不得把 now 拉回
    expect(eng.snapshot().elapsedMs).toBe(5000);
    expect(eng.snapshot().errors).toBe(1);
  });

  it('同一帧点完全部格子时 timeMs 为 0，判定按 spec 公式给出 pass / score01 = 1', () => {
    // spec:61-62 未定义 t = 0 的处理，spec:361 又禁止舒尔特做帧间隔判定，引擎无权自行判废。
    // 这条把行为钉成「已知且刻意」：T/0 = Infinity、Math.min(1, Infinity) = 1，不泄漏 NaN/Infinity。
    // M3 若要防「多指同帧刷分」，改动点在判定公式，而不是临时给引擎加防御分支。
    const eng = fresh(1, 5, 1000);
    for (let k = 1; k <= 9; k++) tap(eng, String(k), 1000);
    expect(eng.result().metrics.timeMs).toBe(0);
    expect(judgeSchulte(eng.result())).toEqual({ outcome: 'pass', score01: 1 });
  });
});
