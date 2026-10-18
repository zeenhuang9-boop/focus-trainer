# M1 基础模块与舒尔特方格 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 搭好 `focus-trainer` 项目，完成 `src/core/` 全部模块、应用外壳（首页、训练页、结算页、设置页）和舒尔特方格，手机浏览器里可以完整练一次并看到成绩。

**架构：** 纯逻辑放在 `src/core/` 与 `src/games/schulte/rules.ts`、`engine.ts`，用 Vitest 在 node 环境测试；DOM 只出现在 `view.ts` 和 `src/ui/`。训练页用 `requestAnimationFrame` 驱动 `SessionRunner`，所有游戏内计时都取帧时间戳或 `event.timeStamp`。

**技术选型：** TypeScript 5.9.3、Vite 8.3.4、Vitest 5.0.5、fake-indexeddb 6.2.6，原生 DOM，不用 UI 框架。

**Spec：** `docs/superpowers/specs/2026-10-18-focus-trainer-design.md`

## Global Constraints

- 项目根：`E:\WORK\脑力训练\focus-trainer\`；Git 仓库根：`E:\WORK\脑力训练\`（在仓库根执行 git 命令，路径写 `focus-trainer/...`）。
- Node 24.18.0（Vite 8 要求 `^20.19.0 || >=22.12.0`，Vitest 5 要求 `>=22.12.0`）。
- 依赖版本精确锁定：`vite@8.3.4`、`vitest@5.0.5`、`typescript@5.9.3`、`fake-indexeddb@6.2.6`。不加其他依赖。
- 测试文件与源码同目录，命名 `*.test.ts`；Vitest 环境 `node`。
- `tsconfig` 开启 `strict` 与 `verbatimModuleSyntax`：类型导入必须写 `import type` 或 `type` 修饰。
- 游戏内计时只用帧时间戳（rAF 的 `now`）和 `PointerEvent.timeStamp`；`Date.now()` 只用于记录时间戳、种子和日期键。
- 日期键 `YYYY-MM-DD`，默认 04:00 分界。
- IndexedDB 库名 `focus-trainer`，版本 1，四个 store：`sessions`、`gameState`、`plans`、`settings`。
- 界面文案用中文；代码标识符用英文；代码默认不写注释，只在原因不明显处写一行中文注释。
- 修改代码只用编辑工具（Write / Edit），不用 sed、heredoc、脚本改代码。
- 测试替身（如 `FakeEngine`）只用于测试编排逻辑，在测试文件里写明用途；不得用替身冒充真实存储或真实游戏的验收。
- 对 spec 的一处补充：`GameModule` 增加 `formatSummary(summary): SummaryItem[]`，供结算页把 `summarize` 的数字转成带单位的中文文案。
- M1 的注册表只有舒尔特方格，所以 M1 的今日计划只含 1 个游戏；趋势页、雷达值、每日序列放到 M3。

## 文件结构

| 文件 | 职责 |
|---|---|
| `focus-trainer/package.json`、`tsconfig.json`、`vite.config.ts`、`vitest.config.ts`、`index.html` | 项目配置与入口页 |
| `src/core/types.ts` | 共享类型与 `GAME_IDS` |
| `src/core/rng.ts` | 可播种随机数 mulberry32 与 `randInt`、`shuffle`、`pick` |
| `src/core/daykey.ts` | `dayKey`、`addDays` |
| `src/core/adaptive.ts` | 升降档 `step`（唯一改档位的地方） |
| `src/core/scoring.ts` | 能力指数 `abilityIndex` |
| `src/core/scheduler.ts` | 今日计划、完成标记、连续打卡 |
| `src/core/storage.ts` | `Repository` 接口、`MemoryRepository`、`openIdbRepository` |
| `src/core/session.ts` | `SessionRunner`：轮次编排、补轮、作废、结算 |
| `src/games/schulte/rules.ts` | 档位表、判定、结算指标与文案 |
| `src/games/schulte/engine.ts` | 舒尔特单轮状态机 |
| `src/games/schulte/view.ts` | 方格 DOM 与点击转 `InputEvent` |
| `src/games/schulte/index.ts` | 组装成 `GameModule` |
| `src/games/registry.ts` | 已实现游戏的注册表 |
| `src/ui/dom.ts` | `h()` 建元素 |
| `src/ui/router.ts` | hash 路由 |
| `src/ui/context.ts` | `AppContext` 类型 |
| `src/ui/today.ts` | 生成或读取今日计划、保存一次训练 |
| `src/ui/pages/home.ts`、`play.ts`、`result.ts`、`settings.ts` | 四个页面 |
| `src/ui/styles.css` | 基础深色样式（M3 再打磨） |
| `src/main.ts` | 启动装配 |

---

### Task 1: 项目脚手架与可播种随机数

**Files:**
- Create: `focus-trainer/package.json`
- Create: `focus-trainer/tsconfig.json`
- Create: `focus-trainer/vite.config.ts`
- Create: `focus-trainer/vitest.config.ts`
- Create: `focus-trainer/index.html`
- Create: `focus-trainer/src/main.ts`（本任务只放占位，Task 9 重写）
- Create: `focus-trainer/src/core/rng.ts`
- Test: `focus-trainer/src/core/rng.test.ts`

**Interfaces:**
- Produces: `type Rng = () => number`；`createRng(seed: number): Rng`；`randInt(rng: Rng, min: number, maxIncl: number): number`；`shuffle<T>(rng: Rng, items: readonly T[]): T[]`；`pick<T>(rng: Rng, items: readonly T[]): T`

- [ ] **Step 1: 写配置文件**

`focus-trainer/package.json`：

```json
{
  "name": "focus-trainer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "fake-indexeddb": "6.2.6",
    "typescript": "5.9.3",
    "vite": "8.3.4",
    "vitest": "5.0.5"
  }
}
```

`focus-trainer/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`focus-trainer/vite.config.ts`：

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
});
```

`focus-trainer/vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`focus-trainer/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#14161a" />
    <title>专注力训练</title>
  </head>
  <body>
    <div id="app">
      <div id="banner" hidden></div>
      <main id="view"></main>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`focus-trainer/src/main.ts`（占位）：

```ts
document.getElementById('view')!.textContent = '专注力训练';
```

- [ ] **Step 2: 安装依赖**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npm install
```

Expected: 生成 `package-lock.json` 与 `node_modules/`，无 `ERR!`。再执行 `npx vitest --version`，输出含 `5.0.5`。

- [ ] **Step 3: 写失败的测试**

`focus-trainer/src/core/rng.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { createRng, pick, randInt, shuffle } from './rng';

describe('createRng', () => {
  it('同一种子给出同一序列', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('不同种子给出不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });

  it('输出落在 [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('randInt', () => {
  it('取值含两端且不越界', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = randInt(r, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

describe('shuffle', () => {
  it('返回原数组的一个排列且不改动原数组', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = shuffle(createRng(5), items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...out].sort((x, y) => x - y)).toEqual(items);
  });

  it('同一种子打乱结果相同', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffle(createRng(9), items)).toEqual(shuffle(createRng(9), items));
  });
});

describe('pick', () => {
  it('只取数组里的元素', () => {
    const r = createRng(11);
    for (let i = 0; i < 100; i++) expect(['x', 'y', 'z']).toContain(pick(r, ['x', 'y', 'z']));
  });
});
```

- [ ] **Step 4: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/rng.test.ts
```

Expected: FAIL，报错找不到 `./rng`。

- [ ] **Step 5: 写实现**

`focus-trainer/src/core/rng.ts`：

```ts
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: Rng, min: number, maxIncl: number): number {
  return min + Math.floor(rng() * (maxIncl - min + 1));
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}
```

- [ ] **Step 6: 运行测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/rng.test.ts && npx tsc --noEmit
```

Expected: 7 个测试 PASS；`tsc` 无输出。

- [ ] **Step 7: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/package.json focus-trainer/package-lock.json focus-trainer/tsconfig.json focus-trainer/vite.config.ts focus-trainer/vitest.config.ts focus-trainer/index.html focus-trainer/src/main.ts focus-trainer/src/core/rng.ts focus-trainer/src/core/rng.test.ts && git commit -m "feat: scaffold focus-trainer and add seeded rng"
```

### Task 2: 共享类型、日期键与升降档

**Files:**
- Create: `focus-trainer/src/core/types.ts`
- Create: `focus-trainer/src/core/daykey.ts`
- Create: `focus-trainer/src/core/adaptive.ts`
- Test: `focus-trainer/src/core/daykey.test.ts`
- Test: `focus-trainer/src/core/adaptive.test.ts`

**Interfaces:**
- Produces（`types.ts`，后续所有任务使用）：`GameId`、`GAME_IDS`、`Outcome`、`Mode`、`InputEvent`、`TrialRecord`、`RoundResult`、`GameEngine<S>`、`GameView<S>`、`StaircaseRule`、`RoundRecord`、`SummaryItem`、`GameModule`、`AdaptiveState`、`GameState`、`SessionRecord`、`DayPlan`、`Settings`
- Produces：`dayKey(epochMs: number, dayStartHour?: number): string`；`addDays(key: string, delta: number): string`
- Produces：`INITIAL_ADAPTIVE: AdaptiveState`；`step(state: AdaptiveState, outcome: Outcome, rule: StaircaseRule, maxLevel: number): AdaptiveState`

- [ ] **Step 1: 写类型文件**

`focus-trainer/src/core/types.ts`：

```ts
export type GameId = 'schulte' | 'stroop' | 'seqmem' | 'mot' | 'gestalt';

export const GAME_IDS: readonly GameId[] = ['schulte', 'stroop', 'seqmem', 'mot', 'gestalt'];

export type Outcome = 'pass' | 'hold' | 'fail';

export type Mode = 'plan' | 'free';

export type InputEvent =
  | { kind: 'cell'; index: number; t: number }
  | { kind: 'choice'; index: number; t: number }
  | { kind: 'point'; x: number; y: number; t: number };

export interface TrialRecord {
  onset: number;
  rt: number | null;
  correct: boolean;
  [field: string]: unknown;
}

export interface RoundResult {
  level: number;
  seed: number;
  trials: TrialRecord[];
  metrics: Record<string, number>;
  timingValid: boolean;
}

export interface GameEngine<S = unknown> {
  configure(level: number, seed: number, roundNo: number): void;
  start(now: number): void;
  input(e: InputEvent): void;
  tick(now: number): void;
  snapshot(): S;
  isDone(): boolean;
  result(): RoundResult;
}

export interface GameView<S = unknown> {
  render(snapshot: S): void;
  destroy(): void;
}

export interface StaircaseRule {
  upAfter: number;
  downAfter: number;
}

export interface RoundRecord extends RoundResult {
  roundNo: number;
  outcome: Outcome;
  score01: number;
  counted: boolean;
}

export interface SummaryItem {
  label: string;
  value: string;
}

export interface GameModule {
  id: GameId;
  name: string;
  ability: string;
  maxLevel: number;
  roundsPerSession: number;
  roundBreak: 'tap' | 'auto';
  staircase: StaircaseRule;
  instructions: string;
  createEngine(): GameEngine;
  createView(host: HTMLElement, emit: (e: InputEvent) => void): GameView;
  judge(r: RoundResult): { outcome: Outcome; score01: number };
  summarize(rounds: readonly RoundRecord[]): Record<string, number>;
  formatSummary(summary: Record<string, number>): SummaryItem[];
}

export interface AdaptiveState {
  level: number;
  passStreak: number;
  failStreak: number;
}

export interface GameState extends AdaptiveState {
  gameId: GameId;
  lastPlayedDayKey: string | null;
}

export interface SessionRecord {
  id?: number;
  gameId: GameId;
  mode: Mode;
  dayKey: string;
  startedAt: number;
  durationMs: number;
  startLevel: number;
  endLevel: number;
  rounds: RoundRecord[];
  summary: Record<string, number>;
  ability: number;
}

export interface DayPlan {
  dayKey: string;
  games: GameId[];
  completed: GameId[];
}

