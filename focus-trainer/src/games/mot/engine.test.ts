// focus-trainer/src/games/mot/engine.test.ts
import { describe, expect, it } from 'vitest';
import { HIT_RADIUS, MOT_LEVELS, PROMPT_MS } from './rules';
import { STEPS_PER_SECOND } from './physics';
import { MotEngine } from './engine';
import type { MotSnapshot } from './engine';

// start(now) 的时刻故意不是 0：引擎只吃「距 startAt 的差」，绝不能吃绝对时间戳
const START = 1_700_000_000_000;

function make(level = 1, seed = 42, roundNo = 1): MotEngine {
  const e = new MotEngine();
  e.configure(level, seed, roundNo);
  e.start(START);
  return e;
}

// 整数下标换算时刻而不是 t += stepMs 累加：在 1.7e12 这个量级上 ulp ≈ 0.000244，
// 累加会把 to 落在 6999.99999988… 这种值上，循环最后一帧永远喂不到边界，
// 「跨过运动结束点的那一帧」就用例想锁的东西而言根本不存在。
function feedRange(e: MotEngine, from: number, to: number, stepMs: number): void {
  const n = Math.round((to - from) / stepMs);
  for (let i = 0; i <= n; i++) e.tick(from + i * stepMs);
}

// 三种节奏必须停在同一逻辑时刻：rAF 一定会在边界之后给出一帧，测试要模拟这件事，
// 否则 7ms 的循环最后一次落在 until - 1 上，步数天生少一步，用例会以「不相等」假失败。
function runCadence(stepMs: number, until: number, level = 9, seed = 2026): MotSnapshot {
  const e = make(level, seed);
  for (let t = START; t < until; t += stepMs) e.tick(t);
  e.tick(until);
  return e.snapshot();
}

// 找一个离所有点都远的坐标，避免「空点」用例被某个恰好落在远处的点偷走（同种子确定，但对布局改动脆弱）
function emptySpot(s: MotSnapshot): { x: number; y: number } {
  for (let gx = 0; gx <= 20; gx++) {
    for (let gy = 0; gy <= 20; gy++) {
      const x = gx / 20;
      const y = gy / 20;
      if (s.dots.every((d) => Math.hypot(d.x - x, d.y - y) > HIT_RADIUS + 0.01)) return { x, y };
    }
  }
  throw new Error('no empty spot in this layout');
}

// 档 1：6 点、K=2、v=0.15、D=5 ⇒ prompt 结束 = START+2000，运动结束 = START+7000
const PROMPT_END = START + PROMPT_MS;
const L1_MOTION_END = PROMPT_END + MOT_LEVELS[0].durationSec * 1000;