export interface Settings {
  dayStartHour: number;
}
```

- [ ] **Step 2: 写失败的测试**

`focus-trainer/src/core/daykey.test.ts`（用本地时间构造时刻，测试与机器时区无关）：

```ts
import { describe, expect, it } from 'vitest';
import { addDays, dayKey } from './daykey';

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('dayKey', () => {
  it('默认 04:00 分界：03:59 算前一天，04:00 算当天', () => {
    expect(dayKey(at(2026, 10, 18, 3, 59))).toBe('2026-10-17');
    expect(dayKey(at(2026, 10, 18, 4, 0))).toBe('2026-10-18');
    expect(dayKey(at(2026, 10, 18, 23, 59))).toBe('2026-10-18');
  });

  it('分界改成 0 点时按自然日', () => {
    expect(dayKey(at(2026, 10, 18, 0, 30), 0)).toBe('2026-10-18');
    expect(dayKey(at(2026, 10, 18, 3, 59), 0)).toBe('2026-10-18');
  });

  it('跨月与跨年', () => {
    expect(dayKey(at(2026, 11, 1, 2, 0))).toBe('2026-10-31');
    expect(dayKey(at(2027, 1, 1, 1, 0))).toBe('2026-12-31');
  });

  it('月和日补零', () => {
    expect(dayKey(at(2026, 3, 5, 12, 0))).toBe('2026-03-05');
  });

  it('夏令时开始日仍按本地小时分界', () => {
    const saved = process.env.TZ;
    process.env.TZ = 'Europe/London';
    try {
      // 只在进程内改 TZ 真的生效时才断言，避免在不支持的平台上当然是绿的
      const probe = new Date(2026, 2, 29, 12, 0);
      if (probe.getTimezoneOffset() === -60) {
        expect(dayKey(probe.getTime())).toBe('2026-03-29');
        expect(dayKey(at(2026, 3, 29, 4, 0))).toBe('2026-03-29');
        expect(dayKey(at(2026, 3, 29, 3, 30))).toBe('2026-03-28');
      }
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });
});

describe('addDays', () => {
  it('前后推算并跨月跨年', () => {
    expect(addDays('2026-10-18', 1)).toBe('2026-10-19');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-10-18', 0)).toBe('2026-10-18');
  });
});
```

`focus-trainer/src/core/adaptive.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { INITIAL_ADAPTIVE, step } from './adaptive';
import type { AdaptiveState } from './types';

const fast = { upAfter: 1, downAfter: 1 };
const slow = { upAfter: 2, downAfter: 1 };
const s = (level: number, passStreak = 0, failStreak = 0): AdaptiveState => ({ level, passStreak, failStreak });

describe('step', () => {
  it('初始状态是 1 档、连胜连败都为 0', () => {
    expect(INITIAL_ADAPTIVE).toEqual(s(1));
  });

  it('1 升 1 降：pass 升一档，fail 降一档', () => {
    expect(step(s(3), 'pass', fast, 10)).toEqual(s(4));
    expect(step(s(3), 'fail', fast, 10)).toEqual(s(2));
  });

  it('hold 不改档位并清空两个计数', () => {
    expect(step(s(3, 1, 0), 'hold', slow, 10)).toEqual(s(3));
  });

  it('2 升 1 降：第一次 pass 只累计，第二次升档', () => {
    const once = step(s(3), 'pass', slow, 10);
    expect(once).toEqual(s(3, 1, 0));
    expect(step(once, 'pass', slow, 10)).toEqual(s(4));
  });

  it('pass 之后 fail 会清空连胜', () => {
    expect(step(s(3, 1, 0), 'fail', slow, 10)).toEqual(s(2));
  });

  it('顶档 pass 与 1 档 fail 不越界', () => {
    expect(step(s(10), 'pass', fast, 10)).toEqual(s(10));
    expect(step(s(1), 'fail', fast, 10)).toEqual(s(1));
  });

  it('不修改传入的状态', () => {
    const before = s(5, 1, 0);
    step(before, 'pass', slow, 10);
    expect(before).toEqual(s(5, 1, 0));
  });
});
```

- [ ] **Step 3: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/daykey.test.ts src/core/adaptive.test.ts
```

Expected: FAIL，报错找不到 `./daykey` 与 `./adaptive`。

- [ ] **Step 4: 写实现**

`focus-trainer/src/core/daykey.ts`：

```ts
function formatLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 必须用本地小时判断：「epoch 减 dayStartHour 小时」在夏令时切换日与本地小时不等价，
// 会把 04:00 的实例误判成前一天（Europe/London 2026-03-29 实测）。
export function dayKey(epochMs: number, dayStartHour = 4): string {
  const d = new Date(epochMs);
  if (d.getHours() >= dayStartHour) return formatLocal(d);
  return formatLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12));
}

export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return formatLocal(new Date(y, m - 1, d + delta, 12));
}
```

`focus-trainer/src/core/adaptive.ts`：

```ts
import type { AdaptiveState, Outcome, StaircaseRule } from './types';

export const INITIAL_ADAPTIVE: AdaptiveState = { level: 1, passStreak: 0, failStreak: 0 };

export function step(state: AdaptiveState, outcome: Outcome, rule: StaircaseRule, maxLevel: number): AdaptiveState {
  let { level, passStreak, failStreak } = state;
  if (outcome === 'pass') {
    passStreak += 1;
    failStreak = 0;
    if (passStreak >= rule.upAfter) {
      level += 1;
      passStreak = 0;
    }
  } else if (outcome === 'fail') {
    failStreak += 1;
    passStreak = 0;
    if (failStreak >= rule.downAfter) {
      level -= 1;
      failStreak = 0;
    }
  } else {
    passStreak = 0;
    failStreak = 0;
  }
  return { level: Math.min(maxLevel, Math.max(1, level)), passStreak, failStreak };
}
```

- [ ] **Step 5: 运行测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/daykey.test.ts src/core/adaptive.test.ts && npx tsc --noEmit
```

Expected: 13 个测试 PASS；`tsc` 无输出。

- [ ] **Step 6: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/core/types.ts focus-trainer/src/core/daykey.ts focus-trainer/src/core/daykey.test.ts focus-trainer/src/core/adaptive.ts focus-trainer/src/core/adaptive.test.ts && git commit -m "feat(core): add shared types, day keys and staircase"
```

### Task 3: 能力指数与今日计划

**Files:**
- Create: `focus-trainer/src/core/scoring.ts`
- Create: `focus-trainer/src/core/scheduler.ts`
- Test: `focus-trainer/src/core/scoring.test.ts`
- Test: `focus-trainer/src/core/scheduler.test.ts`

**Interfaces:**
- Consumes: `RoundRecord`、`DayPlan`、`GameId`、`GAME_IDS`（Task 2）；`addDays`（Task 2）
- Produces：`abilityIndex(rounds: readonly RoundRecord[], maxLevel: number): number`
- Produces：`interface GameStanding { gameId: GameId; lastPlayedDayKey: string | null; lastAbility: number | null }`；`PLAN_SIZE = 3`；`buildPlan(dayKey: string, standings: readonly GameStanding[]): DayPlan`；`markCompleted(plan: DayPlan, gameId: GameId): DayPlan`；`isPlanComplete(plan: DayPlan): boolean`；`nextPending(plan: DayPlan): GameId | null`；`streak(plans: readonly DayPlan[], todayKey: string): number`

- [ ] **Step 1: 写失败的测试**

`focus-trainer/src/core/scoring.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { abilityIndex } from './scoring';
import type { RoundRecord } from './types';

const round = (level: number, score01: number, counted = true, timingValid = true): RoundRecord => ({
  level,
  seed: 0,
  trials: [],
  metrics: {},
  timingValid,
  roundNo: 1,
  outcome: 'hold',
  score01,
  counted,
});

describe('abilityIndex', () => {
  it('没有计分轮时为 0', () => {
    expect(abilityIndex([], 10)).toBe(0);
    expect(abilityIndex([round(5, 1, false)], 10)).toBe(0);
  });

  it('3 个计分轮取最后 2 个求均值', () => {
    // (3-1+0.5 + 4-1+0.5) / 2 = 3，100*3/10 = 30
    expect(abilityIndex([round(1, 0), round(3, 0.5), round(4, 0.5)], 10)).toBe(30);
  });

  it('4 个计分轮取最后 2 个', () => {
    expect(abilityIndex([round(9, 1), round(9, 1), round(2, 0), round(2, 0)], 10)).toBe(10);
  });

  it('忽略未计分轮', () => {
    expect(abilityIndex([round(2, 0), round(10, 1, false), round(2, 0)], 10)).toBe(10);
  });

  it('过滤只看 counted，不看 timingValid', () => {
    // SessionRunner 会产出 counted:true + timingValid:false 的补满轮，必须计入
    expect(abilityIndex([round(4, 0.5, true, false)], 10)).toBe(35);
  });

  it('夹在 0 到 100', () => {
    expect(abilityIndex([round(10, 1)], 10)).toBe(100);
    expect(abilityIndex([round(1, 0)], 10)).toBe(0);
    expect(abilityIndex([round(1, 500)], 10)).toBe(100);
    expect(abilityIndex([round(1, -50)], 10)).toBe(0);
  });

  it('四舍五入到整数', () => {
    // (1-1+0.333) / 12 * 100 = 2.775
    expect(abilityIndex([round(1, 0.333)], 12)).toBe(3);
  });
});
```

`focus-trainer/src/core/scheduler.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildPlan, isPlanComplete, markCompleted, nextPending, streak, type GameStanding } from './scheduler';
import type { DayPlan, GameId } from './types';

const st = (gameId: GameId, lastPlayedDayKey: string | null = null, lastAbility: number | null = null): GameStanding => ({
  gameId,
  lastPlayedDayKey,
  lastAbility,
});

const all = (overrides: Partial<Record<GameId, GameStanding>> = {}): GameStanding[] =>
  (['schulte', 'stroop', 'seqmem', 'mot', 'gestalt'] as GameId[]).map((id) => overrides[id] ?? st(id));

const plan = (dayKey: string, games: GameId[], completed: GameId[] = []): DayPlan => ({ dayKey, games, completed });

describe('buildPlan', () => {
  it('首日全都没练过：按固定顺序取前 3 个', () => {
    expect(buildPlan('2026-10-18', all())).toEqual(plan('2026-10-18', ['schulte', 'stroop', 'seqmem']));
  });

  it('日期与能力全相同时按 GAME_IDS 固定顺序，不按输入顺序', () => {
    const tied = all({
      schulte: st('schulte', '2026-10-18', 50),
      stroop: st('stroop', '2026-10-18', 50),
      seqmem: st('seqmem', '2026-10-18', 50),
      mot: st('mot', '2026-10-18', 50),
      gestalt: st('gestalt', '2026-10-18', 50),
    }).reverse();
    expect(buildPlan('2026-10-19', tied)).toEqual(plan('2026-10-19', ['schulte', 'stroop', 'seqmem']));
  });

  it('次日：没练过的排最前，再按最近练习日期升序', () => {
    const standings = all({
      schulte: st('schulte', '2026-10-18', 40),
      stroop: st('stroop', '2026-10-18', 20),
      seqmem: st('seqmem', '2026-10-18', 30),
    });
    expect(buildPlan('2026-10-19', standings).games).toEqual(['mot', 'gestalt', 'stroop']);
  });

  it('最近练习日期相同时按上次能力指数升序，没有记录按 0', () => {
    const standings = all({
      schulte: st('schulte', '2026-10-17', 50),
      stroop: st('stroop', '2026-10-17', 10),
      seqmem: st('seqmem', '2026-10-17', 30),
      mot: st('mot', '2026-10-17', null),
      gestalt: st('gestalt', '2026-10-18', 0),
    });
    expect(buildPlan('2026-10-19', standings).games).toEqual(['mot', 'stroop', 'seqmem']);
  });

  it('不足 3 个游戏时全部入选', () => {
    expect(buildPlan('2026-10-18', [st('schulte')]).games).toEqual(['schulte']);
  });

  it('不修改传入数组的顺序', () => {
    const standings = all({ schulte: st('schulte', '2026-10-18', 10) });
    buildPlan('2026-10-19', standings);
    expect(standings.map((s) => s.gameId)).toEqual(['schulte', 'stroop', 'seqmem', 'mot', 'gestalt']);
  });
});

describe('markCompleted / isPlanComplete / nextPending', () => {
  const p = plan('2026-10-18', ['schulte', 'stroop', 'seqmem']);

  it('标记计划内游戏，重复标记不重复记录', () => {
    const once = markCompleted(p, 'stroop');
    expect(once.completed).toEqual(['stroop']);
    expect(markCompleted(once, 'stroop').completed).toEqual(['stroop']);
    expect(p.completed).toEqual([]);
  });

  it('计划外游戏不影响计划', () => {
    expect(markCompleted(p, 'mot')).toEqual(p);
  });

  it('全部完成才算完成，空计划不算完成', () => {
    let q = markCompleted(p, 'schulte');
    q = markCompleted(q, 'stroop');
    expect(isPlanComplete(q)).toBe(false);
    expect(isPlanComplete(markCompleted(q, 'seqmem'))).toBe(true);
    expect(isPlanComplete(plan('2026-10-18', []))).toBe(false);
  });

  it('nextPending 按计划顺序给出第一个未完成项', () => {
    expect(nextPending(p)).toBe('schulte');
    expect(nextPending(markCompleted(p, 'schulte'))).toBe('stroop');
    expect(nextPending(plan('2026-10-18', ['schulte'], ['schulte']))).toBeNull();
  });
});

describe('streak', () => {
  const done = (dayKey: string) => plan(dayKey, ['schulte'], ['schulte']);
  const open = (dayKey: string) => plan(dayKey, ['schulte'], []);

  it('今天已完成：从今天往前数', () => {
    expect(streak([done('2026-10-16'), done('2026-10-17'), done('2026-10-18')], '2026-10-18')).toBe(3);
  });

  it('今天未完成不打断连续，从昨天往前数', () => {
    expect(streak([done('2026-10-16'), done('2026-10-17'), open('2026-10-18')], '2026-10-18')).toBe(2);
    expect(streak([done('2026-10-16'), done('2026-10-17')], '2026-10-18')).toBe(2);
  });

  it('中间断一天就停', () => {
    expect(streak([done('2026-10-15'), open('2026-10-16'), done('2026-10-17'), done('2026-10-18')], '2026-10-18')).toBe(2);
    expect(streak([done('2026-10-15'), done('2026-10-17')], '2026-10-18')).toBe(1);
  });

  it('昨天没完成且今天也没完成时为 0', () => {
    expect(streak([open('2026-10-17'), open('2026-10-18')], '2026-10-18')).toBe(0);
    expect(streak([], '2026-10-18')).toBe(0);
  });

  it('跨月连续', () => {
    expect(streak([done('2026-09-30'), done('2026-10-01')], '2026-10-01')).toBe(2);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/scoring.test.ts src/core/scheduler.test.ts
```

Expected: FAIL，报错找不到 `./scoring` 与 `./scheduler`。

- [ ] **Step 3: 写实现**

`focus-trainer/src/core/scoring.ts`：

```ts
import type { RoundRecord } from './types';

export function abilityIndex(rounds: readonly RoundRecord[], maxLevel: number): number {
  const counted = rounds.filter((r) => r.counted);
  if (counted.length === 0) return 0;
  const tail = counted.slice(counted.length - Math.ceil(counted.length / 2));
  const mean = tail.reduce((sum, r) => sum + (r.level - 1 + r.score01), 0) / tail.length;
  return Math.min(100, Math.max(0, Math.round((100 * mean) / maxLevel)));
}
```

`focus-trainer/src/core/scheduler.ts`：

```ts
import { addDays } from './daykey';
import { GAME_IDS, type DayPlan, type GameId } from './types';

export interface GameStanding {
  gameId: GameId;
  lastPlayedDayKey: string | null;
  lastAbility: number | null;
}

export const PLAN_SIZE = 3;

function compareStanding(a: GameStanding, b: GameStanding): number {
  if (a.lastPlayedDayKey !== b.lastPlayedDayKey) {
    if (a.lastPlayedDayKey === null) return -1;
    if (b.lastPlayedDayKey === null) return 1;
    return a.lastPlayedDayKey < b.lastPlayedDayKey ? -1 : 1;
  }
  const abilityDiff = (a.lastAbility ?? 0) - (b.lastAbility ?? 0);
  if (abilityDiff !== 0) return abilityDiff;
  return GAME_IDS.indexOf(a.gameId) - GAME_IDS.indexOf(b.gameId);
}

export function buildPlan(dayKey: string, standings: readonly GameStanding[]): DayPlan {
  const games = standings
    .slice()
    .sort(compareStanding)
    .slice(0, PLAN_SIZE)
    .map((s) => s.gameId);
  return { dayKey, games, completed: [] };
}

export function markCompleted(plan: DayPlan, gameId: GameId): DayPlan {
  if (!plan.games.includes(gameId) || plan.completed.includes(gameId)) return plan;
  return { ...plan, completed: [...plan.completed, gameId] };
}

export function isPlanComplete(plan: DayPlan): boolean {
  return plan.games.length > 0 && plan.games.every((g) => plan.completed.includes(g));
}

export function nextPending(plan: DayPlan): GameId | null {
  return plan.games.find((g) => !plan.completed.includes(g)) ?? null;
}

export function streak(plans: readonly DayPlan[], todayKey: string): number {
  const byKey = new Map(plans.map((p) => [p.dayKey, p]));
  const today = byKey.get(todayKey);
  let key = today && isPlanComplete(today) ? todayKey : addDays(todayKey, -1);
  let count = 0;
  for (;;) {
    const p = byKey.get(key);
    if (!p || !isPlanComplete(p)) return count;
    count += 1;
    key = addDays(key, -1);
  }
}
```

- [ ] **Step 4: 运行测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/scoring.test.ts src/core/scheduler.test.ts && npx tsc --noEmit
```

Expected: 22 个测试 PASS；`tsc` 无输出。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/core/scoring.ts focus-trainer/src/core/scoring.test.ts focus-trainer/src/core/scheduler.ts focus-trainer/src/core/scheduler.test.ts && git commit -m "feat(core): add ability index and daily plan scheduler"
```

### Task 4: 存储层（内存实现与 IndexedDB 实现）

**Files:**
- Create: `focus-trainer/src/core/storage.ts`
- Test: `focus-trainer/src/core/storage.test.ts`

**Interfaces:**
- Consumes: `GameId`、`GameState`、`SessionRecord`、`DayPlan`、`Settings`（Task 2）；`INITIAL_ADAPTIVE`（Task 2）
- Produces：`DEFAULT_SETTINGS: Settings`；`defaultGameState(gameId: GameId): GameState`；`interface Repository`（方法见下方代码）；`class MemoryRepository implements Repository`；`openIdbRepository(name?: string): Promise<Repository>`
- 约定：`listSessions` 按 `startedAt` 升序；`listPlans` 按 `dayKey` 升序；`listGameStates` 按 `gameId` 字典序；所有读取方法返回副本；`saveSession` 在一个事务里写 session、gameState 与 plan（plan 为 `null` 时不写），返回新 session 的 id。

- [ ] **Step 1: 写失败的测试**

`focus-trainer/src/core/storage.test.ts`（两种实现跑同一组契约测试；IndexedDB 用 fake-indexeddb，它是规范实现的内存版，用来验证真实的 IndexedDB 调用代码）：

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRepository, defaultGameState, openIdbRepository, type Repository } from './storage';
import type { DayPlan, GameId, GameState, SessionRecord } from './types';

let dbSeq = 0;
const uniqueDbName = () => `focus-trainer-test-${++dbSeq}`;

const rec = (gameId: GameId, startedAt: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  gameId,
  mode: 'free',
  dayKey: '2026-10-18',
  startedAt,
  durationMs: 1000,
  startLevel: 1,
  endLevel: 2,
  rounds: [],
  summary: { bestTimeMs: 5000 },
  ability: 12,
  ...extra,
});

const state = (gameId: GameId, level = 2): GameState => ({
  gameId,
  level,
  passStreak: 0,
  failStreak: 0,
  lastPlayedDayKey: '2026-10-18',
});

const dayPlan = (dayKey: string, completed: GameId[] = []): DayPlan => ({ dayKey, games: ['schulte'], completed });

const impls = [
  { name: 'memory', make: async (): Promise<Repository> => new MemoryRepository() },
  { name: 'indexeddb', make: (): Promise<Repository> => openIdbRepository(uniqueDbName()) },
];

describe.each(impls)('$name repository', ({ make }) => {
  let repo: Repository;
  beforeEach(async () => {
    repo = await make();
  });

  it('没存过的游戏返回默认状态', async () => {
    expect(await repo.getGameState('mot')).toEqual(defaultGameState('mot'));
    expect(defaultGameState('mot')).toEqual({ gameId: 'mot', level: 1, passStreak: 0, failStreak: 0, lastPlayedDayKey: null });
  });

  it('saveSession 一次写入 session、gameState 与 plan', async () => {
    const id = await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18', ['schulte']));
    expect(typeof id).toBe('number');
    expect(await repo.getSession(id)).toEqual({ ...rec('schulte', 100), id });
    expect(await repo.getGameState('schulte')).toEqual(state('schulte', 3));
    expect(await repo.getPlan('2026-10-18')).toEqual(dayPlan('2026-10-18', ['schulte']));
  });

  it('plan 为 null 时不写计划', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte'), null);
    expect(await repo.getPlan('2026-10-18')).toBeNull();
  });

  it('记录里带着值为 undefined 的 id 也能写入', async () => {
    const id = await repo.saveSession({ ...rec('schulte', 100), id: undefined }, state('schulte'), null);
    expect((await repo.getSession(id))?.id).toBe(id);
  });

  it('listSessions 按游戏过滤并按开始时间升序', async () => {
    await repo.saveSession(rec('schulte', 300), state('schulte'), null);
    await repo.saveSession(rec('stroop', 200), state('stroop'), null);
    await repo.saveSession(rec('schulte', 100), state('schulte'), null);
    expect((await repo.listSessions('schulte')).map((s) => s.startedAt)).toEqual([100, 300]);
    expect((await repo.listSessions()).map((s) => s.startedAt)).toEqual([100, 200, 300]);
    expect(await repo.listSessions('mot')).toEqual([]);
  });

  it('lastSession 返回最晚的一次，没有时为 null', async () => {
    expect(await repo.lastSession('schulte')).toBeNull();
    await repo.saveSession(rec('schulte', 100, { ability: 1 }), state('schulte'), null);
    await repo.saveSession(rec('schulte', 200, { ability: 2 }), state('schulte'), null);
    expect((await repo.lastSession('schulte'))?.ability).toBe(2);
  });

  it('getSession 找不到时为 null', async () => {
    expect(await repo.getSession(9999)).toBeNull();
  });

  it('设置有默认值并能往返', async () => {
    expect(await repo.getSettings()).toEqual({ dayStartHour: 4 });
    await repo.putSettings({ dayStartHour: 2 });
    expect(await repo.getSettings()).toEqual({ dayStartHour: 2 });
  });

  it('计划能往返，listPlans 按日期升序', async () => {
    expect(await repo.getPlan('2026-10-18')).toBeNull();
    await repo.putPlan(dayPlan('2026-10-18'));
    await repo.putPlan(dayPlan('2026-10-16'));
    await repo.putPlan(dayPlan('2026-10-18', ['schulte']));
    expect((await repo.listPlans()).map((p) => [p.dayKey, p.completed.length])).toEqual([
      ['2026-10-16', 0],
      ['2026-10-18', 1],
    ]);
  });

  it('listGameStates 按 gameId 字典序返回已保存的状态', async () => {
    await repo.saveSession(rec('stroop', 1), state('stroop'), null);
    await repo.saveSession(rec('mot', 2), state('mot'), null);
    expect((await repo.listGameStates()).map((s) => s.gameId)).toEqual(['mot', 'stroop']);
  });

  it('返回的是副本，改动不影响库里的数据', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18'));
    const s = await repo.getGameState('schulte');
    s.level = 9;
    const p = await repo.getPlan('2026-10-18');
    p?.completed.push('schulte');
    expect((await repo.getGameState('schulte')).level).toBe(3);
    expect((await repo.getPlan('2026-10-18'))?.completed).toEqual([]);
  });

  it('缺 key 的记录两种实现都拒绝且不落库', async () => {
    const broken = { games: ['schulte'], completed: [] } as unknown as DayPlan;
    await expect(repo.saveSession(rec('schulte', 100), state('schulte', 5), broken)).rejects.toThrow(TypeError);
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.getGameState('schulte')).toEqual(defaultGameState('schulte'));
    await repo.saveSession(rec('schulte', 120), state('schulte', 5), null);
    expect(await repo.listSessions()).toHaveLength(1);
  });

  it('写入后修改入参对象不影响库内数据', async () => {
    const rec1 = rec('schulte', 100);
    const st1 = state('schulte', 3);
    await repo.saveSession(rec1, st1, dayPlan('2026-10-18'));
    rec1.ability = 999;
    st1.level = 9;
    expect((await repo.lastSession('schulte'))?.ability).not.toBe(999);
    expect((await repo.getGameState('schulte')).level).toBe(3);
  });

  it('clearAll 清空全部数据', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18'));
    await repo.putSettings({ dayStartHour: 0 });
    await repo.clearAll();
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.listGameStates()).toEqual([]);
    expect(await repo.listPlans()).toEqual([]);
    expect(await repo.getSettings()).toEqual({ dayStartHour: 4 });
  });
});

describe('openIdbRepository', () => {
  it('同一事务：计划写入失败时 session 和 gameState 都不落库', async () => {
    const repo = await openIdbRepository(uniqueDbName());
    // 带函数值的记录能过 assertWriteKeys，但 IndexedDB 结构化克隆会同步抛 DataError，
    // 用它专门验证 tx.abort() 这条回滚路径真的在承重。
    const broken = { dayKey: '2026-10-18', games: ['schulte'], completed: [() => undefined] } as unknown as DayPlan;
    await expect(repo.saveSession(rec('schulte', 100), state('schulte', 5), broken)).rejects.toThrow();
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.getGameState('schulte')).toEqual(defaultGameState('schulte'));
  });

  it('用同一库名重新打开，数据仍在', async () => {
    const name = uniqueDbName();
    const first = await openIdbRepository(name);
    await first.saveSession(rec('schulte', 100), state('schulte', 4), dayPlan('2026-10-18'));
    const second = await openIdbRepository(name);
    expect((await second.getGameState('schulte')).level).toBe(4);
    expect(await second.listSessions('schulte')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/storage.test.ts
```

Expected: FAIL，报错找不到 `./storage`。

- [ ] **Step 3: 写实现**

`focus-trainer/src/core/storage.ts`：

```ts
import { INITIAL_ADAPTIVE } from './adaptive';
import type { DayPlan, GameId, GameState, SessionRecord, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = { dayStartHour: 4 };

export function defaultGameState(gameId: GameId): GameState {
  return { gameId, ...INITIAL_ADAPTIVE, lastPlayedDayKey: null };
}

export interface Repository {
  getGameState(gameId: GameId): Promise<GameState>;
  listGameStates(): Promise<GameState[]>;
  getPlan(dayKey: string): Promise<DayPlan | null>;
  putPlan(plan: DayPlan): Promise<void>;
  listPlans(): Promise<DayPlan[]>;
  listSessions(gameId?: GameId): Promise<SessionRecord[]>;
  lastSession(gameId: GameId): Promise<SessionRecord | null>;
  getSession(id: number): Promise<SessionRecord | null>;
  saveSession(rec: SessionRecord, state: GameState, plan: DayPlan | null): Promise<number>;
  getSettings(): Promise<Settings>;
  putSettings(settings: Settings): Promise<void>;
  clearAll(): Promise<void>;
}

const byStartedAt = (a: SessionRecord, b: SessionRecord) => a.startedAt - b.startedAt;

// 两种实现必须拒绝同一批坏数据：内存实现对缺 key 的记录会静默写进 undefined 键，
// 真机 IndexedDB 会抛错并回滚，测试（跑内存实现）就会给出与设备相反的结论。
function assertWriteKeys(rec: SessionRecord, state: GameState, plan: DayPlan | null): void {
  if (typeof rec.gameId !== 'string' || typeof rec.dayKey !== 'string') throw new TypeError('session 缺 gameId 或 dayKey');
  if (typeof state.gameId !== 'string') throw new TypeError('gameState 缺 gameId');
  if (plan !== null && typeof plan.dayKey !== 'string') throw new TypeError('plan 缺 dayKey');
}

export class MemoryRepository implements Repository {
  private sessions: SessionRecord[] = [];
  private states = new Map<GameId, GameState>();
  private plans = new Map<string, DayPlan>();
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private nextId = 1;

  async getGameState(gameId: GameId): Promise<GameState> {
    const s = this.states.get(gameId);
    return s ? structuredClone(s) : defaultGameState(gameId);
  }

  async listGameStates(): Promise<GameState[]> {
    return [...this.states.values()]
      .sort((a, b) => (a.gameId < b.gameId ? -1 : 1))
      .map((s) => structuredClone(s));
  }

  async getPlan(dayKey: string): Promise<DayPlan | null> {
    const p = this.plans.get(dayKey);
    return p ? structuredClone(p) : null;
  }

  async putPlan(plan: DayPlan): Promise<void> {
    this.plans.set(plan.dayKey, structuredClone(plan));
  }

  async listPlans(): Promise<DayPlan[]> {
    return [...this.plans.values()]
      .sort((a, b) => (a.dayKey < b.dayKey ? -1 : 1))
      .map((p) => structuredClone(p));
  }

  async listSessions(gameId?: GameId): Promise<SessionRecord[]> {
    return this.sessions
      .filter((s) => gameId === undefined || s.gameId === gameId)
      .sort(byStartedAt)
      .map((s) => structuredClone(s));
  }

  async lastSession(gameId: GameId): Promise<SessionRecord | null> {
    const list = await this.listSessions(gameId);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async getSession(id: number): Promise<SessionRecord | null> {
    const s = this.sessions.find((x) => x.id === id);
    return s ? structuredClone(s) : null;
  }

  async saveSession(rec: SessionRecord, state: GameState, plan: DayPlan | null): Promise<number> {
    assertWriteKeys(rec, state, plan);
    const id = this.nextId++;
    this.sessions.push({ ...structuredClone(rec), id });
    this.states.set(state.gameId, structuredClone(state));
    if (plan) this.plans.set(plan.dayKey, structuredClone(plan));
    return id;
  }

  async getSettings(): Promise<Settings> {
    return { ...this.settings };
  }

  async putSettings(settings: Settings): Promise<void> {
    this.settings = { ...settings };
  }

  async clearAll(): Promise<void> {
    this.sessions = [];
    this.states.clear();
    this.plans.clear();
    this.settings = { ...DEFAULT_SETTINGS };
  }
}

const DB_VERSION = 1;
const SETTINGS_KEY = 'settings';
const ALL_STORES = ['sessions', 'gameState', 'plans', 'settings'];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
}

class IdbRepository implements Repository {
  constructor(private readonly db: IDBDatabase) {}

  private store(name: string, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    return this.db.transaction(name, mode).objectStore(name);
  }

  async getGameState(gameId: GameId): Promise<GameState> {
    const s = await req<GameState | undefined>(this.store('gameState').get(gameId));
    return s ?? defaultGameState(gameId);
  }

  listGameStates(): Promise<GameState[]> {
    return req<GameState[]>(this.store('gameState').getAll());
  }

  async getPlan(dayKey: string): Promise<DayPlan | null> {
    const p = await req<DayPlan | undefined>(this.store('plans').get(dayKey));
    return p ?? null;
  }

  async putPlan(plan: DayPlan): Promise<void> {
    const tx = this.db.transaction('plans', 'readwrite');
    const done = txDone(tx);
    tx.objectStore('plans').put(plan);
    await done;
  }

  listPlans(): Promise<DayPlan[]> {
    return req<DayPlan[]>(this.store('plans').getAll());
  }

  async listSessions(gameId?: GameId): Promise<SessionRecord[]> {
    const sessions = this.store('sessions');
    if (gameId === undefined) {
      const all = await req<SessionRecord[]>(sessions.getAll());
      return all.sort(byStartedAt);
    }
    const range = IDBKeyRange.bound([gameId, -Infinity], [gameId, Infinity]);
    return req<SessionRecord[]>(sessions.index('byGameStarted').getAll(range));
  }

  async lastSession(gameId: GameId): Promise<SessionRecord | null> {
    const list = await this.listSessions(gameId);
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async getSession(id: number): Promise<SessionRecord | null> {
    const s = await req<SessionRecord | undefined>(this.store('sessions').get(id));
    return s ?? null;
  }

  async saveSession(rec: SessionRecord, state: GameState, plan: DayPlan | null): Promise<number> {
    assertWriteKeys(rec, state, plan);
    const tx = this.db.transaction(['sessions', 'gameState', 'plans'], 'readwrite');
    const done = txDone(tx);
    // 自增主键：值为 undefined 的 id 属性会让 add 抛 DataError，必须去掉
    const toAdd: SessionRecord = { ...rec };
    delete toAdd.id;
    let idReq: IDBRequest<IDBValidKey>;
    try {
      idReq = tx.objectStore('sessions').add(toAdd);
      tx.objectStore('gameState').put(state);
      if (plan) tx.objectStore('plans').put(plan);
    } catch (err) {
      tx.abort();
      await done.catch(() => undefined);
      throw err;
    }
    const [id] = await Promise.all([req(idReq), done]);
    return id as number;
  }

  async getSettings(): Promise<Settings> {
    const row = await req<(Settings & { key: string }) | undefined>(this.store('settings').get(SETTINGS_KEY));
    return row ? { dayStartHour: row.dayStartHour } : { ...DEFAULT_SETTINGS };
  }

  async putSettings(settings: Settings): Promise<void> {
    const tx = this.db.transaction('settings', 'readwrite');
    const done = txDone(tx);
    tx.objectStore('settings').put({ key: SETTINGS_KEY, ...settings });
    await done;
  }

  async clearAll(): Promise<void> {
    const tx = this.db.transaction(ALL_STORES, 'readwrite');
    const done = txDone(tx);
    for (const name of ALL_STORES) tx.objectStore(name).clear();
    await done;
  }
}

export async function openIdbRepository(name = 'focus-trainer'): Promise<Repository> {
  const open = indexedDB.open(name, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    const sessions = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
    sessions.createIndex('byGameStarted', ['gameId', 'startedAt']);
    sessions.createIndex('byDay', 'dayKey');
    db.createObjectStore('gameState', { keyPath: 'gameId' });
    db.createObjectStore('plans', { keyPath: 'dayKey' });
    db.createObjectStore('settings', { keyPath: 'key' });
  };
  const db = await req(open);
  return new IdbRepository(db);
}
```

- [ ] **Step 4: 运行测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/storage.test.ts && npx tsc --noEmit
```

Expected: 30 个测试 PASS（14 个契约测试 × 2 种实现 + 2 个 IndexedDB 专属测试）；`tsc` 无输出。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/core/storage.ts focus-trainer/src/core/storage.test.ts && git commit -m "feat(core): add repository with memory and IndexedDB implementations"
```

### Task 5: SessionRunner（轮次编排、补轮、作废与结算）

**Files:**
- Create: `focus-trainer/src/core/session.ts`
- Test: `focus-trainer/src/core/session.test.ts`

**Interfaces:**
- Consumes: `GameModule`、`GameEngine`、`GameState`、`InputEvent`、`Mode`、`Outcome`、`RoundRecord`、`SessionRecord`（Task 2）；`step`（Task 2）；`abilityIndex`（Task 3）；`defaultGameState`（Task 4，仅测试用）
- Produces：
  - `type SessionPhase = 'ready' | 'playing' | 'between' | 'voided' | 'finished'`
  - `interface SessionSnapshot { phase; roundNo; roundsTotal; level; lastOutcome: Outcome | null; lastLevelChange: -1 | 0 | 1; lastInvalid: boolean; waitingForTap: boolean }`
  - `MAX_RETRIES = 3`、`AUTO_BREAK_MS = 600`
  - `class SessionRunner`：`constructor(module: GameModule, state: GameState, mode: Mode, seed: number, startedAtEpoch: number)`；`readonly engine: GameEngine`；`snapshot(): SessionSnapshot`；`beginRound(now: number): void`；`tick(now: number): void`；`input(e: InputEvent): void`；`voidCurrentRound(): void`；`isFinished(): boolean`；`finish(dayKey: string): { record: SessionRecord; state: GameState }`
- 行为约定（spec 5.1）：
  - 每轮 `engine.configure(state.level, seed + attempt, roundNo)`，`attempt` 每次开轮加 1（含补轮与作废重开），`roundNo` 是计分轮号。
  - `timingValid === false`：记一条 `counted: false` 的轮记录，同轮号补一轮；一次训练最多补 3 次，第 4 次起按 `hold` 计入（`score01` 用 `judge` 给的值）。
  - `voidCurrentRound()`：`playing` 时转 `voided`，当前轮不记录，不占补轮次数；`between` 时取消 `auto` 的自动衔接，改为等待点击。
  - `roundBreak === 'auto'`：轮结束后 600ms 由 `tick` 自动开下一轮；`'tap'`：等待调用方 `beginRound`。
  - `durationMs` = 最后一轮结束时刻 − 第一次 `beginRound` 时刻（帧时间轴）。
  - `finish()` 只能成功调用一次：第二次一律抛 `session already finished`（写库方只应在第一次成功时落盘，防止重复记录污染趋势与打卡）。
  - 时钟契约（实现内不做负值/NaN 兜底，靠调用方遵守）：`beginRound(now)` 与 `tick(now)` 必须传 `requestAnimationFrame` 回调的帧时间戳，`InputEvent.t` 必须传 `PointerEvent.timeStamp`；三者同源于 `performance.now()`，任何一处换成 `Date.now()` 都会让 `durationMs` 变成荒谬量级。

- [ ] **Step 1: 写失败的测试**

`focus-trainer/src/core/session.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { AUTO_BREAK_MS, MAX_RETRIES, SessionRunner } from './session';
import { defaultGameState } from './storage';
import type { GameEngine, GameModule, GameState, InputEvent, RoundResult } from './types';

// 测试替身：只用来驱动 SessionRunner 的轮次编排，不代表任何真实游戏。
// 事件里的 index 是本轮结果编码：1=pass，0=fail，2=hold，9=时序无效。
// choice 事件让本轮立即结束；cell 事件让本轮在下一次 tick 时结束。
class FakeEngine implements GameEngine<null> {
  readonly configured: Array<{ level: number; seed: number; roundNo: number }> = [];
  private level = 1;
  private seed = 0;
  private code = -1;
  private pending: number | null = null;
  private done = false;

  configure(level: number, seed: number, roundNo: number): void {
    this.configured.push({ level, seed, roundNo });
    this.level = level;
    this.seed = seed;
    this.code = -1;
    this.pending = null;
    this.done = false;
  }

  start(): void {}

  input(e: InputEvent): void {
    if (e.kind === 'choice') {
      this.code = e.index;
      this.done = true;
    } else if (e.kind === 'cell') {
      this.pending = e.index;
    }
  }

  tick(): void {
    if (this.pending !== null) {
      this.code = this.pending;
      this.pending = null;
      this.done = true;
    }
  }

  snapshot(): null {
    return null;
  }

  isDone(): boolean {
    return this.done;
  }

  result(): RoundResult {
    return { level: this.level, seed: this.seed, trials: [], metrics: { code: this.code }, timingValid: this.code !== INVALID };
  }
}

const PASS = 1;
const FAIL = 0;
const HOLD = 2;
const INVALID = 9;
const SEED = 1000;
const EPOCH = 1_700_000_000_000;

function makeModule(overrides: Partial<GameModule>): GameModule {
  return {
    id: 'schulte',
    name: '测试',
    ability: '测试',
    maxLevel: 10,
    roundsPerSession: 3,
    roundBreak: 'tap',
    staircase: { upAfter: 1, downAfter: 1 },
    instructions: '',
    createEngine: () => new FakeEngine(),
    createView: () => {
      throw new Error('测试中不创建 view');
    },
    // INVALID 必须显式映射成 pass：若与 HOLD 共用兜底的 hold，「补满配额后强制 hold」这条
    // 分支的两种实现会产出完全相同的记录，测试就钉不住 spec 5.1（评审变异 V9 存活）。
    judge: (r) =>
      r.metrics.code === PASS
        ? { outcome: 'pass', score01: 1 }
        : r.metrics.code === FAIL
          ? { outcome: 'fail', score01: 0 }
          : r.metrics.code === INVALID
            ? { outcome: 'pass', score01: 0.6 }
            : { outcome: 'hold', score01: 0.6 },
    summarize: (rounds) => ({ counted: rounds.filter((r) => r.counted).length }),
    formatSummary: () => [],
    ...overrides,
  };
}

function make(overrides: Partial<GameModule> = {}, level = 1) {
  const state: GameState = { ...defaultGameState('schulte'), level };
  const runner = new SessionRunner(makeModule(overrides), state, 'free', SEED, EPOCH);
  return { runner, engine: runner.engine as FakeEngine };
}

function play(runner: SessionRunner, code: number, at: number): void {
  runner.beginRound(at);
  runner.input({ kind: 'choice', index: code, t: at + 100 });
}

describe('SessionRunner', () => {
  it('按轮升降档，最后一轮结束后进入 finished', () => {
    const { runner } = make();
    expect(runner.snapshot()).toMatchObject({ phase: 'ready', roundNo: 1, roundsTotal: 3, level: 1, waitingForTap: true });
    play(runner, PASS, 0);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 2, level: 2, lastOutcome: 'pass', lastLevelChange: 1, waitingForTap: true });
    play(runner, PASS, 1000);
    expect(runner.snapshot()).toMatchObject({ roundNo: 3, level: 3 });
    play(runner, FAIL, 2000);
    expect(runner.snapshot()).toMatchObject({ phase: 'finished', roundNo: 3, level: 2, lastOutcome: 'fail', lastLevelChange: -1 });
    expect(runner.isFinished()).toBe(true);
    // finished 是 beginRound 的另一个禁止态（评审变异 V7：只拦 playing 也能全绿）
    expect(() => runner.beginRound(3000)).toThrow();
  });

  it('每轮用当前档位、seed + attempt 与计分轮号 configure', () => {
    const { runner, engine } = make();
    play(runner, PASS, 0);
    play(runner, HOLD, 1000);
    play(runner, FAIL, 2000);
    expect(engine.configured).toEqual([
      { level: 1, seed: SEED, roundNo: 1 },
      { level: 2, seed: SEED + 1, roundNo: 2 },
      { level: 2, seed: SEED + 2, roundNo: 3 },
    ]);
  });

  it('staircase 规则来自游戏模块：2 升 1 降时第一次 pass 不升档', () => {
    const { runner } = make({ staircase: { upAfter: 2, downAfter: 1 } });
    play(runner, PASS, 0);
    expect(runner.snapshot()).toMatchObject({ level: 1, lastLevelChange: 0 });
    play(runner, PASS, 1000);
    expect(runner.snapshot()).toMatchObject({ level: 2, lastLevelChange: 1 });
  });

  it('时序无效的轮不计分、不升降档，同轮号用新 seed 补一轮', () => {
    const { runner, engine } = make();
    play(runner, INVALID, 0);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 1, level: 1, lastInvalid: true, lastOutcome: null });
    play(runner, PASS, 1000);
    expect(engine.configured[1]).toEqual({ level: 1, seed: SEED + 1, roundNo: 1 });
    expect(runner.snapshot()).toMatchObject({ roundNo: 2, level: 2, lastInvalid: false });
  });

  it('补满 3 次后再出现时序无效，按 hold 计入', () => {
    const { runner } = make();
    for (let i = 0; i < MAX_RETRIES; i++) play(runner, INVALID, i * 1000);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 1 });
    play(runner, INVALID, 5000);
    expect(runner.snapshot()).toMatchObject({ roundNo: 2, level: 1, lastOutcome: 'hold', lastInvalid: false });
    play(runner, PASS, 6000);
    play(runner, PASS, 7000);
    const { record } = runner.finish('2026-10-18');
    expect(record.rounds.map((r) => [r.roundNo, r.counted, r.outcome])).toEqual([
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, true, 'hold'],
      [2, true, 'pass'],
      [3, true, 'pass'],
    ]);
    expect(record.rounds[3].score01).toBe(0.6);
  });

  it('补轮配额是整次训练共享的，不是每个轮号各自 3 次', () => {
    // spec 5.1「一次训练最多补 3 次」是整场训练的配额，不是每个轮号各自 3 次。
    // 若实现按轮号计数（评审变异 V19：计分后把 retriesUsed 归零），本用例第 2 轮遇到无效会
    // 再补一轮而不是立即 hold —— seqmem/mot/gestalt 的轮数是 3/8/16，每轮口径会把上限
    // 放大成 9/24/48 次，整场题面与时长失控而测试仍绿。
    const { runner } = make({ roundsPerSession: 2 });
    for (let i = 0; i < MAX_RETRIES; i++) play(runner, INVALID, i * 1000);
    play(runner, PASS, 4000);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', roundNo: 2, level: 2 });
    play(runner, INVALID, 5000);
    expect(runner.snapshot()).toMatchObject({ phase: 'finished', roundNo: 2, level: 2, lastOutcome: 'hold' });
    const { record } = runner.finish('2026-10-18');
    expect(record.rounds.map((r) => [r.roundNo, r.counted, r.outcome])).toEqual([
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, false, 'pass'],
      [1, true, 'pass'],
      [2, true, 'hold'],
    ]);
  });

  it('切后台作废当前轮：不记录、同轮号新 seed 重开、不占补轮次数', () => {
    const { runner, engine } = make();
    runner.beginRound(0);
    runner.voidCurrentRound();
    expect(runner.snapshot()).toMatchObject({ phase: 'voided', roundNo: 1, waitingForTap: true });
    runner.input({ kind: 'choice', index: PASS, t: 50 });
    expect(runner.snapshot().phase).toBe('voided');
    play(runner, PASS, 1000);
    expect(engine.configured.map((c) => [c.roundNo, c.seed])).toEqual([
      [1, SEED],
      [1, SEED + 1],
    ]);
    for (let i = 0; i < MAX_RETRIES; i++) play(runner, INVALID, 2000 + i * 1000);
    expect(runner.snapshot()).toMatchObject({ roundNo: 2, lastInvalid: true });
    play(runner, PASS, 9000);
    play(runner, PASS, 10000);
    const { record } = runner.finish('2026-10-18');
    expect(record.rounds).toHaveLength(6);
    expect(record.rounds.filter((r) => r.counted)).toHaveLength(3);
  });

  it('auto 轮间：600ms 后由 tick 自动开下一轮', () => {
    const { runner, engine } = make({ roundBreak: 'auto' });
    // 下面的用例用「相对常量」取时间点，常量本身必须钉住（评审变异 V8：600 改 1000 仍全绿）
    expect(AUTO_BREAK_MS).toBe(600);
    play(runner, PASS, 0);
    expect(runner.snapshot()).toMatchObject({ phase: 'between', waitingForTap: false });
    runner.tick(100 + AUTO_BREAK_MS - 1);
    expect(runner.snapshot().phase).toBe('between');
    runner.tick(100 + AUTO_BREAK_MS);
    expect(runner.snapshot().phase).toBe('playing');
    expect(engine.configured).toHaveLength(2);
  });

  it('auto 轮间切后台：取消自动衔接，改为等待点击', () => {
    const { runner } = make({ roundBreak: 'auto' });
    play(runner, PASS, 0);
    runner.voidCurrentRound();
    expect(runner.snapshot()).toMatchObject({ phase: 'between', waitingForTap: true });
    runner.tick(10_000);
    expect(runner.snapshot().phase).toBe('between');
    runner.beginRound(10_000);
    expect(runner.snapshot().phase).toBe('playing');
  });

  it('引擎在 tick 里结束时同样结算，结束时刻取该帧时间', () => {
    const { runner } = make({ roundsPerSession: 1 });
    runner.beginRound(0);
    runner.input({ kind: 'cell', index: PASS, t: 10 });
    expect(runner.snapshot().phase).toBe('playing');
    runner.tick(16);
    expect(runner.snapshot().phase).toBe('finished');
    expect(runner.finish('2026-10-18').record.durationMs).toBe(16);
    // finish 一次性（评审 N-4）：重复调用会多写一行同 startedAt 的记录，
    // 污染趋势页的「当天最高能力指数」与打卡判定，而 runner 是唯一能廉价拦住它的位置。
    expect(() => runner.finish('2026-10-18')).toThrow();
  });

  it('finish 生成记录：起止档位、能力指数、时长与 lastPlayedDayKey', () => {
    const { runner } = make({}, 4);
    play(runner, PASS, 0);
    play(runner, HOLD, 1000);
    play(runner, FAIL, 2000);
    const { record, state } = runner.finish('2026-10-18');
    expect(record).toMatchObject({
      gameId: 'schulte',
      mode: 'free',
      dayKey: '2026-10-18',
      startedAt: EPOCH,
      durationMs: 2100,
      startLevel: 4,
      endLevel: 4,
      summary: { counted: 3 },
    });
    expect(record.rounds.map((r) => r.level)).toEqual([4, 5, 5]);
    // 最后 2 个计分轮：(5-1+0.6) 与 (5-1+0)，均值 4.3，100*4.3/10 = 43
    expect(record.ability).toBe(43);
    expect(state).toEqual({ gameId: 'schulte', level: 4, passStreak: 0, failStreak: 0, lastPlayedDayKey: '2026-10-18' });
  });

  it('训练没结束时 finish 报错', () => {
    const { runner } = make();
    expect(() => runner.finish('2026-10-18')).toThrow();
    play(runner, PASS, 0);
    expect(() => runner.finish('2026-10-18')).toThrow();
  });

  it('非 playing 时输入被忽略；playing 时不能再开轮', () => {
    const { runner, engine } = make();
    runner.input({ kind: 'choice', index: PASS, t: 0 });
    expect(runner.snapshot().phase).toBe('ready');
    runner.beginRound(0);
    expect(() => runner.beginRound(1)).toThrow();
    expect(engine.configured).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/session.test.ts
```

Expected: FAIL，报错找不到 `./session`。

- [ ] **Step 3: 写实现**

`focus-trainer/src/core/session.ts`：

```ts
import { step } from './adaptive';
import { abilityIndex } from './scoring';
import type { GameEngine, GameModule, GameState, InputEvent, Mode, Outcome, RoundRecord, SessionRecord } from './types';

export type SessionPhase = 'ready' | 'playing' | 'between' | 'voided' | 'finished';

export interface SessionSnapshot {
  phase: SessionPhase;
  roundNo: number;
  roundsTotal: number;
  level: number;
  lastOutcome: Outcome | null;
  lastLevelChange: -1 | 0 | 1;
  lastInvalid: boolean;
  waitingForTap: boolean;
}

export const MAX_RETRIES = 3;
export const AUTO_BREAK_MS = 600;

export class SessionRunner {
  readonly engine: GameEngine;
  private state: GameState;
  private readonly startLevel: number;
  private readonly rounds: RoundRecord[] = [];
  private phase: SessionPhase = 'ready';
  private roundNo = 1;
  private attempt = 0;
  private retriesUsed = 0;
  private lastOutcome: Outcome | null = null;
  private lastLevelChange: -1 | 0 | 1 = 0;
  private lastInvalid = false;
  private firstStartAt: number | null = null;
  private endAt = 0;
  private breakUntil: number | null = null;
  private saved = false;

  constructor(
    private readonly module: GameModule,
    state: GameState,
    private readonly mode: Mode,
    private readonly seed: number,
    private readonly startedAtEpoch: number,
  ) {
    this.engine = module.createEngine();
    this.state = { ...state };
    this.startLevel = state.level;
  }

  snapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      roundNo: this.roundNo,
      roundsTotal: this.module.roundsPerSession,
      level: this.state.level,
      lastOutcome: this.lastOutcome,
      lastLevelChange: this.lastLevelChange,
      lastInvalid: this.lastInvalid,
      waitingForTap:
        this.phase === 'ready' || this.phase === 'voided' || (this.phase === 'between' && this.breakUntil === null),
    };
  }

  beginRound(now: number): void {
    if (this.phase === 'playing' || this.phase === 'finished') {
      throw new Error(`cannot begin a round while ${this.phase}`);
    }
    this.engine.configure(this.state.level, this.seed + this.attempt, this.roundNo);
    this.attempt += 1;
    this.engine.start(now);
    if (this.firstStartAt === null) this.firstStartAt = now;
    this.breakUntil = null;
    this.phase = 'playing';
  }

  tick(now: number): void {
    if (this.phase === 'playing') {
      this.engine.tick(now);
      if (this.engine.isDone()) this.completeRound(now);
    } else if (this.phase === 'between' && this.breakUntil !== null && now >= this.breakUntil) {
      this.beginRound(now);
    }
  }

  input(e: InputEvent): void {
    if (this.phase !== 'playing') return;
    this.engine.input(e);
    if (this.engine.isDone()) this.completeRound(e.t);
  }

  voidCurrentRound(): void {
    if (this.phase === 'playing') this.phase = 'voided';
    else if (this.phase === 'between') this.breakUntil = null;
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  finish(dayKey: string): { record: SessionRecord; state: GameState } {
    if (this.saved) {
      throw new Error('session already finished');
    }
    if (this.phase !== 'finished' || this.firstStartAt === null) {
      throw new Error('session is not finished');
    }
    // 必须深拷贝：{ ...r } 只拷顶层，trials/metrics 会与 runner 内部共享引用；
    // 结算页一旦原地排序 trials 或就地换算 metrics.timeMs，就会同时改掉 runner 的状态。
    // summarize 也拿这份副本，不给它内部数组本体。
    const rounds = this.rounds.map((r) => ({
      ...r,
      trials: r.trials.map((t) => ({ ...t })),
      metrics: { ...r.metrics },
    }));
    const record: SessionRecord = {
      gameId: this.module.id,
      mode: this.mode,
      dayKey,
      startedAt: this.startedAtEpoch,
      durationMs: Math.round(this.endAt - this.firstStartAt),
      startLevel: this.startLevel,
      endLevel: this.state.level,
      rounds,
      summary: this.module.summarize(rounds),
      ability: abilityIndex(rounds, this.module.maxLevel),
    };
    this.saved = true;
    return { record, state: { ...this.state, lastPlayedDayKey: dayKey } };
  }

  private completeRound(now: number): void {
    const result = this.engine.result();
    const judged = this.module.judge(result);
    if (!result.timingValid && this.retriesUsed < MAX_RETRIES) {
      this.retriesUsed += 1;
      this.rounds.push({ ...result, roundNo: this.roundNo, outcome: judged.outcome, score01: judged.score01, counted: false });
      this.lastInvalid = true;
      this.lastOutcome = null;
      this.lastLevelChange = 0;
      this.enterBreak(now);
      return;
    }
    const outcome: Outcome = result.timingValid ? judged.outcome : 'hold';
    const before = this.state.level;
    this.state = { ...this.state, ...step(this.state, outcome, this.module.staircase, this.module.maxLevel) };
    this.rounds.push({ ...result, roundNo: this.roundNo, outcome, score01: judged.score01, counted: true });
    this.lastInvalid = false;
    this.lastOutcome = outcome;
    this.lastLevelChange = Math.sign(this.state.level - before) as -1 | 0 | 1;
    if (this.roundNo >= this.module.roundsPerSession) {
      this.endAt = now;
      this.phase = 'finished';
      return;
    }
    this.roundNo += 1;
    this.enterBreak(now);
  }

  private enterBreak(now: number): void {
    this.phase = 'between';
    this.breakUntil = this.module.roundBreak === 'auto' ? now + AUTO_BREAK_MS : null;
  }
}
```

- [ ] **Step 4: 运行测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/session.test.ts && npx tsc --noEmit
```

Expected: 13 个测试 PASS；`tsc` 无输出。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/core/session.ts focus-trainer/src/core/session.test.ts && git commit -m "feat(core): add session runner with retries and voiding"
```

### Task 6: 舒尔特方格的规则与引擎

**Files:**
- Create: `focus-trainer/src/games/schulte/rules.ts`
- Create: `focus-trainer/src/games/schulte/engine.ts`
- Test: `focus-trainer/src/games/schulte/rules.test.ts`
- Test: `focus-trainer/src/games/schulte/engine.test.ts`

**Interfaces:**
- Consumes：`createRng`、`randInt`、`shuffle`（Task 1）；`GameEngine`、`InputEvent`、`RoundResult`、`RoundRecord`、`TrialRecord`、`Outcome`、`SummaryItem`（Task 2）
- Produces（`rules.ts`）：`SchulteLevel`；`SCHULTE_LEVELS: readonly SchulteLevel[]`；`SCHULTE_MAX_LEVEL`（= 10）；`schulteLevel(level: number): SchulteLevel`（越界抛 `RangeError`）；`targetSequence(lv: SchulteLevel): string[]`；`judgeSchulte(r: RoundResult): { outcome: Outcome; score01: number }`；`summarizeSchulte(rounds: readonly RoundRecord[]): Record<string, number>`（键 `bestTimeMs`、`avgCellMs`、`errors`）；`formatSchulteSummary(s: Record<string, number>): SummaryItem[]`
- Produces（`engine.ts`）：`TINTS`（= 4）；`FLASH_MS`（= 150）；`SchulteCell { label; done; tint: number | null }`；`SchulteSnapshot { size; cells; nextLabel: string | null; errors; elapsedMs; flashIndex: number | null; done }`；`class SchulteEngine implements GameEngine<SchulteSnapshot>`
- 引擎的 `RoundResult.metrics` 固定为 `{ timeMs, errors, cells }`，`timingValid` 恒为 `true`（spec 第 6 节：舒尔特只测反应时，不做帧间隔判定）。
- 只读契约：`judgeSchulte`、`summarizeSchulte`、`formatSchulteSummary` 一律不得原地改写入参（不 sort、不写回 `metrics`）。`SessionRunner.finish()` 把整场记录交给 `summarize`，结算页还会再读同一份记录。
- 作废契约（spec 5.1）：`configure()` 必须把 `elapsedMs`（= `startAt`/`lastHitAt`/`now` 三个时间基准一起归零，且要体现在 `start()` 之前调 `snapshot()` 的读数里）、`errors`、已点对进度、`done`、`flashIndex` 全部重置。`GameEngine` 接口没有 abort/cancel，`SessionRunner.voidCurrentRound()` 也不会通知引擎 —— 作废轮的残留一旦渗进重开轮，「同档位新 seed 重开」的语义就静默失效。Step 里那条「重新 configure 会清空上一轮状态」的用例是本契约的唯一守卫，不得判成冗余而删掉。M2 的 seqmem/mot/gestalt 三个引擎必须遵守同一约定。

- [ ] **Step 1: 写规则的失败测试**

`focus-trainer/src/games/schulte/rules.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { RoundRecord, RoundResult } from '../../core/types';
import {
  SCHULTE_LEVELS,
  SCHULTE_MAX_LEVEL,
  formatSchulteSummary,
  judgeSchulte,
  schulteLevel,
  summarizeSchulte,
  targetSequence,
} from './rules';

const res = (level: number, timeMs: number, errors: number): RoundResult => ({
  level,
  seed: 1,
  trials: [],
  metrics: { timeMs, errors, cells: 9 },
  timingValid: true,
});

const rec = (timeMs: number, errors: number, cells: number, counted = true): RoundRecord => ({
  level: 1,
  seed: 1,
  trials: [],
  metrics: { timeMs, errors, cells },
  timingValid: true,
  roundNo: 1,
  outcome: 'hold',
  score01: 0,
  counted,
});

describe('档位表', () => {
  it('10 档，与 spec 3.1 的表一致', () => {
    expect(SCHULTE_MAX_LEVEL).toBe(10);
    expect(SCHULTE_LEVELS.map((l) => [l.size, l.order, l.symbols, l.distractor, l.targetSec])).toEqual([
      [3, 'asc', 'digits', false, 8],
      [4, 'asc', 'digits', false, 15],
      [5, 'asc', 'digits', false, 25],
      [5, 'desc', 'digits', false, 28],
      [5, 'asc', 'letters', false, 30],
      [5, 'asc', 'digits', true, 30],
      [6, 'asc', 'digits', false, 42],
      [6, 'desc', 'digits', true, 48],
      [7, 'asc', 'digits', false, 60],
      [7, 'desc', 'digits', true, 70],
    ]);
  });

  it('档位越界抛 RangeError', () => {
    expect(() => schulteLevel(0)).toThrow(RangeError);
    expect(() => schulteLevel(11)).toThrow(RangeError);
    expect(() => schulteLevel(1.5)).toThrow(RangeError);
  });
});

describe('targetSequence', () => {
  it('正序数字 1→9', () => {
    expect(targetSequence(schulteLevel(1))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('倒序数字 25→1', () => {
    const seq = targetSequence(schulteLevel(4));
    expect(seq).toHaveLength(25);
    expect(seq[0]).toBe('25');
    expect(seq[24]).toBe('1');
  });

  it('字母 A→Y', () => {
    const seq = targetSequence(schulteLevel(5));
    expect(seq).toHaveLength(25);
    expect(seq[0]).toBe('A');
    expect(seq[24]).toBe('Y');
  });
});

describe('judgeSchulte（1 档 T = 8 秒）', () => {
  it('t ≤ T 且误点 ≤ 2 为 pass', () => {
    expect(judgeSchulte(res(1, 8000, 2)).outcome).toBe('pass');
  });

  it('超过 T、不超过 1.5T 为 hold；超过 1.5T 为 fail', () => {
    expect(judgeSchulte(res(1, 8001, 0)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 12000, 0)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 12001, 0)).outcome).toBe('fail');
  });

  it('误点 3–5 为 hold；超过 5 为 fail', () => {
    expect(judgeSchulte(res(1, 5000, 3)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 5000, 5)).outcome).toBe('hold');
    expect(judgeSchulte(res(1, 5000, 6)).outcome).toBe('fail');
  });

  it('score01 = clamp(T / t, 0, 1) × max(0, 1 − 0.1e)', () => {
    expect(judgeSchulte(res(1, 4000, 0)).score01).toBe(1);
    expect(judgeSchulte(res(1, 8000, 2)).score01).toBeCloseTo(0.8, 10);
    expect(judgeSchulte(res(1, 16000, 4)).score01).toBeCloseTo(0.3, 10);
    expect(judgeSchulte(res(1, 5000, 12)).score01).toBe(0);
  });
});

describe('summarizeSchulte 与 formatSchulteSummary', () => {
  it('只统计计分轮', () => {
    const input = [rec(9000, 1, 9), rec(16000, 2, 16), rec(1000, 0, 9, false)];
    const before = structuredClone(input);
    expect(summarizeSchulte(input)).toEqual({ bestTimeMs: 9000, avgCellMs: 1000, errors: 3 });
    // 只读契约：SessionRunner 把整场记录交给 summarize，结算页也复用同一份记录。
    // 原地排序或就地改写 metrics 会污染调用方的数据（评审 N-3 的真实风险面）。
    expect(input).toEqual(before);
  });

  it('没有计分轮时三项都为 0', () => {
    expect(summarizeSchulte([rec(1000, 0, 9, false)])).toEqual({ bestTimeMs: 0, avgCellMs: 0, errors: 0 });
  });

  it('平均每格用时按四舍五入取整', () => {
    // 原先三条用例全用整除输入，round 与 floor 同值，取整方向没人钉过（评审变异 T55）。
    // 裁定：保留 Math.round（结算页显示的就是这个数），1001/2 = 500.5 → 501。
    expect(summarizeSchulte([rec(1001, 0, 2)])).toEqual({ bestTimeMs: 1001, avgCellMs: 501, errors: 0 });
  });

  it('转成带单位的中文文案', () => {
    expect(formatSchulteSummary({ bestTimeMs: 9040, avgCellMs: 1000, errors: 3 })).toEqual([
      { label: '最佳用时', value: '9.0 秒' },
      { label: '平均每格', value: '1000 毫秒' },
      { label: '总误点', value: '3 次' },
    ]);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games/schulte/rules.test.ts
```

Expected: FAIL，提示无法解析 `./rules`。

- [ ] **Step 3: 写规则**

`focus-trainer/src/games/schulte/rules.ts`：

```ts
import type { Outcome, RoundRecord, RoundResult, SummaryItem } from '../../core/types';

export interface SchulteLevel {
  size: number;
  order: 'asc' | 'desc';
  symbols: 'digits' | 'letters';
  distractor: boolean;
  targetSec: number;
}

export const SCHULTE_LEVELS: readonly SchulteLevel[] = [
  { size: 3, order: 'asc', symbols: 'digits', distractor: false, targetSec: 8 },
  { size: 4, order: 'asc', symbols: 'digits', distractor: false, targetSec: 15 },
  { size: 5, order: 'asc', symbols: 'digits', distractor: false, targetSec: 25 },
  { size: 5, order: 'desc', symbols: 'digits', distractor: false, targetSec: 28 },
  { size: 5, order: 'asc', symbols: 'letters', distractor: false, targetSec: 30 },
  { size: 5, order: 'asc', symbols: 'digits', distractor: true, targetSec: 30 },
  { size: 6, order: 'asc', symbols: 'digits', distractor: false, targetSec: 42 },
  { size: 6, order: 'desc', symbols: 'digits', distractor: true, targetSec: 48 },
  { size: 7, order: 'asc', symbols: 'digits', distractor: false, targetSec: 60 },
  { size: 7, order: 'desc', symbols: 'digits', distractor: true, targetSec: 70 },
];

export const SCHULTE_MAX_LEVEL = SCHULTE_LEVELS.length;

export function schulteLevel(level: number): SchulteLevel {
  if (!Number.isInteger(level) || level < 1 || level > SCHULTE_MAX_LEVEL) {
    throw new RangeError(`schulte level out of range: ${level}`);
  }
  return SCHULTE_LEVELS[level - 1];
}

export function targetSequence(lv: SchulteLevel): string[] {
  const labels = Array.from({ length: lv.size * lv.size }, (_, i) =>
    lv.symbols === 'letters' ? String.fromCharCode(65 + i) : String(i + 1),
  );
  return lv.order === 'desc' ? labels.reverse() : labels;
}

export function judgeSchulte(r: RoundResult): { outcome: Outcome; score01: number } {
  const T = schulteLevel(r.level).targetSec;
  const t = r.metrics.timeMs / 1000;
  const e = r.metrics.errors;
  let outcome: Outcome = 'hold';
  if (t <= T && e <= 2) outcome = 'pass';
  else if (t > 1.5 * T || e > 5) outcome = 'fail';
  const score01 = Math.min(1, Math.max(0, T / t)) * Math.max(0, 1 - 0.1 * e);
  return { outcome, score01 };
}

export function summarizeSchulte(rounds: readonly RoundRecord[]): Record<string, number> {
  const counted = rounds.filter((r) => r.counted);
  if (counted.length === 0) return { bestTimeMs: 0, avgCellMs: 0, errors: 0 };
  const totalTime = counted.reduce((sum, r) => sum + r.metrics.timeMs, 0);
  const totalCells = counted.reduce((sum, r) => sum + r.metrics.cells, 0);
  return {
    bestTimeMs: Math.min(...counted.map((r) => r.metrics.timeMs)),
    avgCellMs: Math.round(totalTime / totalCells),
    errors: counted.reduce((sum, r) => sum + r.metrics.errors, 0),
  };
}

export function formatSchulteSummary(s: Record<string, number>): SummaryItem[] {
  return [
    { label: '最佳用时', value: `${(s.bestTimeMs / 1000).toFixed(1)} 秒` },
    { label: '平均每格', value: `${s.avgCellMs} 毫秒` },
    { label: '总误点', value: `${s.errors} 次` },
  ];
}
```

- [ ] **Step 4: 运行规则测试，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games/schulte/rules.test.ts
```

Expected: 13 个测试 PASS。

- [ ] **Step 5: 写引擎的失败测试**

`focus-trainer/src/games/schulte/engine.test.ts`：

```ts
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
```

- [ ] **Step 6: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games/schulte/engine.test.ts
```

Expected: FAIL，提示无法解析 `./engine`。

- [ ] **Step 7: 写引擎**

`focus-trainer/src/games/schulte/engine.ts`（签名与 `GameEngine` 逐字一致，含 `roundNo`：虽然 TypeScript 允许实现方省略接口靠后的参数，但本任务自己的 `engine.test.ts` 在具体类 `SchulteEngine` 上用三个实参调用，省略形参会直接 `TS2554 Expected 2 arguments, but got 3`。引擎不使用轮号 —— 轮号是 `SessionRunner` 记账用的，tsconfig 没开 `noUnusedParameters`，未使用不报错）：

```ts
import { createRng, randInt, shuffle } from '../../core/rng';
import type { GameEngine, InputEvent, RoundResult, TrialRecord } from '../../core/types';
import { schulteLevel, targetSequence } from './rules';

export const TINTS = 4;
export const FLASH_MS = 150;

export interface SchulteCell {
  label: string;
  done: boolean;
  tint: number | null;
}

export interface SchulteSnapshot {
  size: number;
  cells: SchulteCell[];
  nextLabel: string | null;
  errors: number;
  elapsedMs: number;
  flashIndex: number | null;
  done: boolean;
}

export class SchulteEngine implements GameEngine<SchulteSnapshot> {
  private level = 1;
  private seed = 0;
  private size = 3;
  private targets: string[] = [];
  private cells: SchulteCell[] = [];
  private nextIdx = 0;
  private errors = 0;
  private missesSinceHit = 0;
  private startAt = 0;
  private lastHitAt = 0;
  private now = 0;
  private endAt: number | null = null;
  private flashIndex: number | null = null;
  private flashUntil = 0;
  private trials: TrialRecord[] = [];

  configure(level: number, seed: number, roundNo: number): void {
    const lv = schulteLevel(level);
    const rng = createRng(seed);
    this.level = level;
    this.seed = seed;
    this.size = lv.size;
    this.targets = targetSequence(lv);
    this.cells = shuffle(rng, this.targets).map((label) => ({
      label,
      done: false,
      tint: lv.distractor ? randInt(rng, 0, TINTS - 1) : null,
    }));
    this.nextIdx = 0;
    this.errors = 0;
    this.missesSinceHit = 0;
    this.endAt = null;
    this.flashIndex = null;
    this.trials = [];
    // 作废契约：SessionRunner.voidCurrentRound() 不通知引擎，重开轮只调 configure + start。
    // 时间基准必须在这里一起归零，否则 start() 之前 snapshot().elapsedMs 会漏出上一轮的用时。
    this.startAt = 0;
    this.lastHitAt = 0;
    this.now = 0;
  }

  start(now: number): void {
    this.startAt = now;
    this.lastHitAt = now;
    this.now = now;
  }

  input(e: InputEvent): void {
    if (e.kind !== 'cell' || this.endAt !== null) return;
    const cell = this.cells[e.index];
    if (cell === undefined || cell.done) return;
    this.now = Math.max(this.now, e.t);
    if (cell.label === this.targets[this.nextIdx]) {
      cell.done = true;
      this.trials.push({
        onset: this.lastHitAt,
        rt: e.t - this.lastHitAt,
        correct: true,
        label: cell.label,
        misses: this.missesSinceHit,
      });
      this.lastHitAt = e.t;
      this.missesSinceHit = 0;
      this.nextIdx += 1;
      if (this.nextIdx === this.targets.length) this.endAt = e.t;
    } else {
      this.errors += 1;
      this.missesSinceHit += 1;
      this.flashIndex = e.index;
      this.flashUntil = e.t + FLASH_MS;
    }
  }

  tick(now: number): void {
    this.now = Math.max(this.now, now);
    if (this.flashIndex !== null && this.now >= this.flashUntil) this.flashIndex = null;
  }

  snapshot(): SchulteSnapshot {
    const end = this.endAt ?? this.now;
    return {
      size: this.size,
      cells: this.cells.map((c) => ({ ...c })),
      nextLabel: this.endAt === null ? this.targets[this.nextIdx] : null,
      errors: this.errors,
      elapsedMs: Math.max(0, end - this.startAt),
      flashIndex: this.flashIndex,
      done: this.endAt !== null,
    };
  }

  isDone(): boolean {
    return this.endAt !== null;
  }

  result(): RoundResult {
    if (this.endAt === null) throw new Error('schulte round is not finished');
    return {
      level: this.level,
      seed: this.seed,
      trials: this.trials.map((t) => ({ ...t })),
      metrics: { timeMs: Math.round(this.endAt - this.startAt), errors: this.errors, cells: this.targets.length },
      timingValid: true,
    };
  }
}
```

- [ ] **Step 8: 运行舒尔特全部测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games/schulte && npx tsc --noEmit
```

Expected: 26 个测试 PASS（rules 13 + engine 13）；`tsc` 无输出。

- [ ] **Step 9: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/games/schulte/rules.ts focus-trainer/src/games/schulte/rules.test.ts focus-trainer/src/games/schulte/engine.ts focus-trainer/src/games/schulte/engine.test.ts && git commit -m "feat(schulte): add level table, judging and round engine"
```

### Task 7: 舒尔特视图、游戏模块与注册表

**Files:**
- Create: `focus-trainer/src/games/schulte/view.ts`
- Create: `focus-trainer/src/games/schulte/index.ts`
- Create: `focus-trainer/src/games/registry.ts`
- Test: `focus-trainer/src/games/registry.test.ts`
- Test: `focus-trainer/src/games/schulte/view.test.ts`

**Interfaces:**
- Consumes：`SchulteEngine`、`SchulteSnapshot`、`TINTS`（Task 6）；`SCHULTE_MAX_LEVEL`、`judgeSchulte`、`summarizeSchulte`、`formatSchulteSummary`（Task 6）；`GameModule`、`GameView`、`InputEvent`、`GAME_IDS`（Task 2）
- Produces：`createSchulteView(host: HTMLElement, emit: (e: InputEvent) => void): GameView<SchulteSnapshot>`；`TINT_COLORS: readonly string[]`（长度必须等于 `TINTS`，导出只为让测试能钉住这条耦合）
- Produces：`schulte: GameModule`（`src/games/schulte/index.ts`）
- Produces：`GAMES: readonly GameModule[]`；`getGame(id: string): GameModule | undefined`（路由参数可能是任意字符串，未知 id 返回 `undefined`，由训练页处理）
- 视图用到的 CSS 类名（样式在 Task 9 的 `styles.css` 里写）：`.schulte`、`.schulte-info`、`.schulte-grid`、`.schulte-cell`、`.schulte-cell.done`、`.schulte-cell.flash`；干扰色通过 CSS 变量 `--tint` 设在格子上。
- 以后各游戏的雷达维度名（M2 使用，这里只记下）：stroop「抑制控制」、seqmem「工作记忆」、mot「动态追踪」、gestalt「整体识别」。

- [ ] **Step 1: 写注册表的失败测试**

`focus-trainer/src/games/registry.test.ts`（node 环境能导入视图模块，因为 `view.ts` 只在函数内部访问 DOM）：

```ts
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
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games/registry.test.ts
```

Expected: FAIL，提示无法解析 `./registry`。

- [ ] **Step 3: 写视图的失败测试（手写 DOM 桩）**

`view.ts` 只有 55 行，但它是「emit 的事件必须带 `PointerEvent.timeStamp`」「闪烁与底色必须被清干净」「destroy 必须摘监听」这三条契约的唯一实现点。全局约束禁的是新增依赖，不是禁止测试 —— 手写一个只覆盖 `view.ts` 用到的 API 的最小桩即可（约 60 行，零依赖）。评审实测：不打桩时 `view.ts` 的 9 个变异全部存活。

`focus-trainer/src/games/schulte/view.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameView, InputEvent } from '../../core/types';
import { TINTS } from './engine';
import type { SchulteSnapshot } from './engine';
import { TINT_COLORS, createSchulteView } from './view';

// node 环境没有 DOM，这里手写 view.ts 用到的那一小撮 API 的最小桩：createElement / append /
// replaceChildren / add|removeEventListener / classList / style.setProperty / dataset /
// textContent / remove / closest。目的不是模拟浏览器，而是让这 55 行代码在 CI 里有守卫；
// 手感、布局与真实事件时间戳仍由 Task 10 的浏览器验收负责。
class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly dataset: Record<string, string> = {};
  readonly styleVars = new Map<string, string>();
  readonly style = {
    gridTemplateColumns: '',
    setProperty: (k: string, v: string) => {
      this.styleVars.set(k, v);
    },
    getPropertyValue: (k: string) => this.styleVars.get(k) ?? '',
  };
  textContent = '';
  parent: StubEl | null = null;
  removed = false;
  private readonly handlers: Array<{ type: string; fn: (ev: unknown) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; contains(c: string): boolean; toggle(c: string, on: boolean): boolean } {
    const classes = this.classes;
    return {
      add: (c: string) => {
        classes.add(c);
      },
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on: boolean) => {
        if (on) classes.add(c);
        else classes.delete(c);
        return on;
      },
    };
  }

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  append(...els: StubEl[]): void {
    for (const e of els) {
      e.parent = this;
      this.children.push(e);
    }
  }

  replaceChildren(...els: StubEl[]): void {
    this.children.length = 0;
    this.append(...els);
  }

  remove(): void {
    this.removed = true;
    const p = this.parent;
    if (p) p.children.splice(p.children.indexOf(this), 1);
  }

  addEventListener(type: string, fn: (ev: unknown) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: unknown) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  closest(selector: string): StubEl | null {
    return selector === 'button[data-i]' && this.tag === 'button' && this.dataset.i !== undefined ? this : null;
  }

  fire(type: string, ev: Record<string, unknown>): { defaultPrevented: boolean } {
    const state = { defaultPrevented: false };
    for (const h of this.handlers.filter((x) => x.type === type)) {
      h.fn({ ...ev, preventDefault: () => void (state.defaultPrevented = true) });
    }
    return state;
  }

  handlerCount(type: string): number {
    return this.handlers.filter((h) => h.type === type).length;
  }
}

class StubButton extends StubEl {}

function installDom(): void {
  vi.stubGlobal('Element', StubEl);
  vi.stubGlobal('HTMLButtonElement', StubButton);
  vi.stubGlobal('document', {
    createElement: (tag: string) => (tag === 'button' ? new StubButton(tag) : new StubEl(tag)),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const cell = (label: string, done = false, tint: number | null = null) => ({ label, done, tint });

const snap = (over: Partial<SchulteSnapshot> = {}): SchulteSnapshot => ({
  size: 3,
  cells: Array.from({ length: 9 }, (_, i) => cell(String(i + 1))),
  nextLabel: '1',
  errors: 0,
  elapsedMs: 0,
  flashIndex: null,
  done: false,
  ...over,
});

interface Mounted {
  host: StubEl;
  grid: StubEl;
  inputs: InputEvent[];
  view: GameView<SchulteSnapshot>;
}

// view.ts 的结构固定是 root > [info, grid]，grid 的直接子节点就是格子的 number of cells 个按钮
function mount(s: SchulteSnapshot): Mounted {
  installDom();
  const host = new StubEl('div');
  const inputs: InputEvent[] = [];
  const view = createSchulteView(host as unknown as HTMLElement, (e) => inputs.push(e));
  view.render(s);
  const root = host.children[0];
  return { host, grid: root.children[1], inputs, view };
}

describe('createSchulteView', () => {
  it('pointerdown 命中格子时 emit 事件时间戳，并 preventDefault', () => {
    const { grid, inputs } = mount(snap());
    const state = grid.fire('pointerdown', { target: grid.children[4], timeStamp: 1234.5 });
    // t 必须取 timeStamp（与 rAF 同域），不是 Date.now()：Task 5 的 durationMs 直接吃它
    expect(inputs).toEqual([{ kind: 'cell', index: 4, t: 1234.5 }]);
    expect(state.defaultPrevented).toBe(true);
  });

  it('命中容器自身（不是格子）时不 emit、也不 preventDefault', () => {
    const { grid, inputs } = mount(snap());
    const state = grid.fire('pointerdown', { target: grid, timeStamp: 10 });
    expect(inputs).toEqual([]);
    expect(state.defaultPrevented).toBe(false);
  });

  it('done 与 flash 跟着快照走；轮结束后不再残留闪烁', () => {
    const cells = [cell('1', true), cell('2'), cell('3'), cell('4'), cell('5'), cell('6'), cell('7'), cell('8'), cell('9')];
    const { grid, view } = mount(snap({ cells, flashIndex: 1 }));
    const buttons = grid.children;
    expect(buttons[0].classes.has('done')).toBe(true);
    expect(buttons[1].classes.has('flash')).toBe(true);
    expect(buttons[2].classes.has('flash')).toBe(false);
    // 最后一格是误点后立刻完成：SessionRunner 停止喂帧，flashIndex 不会被 tick 清掉，
    // 少了 !s.done 这一格会红到用户点「继续」为止（评审 M-4）。
    view.render(snap({ cells, flashIndex: 1, done: true, nextLabel: null }));
    expect(buttons[1].classes.has('flash')).toBe(false);
  });

  it('网格列数与格子数跟着 size 走', () => {
    const { grid, view } = mount(snap());
    expect(grid.style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    view.render(snap({ size: 5, cells: Array.from({ length: 25 }, (_, i) => cell(String(i + 1))) }));
    expect(grid.style.gridTemplateColumns).toBe('repeat(5, 1fr)');
    expect(grid.children).toHaveLength(25);
  });

  it('干扰色按下标写进 --tint，非干扰档不写，且调色板长度等于 TINTS', () => {
    const tints = Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, i % 4));
    const { grid } = mount(snap({ cells: tints }));
    // engine.ts 用 randInt(rng, 0, TINTS - 1) 生成下标，这里按下标取色；两处各自硬编码时，
    // TINTS 改 5 会让 TINT_COLORS[4] === undefined，setProperty 静默 no-op 而测试仍绿（评审 I-1）。
    expect(TINT_COLORS.length).toBe(TINTS);
    expect(grid.children[0].styleVars.get('--tint')).toBe(TINT_COLORS[0]);
    expect(grid.children[5].styleVars.get('--tint')).toBe(TINT_COLORS[1]);
    expect(mount(snap()).grid.children[0].styleVars.has('--tint')).toBe(false);
  });

  it('标签与底色都没变时复用节点，只有底色变化也重建；destroy 摘监听并移根', () => {
    const a = Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, i % 4));
    const { host, grid, inputs, view } = mount(snap({ cells: a }));
    const first = grid.children[0];
    view.render(snap({ cells: Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, i % 4)) }));
    expect(grid.children[0]).toBe(first);
    // 作废重开同档位 + 新 seed 可能撞出相同排列；键里不含 tint 就会跳过重建，底色残留（评审 M-5）。
    view.render(snap({ cells: Array.from({ length: 9 }, (_, i) => cell(String(i + 1), false, (i + 1) % 4)) }));
    expect(grid.children[0]).not.toBe(first);
    view.destroy();
    expect(host.children).toHaveLength(0);
    expect(grid.handlerCount('pointerdown')).toBe(0);
    grid.fire('pointerdown', { target: grid.children[0], timeStamp: 1 });
    expect(inputs).toHaveLength(0);
  });
});
```

- [ ] **Step 4: 运行视图测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games/schulte/view.test.ts
```