describe('相位时序', () => {
  it('prompt → motion → answer 的边界落在 2000ms 与 2000 + D*1000ms 上', () => {
    const e = make(1);
    expect(e.snapshot().phase).toBe('prompt');
    e.tick(PROMPT_END - 1);
    expect(e.snapshot().phase).toBe('prompt');
    expect(e.snapshot().simSteps).toBe(0); // 运动未开始，负 elapsed 不推进也不钳制
    e.tick(PROMPT_END);
    expect(e.snapshot().phase).toBe('motion');
    e.tick(L1_MOTION_END - 1);
    expect(e.snapshot().phase).toBe('motion');
    e.tick(L1_MOTION_END);
    expect(e.snapshot().phase).toBe('answer');
    expect(e.snapshot().simSteps).toBe(MOT_LEVELS[0].durationSec * STEPS_PER_SECOND);
  });

  it('曝光步数对 10 档都精确等于 D × 120，跨过边界的那一帧有溢出也不得多走', () => {
    for (let level = 1; level <= MOT_LEVELS.length; level++) {
      const lv = MOT_LEVELS[level - 1];
      const e = make(level, 5);
      // 故意用 33ms 的节奏：越过运动结束点的那一帧最坏溢出 32ms，上限必须把步数钉死
      feedRange(e, START, PROMPT_END + lv.durationSec * 1000 + 32, 33);
      expect(e.snapshot().simSteps).toBe(lv.durationSec * STEPS_PER_SECOND);
      expect(e.snapshot().phase).toBe('answer');
    }
  });

  it('answer 阶段位置冻结：继续喂帧不再改变任何点的坐标', () => {
    const e = make(3, 11); // D=6 ⇒ 运动结束 = START+9000
    feedRange(e, START, START + 9000, 16);
    const frozen = e.snapshot().dots.map((d) => ({ x: d.x, y: d.y }));
    feedRange(e, START + 9016, START + 20_000, 16);
    expect(e.snapshot().dots.map((d) => ({ x: d.x, y: d.y }))).toEqual(frozen);
  });

  it('16ms / 48ms / 7ms 三种喂帧节奏在同一逻辑时刻给出逐位相同的轨迹', () => {
    const until = START + 3200; // prompt 2000 + 运动 1200
    const a = runCadence(16, until);
    const b = runCadence(48, until);
    const c = runCadence(7, until);
    expect(a.simSteps).toBe(144);
    expect(b.simSteps).toBe(144);
    expect(c.simSteps).toBe(144);
    expect(a.dots).toEqual(b.dots);
    expect(a.dots).toEqual(c.dots);
    // 反向探针：不同截止时刻必须给出不同轨迹，否则「相等」可能只是轨迹根本没动
    expect(a.dots).not.toEqual(runCadence(16, START + 2016).dots);
  });

  it('remainMs 是原始差值（可为负由视图显示时钳 0），answer 阶段恒 0', () => {
    const e = make(1);
    expect(e.snapshot().remainMs).toBe(PROMPT_MS);
    e.tick(PROMPT_END - 1000);
    expect(e.snapshot().remainMs).toBe(1000);
    e.tick(L1_MOTION_END);
    expect(e.snapshot().remainMs).toBe(0);
  });
});

describe('timingValid', () => {
  it('运动阶段出现 > 50ms 的帧间隔即作废本轮', () => {
    const e = make(1);
    e.tick(PROMPT_END + 100); // 首帧只建基准
    expect(e.snapshot().timingValid).toBe(true);
    e.tick(PROMPT_END + 151); // 间隔 51ms：阈值是严格大于 50
    expect(e.snapshot().timingValid).toBe(false);
  });

  it('帧间隔恰为 50ms 不作废（阈值是严格大于）', () => {
    const e = make(1);
    e.tick(PROMPT_END + 100);
    e.tick(PROMPT_END + 150);
    expect(e.snapshot().timingValid).toBe(true);
  });

  it('start 后迟迟不来第一帧不算作废：首帧只建基准', () => {
    const e = make(1);
    e.tick(START + 400); // 距 start 400ms，远超阈值；若拿 start 当帧基准就会误废
    expect(e.snapshot().timingValid).toBe(true);
    e.tick(START + 416);
    expect(e.snapshot().timingValid).toBe(true);
  });

  it('answer 阶段的长间隔合法（用户思考多久都行）', () => {
    const e = make(1);
    feedRange(e, START, L1_MOTION_END, 16);
    expect(e.snapshot().phase).toBe('answer');
    expect(e.snapshot().timingValid).toBe(true);
    e.tick(L1_MOTION_END + 90_000);
    expect(e.snapshot().timingValid).toBe(true);
  });

  it('configure 重新武装 timingValid 与所有时间基准', () => {
    const e = make(1);
    e.tick(PROMPT_END + 100);
    e.tick(PROMPT_END + 900);
    expect(e.snapshot().timingValid).toBe(false);
    e.configure(1, 42, 1);
    const s = e.snapshot();
    expect(s.timingValid).toBe(true);
    expect(s.phase).toBe('prompt');
    expect(s.simSteps).toBe(0);
    expect(s.selectedCount).toBe(0);
    expect(s.done).toBe(false);
  });
});