Expected: FAIL，报错找不到 `./view`。
- [ ] **Step 5: 写视图**

`focus-trainer/src/games/schulte/view.ts`（输入取 `pointerdown` 的 `event.timeStamp`，与 rAF 时间戳同一时间基准；`preventDefault` 防止触屏上的兼容鼠标事件和长按菜单）：

```ts
import type { GameView, InputEvent } from '../../core/types';
import type { SchulteSnapshot } from './engine';

// 导出只为让 view.test.ts 能把「调色板长度 === TINTS」这条耦合钉住：engine.ts 用
// randInt(rng, 0, TINTS - 1) 生成 tint 下标，这里按下标取色。两处各自硬编码时，任一方改动
// 会让 setProperty('--tint', undefined) 静默 no-op —— 格子掉回默认底色，无类型错误、无异常、测试全绿。
export const TINT_COLORS = ['#2b3a4a', '#3a2b4a', '#2b4a3a', '#4a3a2b'];

export function createSchulteView(host: HTMLElement, emit: (e: InputEvent) => void): GameView<SchulteSnapshot> {
  const root = document.createElement('div');
  root.className = 'schulte';
  const info = document.createElement('div');
  info.className = 'schulte-info';
  const grid = document.createElement('div');
  grid.className = 'schulte-grid';
  root.append(info, grid);
  host.append(root);

  let layoutKey = '';
  let buttons: HTMLButtonElement[] = [];

  const onDown = (ev: PointerEvent): void => {
    const hit = ev.target instanceof Element ? ev.target.closest('button[data-i]') : null;
    if (!(hit instanceof HTMLButtonElement)) return;
    ev.preventDefault();
    emit({ kind: 'cell', index: Number(hit.dataset.i), t: ev.timeStamp });
  };
  grid.addEventListener('pointerdown', onDown);

  return {
    render(s) {
      // 键必须含 size 与 tint：作废重开是同档位 + 新 seed（session.ts 用 seed + attempt），
      // 同档布局数有限，有一定概率撞出相同排列；只比标签会跳过重建，上一轮的 --tint 底色就残留下来。
      const key = `${s.size}|${s.cells.map((c) => c.label).join(',')}|${s.cells.map((c) => c.tint ?? '').join(',')}`;
      if (key !== layoutKey) {
        layoutKey = key;
        grid.style.gridTemplateColumns = `repeat(${s.size}, 1fr)`;
        buttons = s.cells.map((c, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'schulte-cell';
          b.dataset.i = String(i);
          b.textContent = c.label;
          if (c.tint !== null) b.style.setProperty('--tint', TINT_COLORS[c.tint]);
          return b;
        });
        grid.replaceChildren(...buttons);
      }
      s.cells.forEach((c, i) => {
        buttons[i].classList.toggle('done', c.done);
        // flashIndex 只由 tick 清除，而 SessionRunner 在 isDone() 后停止喂帧；
        // 最后一格若是误点，那格会红到用户点「继续」为止（评审 M-4）。
        buttons[i].classList.toggle('flash', s.flashIndex === i && !s.done);
      });
      info.textContent = `下一个 ${s.nextLabel ?? '—'}　用时 ${(s.elapsedMs / 1000).toFixed(1)} 秒　误点 ${s.errors}`;
    },
    destroy() {
      grid.removeEventListener('pointerdown', onDown);
      root.remove();
    },
  };
}
```

- [ ] **Step 6: 写游戏模块**

`focus-trainer/src/games/schulte/index.ts`：

```ts
import type { GameModule } from '../../core/types';
import { SchulteEngine } from './engine';
import { SCHULTE_MAX_LEVEL, formatSchulteSummary, judgeSchulte, summarizeSchulte } from './rules';
import { createSchulteView } from './view';

export const schulte: GameModule = {
  id: 'schulte',
  name: '舒尔特方格',
  ability: '持续注意',
  maxLevel: SCHULTE_MAX_LEVEL,
  roundsPerSession: 3,
  roundBreak: 'tap',
  staircase: { upAfter: 1, downAfter: 1 },
  instructions:
    '按顺序尽快点完所有格子。顶部「下一个」提示要找的格子：低档位从 1 往大数点，高档位会出现倒序和字母。点错会闪红并记一次误点。每次训练 3 张方格，每张结束后按用时和误点调整难度。',
  createEngine: () => new SchulteEngine(),
  createView: createSchulteView,
  judge: judgeSchulte,
  summarize: summarizeSchulte,
  formatSummary: formatSchulteSummary,
};
```

- [ ] **Step 7: 写注册表**

`focus-trainer/src/games/registry.ts`：

```ts
import type { GameModule } from '../core/types';
import { schulte } from './schulte';

export const GAMES: readonly GameModule[] = [schulte];

export function getGame(id: string): GameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
```