describe('configure 全量重置（作废契约）', () => {
  it('跑到 answer 并选中后按同参重开，与全新引擎逐字段相同，不留上一轮残留', () => {
    const fresh = make(4, 777, 2);
    const used = make(4, 777, 2);
    feedRange(used, START, START + 12_000, 16); // 档 4 D=7 ⇒ 运动结束 = START+10000
    const s = used.snapshot();
    used.input({ kind: 'point', x: s.dots[0].x, y: s.dots[0].y, t: START + 12_016 });
    expect(used.snapshot().selectedCount).toBe(1);
    used.configure(4, 777, 2);
    used.start(START);
    expect(used.snapshot()).toEqual(fresh.snapshot());
    expect(used.isDone()).toBe(false);
  });

  it('换 seed 一定换布局；同 seed 只换 roundNo 布局不变（复现契约的地基）', () => {
    const a = make(6, 100, 1);
    a.tick(PROMPT_END);
    const b = make(6, 101, 1);
    b.tick(PROMPT_END);
    expect(a.snapshot().dots.map((d) => d.x)).not.toEqual(b.snapshot().dots.map((d) => d.x));
    const c = make(6, 100, 3);
    c.tick(PROMPT_END);
    expect(c.snapshot()).toEqual(a.snapshot());
  });
});

describe('answer 阶段的点选', () => {
  it('容差内选中、原地再点取消、空点忽略、prompt 阶段拒绝一切点选', () => {
    const e = make(2, 5); // 档 2：K=2、D=6 ⇒ 运动结束 = START+9000
    const s0 = e.snapshot();
    e.input({ kind: 'point', x: s0.dots[0].x, y: s0.dots[0].y, t: START + 10 });
    expect(e.snapshot().selectedCount).toBe(0); // 提示阶段点不算（必须只用眼睛追）
    feedRange(e, START, START + 9000, 16);
    const s = e.snapshot();
    expect(s.phase).toBe('answer');
    const tap = (i: number, t: number): void => {
      e.input({ kind: 'point', x: s.dots[i].x, y: s.dots[i].y, t });
    };
    tap(0, START + 9016);
    expect(e.snapshot().selectedCount).toBe(1);
    expect(e.snapshot().dots[0].selected).toBe(true);
    tap(0, START + 9032); // 再点同一个点 = 取消
    expect(e.snapshot().selectedCount).toBe(0);
    const gap = emptySpot(s);
    e.input({ kind: 'point', x: gap.x, y: gap.y, t: START + 9048 }); // 容差外的空点
    expect(e.snapshot().selectedCount).toBe(0);
    tap(1, START + 9064);
    expect(e.snapshot().selectedCount).toBe(1);
    tap(3, START + 9080);
    // Task 5 落地后语义变了：选满 K 当场自动提交，「改选窗口」在凑满 K 的那一瞬间关闭，
    // 相位同时进 feedback（原注释「选满 K 之后仍能改选」描述的是 Task 4 的半成品行为）。
    expect(e.snapshot().selectedCount).toBe(2);
    expect(e.snapshot().phase).toBe('feedback');
    expect(e.snapshot().timingValid).toBe(true);
  });

  it('target 只在 prompt / feedback 暴露：运动与作答阶段的快照全是 false', () => {
    const e = make(5, 3); // 档 5：K=4、D=7 ⇒ 运动结束 = START+10000
    expect(e.snapshot().dots.filter((d) => d.target)).toHaveLength(MOT_LEVELS[4].k);
    e.tick(PROMPT_END + 100);
    expect(e.snapshot().phase).toBe('motion');
    expect(e.snapshot().dots.filter((d) => d.target)).toHaveLength(0);
    feedRange(e, PROMPT_END + 116, START + 11_000, 16);
    expect(e.snapshot().phase).toBe('answer');
    expect(e.snapshot().dots.filter((d) => d.target)).toHaveLength(0);
  });

  it('snapshot() 是防御拷贝：改返回的数组与元素不会污染引擎内部状态', () => {
    const e = make(1);
    const s = e.snapshot();
    const before = JSON.stringify(s.dots);
    const leaked = s.dots as unknown as Array<{ id: number; x: number; y: number; target: boolean; selected: boolean; mark: string }>;
    leaked.push({ id: 999, x: 0, y: 0, target: false, selected: false, mark: 'none' });
    leaked[0].x = 0.0;
    leaked[0].selected = true;
    expect(JSON.stringify(e.snapshot().dots)).toBe(before);
    expect(e.snapshot().selectedCount).toBe(0);
  });
});