- [ ] **Step 8: 运行测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games && npx tsc --noEmit
```

Expected: 36 个测试 PASS（schulte 26 + view 6 + registry 4）；`tsc` 无输出。视图的实际显示和点击在 Task 10 用浏览器验收。

- [ ] **Step 9: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/games/schulte/view.ts focus-trainer/src/games/schulte/index.ts focus-trainer/src/games/registry.ts focus-trainer/src/games/registry.test.ts && git commit -m "feat(schulte): add view, game module and registry"
```

### Task 8: 界面基础：建元素工具、路由、应用上下文与今日计划

**Files:**
- Create: `focus-trainer/src/ui/dom.ts`
- Create: `focus-trainer/src/ui/router.ts`
- Create: `focus-trainer/src/ui/context.ts`
- Create: `focus-trainer/src/ui/today.ts`
- Test: `focus-trainer/src/ui/router.test.ts`
- Test: `focus-trainer/src/ui/today.test.ts`

**Interfaces:**
- Consumes：`dayKey`（Task 2）；`buildPlan`、`markCompleted`、`isPlanComplete`、`streak`、`GameStanding`（Task 3）；`Repository`、`MemoryRepository`（Task 4）；`SessionRunner`（Task 5）；`schulte`（Task 7）
- Produces（`dom.ts`）：`h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K]`。`attrs` 里 `class` 设 `className`；`on` 开头且值为函数的键注册事件（`onclick` → `click`）；`true` 设空属性；`false` / `undefined` 跳过。`children` 接受 `Node`、字符串、`null`、`undefined`、`false`（后三者跳过）。
- Produces（`router.ts`）：`Route = { name: 'home' } | { name: 'play'; gameId: GameId; mode: Mode } | { name: 'result'; sessionId: number } | { name: 'settings' }`；`parseRoute(hash: string): Route`（无法识别的一律回首页）；`href(r: Route): string`；`navigate(r: Route, replace?: boolean): void`；`startRouter(onRoute: (r: Route) => void): void`。趋势页路由在 M3 加。
- Produces（`context.ts`）：`AppContext { repo: Repository; storageOk: boolean; settings: Settings }`
- Produces（`today.ts`）：`ensureTodayPlan(repo, gameIds: readonly GameId[], dayStartHour: number, now?: number): Promise<DayPlan>`；`saveFinishedSession(repo, gameIds: readonly GameId[], dayStartHour: number, runner: SessionRunner, now?: number): Promise<{ id: number; record: SessionRecord }>`。日期键按训练结束时刻算。

- [ ] **Step 1: 写路由与今日计划的失败测试**

`focus-trainer/src/ui/router.test.ts`（只测纯函数；`navigate`、`startRouter` 依赖浏览器，在 Task 10 验收）：

```ts
import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './router';

describe('parseRoute', () => {
  it('识别四种路由', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/play/schulte/plan')).toEqual({ name: 'play', gameId: 'schulte', mode: 'plan' });
    expect(parseRoute('#/play/schulte/free')).toEqual({ name: 'play', gameId: 'schulte', mode: 'free' });
    expect(parseRoute('#/result/12')).toEqual({ name: 'result', sessionId: 12 });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  it('无法识别的地址回首页', () => {
    for (const bad of ['#/play/xxx/plan', '#/play/schulte/zzz', '#/play/schulte', '#/result/abc', '#/result/-1', '#/settings/x', '#/nope']) {
      expect(parseRoute(bad)).toEqual({ name: 'home' });
    }
  });

  it('href 与 parseRoute 互为逆运算', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'play', gameId: 'schulte', mode: 'plan' },
      { name: 'play', gameId: 'gestalt', mode: 'free' },
      { name: 'result', sessionId: 3 },
      { name: 'settings' },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});
```

`focus-trainer/src/ui/today.test.ts`（用内存仓库和真实的舒尔特模块，不用替身）：

```ts
import { describe, expect, it } from 'vitest';
import { isPlanComplete, streak } from '../core/scheduler';
import { SessionRunner } from '../core/session';
import { MemoryRepository } from '../core/storage';
import { GAME_IDS, type GameId, type Mode } from '../core/types';
import { schulte } from '../games/schulte';
import type { SchulteSnapshot } from '../games/schulte/engine';
import { ensureTodayPlan, saveFinishedSession } from './today';

const NOW = new Date(2026, 9, 18, 10, 0).getTime();
const IDS: readonly GameId[] = ['schulte'];

// 用真实的舒尔特模块跑完一次 3 轮训练，每 300ms 点对一格
async function playSchulte(repo: MemoryRepository, mode: Mode = 'plan'): Promise<SessionRunner> {
  const runner = new SessionRunner(schulte, await repo.getGameState('schulte'), mode, 99, NOW);
  let t = 0;
  while (!runner.isFinished()) {
    runner.beginRound(t);
    for (;;) {
      const snap = runner.engine.snapshot() as SchulteSnapshot;
      if (snap.done) break;
      t += 300;
      runner.input({ kind: 'cell', index: snap.cells.findIndex((c) => c.label === snap.nextLabel), t });
    }
  }
  return runner;
}

describe('ensureTodayPlan', () => {
  it('当天首次调用时生成计划并写库', async () => {
    const repo = new MemoryRepository();
    const plan = await ensureTodayPlan(repo, GAME_IDS, 4, NOW);
    expect(plan).toEqual({ dayKey: '2026-10-18', games: ['schulte', 'stroop', 'seqmem'], completed: [] });
    expect(await repo.getPlan('2026-10-18')).toEqual(plan);
  });

  it('当天内计划不变，第二天按上次训练日期轮换', async () => {
    const repo = new MemoryRepository();
    await ensureTodayPlan(repo, GAME_IDS, 4, NOW);
    await saveFinishedSession(repo, GAME_IDS, 4, await playSchulte(repo), NOW);
    const sameDay = await ensureTodayPlan(repo, GAME_IDS, 4, NOW + 3_600_000);
    expect(sameDay.games).toEqual(['schulte', 'stroop', 'seqmem']);
    expect(sameDay.completed).toEqual(['schulte']);
    const nextDay = await ensureTodayPlan(repo, GAME_IDS, 4, NOW + 24 * 3_600_000);
    expect(nextDay).toEqual({ dayKey: '2026-10-19', games: ['stroop', 'seqmem', 'mot'], completed: [] });
  });
});

describe('saveFinishedSession', () => {
  it('写入训练记录、更新档位、标记计划完成，打卡天数变为 1', async () => {
    const repo = new MemoryRepository();
    const { id, record } = await saveFinishedSession(repo, IDS, 4, await playSchulte(repo), NOW);
    expect(record).toMatchObject({
      id,
      gameId: 'schulte',
      mode: 'plan',
      dayKey: '2026-10-18',
      startedAt: NOW,
      durationMs: 15000,
      startLevel: 1,
      endLevel: 4,
      ability: 25,
    });
    expect(record.rounds.map((r) => [r.level, r.outcome, r.counted])).toEqual([
      [1, 'pass', true],
      [2, 'pass', true],
      [3, 'pass', true],
    ]);
    expect(record.summary).toEqual({ bestTimeMs: 2700, avgCellMs: 300, errors: 0 });
    expect(await repo.getSession(id)).toEqual(record);
    expect(await repo.getGameState('schulte')).toMatchObject({ level: 4, lastPlayedDayKey: '2026-10-18' });
    const plan = await repo.getPlan('2026-10-18');
    expect(plan?.completed).toEqual(['schulte']);
    expect(plan !== null && isPlanComplete(plan)).toBe(true);
    expect(streak(await repo.listPlans(), '2026-10-18')).toBe(1);
  });

  it('自由练也算完成计划项', async () => {
    const repo = new MemoryRepository();
    const { record } = await saveFinishedSession(repo, IDS, 4, await playSchulte(repo, 'free'), NOW);
    expect(record.mode).toBe('free');
    expect((await repo.getPlan('2026-10-18'))?.completed).toEqual(['schulte']);
  });

  it('凌晨 4 点前结束的训练记在前一天', async () => {
    const repo = new MemoryRepository();
    const lateNight = new Date(2026, 9, 19, 2, 0).getTime();
    const { record } = await saveFinishedSession(repo, IDS, 4, await playSchulte(repo), lateNight);
    expect(record.dayKey).toBe('2026-10-18');
    expect(await repo.getPlan('2026-10-18')).not.toBeNull();
  });
});
```

数值来源：3 轮依次是 1 档 3×3、2 档 4×4、3 档 5×5，每格 300ms，用时 2.7 / 4.8 / 7.5 秒都不超过目标用时且无误点，所以 3 轮都 pass，档位 1→4；能力指数取后 2 轮：round(100 × mean(2, 3) / 10) = 25；平均每格 = 15000 / 50 = 300。

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui
```

Expected: FAIL，提示无法解析 `./router` 和 `./today`。

- [ ] **Step 3: 写建元素工具与应用上下文**

`focus-trainer/src/ui/dom.ts`：

```ts
type Child = Node | string | null | undefined | false;
type AttrValue = string | number | boolean | EventListener | undefined;
type Attrs = Record<string, AttrValue>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === false) continue;
      if (typeof value === 'function') {
        if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      } else if (key === 'class') {
        el.className = String(value);
      } else {
        el.setAttribute(key, value === true ? '' : String(value));
      }
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== false) el.append(child);
  }
  return el;
}
```

`focus-trainer/src/ui/context.ts`：

```ts
import type { Repository } from '../core/storage';
import type { Settings } from '../core/types';

export interface AppContext {
  repo: Repository;
  storageOk: boolean;
  settings: Settings;
}
```

- [ ] **Step 4: 写路由**

`focus-trainer/src/ui/router.ts`（`replaceState` 不会触发 `hashchange`，所以替换跳转时手动派发一次）：

```ts
import { GAME_IDS, type GameId, type Mode } from '../core/types';

export type Route =
  | { name: 'home' }
  | { name: 'play'; gameId: GameId; mode: Mode }
  | { name: 'result'; sessionId: number }
  | { name: 'settings' };

function isGameId(s: string | undefined): s is GameId {
  return s !== undefined && (GAME_IDS as readonly string[]).includes(s);
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter((p) => p.length > 0);
  const [head, a, b] = parts;
  if (head === 'play' && parts.length === 3 && isGameId(a) && (b === 'plan' || b === 'free')) {
    return { name: 'play', gameId: a, mode: b };
  }
  if (head === 'result' && parts.length === 2 && /^\d+$/.test(a)) return { name: 'result', sessionId: Number(a) };
  if (head === 'settings' && parts.length === 1) return { name: 'settings' };
  return { name: 'home' };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'play':
      return `#/play/${r.gameId}/${r.mode}`;
    case 'result':
      return `#/result/${r.sessionId}`;
    case 'settings':
      return '#/settings';
  }
}

export function navigate(r: Route, replace = false): void {
  const url = href(r);
  if (replace) {
    history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = url;
  }
}

export function startRouter(onRoute: (r: Route) => void): void {
  const fire = (): void => onRoute(parseRoute(location.hash));
  window.addEventListener('hashchange', fire);
  fire();
}
```

- [ ] **Step 5: 写今日计划与保存训练**

`focus-trainer/src/ui/today.ts`：

```ts
import { dayKey } from '../core/daykey';
import { buildPlan, markCompleted, type GameStanding } from '../core/scheduler';
import type { SessionRunner } from '../core/session';
import type { Repository } from '../core/storage';
import type { DayPlan, GameId, SessionRecord } from '../core/types';

export async function ensureTodayPlan(
  repo: Repository,
  gameIds: readonly GameId[],
  dayStartHour: number,
  now = Date.now(),
): Promise<DayPlan> {
  const key = dayKey(now, dayStartHour);
  const existing = await repo.getPlan(key);
  if (existing) return existing;
  const standings: GameStanding[] = await Promise.all(
    gameIds.map(async (gameId) => {
      const [state, last] = await Promise.all([repo.getGameState(gameId), repo.lastSession(gameId)]);
      return { gameId, lastPlayedDayKey: state.lastPlayedDayKey, lastAbility: last?.ability ?? null };
    }),
  );
  const plan = buildPlan(key, standings);
  await repo.putPlan(plan);
  return plan;
}

export async function saveFinishedSession(
  repo: Repository,
  gameIds: readonly GameId[],
  dayStartHour: number,
  runner: SessionRunner,
  now = Date.now(),
): Promise<{ id: number; record: SessionRecord }> {
  const key = dayKey(now, dayStartHour);
  const plan = await ensureTodayPlan(repo, gameIds, dayStartHour, now);
  const { record, state } = runner.finish(key);
  const id = await repo.saveSession(record, state, markCompleted(plan, record.gameId));
  return { id, record: { ...record, id } };
}
```

- [ ] **Step 6: 运行测试与类型检查，确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui && npx tsc --noEmit
```

Expected: 8 个测试 PASS（router 3 + today 5）；`tsc` 无输出。

- [ ] **Step 7: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/ui/dom.ts focus-trainer/src/ui/router.ts focus-trainer/src/ui/router.test.ts focus-trainer/src/ui/context.ts focus-trainer/src/ui/today.ts focus-trainer/src/ui/today.test.ts && git commit -m "feat(ui): add dom helper, hash router and today plan service"
```

### Task 9: 页面、样式与启动装配

**Files:**
- Create: `focus-trainer/src/ui/styles.css`
- Create: `focus-trainer/src/ui/pages/home.ts`
- Create: `focus-trainer/src/ui/pages/settings.ts`
- Create: `focus-trainer/src/ui/pages/play.ts`
- Create: `focus-trainer/src/ui/pages/result.ts`
- Test: `focus-trainer/src/ui/pages/play.test.ts`
- Modify: `focus-trainer/src/main.ts`（整体替换 Task 1 的占位内容）

**Interfaces:**
- Consumes：`h`、`navigate`、`startRouter`、`Route`、`AppContext`、`ensureTodayPlan`、`saveFinishedSession`（Task 8）；`GAMES`、`getGame`（Task 7）；`SessionRunner`、`SessionSnapshot`（Task 5）；`nextPending`、`isPlanComplete`、`streak`（Task 3）；`openIdbRepository`、`MemoryRepository`、`Repository`（Task 4）
- Produces：四个页面函数，签名统一为「先 await 读数据 → 检查 `signal.aborted` → 再写 DOM」，防止快速切页时旧页面覆盖新页面：
  - `renderHome(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void>`
  - `renderSettings(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void>`
  - `renderPlay(view: HTMLElement, ctx: AppContext, gameId: GameId, mode: Mode, signal: AbortSignal): Promise<void>`
  - `renderResult(view: HTMLElement, ctx: AppContext, sessionId: number, signal: AbortSignal): Promise<void>`
- 事件处理函数不写参数类型或写 `Event`：`h()` 的事件值类型是 `EventListener`，写成 `(e: MouseEvent) => …` 在 `strict` 下会报类型错误。
- 时钟契约（Task 5 的 `durationMs` 无负值/NaN 兜底，全靠本页遵守）：`runner.beginRound(now)` 与 `runner.tick(now)` 的 `now` 只能取 `requestAnimationFrame` 回调参数；`InputEvent.t` 只能取 `PointerEvent.timeStamp`。这两者与 rAF 时间戳同源于 `performance.now()`，任何一处填 `Date.now()` 都会让 `durationMs` 变成 1.7e12 量级。`Date.now()` 只允许用于 `startedAt`、种子与日期键的入参。
- `runner.finish()` 只能调用一次（Task 5 已加一次性守卫，第二次抛错）：`saveFinishedSession` 内部是唯一调用点，页面不得再自己调 `finish()` 取记录，要用的数据从返回的 `record` 里拿。
- 结算页对 `record` 只读：不得 `record.rounds[i].trials.sort(...)`、不得就地改写 `metrics`（要排序先 `[...arr].sort()`）。展示用的换算（毫秒→秒）写进局部变量，不要回写 `record`。这条是 Task 5 深拷贝（N-3）在真实流程里唯一会变得可达的地方。
- `getGame(id)` 对未知 id 返回 `undefined`（Task 7 契约）。今日计划是按已注册的游戏建的（本任务下面的 `ensureTodayPlan` / `saveFinishedSession` 调用点传的都是 `GAMES.map((g) => g.id)`），M1 只注册舒尔特，所以 `buildPlan` 的候选只有 1 个、当天的计划就是 `['schulte']`。**不要把这里改成 `GAME_IDS`**：那样 M1 的 `DayPlan.games` 会含 2 个进不去的游戏，`isPlanComplete` 永远为 false，`streak()` 在整个 M1 恒为 0，首页的「连续 N 天」会变成一句永远不应兑现的承诺。`undefined` 分支今天仍然可达，路径是手敲或粘贴 hash：`parseRoute` 校验的是 `GameId` 全集而不是注册表，`#/play/stroop/free` 会正常解析成一条 play 路由。训练页遇到 `undefined` 必须渲染「未实现」提示页而不是崩（`getGame(id)!.xxx` 一律禁止）；结果页的 `getGame(record.gameId)` 同样保留这层判空，M1 走不到那条分支，但 M2 回退档位或手工写记录时会用到。Task 10 验收里这条是「输入 `#/play/stroop/plan` 应看到提示页」一项。
- `engine` 与 `view` 的配对必须来自同一个 `GameModule`，且在同一处窄化：`GameModule.createView` 声明的是 `GameView<unknown>`（`types.ts:71`），`render` 是方法声明、参数按双变放行，所以 `strict` 抓不住「把 A 游戏的快照喂给 B 游戏的视图」。写法：`const mod = getGame(gameId); const eng = mod.createEngine() as GameEngine<...>`，`view.render(eng.snapshot())` 两个变量只能由这一处 `mod` 派生。Task 6/7 评审把这条列为 Task 9 入口约束（M-6.3），改 `types.ts` 泛型化不在 M1 范围内。
- 本任务只有 `play.ts` 一条桩测（Step 7）：其余页面依赖 DOM 与真实交互，Vitest 环境是 node，验证方式是类型检查、全部单元测试回归、生产构建，实际操作在 Task 10 用浏览器验收。Step 7 不是可选加固 —— 它守的是 spec 4.3 的时钟基准，M1 里没有任何其他地方能测到。

- [ ] **Step 1: 写基础样式**

`focus-trainer/src/ui/styles.css`（中性深色底，触控目标至少 48px；`#view` 内边距 12px、方格间距 4px，使 390px 宽的屏幕上 7×7 方格每格约 48.9px）：

```css
:root {
  color-scheme: dark;
  --bg: #14161a;
  --panel: #1d2026;
  --line: #2c313a;
  --text: #e8eaed;
  --muted: #9aa0a6;
  --accent: #8ab4f8;
  --bad: #f28b82;
  --tap: 48px;
  font-family: system-ui, -apple-system, 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif;
}

* {
  box-sizing: border-box;
}

[hidden] {
  display: none !important;
}

html,
body {
  margin: 0;
  height: 100%;
  background: var(--bg);
  color: var(--text);
}

body {
  overscroll-behavior: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}

#app {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
}

#banner {
  background: #5f2120;
  color: #fff;
  padding: 8px 16px;
  font-size: 14px;
}

#view {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px;
}

h1 {
  font-size: 22px;
  margin: 0;
}

h2 {
  font-size: 16px;
  margin: 0;
  color: var(--muted);
  font-weight: 500;
}

p {
  margin: 0;
  line-height: 1.6;
}

button,
select {
  font: inherit;
  color: inherit;
  min-height: var(--tap);
  min-width: var(--tap);
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 10px;
  padding: 0 16px;
  touch-action: manipulation;
}

button.primary {
  background: var(--accent);
  color: #0b1a2e;
  border-color: transparent;
  font-weight: 600;
}

button.danger {
  color: var(--bad);
  border-color: var(--bad);
}

button:disabled {
  opacity: 0.4;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.spacer {
  flex: 1;
}

.muted {
  color: var(--muted);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  text-align: left;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.card.done {
  opacity: 0.6;
}

.big {
  font-size: 40px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stat {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--line);
}

.play-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.stage {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
}

.stage-game {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  text-align: center;
  background: rgba(20, 22, 26, 0.94);
}

.countdown {
  font-size: 72px;
  font-weight: 700;
}

.overlay-msg {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.5;
  white-space: pre-line;
}

.schulte {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.schulte-info {
  text-align: center;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.schulte-grid {
  display: grid;
  gap: 4px;
  width: min(100%, 520px);
  margin: 0 auto;
  aspect-ratio: 1;
}

.schulte-cell {
  --tint: #22262d;
  background: var(--tint);
  border: none;
  border-radius: 8px;
  padding: 0;
  min-width: 0;
  min-height: 0;
  font-size: clamp(16px, 6vw, 28px);
  font-weight: 600;
}

.schulte-cell.done {
  opacity: 0.2;
}

.schulte-cell.flash {
  background: #b3261e;
}
```

- [ ] **Step 2: 重写启动装配**

`focus-trainer/src/main.ts`（整体替换占位内容）：

```ts
import './ui/styles.css';
import { MemoryRepository, openIdbRepository, type Repository } from './core/storage';
import type { AppContext } from './ui/context';
import { h } from './ui/dom';
import { renderHome } from './ui/pages/home';
import { renderPlay } from './ui/pages/play';
import { renderResult } from './ui/pages/result';
import { renderSettings } from './ui/pages/settings';
import { startRouter, type Route } from './ui/router';

function show(route: Route, view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  switch (route.name) {
    case 'home':
      return renderHome(view, ctx, signal);
    case 'play':
      return renderPlay(view, ctx, route.gameId, route.mode, signal);
    case 'result':
      return renderResult(view, ctx, route.sessionId, signal);
    case 'settings':
      return renderSettings(view, ctx, signal);
  }
}

async function boot(): Promise<void> {
  const banner = document.getElementById('banner') as HTMLElement;
  const view = document.getElementById('view') as HTMLElement;
  let repo: Repository;
  let storageOk = true;
  try {
    repo = await openIdbRepository();
  } catch (err) {
    console.error('IndexedDB 打开失败，改用内存仓库', err);
    repo = new MemoryRepository();
    storageOk = false;
    banner.textContent = '本次成绩无法保存';
    banner.hidden = false;
  }
  navigator.storage?.persist?.().catch((err: unknown) => console.warn('storage.persist 失败', err));
  const ctx: AppContext = { repo, storageOk, settings: await repo.getSettings() };
  let current: AbortController | null = null;
  startRouter((route) => {
    current?.abort();
    const ac = new AbortController();
    current = ac;
    view.replaceChildren();
    show(route, view, ctx, ac.signal).catch((err: unknown) => {
      console.error(err);
      if (!ac.signal.aborted) view.replaceChildren(h('p', null, `页面出错：${String(err)}`));
    });
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  document.getElementById('view')?.replaceChildren(`启动失败：${String(err)}`);
});
```

- [ ] **Step 3: 写首页**

`focus-trainer/src/ui/pages/home.ts`（底部保留 spec 5.8 的「趋势」入口位置，M1 用 `disabled` 按钮占位，M3 再接路由）：

```ts
import { nextPending, streak } from '../../core/scheduler';
import { GAMES, getGame } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';
import { ensureTodayPlan } from '../today';

export async function renderHome(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  const plan = await ensureTodayPlan(
    ctx.repo,
    GAMES.map((g) => g.id),
    ctx.settings.dayStartHour,
  );
  const [plans, states] = await Promise.all([ctx.repo.listPlans(), ctx.repo.listGameStates()]);
  if (signal.aborted) return;
  const levelOf = new Map(states.map((s) => [s.gameId, s.level]));
  const pending = nextPending(plan);

  const planCards = plan.games.map((id) => {
    const done = plan.completed.includes(id);
    return h(
      'div',
      { class: done ? 'card done' : 'card' },
      h('span', null, done ? '✓' : '○'),
      h('span', null, getGame(id)?.name ?? id),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, getGame(id)?.ability ?? ''),
    );
  });

  const start = h(
    'button',
    {
      class: 'primary',
      onclick: () => {
        if (pending) navigate({ name: 'play', gameId: pending, mode: 'plan' });
      },
    },
    pending ? '开始训练' : '今日完成',
  );
  start.disabled = pending === null;

  const freeButtons = GAMES.map((g) =>
    h(
      'button',
      { class: 'card', onclick: () => navigate({ name: 'play', gameId: g.id, mode: 'free' }) },
      h('span', null, g.name),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, `第 ${levelOf.get(g.id) ?? 1} 档`),
    ),
  );

  view.replaceChildren(
    h('h1', null, '专注力训练'),
    h(
      'div',
      { class: 'card' },
      h('span', { class: 'big' }, String(streak(plans, plan.dayKey))),
      h('span', null, '天连续打卡'),
    ),
    h('h2', null, '今日计划'),
    h('div', { class: 'list' }, ...planCards),
    start,
    h('h2', null, '自由练'),
    h('div', { class: 'list' }, ...freeButtons),
    h(
      'div',
      { class: 'row' },
      h('button', { disabled: true, title: '趋势页在 M3 提供' }, '趋势'),
      h('button', { onclick: () => navigate({ name: 'settings' }) }, '设置'),
    ),
  );
}
```

- [ ] **Step 4: 写设置页**

`focus-trainer/src/ui/pages/settings.ts`（清空数据用一次 `confirm` 作为二次确认；Capacitor 的 WebView 支持原生确认框）：

```ts
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

const HOURS = [0, 1, 2, 3, 4, 5, 6];

export async function renderSettings(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  const note = h('p', { class: 'muted' }, '这个时间之前的训练算作前一天。');
  const select = h(
    'select',
    { 'aria-label': '每日分界时间' },
    ...HOURS.map((hour) => {
      const option = h('option', { value: hour }, `${hour}:00`);
      option.selected = hour === ctx.settings.dayStartHour;
      return option;
    }),
  );
  select.addEventListener('change', async () => {
    const settings = { ...ctx.settings, dayStartHour: Number(select.value) };
    await ctx.repo.putSettings(settings);
    ctx.settings = settings;
    note.textContent = `已保存：每天 ${settings.dayStartHour}:00 开始新的一天。`;
  });
  const clear = h(
    'button',
    {
      class: 'danger',
      onclick: async () => {
        if (!confirm('清空全部训练记录、档位和计划？此操作不能撤销。')) return;
        await ctx.repo.clearAll();
        ctx.settings = await ctx.repo.getSettings();
        navigate({ name: 'home' });
      },
    },
    '清空数据',
  );
  view.replaceChildren(
    h('div', { class: 'row' }, h('button', { onclick: () => navigate({ name: 'home' }) }, '返回'), h('h1', null, '设置')),
    h('div', { class: 'card' }, h('span', null, '每日分界时间'), h('span', { class: 'spacer' }), select),
    note,
    clear,
  );
}
```

- [ ] **Step 5: 写训练页 `play.ts`**

`focus-trainer/src/ui/pages/play.ts`：

页面状态机分两层。`ui` 是页面自己的显示状态（说明 / 倒计时 / 待开轮 / 进行中 / 等待点击 / 保存中），`runner.snapshot().phase` 是编排状态（ready / playing / between / voided / finished）。页面只在这两层之间做映射，不重复实现任何轮次逻辑。

内部函数一律用函数声明（会提升），因为它们互相引用（`frame` 调 `showBreak`、`showIntro` 调 `startCountdown`），写成 `const` 箭头函数会因为定义顺序而踩到 TDZ。

```ts
import { SessionRunner, type SessionSnapshot } from '../../core/session';
import type { GameId, Mode, Outcome } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';
import { saveFinishedSession } from '../today';

const COUNTDOWN_MS = 3000;

function outcomeLabel(o: Outcome): string {
  return o === 'pass' ? '通过' : o === 'fail' ? '未通过' : '保持';
}

function breakText(s: SessionSnapshot): string {
  if (s.lastInvalid) return `画面卡顿，本轮不计分\n再来一轮（第 ${s.roundNo} / ${s.roundsTotal} 轮）`;
  const dir =
    s.lastLevelChange > 0
      ? `↑ 升到第 ${s.level} 档`
      : s.lastLevelChange < 0
        ? `↓ 降到第 ${s.level} 档`
        : `→ 保持第 ${s.level} 档`;
  return `${outcomeLabel(s.lastOutcome ?? 'hold')}\n${dir}`;
}

export async function renderPlay(
  view: HTMLElement,
  ctx: AppContext,
  gameId: GameId,
  mode: Mode,
  signal: AbortSignal,
): Promise<void> {
  const game = getGame(gameId);
  if (!game) {
    navigate({ name: 'home' }, true);
    return;
  }
  const state = await ctx.repo.getGameState(gameId);
  if (signal.aborted) return;

  // Date.now() 只用于种子与记录时间；轮内计时全用帧时间戳
  const startedAt = Date.now();
  const runner = new SessionRunner(game, state, mode, startedAt, startedAt);
  const countdownEl = h('div', { class: 'countdown' }, String(Math.ceil(COUNTDOWN_MS / 1000)));

  let ui: 'intro' | 'countdown' | 'starting' | 'running' | 'paused' | 'saving' = 'intro';
  let countdownEnd = 0;
  let raf = 0;

  const roundEl = h('span', { class: 'muted' });
  const levelEl = h('span', { class: 'muted' });
  const stageGame = h('div', { class: 'stage-game' });
  const overlay = h('div', { class: 'overlay' });
  const quitBtn = h(
    'button',
    {
      onclick: () => {
        if (ui === 'intro') {
          navigate({ name: 'home' });
          return;
        }
        if (confirm('退出后本次训练不保存，确定退出吗？')) navigate({ name: 'home' });
      },
    },
    '退出',
  );
  view.replaceChildren(
    h(
      'div',
      { class: 'play-top' },
      h('span', null, game.name),
      roundEl,
      levelEl,
      h('span', { class: 'spacer' }),
      quitBtn,
    ),
    h('div', { class: 'stage' }, stageGame, overlay),
  );

  const gameView = game.createView(stageGame, (e) => runner.input(e));

  function overlayShow(...nodes: HTMLElement[]): void {
    overlay.hidden = false;
    overlay.replaceChildren(...nodes);
  }

  function overlayHide(): void {
    overlay.hidden = true;
  }

  function primary(label: string, onclick: () => void): HTMLElement {
    return h('button', { class: 'primary', onclick }, label);
  }

  function sync(s: SessionSnapshot): void {
    roundEl.textContent = `第 ${s.roundNo} / ${s.roundsTotal} 轮`;
    levelEl.textContent = `第 ${s.level} 档`;
  }

  function showIntro(): void {
    ui = 'intro';
    const s = runner.snapshot();
    overlayShow(
      h('h2', null, game.name),
      h('div', { class: 'muted' }, game.instructions),
      h('div', null, `当前第 ${s.level} 档　共 ${s.roundsTotal} 轮`),
      primary('开始', startCountdown),
    );
  }

  function startCountdown(): void {
    ui = 'countdown';
    countdownEnd = performance.now() + COUNTDOWN_MS;
    countdownEl.textContent = String(Math.ceil(COUNTDOWN_MS / 1000));
    overlayShow(countdownEl);
  }

  function resume(): void {
    ui = 'starting';
    overlayHide();
  }

  function showBreak(s: SessionSnapshot): void {
    if (s.phase === 'voided') {
      overlayShow(h('div', { class: 'overlay-msg' }, '本轮已作废，点击继续'), primary('继续', resume));
      return;
    }
    overlayShow(h('div', { class: 'overlay-msg' }, breakText(s)), primary('继续', resume));
  }

  function saveAndGo(): void {
    ui = 'saving';
    overlayShow(h('div', null, '正在保存…'));
    saveFinishedSession(ctx.repo, GAMES.map((g) => g.id), ctx.settings.dayStartHour, runner).then(
      ({ id }) => navigate({ name: 'result', sessionId: id }, true),
      (err: unknown) => {
        overlayShow(
          h('div', null, `保存失败：${String(err)}`),
          primary('回首页', () => navigate({ name: 'home' })),
        );
      },
    );
  }

  function frame(now: number): void {
    if (ui === 'countdown') {
      const left = Math.ceil((countdownEnd - now) / 1000);
      if (left <= 0) {
        ui = 'starting';
      } else if (countdownEl.textContent !== String(left)) {
        countdownEl.textContent = String(left);
      }
    } else if (ui === 'starting') {
      ui = 'running';
      runner.beginRound(now);
      overlayHide();
    } else if (ui === 'running') {
      runner.tick(now);
      gameView.render(runner.engine.snapshot());
      const s = runner.snapshot();
      sync(s);
      if (s.phase === 'finished') {
        saveAndGo();
        return;
      }
      if (s.phase === 'between' && !s.waitingForTap) {
        // roundBreak === 'auto' 的 600ms 间隔：浮层不出现，继续跑帧让 tick 自动开下一轮
        overlayHide();
      } else if (s.phase !== 'playing') {
        ui = 'paused';
        showBreak(s);
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function onVisibility(): void {
    if (document.visibilityState === 'visible' || signal.aborted) return;
    if (ui === 'countdown' || ui === 'starting') {
      // 这一轮还没真正开始，退回说明层重走倒计时
      showIntro();
      return;
    }
    if (ui !== 'running') return;
    runner.voidCurrentRound();
    ui = 'paused';
    showBreak(runner.snapshot());
  }

  document.addEventListener('visibilitychange', onVisibility, { signal });
  signal.addEventListener(
    'abort',
    () => {
      cancelAnimationFrame(raf);
      gameView.destroy();
    },
    { once: true },
  );

  sync(runner.snapshot());
  showIntro();
  raf = requestAnimationFrame(frame);
}
```

- [ ] **Step 6: 写结算页 `result.ts`**

`focus-trainer/src/ui/pages/result.ts`：

```ts
import { nextPending } from '../../core/scheduler';
import type { SummaryItem } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';
import { ensureTodayPlan } from '../today';

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function stat(item: SummaryItem): HTMLElement {
  return h('div', { class: 'stat' }, h('span', null, item.label), h('span', null, item.value));
}

export async function renderResult(
  view: HTMLElement,
  ctx: AppContext,
  sessionId: number,
  signal: AbortSignal,
): Promise<void> {
  const record = await ctx.repo.getSession(sessionId);
  if (signal.aborted) return;
  const game = record === null ? undefined : getGame(record.gameId);
  if (!record || !game) {
    navigate({ name: 'home' }, true);
    return;
  }

  // 变量名用 past，不要占掉全局 history
  const [past, plan] = await Promise.all([
    ctx.repo.listSessions(record.gameId),
    ensureTodayPlan(ctx.repo, GAMES.map((g) => g.id), ctx.settings.dayStartHour),
  ]);
  if (signal.aborted) return;

  const idx = past.findIndex((r) => r.id === record.id);
  const prev = idx > 0 ? past[idx - 1].ability : null;
  const arrow =
    record.endLevel > record.startLevel ? '↑' : record.endLevel < record.startLevel ? '↓' : '→';
  const abilityText =
    prev === null
      ? `${record.ability}（首次训练）`
      : `${record.ability}（上次 ${prev}，${signed(record.ability - prev)}）`;

  const pending = nextPending(plan);
  const nextGame = pending === null ? undefined : getGame(pending);

  view.replaceChildren(
    h('h1', null, '本次结果'),
    h(
      'div',
      { class: 'muted' },
      `${game.name}　${record.mode === 'plan' ? '今日计划' : '自由练'}　用时 ${(record.durationMs / 1000).toFixed(1)} 秒`,
    ),
    h('div', { class: 'card' }, ...game.formatSummary(record.summary).map(stat)),
    h('div', { class: 'stat' }, h('span', null, '档位'), h('span', null, `第 ${record.startLevel} 档 ${arrow} 第 ${record.endLevel} 档`)),
    h('div', { class: 'stat' }, h('span', null, '能力指数'), h('span', null, abilityText)),
    pending !== null && nextGame
      ? h('button', { class: 'primary', onclick: () => navigate({ name: 'play', gameId: pending, mode: 'plan' }) }, `下一个：${nextGame.name}`)
      : h('div', { class: 'big' }, '今日计划已完成 ✓'),
    h('button', { onclick: () => navigate({ name: 'home' }) }, '回首页'),
  );
}
```

- [ ] **Step 7: 给 `play.ts` 补桩测（时钟契约的唯一 CI 守卫）**

`play.ts` 是全 App 唯一把帧时间戳喂给 `SessionRunner` 的地方。Task 5 裁定过 `durationMs` 不做负值/NaN 兜底（N-5：混基准属于集成期错误，加 `Math.max(0,…)` 只会把 1.7e12 量级变成静默错误），代价是这条契约今天只有 Task 10 的手工浏览器步骤在守。复用上一步 `view.test.ts` 已经证明可行的零依赖手写桩（扩展出 `requestAnimationFrame` / `cancelAnimationFrame` / `document.addEventListener` / 派发 `visibilitychange` / `window.confirm`），配 Task 4 就能在 node 里跑的 `MemoryRepository`，新建 `focus-trainer/src/ui/pages/play.test.ts`，逐条钉：

1. **喂进 runner 的 `now` 只能来自 rAF 回调参数。** 桩里的 `requestAnimationFrame` 把回调收集成数组，测试自己按假时钟逐个 `frame(t)`；用 `vi.spyOn` 或注入的 runner 替身记录 `beginRound(now)` / `tick(now)` 的实参，断言实参序列**恰好等于**喂进去的帧时间戳，且 `vi.spyOn(Date, 'now')` 的返回值从不出现在这些实参里。
2. **`InputEvent.t` 原样是 `PointerEvent.timeStamp`。** 派发一次 `pointerdown`（`timeStamp: 1234.5`），断言引擎收到的 `t` 就是这个数，格子按顺序完成、`elapsedMs` 只跟假时钟走。
3. **`visibilitychange` 切到 hidden 必须作废当前轮。** 断言 `snapshot().phase === 'voided'`（`SessionSnapshot` 暴露的是 `phase`，取值见 `core/session.ts:5` 的 `SessionPhase`；没有 `voided` 布尔字段）、页面出现「本轮已作废」文案、已计分轮数与档位不变。注意 `voidCurrentRound()` 只在 `phase === 'playing'` 时才改成 `'voided'`（`session.ts:92`），所以这条用例必须先在假时钟上进入 playing 再派发事件。
4. **`finish()` 一次训练只能调一次。** 走完整轮后 `repo.listSessions()` 长度 +1；再触发一次结束路径不得再多一条记录（Task 5 的一次性守卫会抛 `session already finished`）。
5. **退出必须走确认框且不落库。** `confirm` 桩返回 false 时留在训练页、监听不摘；返回 true 时 `view.destroy()` 被调用、`repo.listSessions()` 不变。
6. **`getGame(gameId)` 返回 `undefined` 时渲染「未实现」提示页而不是崩。** 这条在 M1 的真实入口是手敲 hash（`parseRoute` 按 `GameId` 全集放行，不查注册表），不是每日计划 —— 计划由已注册游戏生成，见本任务 Interfaces 的对应条目。用例用 `#/play/stroop/plan` 这条路由驱动，断言页面出现「未实现」文案、没有异常抛出、能返回首页。

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui && npx tsc --noEmit
```

Expected: 14 个测试 PASS（Task 8 的 router 3 + today 5，加这里 play 6）；`tsc` 无输出。

- 如果某条契约在 `play.ts` 现有写法下根本测不出来（典型：rAF 循环封在闭包里，桩拿不到回调），**不要放宽断言**，改 `play.ts` 把 `raf` / `now` 做成可注入的可选参数（默认走真的 `requestAnimationFrame`），并把这处改动连同理由写进提交说明。这一步是 Task 9 唯一新增测试的地方，其余页面仍由类型检查、构建与 Task 10 浏览器验收负责。

- [ ] **Step 8: 类型检查、全量回归与构建**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx tsc --noEmit && npx vitest run && npx vite build
```

Expected: `tsc --noEmit` 无任何输出；`vitest run` 全部 135 个测试 PASS（Task 1 7 + Task 2 13 + Task 3 22 + Task 4 30 + Task 5 13 + Task 6 26 + Task 7 10 + Task 8 8 + Task 9 6）；`vite build` 打印 `dist/` 产物且没有报错。

- [ ] **Step 9: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/ui/styles.css focus-trainer/src/ui/pages focus-trainer/src/main.ts && git commit -m "feat(ui): add home, play, result and settings pages"
```

---

### Task 10: 真机尺寸界面验收（browser-use）

**Files:**
- 无新增文件；本任务只做验收，发现问题才回到对应源码文件修复。

**Interfaces:**
- Consumes: Task 1–9 的全部产物；`npm run dev`（`vite --host`）。
- Produces: 验收结论（写进本任务 Step 9 的检查清单），以及必要时的修复提交。

**约定：**
- 本任务必须用 `browser-use:browser-use` 技能驱动浏览器，不允许只靠单元测试就宣称界面可用。
- 后台进程按 AGENTS.md 第 28 条处理：启动前说明用途，记录端口 5173，验收结束后停掉。
- 视口目标 390×844（iPhone 14 Pro 逻辑分辨率，接近常见安卓机）。调用前先 `mcp_get` 看清工具参数：若 `navigate_page` / `take_screenshot` 支持视口或设备参数，就显式设成 390×844；若不支持，用 `evaluate_script` 读取 `window.innerWidth`，在结论里如实记录实际宽度，并按实际尺寸判断触控目标是否达标。

- [ ] **Step 1: 后台启动开发服务器**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vite --host 127.0.0.1 --port 5173 --strictPort
```

用途：本地预览 M1 界面，供 browser-use 验收。端口：5173。用后台方式启动，启动后先访问 `http://127.0.0.1:5173/` 确认返回页面。

- [ ] **Step 2: 打开首页并检查初始状态**

导航到 `http://127.0.0.1:5173/#/`，截图并取快照。Expected：
- 标题「专注力训练」；
- 打卡数字为 `0`，旁边「天连续打卡」；
- 「今日计划」卡片里有 `○ 舒尔特方格 · 持续注意`；
- 「开始训练」按钮可点；
- 「自由练」区显示 `舒尔特方格 第 1 档`；
- 底部一行为 disabled 的「趋势」按钮（`title` 提示 M3 提供）和可点的「设置」按钮；
- 顶部没有红色横幅（IndexedDB 可用）。

- [ ] **Step 3: 走完整训练（黄金路径）**

1. 点「开始训练」→ 地址变成 `#/play/schulte/plan`，显示游戏名、说明、「当前第 1 档　共 3 轮」和「开始」按钮。
2. 点「开始」→ 出现 `3`，逐帧变为 `2`、`1` 后浮层消失，出现 3×3 方格。
3. `take_snapshot` 拿到 9 个格子的 uid，按标签 1→9 依次 `click`。
4. 点完最后一格 → 浮层显示 `通过\n↑ 升到第 2 档`（首轮 3×3 目标 8 秒，逐格点击应远在 8 秒内）。Expected 顶栏同时更新为 `第 2 / 3 轮`、`第 2 档`。
5. 点「继续」→ 4×4 方格；再重复到 5×5。
6. 第 3 轮点完 → 短暂显示「正在保存…」→ 自动跳到 `#/result/<id>`。
7. 结算页 Expected：
   - 顶部 `舒尔特方格　今日计划　用时 x.x 秒`；
   - 指标三行：`最佳用时`、`平均每格`、`总误点 0 次`；
   - `档位 第 1 档 → 第 4 档`（三轮全通过，1→2→3→4）；
   - `能力指数 …（首次训练）`；
   - 按钮显示「今日计划已完成 ✓」（M1 计划里只有舒尔特一个游戏），加「回首页」。
8. 回首页 Expected：打卡变成 `1` 天；今日计划卡片舒尔特前面是 `✓`；「开始训练」显示「今日完成」且 `disabled`；自由练显示 `第 4 档`。

- [ ] **Step 4: 刷新后数据仍在**

`navigate_page` 重新加载 `http://127.0.0.1:5173/#/`。Expected：仍是 `1` 天、`✓`、`第 4 档`（证明写进了 IndexedDB 而不是内存）。

再用 `evaluate_script` 读回刚保存的那条记录，核对 `durationMs` 的量级（这是 Task 5 时钟契约 N-5 的唯一实测点，runner 内不做负值/NaN 兜底）：

```js
async () => {
  const db = await new Promise((res, rej) => {
    const o = indexedDB.open('focus-trainer');
    o.onsuccess = () => res(o.result);
    o.onerror = () => rej(o.error);
  });
  const all = await new Promise((res, rej) => {
    const rq = db.transaction('sessions').objectStore('sessions').getAll();
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return all.map((s) => ({ durationMs: s.durationMs, startedAt: s.startedAt, rounds: s.rounds.length }));
}
```

Expected：`durationMs` 落在几秒到几分钟之间（与 Step 3 实际耗时同量级）。若出现 `1.7e12` 量级、负数或 `NaN`，说明某处把帧时间换成了 `Date.now()`，按 Step 9 用 `superpowers:systematic-debugging` 追根因（先查 `play.ts` 传给 `beginRound`/`tick` 的 `now` 与视图 `emit` 的 `t`）。

- [ ] **Step 5: 误点反馈**

点「自由练」的舒尔特 → 开始 → 倒计时结束后点一个不是「下一个」的格子。Expected：该格子闪红（`.flash`，约 150ms 后恢复），信息行的「误点」变成 1，且已完成格子的变暗效果正常。

再用 `evaluate_script` 把配色读成数字，别只靠肉眼扫截图（Task 6/7 评审把「干扰色是否真的可辨、完成态是否可辨」列为 diff 判不了的两项）：

```js
() => {
  const cells = [...document.querySelectorAll('.schulte-cell')];
  const rgb = (el) => getComputedStyle(el).backgroundColor;
  return {
    tints: [...new Set(cells.map(rgb))].sort(),
    done: cells.filter((c) => c.classList.contains('done')).map(rgb),
    label: getComputedStyle(cells[0]).color,
    page: getComputedStyle(document.body).backgroundColor,
  };
}
```

Expected（控制器已离线按 WCAG 相对亮度与 CIE76 ΔE 算过，直接比对，不必重算）：

| 项 | 实测值 | 判定线 |
|---|---|---|
| 字色 `#e8eaed` 对 4 种干扰底色 | 8.13 / 9.02 / 9.64 / 10.73 | ≥ 4.5（WCAG AA），全部通过 |
| 字色对闪烁底色 `#b3261e` | 5.42 | ≥ 4.5，通过 |
| 4 种干扰色两两 ΔE（含与默认底 `#22262d`） | 最小 11.0（蓝↔默认），最大 38.4（紫↔绿） | ΔE > 10 即一眼可辨，干扰有效；若实测两两 ΔE < 5，说明手机屏幕把 4 档压成了一片，记为 M3 配色问题 |
| 完成格（`opacity: 0.2`）底色对页面背景 | 1.03–1.09 | **刻意如此**：完成格淡出背景、让未完成的目标突出。副作用是完成格自身数字只剩 1.59–1.69 对比度，几乎读不出——M1 按现状接受，回不回头做「完成态仍可读数」由 M3 打磨时裁定 |

- [ ] **Step 6: 切后台作废当前轮**

新一轮进行中时，用 `evaluate_script` 覆盖可见性并派发事件：

```js
() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  return document.visibilityState;
}
```

Expected：浮层出现「本轮已作废，点击继续」。再把 `visibilityState` 改回 `'visible'` 并点「继续」，能正常开新一轮；跑完 3 轮后结算页轮次数仍是 3（作废的轮不占计分轮号，只补轮）。

- [ ] **Step 7: 退出确认与档位不变**

进行到第 2 轮时点「退出」。Expected：先弹出 `退出后本次训练不保存，确定退出吗？`，用 `handle_dialog` 接受 → 回首页，自由练仍显示上一次保存的档位（本次训练没写库）。再点一次「退出」并选择取消，Expected：留在训练页且当前轮进度保留。

- [ ] **Step 8: 设置页与清空数据**

1. 首页点「设置」→ 改「每日分界时间」为 `6`，Expected：出现 `已保存：每天 6:00 开始新的一天。`；刷新页面后下拉框仍是 `6`。
2. 点「清空数据」→ `handle_dialog` 接受确认框。Expected：回首页，打卡回到 `0`，今日计划变回 `○`，自由练档位回到 `第 1 档`。
3. 分界时间改回 `4`。
4. `list_console_messages` 全量检查。Expected：没有 `error`，也没有 `storage.persist 失败` 以外的警告（`storage.persist 失败` 在桌面浏览器可能出现，属预期，记录即可）。

- [ ] **Step 9: 未注册游戏的路由**

`navigate_page` 到 `http://127.0.0.1:5173/#/play/stroop/plan`。Expected：页面显示「未实现」提示（含游戏名或 id）与返回首页的入口，`list_console_messages` 里**没有** `error`。这是 Task 9 Step 7 第 6 条桩测的实测面 —— M1 的每日计划只含已注册游戏，`getGame()` 返回 `undefined` 的唯一真实入口就是手敲/粘贴 hash（`parseRoute` 按 `GameId` 全集放行，不查注册表），所以只能在这里验一次。

- [ ] **Step 10: 结论与收尾**

- 逐条记录 Step 2–9 的实际结果，任何一条与 Expected 不符，先用 `superpowers:systematic-debugging` 找根因，修完再跑 `cd "E:/WORK/脑力训练/focus-trainer" && npx tsc --noEmit && npx vitest run && npx vite build` 确认没把测试改坏，然后提交：

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src && git commit -m "fix(ui): <具体问题>"
```

- 停掉 Step 1 启动的 dev server（用启动它的那个后台任务的终止接口，确认 5173 端口已释放：`netstat -ano | grep 5173` 无输出）。
- 已知限制，验收时按现状接受、不要临时改：
  - 360px 宽的屏幕上 7×7 每格约 44.6px，低于 48px 触控目标；高档位手感问题留到 M3 打磨。
  - 安卓物理返回键中途离开训练页会丢弃本次训练且不弹确认，M4 用 Capacitor App 插件处理。
  - 今日计划一旦当天生成就复用，因此 M2 上线后当天已存在的旧计划仍只含舒尔特；M2 计划里要显式处理（重算当天计划，或在 M2 验收前清空数据）。



---

## M1 完成判据（对照 spec 第 1 节）

| spec 成功标准 | M1 覆盖情况 |
|---|---|
| 1 APK | 不在 M1，属 M4 |
| 2 游戏走通并写库 | 舒尔特方格走通（Task 6–10），其余四个在 M2 |
| 3 自动升降档并续档 | Task 2 的 `step` + Task 4 的 `gameState` store + Task 10 Step 3/8 实测 |
| 4 今日计划与打卡 | Task 3 的 `buildPlan`/`streak` + Task 8 的 `ensureTodayPlan`/`saveFinishedSession`；M1 注册表只有 1 个游戏，计划当天只有 1 项，M2 注册满 5 个后自然变成 3 项 |
| 5 趋势页 | 不在 M1，属 M3（首页用 disabled 按钮占位） |
| 6 纯逻辑单测 + 帧时间实测 | Task 1–9 共 135 个测试；试次记录的 `onset`/`rt` 全部来自帧时间戳与 `PointerEvent.timeStamp`（Task 6，`play.ts` 的基准由 Task 9 Step 7 的桩测钉住） |

M1 结束时应当满足：`npx tsc --noEmit` 干净、135 个测试全绿、`npx vite build` 出 `dist/`、Task 10 的 Step 2–9 在手机尺寸浏览器里全部通过。
