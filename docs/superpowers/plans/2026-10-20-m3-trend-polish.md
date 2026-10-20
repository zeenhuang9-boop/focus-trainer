# M3 趋势页与界面打磨 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付趋势页（五维能力雷达 + 单游戏近 30 天能力曲线 + 近 5 周打卡日历，全部手写 SVG）、把首页的「趋势」按钮接成真路由，并关掉 M1 浏览器验收遗留的两条打磨判据（完成态数字可读性、窄屏触控目标 < 48px），使 spec 第 1 节成功标准 5 与「手机可用」判据可以关闭。

**Architecture:** 三层，全部只读。`src/core/stats.ts` 是纯聚合层（只吃 `SessionRecord[]` / `DayPlan[]` / 注册表派生的 id 数组，不碰 DOM、不碰 `Repository`）；`src/ui/charts.ts` 是纯 SVG 几何 + 建节点层（只用 `document.createElementNS`，颜色一律交给 class）；`src/ui/pages/trends.ts` 只做「读库 → 调 stats → 调 charts → 挂 DOM」。趋势页不调用任何写方法，也不调用会 `putPlan` 的 `ensureTodayPlan()`。能力指数只有一个来源：`SessionRecord.ability`（`scoring.abilityIndex` 在 `SessionRunner.finish()` 时算好落库），本层不重算第二套公式。

**Tech Stack:** TypeScript 5.9.3（`strict` + `verbatimModuleSyntax` + `isolatedModules`）、Vite 8.3.4、Vitest 5.0.5（`environment: 'node'`，**没有 jsdom**，视图测试手写 DOM 桩）、fake-indexeddb 6.2.6、原生 DOM + 手写 SVG。M3 **零新增依赖**。

**Spec:** `docs/superpowers/specs/2026-10-18-focus-trainer-design.md`（判据出处：§1 成功标准 5「趋势页显示五维能力雷达图、单个游戏近 30 天能力曲线、近 5 周打卡日历」与成功标准 6、§5.3 能力指数与雷达/折线口径、§5.4 日期键、§5.6 连续打卡、§5.7 存储、§5.8 页面与视觉约束、§7 测试、§8 里程碑 M3）

## Global Constraints

- 项目根 `E:\WORK\脑力训练\focus-trainer\`；Git 仓库根 `E:\WORK\脑力训练\`（git 命令在仓库根执行，路径写 `focus-trainer/...`）。Node/Git Bash 环境，路径含中文，命令一律用双引号包住。
- **不新增、不升级、不删除任何依赖。** 趋势图形必须手写 SVG 或 CSS，由 TS 生成，这样它能在 node 环境下被单测断言结构。禁止 chart 库 / d3 / 图标库 / 字体包。
- **离线红线（M4 会据此审计）：** 源码与打包产物里长得像外部地址的字符串**只允许** SVG 命名空间 `http://www.w3.org/2000/svg`。M4 的离线审计（`2026-10-20-m4-android-apk.md` Task 7）用 `/https?:\/\/[A-Za-z0-9.\-_]+/g` 扫 `assets/public/`，allowlist 只认 `^https?:\/\/([a-z0-9-]+\.)?w3\.org/i`。因此：不许 `<image href="http…">`、不许 `@import`、不许外链字体/CDN/`favicon` 远程地址、不许 `localhost`/`127.0.0.1` 出现在源码里。处理方式是删掉，不是往 allowlist 里加。
- TS 编译门槛：`strict`、`isolatedModules`、`verbatimModuleSyntax`、`noFallthroughCasesInSwitch`（`focus-trainer/tsconfig.json`）。类型只准 `import type { X } from '…'` 或 `import { type X }`。每个任务提交前跑 `npx tsc --noEmit`，必须零输出。
- 测试环境是 **node**，没有 `document`、没有 CSS 引擎。视图测试沿用 `src/ui/pages/play.test.ts:9-130` 的手写零依赖 DOM 桩形状；CSS 判据用 `import css from '../styles.css?raw'` 取文本再断言（`tsconfig.json` 已 `types: ["vite/client"]`，`?raw` 有现成类型，不需要新依赖）。SVG 断言只断**结构与属性字符串**，不断像素。
- 时钟契约：`Date.now()` 只允许用于种子、记录时间戳和「今天属于哪个 dayKey」的日期键入参；轮内计时只用 rAF 帧时间戳与 `PointerEvent.timeStamp`。趋势页不在轮内，且**任何页面级 `Date.now()` 必须以可注入参数写出**（`now = Date.now()`，照 `src/ui/today.ts:11` 的形态），测试里显式传常量而不是 `vi.spyOn(Date,'now')`。禁止给时钟加负值/NaN 钳制。
- 日界是**本地 04:00**（`Settings.dayStartHour`，默认 4，`src/core/daykey.ts`）。30 天曲线、日历、近 3 次均值一律按 `dayKey` 分桶；**禁止** `toISOString().slice(0,10)` 或任何 UTC 日键。
- 注册表是唯一迭代来源：雷达轴、曲线选项、日历完整性判定都从 `src/games/registry.ts` 的 `GAMES.map((g) => g.id)` 派生；**禁止**把 `GAME_IDS` 当数据源（M1 同类裁定：`GAME_IDS` 当计划源会让 `isPlanComplete` 恒 false、`streak()` 恒 0）。执行时 `GAMES` 的实际长度可能是 2（M2 合并前）或 5（合并后），**测试不得硬编码 5**。
- 数字口径（spec 给定的值，一个字都不许改）：`PLAN_SIZE = 3`；`dayStartHour = 4`；能力指数窗口 = 最后 ⌈R/2⌉ 个 `counted` 轮（已由 `scoring.abilityIndex` 落库，M3 只读不重算）；雷达 = 每游戏最近 **3** 次训练 `ability` 的均值，没练过显示 **0** 并标注「未练」；折线 = 每日期键取当天该游戏 `ability` 的**最高值**，显示最近 **30** 个日期键；日历 = 近 **5** 周 = **35** 格；连续打卡 = `scheduler.streak(plans, todayKey)`，今天未完成不打断；触控目标 ≥ **48px**（`--tap: 48px`，`styles.css:10`）。
- **共享文件红线（继承 `docs/superpowers/plans/_m2-conventions.md`）：**
  - `src/games/registry.ts` 与 `src/games/registry.test.ts` **M3 一律不碰**（S-1：由控制器的 M2 汇总步骤在 M3 之前一次性落盘：按 `GAME_IDS` 声明顺序追加 5 个游戏 + 拼接 4 段 `.game-*` 样式 + 同步 K-11 用例）。M3 只 `import { GAMES, getGame }`。
  - `src/ui/pages/play.test.ts` 的 K-11 用例（`expect(...).toMatchObject({ games: [...] })`）由 M2 汇总步骤改成 5 个 id，**M3 不碰**。
  - `src/ui/styles.css` 也是共享文件：M3 的 CSS 改动（Task 4）**必须排在 M2 汇总步骤之后**执行，且只准两处动作——按内容锚定改写既有的 `.schulte-cell.done` 块，以及把新块追加到**文件末尾**。整文件重写禁止，按行号定位禁止。
  - F-1：本计划的测试不喂帧序列，但如果任何步骤需要循环推进时间，一律用整数下标算时刻（`for (let i = 0; i <= n; i++) f(base + i * step)`），禁止 `t += stepMs` 浮点累加。
  - T-1：同一目录同一时刻只允许一个写手。`src/games/**` 此刻有并行的 M2 写手，M3 的写手不得进入该目录。
- 提交纪律：**一个任务一个提交**；`git add` 只准列出本任务 Files 清单里的文件，禁止 `git add -A` / `git add .` / `git stash` / `--no-verify`。提交后运行 `git log --format='%h %s' -1` 并把输出原样抄进报告（C-1：报告里的哈希只能来自这条命令）。
- 文案与命名：用户可见文案中文；标识符英文；默认不写注释，只在原因不显然处写一行中文注释。路由名、class 名、函数名在本计划内拼写唯一（`trend` 单数、`.trend-*` 前缀）。
- 趋势页**只读**：只准调 `Repository` 的 `listSessions()` / `listPlans()` / `listGameStates()`；**禁止** `saveSession` / `putPlan` / `putSettings` / `clearAll`，也**禁止**调用会写库的 `ensureTodayPlan()`（`src/ui/today.ts:19` 有 `repo.putPlan`）。这一条由 `trends.test.ts` 的调用集合断言钉死。
- 渲染上限有界，与记录条数无关：雷达 ≤ 4 圈 + 2n 节点（n = 注册表长度）、曲线 ≤ 1 线 + 30 点 + 2 标签、日历恒 35 格。
- 界面文案中文并在本计划内定死（见各任务的 Expected 字符串）；执行者不得把文案改成「看起来更好」的版本。
- 修改代码只用编辑工具（Write / Edit），禁止 sed / awk / heredoc / 脚本改代码。
- 测试计数纪律：计划里的期望数字以执行者实测为准；不得为凑数删测试、不得写没有断言的测试。每条断言要能杀掉一个对应的变异。
- 门禁命令（每个任务提交前跑，全绿才提交）：
  ```bash
  cd "E:/WORK/脑力训练/focus-trainer" && npx tsc --noEmit && npx vitest run && npx vite build
  ```

## 文件结构

| 文件 | 动作 | 责任 |
|---|---|---|
| `focus-trainer/src/core/stats.ts` | 新建 | 纯聚合：雷达近 3 次均值、30 天窗口最高值、35 格日历状态、当前选中 id 解析 |
| `focus-trainer/src/core/stats.test.ts` | 新建 | 上述口径的单测（含 04:00 边界、注册表长度无关断言） |
| `focus-trainer/src/ui/charts.ts` | 新建 | 手写 SVG：`svg()` 建节点小工具 + 雷达/折线/日历三个几何函数 |
| `focus-trainer/src/ui/charts.test.ts` | 新建 | SVG 结构与坐标断言（`createElementNS` 桩） |
| `focus-trainer/src/ui/pages/trends.ts` | 新建 | 趋势页装配：只读 `listSessions` / `listPlans`，把三张图挂进 `view` |
| `focus-trainer/src/ui/pages/trends.test.ts` | 新建 | 页面级断言：只读方法集合、三个 section 齐全、`select` 切换、空态文案 |
| `focus-trainer/src/ui/router.ts` | 修改 | `Route` 加 `{ name: 'trend' }`；`parseRoute` 加一条分支；`href` 加 `case 'trend'` |
| `focus-trainer/src/ui/router.test.ts` | 修改 | 追加 `#/trend` 的双向解析断言 |
| `focus-trainer/src/main.ts` | 修改 | `show()` 加 `case 'trend'` 分支 |
| `focus-trainer/src/ui/pages/home.ts` | 修改 | 底部「趋势」按钮由 `disabled` + `title` 改为真 `navigate` |
| `focus-trainer/src/ui/styles.css` | 修改（Task 4，M2 汇总之后） | 改写 `.schulte-cell.done`；文件末尾追加 `.trend-*` 与两个 `--done-*` 变量 |
| `focus-trainer/src/ui/styles.test.ts` | 新建 | CSS 文本判据：48px 触控算式、完成态对比度、无外链 |

---

## 执行顺序

Task 1 → 2 → 3 → 4 → 5。

- Task 4 有硬前置：**控制器的 M2 汇总步骤必须已经落地**（S-1）。理由是 Task 4 要在 `styles.css` 末尾追加一段，并且 `.schulte-cell.done` 的改写位置必须稳定；M2 汇总之前动这个文件会和四个游戏的 `.game-*` 段互相覆盖。Task 1/2/3 与 M2 汇总互不干扰（新文件 + 三个非共享文件的定点修改），可以先跑。
- Task 3 起 `#/trend` 就通了，Task 4 只补样式，Task 5 只做验收。**没有「半成品页面」**：Task 3 提交后趋势页三张图都在（只是没配色）。
- Task 5 之前先跑一次全量门禁（`npx tsc --noEmit && npx vitest run && npx vite build`），并确认 `git status --porcelain` 里没有别人的脏文件被本计划夹带。
- `GAMES` 当前是 2 个游戏（M2 合并后是 5 个）。本计划所有测试都从注册表派生长度，两种状态下都必须全绿；Task 5 的验收记录要分别写明「轴数 = 当时 `GAMES.length`」。

---

### Task 1: `core/stats.ts` —— 趋势页的纯聚合层

**Files:**
- Create: `focus-trainer/src/core/stats.ts`
- Test: `focus-trainer/src/core/stats.test.ts`

**Interfaces:**
- Consumes: `src/core/types.ts` 的 `GameId` / `SessionRecord` / `DayPlan`（`import type`）；`src/core/scheduler.ts` 的 `isPlanComplete(plan: DayPlan): boolean`；`src/core/daykey.ts` 的 `addDays(key: string, delta: number): string`。
- Produces（Task 2/3 逐字使用这些名字与类型）:
  - `RADAR_WINDOW = 3`、`TREND_DAYS = 30`、`CALENDAR_CELLS = 35`
  - `type TrendGame = { id: GameId; ability: string }`
  - `interface RadarAxis { gameId: GameId; ability: string; value: number; practiced: boolean }`
  - `interface AbilityPoint { index: number; dayKey: string; ability: number }`
  - `interface AbilityWindow { gameId: GameId; keys: string[]; points: AbilityPoint[] }`
  - `type CalendarState = 'done' | 'partial' | 'none'`
  - `interface CalendarCell { dayKey: string; state: CalendarState; doneCount: number; planSize: number }`
  - `function radarAxes(games: readonly TrendGame[], sessions: readonly SessionRecord[]): RadarAxis[]`
  - `function abilityWindow(gameId: GameId, sessions: readonly SessionRecord[], todayKey: string, days?: number): AbilityWindow`
  - `function calendarCells(games: readonly TrendGame[], plans: readonly DayPlan[], todayKey: string, cells?: number): CalendarCell[]`
  - `function pickTrendGame(games: readonly TrendGame[], states: readonly { gameId: GameId; lastPlayedDayKey: string | null }[], fallback?: GameId): GameId`

**前置：** 本任务只新建 `src/core/` 下的两个文件，不读也不写任何共享文件；`src/games/**` 有 M2 并行写手（T-1），不许进入。

- [ ] **Step 1: 写失败的测试**

Create `focus-trainer/src/core/stats.test.ts`，内容逐字照抄：

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addDays } from './daykey';
import {
  abilityWindow,
  calendarCells,
  pickTrendGame,
  radarAxes,
  CALENDAR_CELLS,
  RADAR_WINDOW,
  TREND_DAYS,
  type TrendGame,
} from './stats';
import type { GameId, SessionRecord } from './types';

const G = (id: GameId, ability: string): TrendGame => ({ id, ability });
const GAMES3: TrendGame[] = [G('schulte', '持续注意'), G('stroop', '抑制控制'), G('seqmem', '工作记忆')];

// 手写记录而不是走 SessionRunner：本层只认 gameId / dayKey / startedAt / ability 四个字段。
function rec(gameId: GameId, startedAt: number, day: string, ability: number): SessionRecord {
  return {
    gameId, mode: 'free', dayKey: day, startedAt,
    durationMs: 1000, startLevel: 1, endLevel: 1, rounds: [], summary: {}, ability,
  };
}

describe('radarAxes', () => {
  it('取最近 3 次训练 ability 的均值并四舍五入，第 4 次以前不参与', () => {
    const sessions = [
      rec('schulte', 1_000, '2026-10-16', 10),
      rec('schulte', 2_000, '2026-10-17', 20),
      rec('schulte', 3_000, '2026-10-18', 30),
      rec('schulte', 4_000, '2026-10-19', 40),
      rec('stroop', 5_000, '2026-10-19', 52),
    ];
    expect(radarAxes(GAMES3, sessions)).toEqual([
      { gameId: 'schulte', ability: '持续注意', value: 30, practiced: true },
      { gameId: 'stroop', ability: '抑制控制', value: 52, practiced: true },
      { gameId: 'seqmem', ability: '工作记忆', value: 0, practiced: false },
    ]);
  });

  it('输入乱序也按 startedAt 倒序取窗口，.5 向上取整', () => {
    const sessions = [rec('schulte', 3_000, '2026-10-19', 40), rec('schulte', 1_000, '2026-10-17', 10), rec('schulte', 2_000, '2026-10-18', 11)];
    expect(radarAxes([G('schulte', '持续注意')], sessions)[0].value).toBe(21);
  });

  it('从没练过是 value 0 且 practiced false', () => {
    expect(radarAxes([G('mot', '动态感知')], [])).toEqual([
      { gameId: 'mot', ability: '动态感知', value: 0, practiced: false },
    ]);
  });

  it('轴数跟随传入的注册表长度，不硬编码 5', () => {
    expect(radarAxes([], [])).toEqual([]);
    expect(radarAxes(GAMES3, [rec('schulte', 1, '2026-10-19', 5)])).toHaveLength(3);
  });
});

describe('abilityWindow', () => {
  const TODAY = '2026-10-19';

  it('默认给出以今天结尾、升序的 30 个日期键', () => {
    const win = abilityWindow('schulte', [], TODAY);
    expect(TREND_DAYS).toBe(30);
    expect(win.keys).toHaveLength(30);
    expect(win.keys[0]).toBe('2026-09-20');
    expect(win.keys[29]).toBe(TODAY);
    expect(win.points).toEqual([]);
    expect(win.gameId).toBe('schulte');
  });

  it('同一日期键取当天最高 ability，不按最后一条', () => {
    const win = abilityWindow('schulte', [rec('schulte', 1_000, TODAY, 45), rec('schulte', 2_000, TODAY, 20)], TODAY);
    expect(win.points).toEqual([{ index: 29, dayKey: TODAY, ability: 45 }]);
  });

  it('凌晨 02:00 的记录归前一天：只认记录自带的 dayKey，绝不再算一次', () => {
    // startedAt 是 2026-10-18 02:00 的时刻，但写入方按 04:00 分界把 dayKey 落成了 2026-10-17
    const lateNight = new Date(2026, 9, 18, 2, 0).getTime();
    const win = abilityWindow('schulte', [rec('schulte', lateNight, '2026-10-17', 33)], TODAY);
    expect(win.points).toEqual([{ index: 27, dayKey: '2026-10-17', ability: 33 }]);
    expect(win.keys[27]).toBe('2026-10-17');
  });

  it('窗口外（更早与更晚）的记录被丢掉', () => {
    const sessions = [
      rec('schulte', 1, addDays(TODAY, -30), 50),
      rec('schulte', 2, addDays(TODAY, 1), 60),
      rec('schulte', 3, addDays(TODAY, -29), 70),
    ];
    expect(abilityWindow('schulte', sessions, TODAY).points.map((p) => p.dayKey)).toEqual([addDays(TODAY, -29)]);
  });

  it('别的游戏的记录不进这条曲线', () => {
    expect(abilityWindow('schulte', [rec('stroop', 1, TODAY, 90)], TODAY).points).toEqual([]);
  });
});

describe('calendarCells', () => {
  const TODAY = '2026-10-19';

  it('默认 35 格、以今天结尾、升序', () => {
    const cells = calendarCells(GAMES3, [], TODAY);
    expect(CALENDAR_CELLS).toBe(35);
    expect(cells).toHaveLength(35);
    expect(cells[34].dayKey).toBe(TODAY);
    expect(cells[0].dayKey).toBe(addDays(TODAY, -34));
    expect(cells[34]).toEqual({ dayKey: TODAY, state: 'none', doneCount: 0, planSize: 0 });
  });

  it('计划全完成是 done，完成一半是 partial，没计划是 none', () => {
    const full = { dayKey: '2026-10-18', games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte', 'stroop', 'seqmem'] as GameId[] };
    const half = { dayKey: '2026-10-17', games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte'] as GameId[] };
    const cells = calendarCells(GAMES3, [full, half], TODAY);
    expect(cells[33]).toEqual({ dayKey: '2026-10-18', state: 'done', doneCount: 3, planSize: 3 });
    expect(cells[32]).toMatchObject({ dayKey: '2026-10-17', state: 'partial', doneCount: 1, planSize: 3 });
  });

  it('未注册游戏既不计进数字也不影响 done 判定', () => {
    // 注册表只有 2 个游戏时，那条 3 项计划：isPlanComplete 为真 → 状态仍是 done，数字按注册表过滤
    const games = [G('schulte', '持续注意'), G('stroop', '抑制控制')];
    const stale = { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte', 'stroop', 'seqmem'] as GameId[] };
    expect(calendarCells(games, [stale], TODAY)[34]).toEqual({ dayKey: TODAY, state: 'done', doneCount: 2, planSize: 2 });
    // 未注册项被勾掉后计划其实没打完：state 交给 isPlanComplete，绝不在 UI 层重算
    const partial = { dayKey: TODAY, games: ['schulte', 'stroop', 'seqmem'] as GameId[], completed: ['schulte', 'seqmem'] as GameId[] };
    expect(calendarCells(games, [partial], TODAY)[34]).toMatchObject({ state: 'partial', doneCount: 1, planSize: 2 });
  });

  it('空 games 的坏计划不算 done', () => {
    const broken = { dayKey: TODAY, games: [] as GameId[], completed: [] as GameId[] };
    expect(calendarCells(GAMES3, [broken], TODAY)[34].state).toBe('none');
  });
});

describe('pickTrendGame', () => {
  it('默认选中 lastPlayedDayKey 最新的那个', () => {
    const states = [
      { gameId: 'schulte' as GameId, lastPlayedDayKey: '2026-10-18' },
      { gameId: 'stroop' as GameId, lastPlayedDayKey: '2026-10-19' },
    ];
    expect(pickTrendGame(GAMES3, states)).toBe('stroop');
  });

  it('从没练过或注册表外都退回注册表第一项', () => {
    const [a, b] = GAMES3;
    expect(pickTrendGame([b, a], [{ gameId: a.id, lastPlayedDayKey: null }])).toBe(b.id);
    expect(pickTrendGame(GAMES3, [{ gameId: 'mot', lastPlayedDayKey: '2026-10-19' }])).toBe('schulte');
  });

  it('空注册表：有 fallback 用它，没有就抛错而不是渲染一条空曲线', () => {
    expect(pickTrendGame([], [], 'schulte')).toBe('schulte');
    expect(() => pickTrendGame([], [])).toThrow(TypeError);
  });
});

it('stats.ts 里没有第二套时钟来源', () => {
  const src = readFileSync(fileURLToPath(new URL('./stats.ts', import.meta.url)), 'utf8');
  expect(src).not.toMatch(/Date\.now|new Date|toISOString|getUTCHours/);
});

it('雷达窗口常量是 3', () => {
  expect(RADAR_WINDOW).toBe(3);
});
```

- [ ] **Step 2: 跑测试确认它失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/stats.test.ts
```
Expected: FAIL，且失败原因是**模块不存在**（`Cannot find module './stats'` / `Failed to load url ./stats`），不是断言不匹配。若报的是断言失败，说明 `stats.ts` 已被别人建出来了 —— 停下来核对工作树，别覆盖。

- [ ] **Step 3: 写实现**

Create `focus-trainer/src/core/stats.ts`，逐字照抄：

```ts
import { addDays } from './daykey';
import { isPlanComplete } from './scheduler';
import type { DayPlan, GameId, SessionRecord } from './types';

export const RADAR_WINDOW = 3;
export const TREND_DAYS = 30;
export const CALENDAR_CELLS = 35;

export type TrendGame = { id: GameId; ability: string };

export interface RadarAxis {
  gameId: GameId;
  ability: string;
  value: number;
  practiced: boolean;
}

export interface AbilityPoint {
  index: number;
  dayKey: string;
  ability: number;
}

export interface AbilityWindow {
  gameId: GameId;
  keys: string[];
  points: AbilityPoint[];
}

export type CalendarState = 'done' | 'partial' | 'none';

export interface CalendarCell {
  dayKey: string;
  state: CalendarState;
  doneCount: number;
  planSize: number;
}

const byStartedAtDesc = (a: SessionRecord, b: SessionRecord): number => b.startedAt - a.startedAt;

export function radarAxes(games: readonly TrendGame[], sessions: readonly SessionRecord[]): RadarAxis[] {
  return games.map((g) => {
    const recent = sessions.filter((s) => s.gameId === g.id).slice().sort(byStartedAtDesc).slice(0, RADAR_WINDOW);
    if (recent.length === 0) return { gameId: g.id, ability: g.ability, value: 0, practiced: false };
    const mean = recent.reduce((sum, s) => sum + s.ability, 0) / recent.length;
    return { gameId: g.id, ability: g.ability, value: Math.round(mean), practiced: true };
  });
}

// 只认记录自带的 dayKey（写入方已按本地 dayStartHour 分界算过），这里绝不再从 startedAt 推日期。
export function abilityWindow(gameId: GameId, sessions: readonly SessionRecord[], todayKey: string, days = TREND_DAYS): AbilityWindow {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) keys.push(addDays(todayKey, -i));
  const first = keys[0] as string;
  const best = new Map<string, number>();
  for (const s of sessions) {
    if (s.gameId !== gameId) continue;
    if (s.dayKey < first || s.dayKey > todayKey) continue;
    const cur = best.get(s.dayKey);
    if (cur === undefined || s.ability > cur) best.set(s.dayKey, s.ability);
  }
  const points: AbilityPoint[] = [];
  keys.forEach((key, index) => {
    const ability = best.get(key);
    if (ability !== undefined) points.push({ index, dayKey: key, ability });
  });
  return { gameId, keys, points };
}

export function calendarCells(games: readonly TrendGame[], plans: readonly DayPlan[], todayKey: string, cells = CALENDAR_CELLS): CalendarCell[] {
  const valid = new Set<string>(games.map((g) => g.id));
  const byKey = new Map(plans.map((p) => [p.dayKey, p]));
  const out: CalendarCell[] = [];
  for (let i = cells - 1; i >= 0; i--) {
    const dayKey = addDays(todayKey, -i);
    const p = byKey.get(dayKey);
    const doneCount = p === undefined ? 0 : p.completed.filter((g) => valid.has(g)).length;
    const planSize = p === undefined ? 0 : p.games.filter((g) => valid.has(g)).length;
    // done 只问 isPlanComplete（与首页、streak 同一把尺子），数字才按注册表过滤
    const state: CalendarState = p !== undefined && isPlanComplete(p) ? 'done' : doneCount > 0 ? 'partial' : 'none';
    out.push({ dayKey, state, doneCount, planSize });
  }
  return out;
}

export function pickTrendGame(
  games: readonly TrendGame[],
  states: readonly { gameId: GameId; lastPlayedDayKey: string | null }[],
  fallback?: GameId,
): GameId {
  const ids = new Set<string>(games.map((g) => g.id));
  let bestKey = '';
  let bestId: GameId | null = null;
  for (const s of states) {
    if (!ids.has(s.gameId) || s.lastPlayedDayKey === null) continue;
    if (s.lastPlayedDayKey > bestKey) {
      bestKey = s.lastPlayedDayKey;
      bestId = s.gameId;
    }
  }
  const first = games.length > 0 ? (games[0] as TrendGame).id : fallback;
  if (first === undefined) throw new TypeError('趋势页没有可显示的游戏');
  return bestId ?? first;
}
```

`Ruling: `pickTrendGame` 用 `lastPlayedDayKey` 而不是 `startedAt` 选默认曲线 —— `GameState.lastPlayedDayKey` 已在库里（`storage.ts:6` 的 `listGameStates()` 一次拿全），不必再 `listSessions` 五遍。 —— 代价：同一天练过两个游戏时选中谁取决于 `listGameStates` 的 `gameId` 升序（`storage.ts:49`），是稳定但任意的平局裁决，成本为零。

`Ruling: `calendarCells` 的 35 格用「以今天结尾的 35 个连续日期键」，不按周一对齐 —— `Settings` 里只有 `dayStartHour`，没有「每周第一天」，按 ISO 周对齐要新造一个设置项和一套 `getDay()` 算术，而 spec §5.8 只写「近 5 周打卡日历」。 —— 代价：日历最后一行的周可能不完整（今天可能在行中间）；如果以后要改成周对齐，改这一个循环，`CALENDAR_CELLS` 与 35 格断言一起动。

`Ruling: `abilityWindow` 只输出有训练的天（`points` 可能少于 30），但 `keys` 恒为 30 个连续日期键 —— 折线的 x 轴必须是日期而不是「第几次训练」，否则缺练的日子会被压缩、曲线看着像天天在练。 —— 代价：`charts.ts` 要处理 0 点/1 点两种退化情形（Task 2 已各写一条断言）。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/stats.test.ts && npx tsc --noEmit
```
Expected: `stats.test.ts` 全部通过（用例数应为 17 条；实际数字以执行者实测为准，不得为凑数删用例），`tsc --noEmit` 零输出。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/core/stats.ts focus-trainer/src/core/stats.test.ts && git commit -m "feat(stats): 趋势页纯聚合层（雷达近 3 次均值 / 30 天最高 / 35 格日历）" && git log --format='%h %s' -1
```
把 `git log` 那一行原样抄进报告（C-1）。

**交付物：** `src/core/stats.ts` 一层被测绿的纯函数，spec §5.3 的三个口径（近 3 次均值、每日期键取最高、30 个日期键）与 §5.8 的 5 周日历在这里已经可关闭；本任务不依赖 M2 合并，注册表 2 个或 5 个游戏都绿。

---

### Task 2: `ui/charts.ts` —— 手写 SVG 几何（雷达 / 折线 / 日历）

**Files:**
- Create: `focus-trainer/src/ui/charts.ts`
- Test: `focus-trainer/src/ui/charts.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `RadarAxis` / `AbilityWindow` / `AbilityPoint` / `CalendarCell` / `CalendarState` / `TREND_DAYS` / `CALENDAR_CELLS`（全部 `import type`，两个常量是值导入）。
- Produces（Task 3 逐字使用）:
  - `SVG_NS = 'http://www.w3.org/2000/svg'`
  - `function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: SvgAttrs | null, ...kids: Array<SVGElement | string>): SVGElementTagNameMap[K]`
  - `type SvgAttrs = Record<string, string | number | undefined>`
  - `function radarChart(axes: readonly RadarAxis[], w?: number, h?: number): SVGSVGElement`（`w = 320`, `h = 320`）
  - `function lineChart(win: AbilityWindow, w?: number, h?: number): SVGSVGElement`（`w = 320`, `h = 160`）
  - `function calendarGrid(cells: readonly CalendarCell[], cellPx?: number, gap?: number): SVGSVGElement`（`cellPx = 40`, `gap = 4`）

**前置：** M2 是否合并对本任务无影响（函数只吃 Task 1 的数据形状）。本任务只新建 `src/ui/` 下两个文件，不碰 `styles.css`（S-1）。

- [ ] **Step 1: 写失败的测试**

Create `focus-trainer/src/ui/charts.test.ts`，逐字照抄。node 环境没有 `document`，所以这里手写一个只管 SVG 的最小桩（形状沿用 `src/ui/pages/play.test.ts:9-130`，但只实现 `charts.ts` 真正用到的 `createElementNS` / `setAttribute` / `append`）：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addDays } from '../../core/daykey';
import { abilityWindow, calendarCells, type RadarAxis, type TrendGame } from '../../core/stats';
import type { DayPlan } from '../../core/types';
import { calendarGrid, lineChart, radarChart, SVG_NS } from './charts';

class StubSvg {
  readonly attrs = new Map<string, string>();
  readonly kids: StubSvg[] = [];
  text = '';
  constructor(readonly tag: string) {}

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }

  append(...items: Array<StubSvg | string>): void {
    for (const item of items) {
      if (typeof item !== 'string') this.kids.push(item);
      else this.text += item;
    }
  }

  get fullText(): string {
    return this.text + this.kids.map((k) => k.fullText).join('');
  }

  all(pred: (el: StubSvg) => boolean): StubSvg[] {
    const out: StubSvg[] = [];
    if (pred(this)) out.push(this);
    for (const k of this.kids) out.push(...k.all(pred));
    return out;
  }

  byClass(cls: string): StubSvg[] {
    return this.all((el) => (el.getAttribute('class') ?? '').split(' ').includes(cls));
  }

  everyAttr(): string[] {
    return this.all(() => true).flatMap((el) => [...el.attrs.values()]);
  }
}

const seen: Array<string | null> = [];
const made: StubSvg[] = [];

function installStub(): void {
  seen.length = 0;
  made.length = 0;
  vi.stubGlobal('document', {
    createElementNS: (ns: string | null, tag: string): StubSvg => {
      seen.push(ns);
      const el = new StubSvg(tag);
      made.push(el);
      return el;
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('radarChart', () => {
  const axes: RadarAxis[] = [
    { gameId: 'schulte', ability: '持续注意', value: 50, practiced: true },
    { gameId: 'stroop', ability: '抑制控制', value: 0, practiced: false },
  ];

  it('320×320 下画 4 圈、2 轴、1 多边形、2 个轴标签，坐标按 p() 保留一位小数', () => {
    installStub();
    const el = radarChart(axes) as unknown as StubSvg;
    expect(el.getAttribute('viewBox')).toBe('0 0 320 320');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('能力雷达图');
    expect(el.byClass('radar-ring').map((c) => c.getAttribute('r'))).toEqual(['33.0', '66.0', '99.0', '132.0']);
    expect(el.byClass('radar-axis').map((c) => `${c.getAttribute('x2')},${c.getAttribute('y2')}`)).toEqual([
      '160.0,28.0',
      '160.0,292.0',
    ]);
    expect(el.byClass('radar-area')).toHaveLength(1);
    expect(el.byClass('radar-area')[0].getAttribute('points')).toBe('160.0,94.0 160.0,160.0');
    expect(el.byClass('radar-label').map((c) => c.getAttribute('x') + '|' + c.getAttribute('y'))).toEqual([
      '160.0|8.0',
      '160.0|312.0',
    ]);
    expect(el.byClass('radar-label').map((c) => c.fullText)).toEqual(['持续注意', '抑制控制']);
  });

  it('超过 100 或负数的 value 被夹到 [0,100]，多边形不会捅出外圈', () => {
    installStub();
    const el = radarChart([{ gameId: 'schulte', ability: 'a', value: 120, practiced: true }]) as unknown as StubSvg;
    expect(el.byClass('radar-area')[0].getAttribute('points')).toBe('160.0,28.0');
    const el2 = radarChart([{ gameId: 'schulte', ability: 'a', value: -5, practiced: true }]) as unknown as StubSvg;
    expect(el2.byClass('radar-area')[0].getAttribute('points')).toBe('160.0,160.0');
  });

  it('轴数为 0 时只出一句降级文案，不画圈也不画轴', () => {
    installStub();
    const el = radarChart([]) as unknown as StubSvg;
    expect(el.byClass('radar-ring')).toHaveLength(0);
    expect(el.byClass('radar-axis')).toHaveLength(0);
    expect(el.byClass('radar-none').map((c) => c.fullText)).toEqual(['没有可显示的能力维度']);
  });

  it('只建 SVG 元素，命名空间恒为 w3.org（M4 离线审计的唯一放行字符串）', () => {
    installStub();
    radarChart(axes);
    lineChart(abilityWindow('schulte', [], '2026-10-19'));
    calendarGrid(calendarCells([{ id: 'schulte', ability: 'a' } as TrendGame], [], '2026-10-19'));
    expect(SVG_NS).toBe('http://www.w3.org/2000/svg');
    expect(seen.every((ns) => ns === SVG_NS)).toBe(true);
    expect(made.every((el) => el.tag !== 'image')).toBe(true);
  });
});

describe('lineChart', () => {
  const TODAY = '2026-10-19';

  it('两点曲线的坐标按 padL28/padR8/padT8/padB20 的算式落位', () => {
    installStub();
    const win = abilityWindow('schulte', [], TODAY);
    win.points.push({ index: 0, dayKey: win.keys[0], ability: 10 }, { index: 29, dayKey: win.keys[29], ability: 50 });
    const el = lineChart(win) as unknown as StubSvg;
    expect(el.getAttribute('viewBox')).toBe('0 0 320 160');
    expect(el.getAttribute('aria-label')).toBe('近 30 天能力曲线');
    expect(el.byClass('curve-axis').map((c) => `${c.getAttribute('x1')},${c.getAttribute('y1')} ${c.getAttribute('x2')},${c.getAttribute('y2')}`)).toEqual([
      '28.0,140.0 312.0,140.0',
    ]);
    expect(el.byClass('curve-line')[0].getAttribute('points')).toBe('28.0,126.8 312.0,74.0');
    expect(el.byClass('curve-dot').map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`)).toEqual([
      '28.0,126.8',
      '312.0,74.0',
    ]);
    expect(el.byClass('curve-edge').map((c) => c.fullText)).toEqual(['09-20', '10-19']);
  });

  it('零点和单点都不画 polyline（连不成线），但轴线和首尾日期标签仍在', () => {
    installStub();
    const empty = lineChart(abilityWindow('schulte', [], TODAY)) as unknown as StubSvg;
    expect(empty.byClass('curve-line')).toHaveLength(0);
    expect(empty.byClass('curve-dot')).toHaveLength(0);
    expect(empty.byClass('curve-axis')).toHaveLength(1);
    expect(empty.byClass('curve-edge')).toHaveLength(2);
    const one = lineChart({
      gameId: 'schulte',
      keys: ['2026-10-19'],
      points: [{ index: 0, dayKey: '2026-10-19', ability: 100 }],
    }) as unknown as StubSvg;
    expect(one.byClass('curve-line')).toHaveLength(0);
    expect(one.byClass('curve-dot').map((c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`)).toEqual(['28.0,8.0']);
    expect(one.byClass('curve-edge').map((c) => c.fullText)).toEqual(['10-19', '10-19']);
  });
});

describe('calendarGrid', () => {
  const TODAY = '2026-10-19';
  const games: TrendGame[] = [{ id: 'schulte', ability: '持续注意' }, { id: 'stroop', ability: '抑制控制' }];

  it('35 格 = 7 列 × 5 行，步长 44px，viewBox 308×216', () => {
    installStub();
    const el = calendarGrid(calendarCells(games, [], TODAY)) as unknown as StubSvg;
    expect(el.getAttribute('viewBox')).toBe('0 0 308 216');
    expect(el.getAttribute('aria-label')).toBe('近 5 周打卡日历');
    const rects = el.byClass('calendar-cell');
    expect(rects).toHaveLength(35);
    expect(rects[0].getAttribute('x')).toBe('0.0');
    expect(rects[0].getAttribute('y')).toBe('0.0');
    expect(rects[8].getAttribute('x')).toBe('44.0');
    expect(rects[8].getAttribute('y')).toBe('44.0');
    expect(rects[0].getAttribute('width')).toBe('40.0');
    expect(rects[0].getAttribute('rx')).toBe('6');
    expect(rects[34].getAttribute('class')).toBe('calendar-cell none');
  });

  it('三种状态各写进 class 与 <title>，数字取过滤后的 doneCount/planSize', () => {
    installStub();
    const all: DayPlan = { dayKey: '2026-10-18', games: ['schulte', 'stroop'], completed: ['schulte', 'stroop'] };
    const half: DayPlan = { dayKey: '2026-10-17', games: ['schulte', 'stroop'], completed: ['schulte'] };
    const el = calendarGrid(calendarCells(games, [all, half], TODAY)) as unknown as StubSvg;
    const byDay = new Map(el.byClass('calendar-cell').map((r) => [r.getAttribute('title'), r]));
    expect(byDay.get('2026-10-18 done')?.getAttribute('class')).toBe('calendar-cell done');
    expect(byDay.get('2026-10-18 done')?.kids[0].fullText).toBe('2026-10-18 已完成 2/2');
    expect(byDay.get('2026-10-17 partial')?.kids[0].fullText).toBe('2026-10-17 完成 1/2');
    expect(byDay.get(`${TODAY} none`)?.kids[0].fullText).toBe(`${TODAY} 未打卡`);
    expect(el.byClass('calendar-cell').map((r) => r.getAttribute('data-day'))).toEqual(
      calendarCells(games, [all, half], TODAY).map((c) => c.dayKey),
    );
  });

  it('属性里不许出现任何 http(s) 值（外链即违反离线红线）', () => {
    installStub();
    const el = calendarGrid(calendarCells(games, [], addDays(TODAY, 3))) as unknown as StubSvg;
    radarChart([{ gameId: 'schulte', ability: 'a', value: 1, practiced: true }]);
    expect(el.everyAttr().some((v) => /https?:\/\//.test(v))).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/charts.test.ts
```
Expected: FAIL，`Cannot find module './charts'`（模块不存在），不是断言不匹配。

- [ ] **Step 3: 写实现**

Create `focus-trainer/src/ui/charts.ts`，逐字照抄：

```ts
import type { AbilityWindow, CalendarCell, RadarAxis } from '../core/stats';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export type SvgAttrs = Record<string, string | number | undefined>;

// -0 会被 toFixed 写成 "-0.0"，先归正，期望值才不用跟负零较真
const p = (n: number): string => (n === 0 ? 0 : n).toFixed(1);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

// SVGElement 的 className 是只读的 SVGAnimatedString，所以这里只能 setAttribute，
// 不能照搬 dom.ts 里 el.className = … 的写法。
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: SvgAttrs | null = null,
  ...kids: Array<SVGElement | string>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag) as unknown as SVGElementTagNameMap[K];
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined) el.setAttribute(key, String(value));
    }
  }
  for (const kid of kids) el.append(kid);
  return el;
}

export function radarChart(axes: readonly RadarAxis[], w = 320, h = 320): SVGSVGElement {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - 28;
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'radar-svg', role: 'img', 'aria-label': '能力雷达图' });
  const n = axes.length;
  if (n === 0) {
    root.append(svg('text', { class: 'radar-none', x: p(cx), y: p(cy) }, '没有可显示的能力维度'));
    return root;
  }
  const angle = (i: number): number => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  for (const k of [0.25, 0.5, 0.75, 1]) {
    root.append(svg('circle', { class: 'radar-ring', cx: p(cx), cy: p(cy), r: p(R * k) }));
  }
  axes.forEach((axis, i) => {
    const rad = angle(i);
    root.append(svg('line', { class: 'radar-axis', x1: p(cx), y1: p(cy), x2: p(cx + R * Math.cos(rad)), y2: p(cy + R * Math.sin(rad)) }));
  });
  root.append(
    svg('polygon', {
      class: 'radar-area',
      points: axes
        .map((axis, i) => {
          const rad = angle(i);
          const v = clamp01(axis.value / 100);
          return `${p(cx + R * v * Math.cos(rad))},${p(cy + R * v * Math.sin(rad))}`;
        })
        .join(' '),
    }),
  );
  axes.forEach((axis, i) => {
    const rad = angle(i);
    root.append(svg('text', { class: 'radar-label', x: p(cx + (R + 20) * Math.cos(rad)), y: p(cy + (R + 20) * Math.sin(rad)) }, axis.ability));
  });
  return root;
}

export function lineChart(win: AbilityWindow, w = 320, h = 160): SVGSVGElement {
  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const base = h - padB;
  const days = Math.max(1, win.keys.length);
  const denom = Math.max(1, days - 1);
  const xAt = (i: number): number => padL + (innerW * i) / denom;
  const yAt = (a: number): number => base - innerH * clamp01(a / 100);
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'curve-svg', role: 'img', 'aria-label': `近 ${days} 天能力曲线` });
  root.append(svg('line', { class: 'curve-axis', x1: p(padL), y1: p(base), x2: p(w - padR), y2: p(base) }));
  if (win.points.length >= 2) {
    root.append(svg('polyline', { class: 'curve-line', points: win.points.map((pt) => `${p(xAt(pt.index))},${p(yAt(pt.ability))}`).join(' ') }));
  }
  for (const pt of win.points) {
    root.append(svg('circle', { class: 'curve-dot', cx: p(xAt(pt.index)), cy: p(yAt(pt.ability)), r: 2.5 }));
  }
  const first = win.keys.length > 0 ? win.keys[0].slice(5) : '';
  const last = win.keys.length > 0 ? win.keys[win.keys.length - 1].slice(5) : '';
  root.append(svg('text', { class: 'curve-edge', x: p(padL), y: p(h - 4) }, first));
  root.append(svg('text', { class: 'curve-edge edge-end', x: p(w - padR), y: p(h - 4) }, last));
  return root;
}

const calendarLabel = (c: CalendarCell): string =>
  c.state === 'done'
    ? `${c.dayKey} 已完成 ${c.doneCount}/${c.planSize}`
    : c.state === 'partial'
      ? `${c.dayKey} 完成 ${c.doneCount}/${c.planSize}`
      : `${c.dayKey} 未打卡`;

export function calendarGrid(cells: readonly CalendarCell[], cellPx = 40, gap = 4): SVGSVGElement {
  const cols = 7;
  const rows = Math.ceil(cells.length / cols);
  const w = cols * cellPx + (cols - 1) * gap;
  const h = Math.max(0, rows * cellPx + (rows - 1) * gap);
  const root = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: 'calendar-svg', role: 'img', 'aria-label': `近 ${rows} 周打卡日历` });
  cells.forEach((c, i) => {
    const x = (i % cols) * (cellPx + gap);
    const y = Math.floor(i / cols) * (cellPx + gap);
    root.append(
      svg(
        'rect',
        { class: `calendar-cell ${c.state}`, 'data-day': c.dayKey, title: `${c.dayKey} ${c.state}`, x: p(x), y: p(y), width: p(cellPx), height: p(cellPx), rx: 6 },
        svg('title', null, calendarLabel(c)),
      ),
    );
  });
  return root;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/charts.test.ts && npx tsc --noEmit
```
Expected: 全部通过；`tsc --noEmit` 零输出。若 `document.createElementNS` 报类型不匹配，改的是**断言的写法**（`as unknown as SVGElementTagNameMap[K]` 那一行不能少），不是给桩加 `any`。

- [ ] **Step 5: 离线自查**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -nE "https?://" src/ui/charts.ts
```
Expected: **只有 `SVG_NS` 那一行**（`http://www.w3.org/2000/svg`）。出现别的 origin、`<image>`、`@import`、字体 URL 即为 hard constraint violation，删掉而不是记下。

- [ ] **Step 6: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/ui/charts.ts focus-trainer/src/ui/charts.test.ts && git commit -m "feat(ui): 手写 SVG 图表几何（雷达 / 近30天曲线 / 35格日历）" && git log --format='%h %s' -1
```

**交付物：** 三个纯 SVG 生成函数，坐标可用 `p()` 一位小数目算钉死；节点数有界（≤4 圈 + 2n 轴/标签 + 1 多边形 / ≤1 线 + 30 点 + 2 轴标签 / 恒 35 格），`SessionRecord` 再多也不会让 DOM 膨胀。

`Ruling: 每个图形函数都自带 `viewBox` 且不写 `width`/`height` 属性 —— 尺寸交给 `styles.css`（Task 4 写 `svg { width: 100%; height: auto }`），这样 360/390/412px 宽的机器不用改代码。 —— 代价：单测只能断言 `viewBox` 字符串，断不到真实渲染尺寸；真尺寸由 Task 5 在 390×844 iframe 里量。

`Ruling: 折线恒发 `circle.curve-dot`（≤30 个），不做「点多就不画点」的降噪 —— 30 个点在 284px 内线宽里不会糊成一团，而少一个条件分支就少一条要断言的分支。 —— 代价：将来窗口拉长到 90 天时点会密，届时把这条改成条件式并补一条断言。

`Ruling: `calendarGrid` 的每格带 `data-day` 与 `<title>` 子节点，`title` 属性写成 `日期 状态` —— 状态色是 CSS 给的，`role="img"` 的 SVG 对读屏只有格子本身，`<title>` 是唯一能把「哪天、打完几个」说清楚的通道。 —— 代价：桩里要多实现一层 `kids`，已在 Step 1 的 `StubSvg` 里实现。

---

### Task 3: 趋势页 + `#/trend` 路由 + 首页入口接通

**Files:**
- Create: `focus-trainer/src/ui/pages/trends.ts`
- Test: `focus-trainer/src/ui/pages/trends.test.ts`
- Modify: `focus-trainer/src/ui/router.ts`（`Route` 联合类型、`parseRoute`、`href`）
- Modify: `focus-trainer/src/ui/router.test.ts`（追加两条断言）
- Modify: `focus-trainer/src/main.ts`（`show()` 的 `switch`）
- Modify: `focus-trainer/src/ui/pages/home.ts`（底部「趋势」按钮）

**Interfaces:**
- Consumes: Task 1 的 `radarAxes` / `abilityWindow` / `calendarCells` / `pickTrendGame` / `RADAR_WINDOW` / `TREND_DAYS` / `CALENDAR_CELLS`；Task 2 的 `radarChart` / `lineChart` / `calendarGrid`；`src/core/scheduler.ts` 的 `streak(plans, todayKey)`；`src/ui/context.ts` 的 `AppContext`；`src/ui/dom.ts` 的 `h`；`src/ui/router.ts` 的 `navigate`。
- Produces:
  - `function renderTrends(view: HTMLElement, ctx: AppContext, signal: AbortSignal, now?: number): Promise<void>`（默认参 `now = Date.now()`）
  - `Route` 新增成员 `{ name: 'trend' }`，`href({ name: 'trend' }) === '#/trend'`，`parseRoute('#/trend')` 返回 `{ name: 'trend' }`
  - DOM 契约（Task 4 的 CSS 与 Task 5 的验收都按这些 class 锚定）：`section.trend-radar`、`section.trend-curve`、`section.trend-calendar`、`ul.radar-legend`、`select[aria-label="选择游戏"]`、`div.trend-empty`

- [ ] **Step 1: 写失败的页面测试**

Create `focus-trainer/src/ui/pages/trends.test.ts`，逐字照抄。桩沿用 `play.test.ts:16-122` 的形状，但只实现趋势页 + `charts.ts` + `dom.ts:10` 用到的那一小撮 API（`createElement` / `createElementNS` / `setAttribute` / `append` / `replaceChildren` / `textContent` / `className` / `selected` / `value` / `addEventListener`），外加 `location.hash` 赋值。桩**不实现** `<select>` 的选择语义：测试直接写 `select.value` 再派发 `change`，真实选择行为归 Task 5 浏览器验收。

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abilityWindow } from '../../core/stats';
import { defaultGameState, type Repository } from '../../core/storage';
import type { DayPlan, GameId, GameState, SessionRecord } from '../../core/types';
import { GAMES } from '../../games/registry';
import type { AppContext } from '../context';
import { renderTrends } from './trends';

class StubEl {
  readonly children: StubEl[] = [];
  readonly attrs = new Map<string, string>();
  text = '';
  value = '';
  selected = false;
  parent: StubEl | null = null;
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; contains(c: string): boolean } {
    const self = this;
    return {
      add: (c: string): void => {
        const cur = self.attrs.get('class') ?? '';
        self.attrs.set('class', cur ? `${cur} ${c}` : c);
      },
      contains: (c: string): boolean => (self.attrs.get('class') ?? '').split(' ').includes(c),
    };
  }

  set className(v: string) {
    this.attrs.set('class', v);
  }

  get className(): string {
    return this.attrs.get('class') ?? '';
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  set textContent(v: string) {
    this.text = v;
    this.children.length = 0;
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }

  append(...items: Array<StubEl | string>): void {
    for (const item of items) {
      if (typeof item === 'string') this.text += item;
      else {
        item.parent = this;
        this.children.push(item);
      }
    }
  }

  replaceChildren(...items: Array<StubEl | string>): void {
    this.text = '';
    this.children.length = 0;
    this.append(...items);
  }

  addEventListener(type: string, fn: (ev: never) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: never) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  fire(type: string): void {
    for (const h of this.handlers.filter((x) => x.type === type)) (h.fn as (e: unknown) => void)({ type });
  }

  all(pred: (el: StubEl) => boolean): StubEl[] {
    const out: StubEl[] = [];
    if (pred(this)) out.push(this);
    for (const c of this.children) out.push(...c.all(pred));
    return out;
  }

  find(pred: (el: StubEl) => boolean): StubEl | null {
    return this.all(pred)[0] ?? null;
  }

  byClass(cls: string): StubEl[] {
    return this.all((el) => (el.attrs.get('class') ?? '').split(' ').includes(cls));
  }

  section(cls: string): StubEl {
    const el = this.find((x) => x.tag === 'section' && x.attrs.get('class') === cls);
    if (!el) throw new Error(`找不到 ${cls}`);
    return el;
  }
}

// Date.now() 打桩后的固定值：只允许进日期键推导。10:00 在 04:00 之后 → 今天就是 2026-10-19。
const NOW = new Date(2026, 9, 19, 10, 0).getTime();
const TODAY = '2026-10-19';
// 同一天的凌晨 02:30 属于前一天（spec §5.4）
const LATE_NIGHT = new Date(2026, 9, 19, 2, 30).getTime();

// 夹具里的记录用 'schulte' / 'stroop' 两个字面 id：这两个游戏在 M1/M2 已注册，
// `registry.test.ts` 的保序断言保证它们是 `GAMES` 的前两项（`pickTrendGame` 只认注册表里的 id）。
// 但**行数类断言一律走 `GAMES.length`**，绝不抄一份硬编码数组——
// 否则就复刻 K-11 那种「M2 每注册一个游戏就弄红一条用例」的脆弱。

function rec(gameId: GameId, startedAt: number, day: string, ability: number): SessionRecord {
  return { gameId, mode: 'free', dayKey: day, startedAt, durationMs: 1000, startLevel: 1, endLevel: 1, rounds: [], summary: {}, ability };
}

function makeRepo(sessions: SessionRecord[], plans: DayPlan[], states: GameState[]): { repo: Repository; calls: string[] } {
  const calls: string[] = [];
  const boom = (name: string) => async (): Promise<never> => {
    throw new Error(`趋势页不该调用 ${name}`);
  };
  const repo: Repository = {
    listSessions: async (gameId?: GameId) => {
      calls.push('listSessions');
      return gameId === undefined ? sessions : sessions.filter((s) => s.gameId === gameId);
    },
    listPlans: async () => {
      calls.push('listPlans');
      return plans;
    },
    listGameStates: async () => {
      calls.push('listGameStates');
      return states;
    },
    getSettings: async () => ({ dayStartHour: 4 }),
    getGameState: async () => {
      calls.push('getGameState');
      return states[0] ?? defaultGameState('schulte');
    },
    getPlan: async () => {
      calls.push('getPlan');
      return plans[0] ?? null;
    },
    getSession: async () => {
      calls.push('getSession');
      return null;
    },
    lastSession: async () => {
      calls.push('lastSession');
      return null;
    },
    putPlan: boom('putPlan') as Repository['putPlan'],
    saveSession: boom('saveSession') as Repository['saveSession'],
    putSettings: boom('putSettings') as Repository['putSettings'],
    clearAll: boom('clearAll') as Repository['clearAll'],
  };
  return { repo, calls };
}

function setup(sessions: SessionRecord[] = [], plans: DayPlan[] = [], states: GameState[] = []) {
  const view = new StubEl('main');
  const { repo, calls } = makeRepo(sessions, plans, states);
  const ctx: AppContext = { repo, storageOk: true, settings: { dayStartHour: 4 } };
  const ac = new AbortController();
  let hashValue = '#/trend';
  const hashSet: string[] = [];
  const location = {
    get hash(): string {
      return hashValue;
    },
    set hash(v: string) {
      hashValue = v;
      hashSet.push(v);
    },
  };
  vi.stubGlobal('document', {
    createElement: (tag: string) => new StubEl(tag),
    createElementNS: (_ns: string, tag: string) => new StubEl(tag),
  });
  vi.stubGlobal('location', location);
  return {
    view,
    repo,
    ctx,
    ac,
    calls,
    hashSet,
    render: (now = NOW): Promise<void> => renderTrends(view as unknown as HTMLElement, ctx, ac.signal, now),
    select: (): StubEl => {
      const el = view.find((x) => x.tag === 'select');
      if (!el) throw new Error('找不到 select');
      return el;
    },
    button: (label: string): StubEl => {
      const el = view.find((x) => x.tag === 'button' && x.textContent === label);
      if (!el) throw new Error(`找不到按钮「${label}」`);
      return el;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('renderTrends', () => {
  it('只读三个方法，一个写方法都不碰', async () => {
    const h = setup();
    await h.render();
    expect([...new Set(h.calls)].sort()).toEqual(['listGameStates', 'listPlans', 'listSessions']);
  });

  it('三个 section 依次是雷达 / 曲线 / 日历，标题文案定死', async () => {
    const h = setup();
    await h.render();
    expect(h.view.section('trend-radar').find((x) => x.tag === 'h2')?.textContent).toBe('能力雷达（近 3 次训练均值）');
    expect(h.view.section('trend-curve').find((x) => x.tag === 'h2')?.textContent).toBe('能力曲线（近 30 天）');
    expect(h.view.section('trend-calendar').find((x) => x.tag === 'h2')?.textContent).toBe('打卡日历（近 5 周）');
    expect(h.view.section('trend-radar').byClass('radar-svg')).toHaveLength(1);
    expect(h.view.section('trend-calendar').byClass('calendar-cell')).toHaveLength(35);
  });

  it('图例行数 = 注册表长度，数值与 radarAxes 一致，没练过的写「未练」', async () => {
    const h = setup([rec('schulte', 1_000, '2026-10-17', 20), rec('schulte', 2_000, '2026-10-18', 30), rec('schulte', 3_000, '2026-10-19', 40)]);
    await h.render();
    const items = h.view.section('trend-radar').find((x) => x.tag === 'ul');
    if (!items) throw new Error('找不到 ul.radar-legend');
    expect(items.children).toHaveLength(GAMES.length);
    expect(items.children[0].textContent).toContain('持续注意');
    expect(items.children[0].textContent).toContain('30');
    expect(items.children[1].textContent).toContain('未练');
  });

  it('默认选中最近练过的游戏，切换只重画曲线区、不再读库', async () => {
    const sessions = [rec('schulte', 1, '2026-10-18', 20), rec('stroop', 2, '2026-10-18', 40), rec('stroop', 3, TODAY, 60)];
    const states = [
      { ...defaultGameState('schulte'), lastPlayedDayKey: '2026-10-18' },
      { ...defaultGameState('stroop'), lastPlayedDayKey: TODAY },
    ] as GameState[];
    const h = setup(sessions, [], states);
    await h.render();
    const select = h.select();
    expect(select.getAttribute('aria-label')).toBe('选择游戏');
    expect(select.children.find((o) => o.getAttribute('value') === 'stroop')?.selected).toBe(true);
    expect(h.calls).toHaveLength(3);
    // 2026-10-18 落在 30 天窗口的 index 28：x=28+284×28/29=302.2，y(40)=140−132×0.4=87.2
    expect(h.view.section('trend-curve').byClass('curve-line')[0].getAttribute('points')).toBe('302.2,87.2 312.0,60.8');

    select.value = 'schulte';
    select.fire('change');
    expect(h.calls).toHaveLength(3);
    expect(h.view.section('trend-curve').byClass('curve-line')).toHaveLength(0);
    expect(h.view.section('trend-curve').byClass('trend-empty')).toHaveLength(0);
    // 单点不连线，只留一个点：y(20)=140−26.4=113.6
    expect(h.view.section('trend-curve').byClass('curve-dot').map((d) => `${d.getAttribute('cx')},${d.getAttribute('cy')}`)).toEqual(['302.2,113.6']);
  });

  it('选中的游戏近 30 天没记录时，曲线区换成空态文案而不是空坐标轴', async () => {
    const h = setup([rec('schulte', 1, '2026-05-01', 20)]);
    await h.render();
    const empty = h.view.section('trend-curve').byClass('trend-empty');
    expect(empty).toHaveLength(1);
    expect(empty[0].textContent).toBe('近 30 天还没有训练记录');
    expect(h.view.section('trend-curve').byClass('curve-svg')).toHaveLength(0);
  });

  it('凌晨 02:30 打开时，日历最后一格是昨天的日期键', async () => {
    const h = setup();
    await h.render(LATE_NIGHT);
    const cells = h.view.section('trend-calendar').byClass('calendar-cell');
    expect(cells[34].getAttribute('data-day')).toBe('2026-10-18');
    expect(cells[0].getAttribute('data-day')).toBe('2026-09-14');
  });

  it('连续打卡天数来自 scheduler.streak，页面不重算', async () => {
    const plans: DayPlan[] = [
      { dayKey: '2026-10-18', games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte', 'stroop', 'seqmem'] },
      { dayKey: '2026-10-17', games: ['schulte', 'stroop', 'seqmem'], completed: ['schulte'] },
    ];
    const h = setup([], plans, []);
    await h.render();
    expect(h.view.byClass('trend-streak')[0].textContent).toBe('1天连续打卡');
  });

  it('signal 已 abort 时一个字都不写', async () => {
    const h = setup();
    h.ac.abort();
    await h.render();
    expect(h.view.children).toHaveLength(0);
  });

  it('返回按钮走 navigate 回首页', async () => {
    const h = setup();
    await h.render();
    h.button('返回').fire('click');
    expect(h.hashSet).toEqual(['#/']);
  });

  it('记录再多也不改变渲染上限：600 条记录仍是 35 格 + ≤30 点 + 2 轴', async () => {
    const many: SessionRecord[] = [];
    for (let i = 0; i < 600; i++) many.push(rec(i % 2 === 0 ? 'schulte' : 'stroop', 1_000 + i, TODAY, (i % 100) + 1));
    const h = setup(many);
    await h.render();
    expect(h.view.section('trend-calendar').byClass('calendar-cell')).toHaveLength(35);
    expect(h.view.section('trend-curve').byClass('curve-dot').length).toBeLessThanOrEqual(30);
    expect(h.view.section('trend-radar').byClass('radar-axis')).toHaveLength(GAMES.length);
    expect(abilityWindow('schulte', many, TODAY).points).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/pages/trends.test.ts
```
Expected: FAIL，`Cannot find module './trends'`。

- [ ] **Step 3: 路由加 `trend`**

Modify `focus-trainer/src/ui/router.ts`，三处按内容锚定替换（不整文件重写）：

1. `Route` 联合类型里，在 `| { name: 'result'; sessionId: number }` 之后、`| { name: 'settings' };` 之前插入一行：
```ts
  | { name: 'trend' }
```
2. `parseRoute` 里，把
```ts
  if (head === 'settings' && parts.length === 1) return { name: 'settings' };
```
改成
```ts
  if (head === 'trend' && parts.length === 1) return { name: 'trend' };
  if (head === 'settings' && parts.length === 1) return { name: 'settings' };
```
3. `href` 的 `switch` 里，在 `case 'settings':` 之前加：
```ts
    case 'trend':
      return '#/trend';
```
`navigate()` 与 `startRouter()` 一个字都不改 —— 它们只认 `Route` 与 `href`。

- [ ] **Step 4: 给路由测试补两条断言**

先确认该文件已经导入这两个函数：
```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -n "^import" src/ui/router.test.ts
```
若缺 `href` 或 `parseRoute`，把首行 import 补成 `import { href, parseRoute } from './router';`（**只补导入，不动既有用例**）。然后在文件末尾追加：

```ts
describe('trend 路由', () => {
  it('#/trend 解析成 trend，多余段落回落 home', () => {
    expect(parseRoute('#/trend')).toEqual({ name: 'trend' });
    expect(parseRoute('#trend')).toEqual({ name: 'trend' });
    expect(parseRoute('#/trend/schulte')).toEqual({ name: 'home' });
  });

  it('href 与 parseRoute 双向一致', () => {
    expect(href({ name: 'trend' })).toBe('#/trend');
    expect(parseRoute(href({ name: 'trend' }))).toEqual({ name: 'trend' });
  });
});
```

- [ ] **Step 5: 写页面**

Create `focus-trainer/src/ui/pages/trends.ts`，逐字照抄：

```ts
import { dayKey } from '../../core/daykey';
import { streak } from '../../core/scheduler';
import {
  abilityWindow,
  calendarCells,
  CALENDAR_CELLS,
  pickTrendGame,
  RADAR_WINDOW,
  radarAxes,
  TREND_DAYS,
  type TrendGame,
} from '../../core/stats';
import type { GameId } from '../../core/types';
import { GAMES, getGame } from '../../games/registry';
import { calendarGrid, lineChart, radarChart } from '../charts';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

export async function renderTrends(
  view: HTMLElement,
  ctx: AppContext,
  signal: AbortSignal,
  now = Date.now(),
): Promise<void> {
  const games: TrendGame[] = GAMES.map((g) => ({ id: g.id, ability: g.ability }));
  const [sessions, plans, states] = await Promise.all([
    ctx.repo.listSessions(),
    ctx.repo.listPlans(),
    ctx.repo.listGameStates(),
  ]);
  if (signal.aborted) return;
  const todayKey = dayKey(now, ctx.settings.dayStartHour);
  const axes = radarAxes(games, sessions);
  const cells = calendarCells(games, plans, todayKey);
  const selected = pickTrendGame(games, states);

  const curveHost = h('div', { class: 'curve-host' });
  const paintCurve = (gameId: GameId): void => {
    const win = abilityWindow(gameId, sessions, todayKey);
    if (win.points.length === 0) {
      curveHost.replaceChildren(h('div', { class: 'trend-empty' }, `近 ${TREND_DAYS} 天还没有训练记录`));
      return;
    }
    curveHost.replaceChildren(lineChart(win));
  };
  paintCurve(selected);

  const select = h(
    'select',
    { 'aria-label': '选择游戏' },
    ...games.map((g) => {
      const option = h('option', { value: g.id }, getGame(g.id)?.name ?? g.ability);
      option.selected = g.id === selected;
      return option;
    }),
  );
  select.addEventListener('change', () => paintCurve(select.value as GameId));

  const legend = h(
    'ul',
    { class: 'radar-legend' },
    ...axes.map((a) =>
      h(
        'li',
        null,
        h('span', null, a.ability),
        h('span', { class: 'spacer' }),
        h('span', { class: a.practiced ? undefined : 'muted' }, a.practiced ? String(a.value) : '未练'),
      ),
    ),
  );

  view.replaceChildren(
    h('div', { class: 'row' }, h('button', { onclick: () => navigate({ name: 'home' }) }, '返回'), h('h1', null, '趋势')),
    h(
      'div',
      { class: 'card trend-streak' },
      h('span', { class: 'big' }, String(streak(plans, todayKey))),
      h('span', null, '天连续打卡'),
    ),
    h(
      'section',
      { class: 'trend-radar' },
      h('h2', null, `能力雷达（近 ${RADAR_WINDOW} 次训练均值）`),
      radarChart(axes),
      legend,
    ),
    h(
      'section',
      { class: 'trend-curve' },
      h('h2', null, `能力曲线（近 ${TREND_DAYS} 天）`),
      select,
      curveHost,
    ),
    h(
      'section',
      { class: 'trend-calendar' },
      h('h2', null, `打卡日历（近 ${CALENDAR_CELLS / 7} 周）`),
      calendarGrid(cells),
    ),
  );
}
```

`Ruling: 趋势页用 `<select aria-label="选择游戏">` 切换曲线，不用一排页签 —— `styles.css:76-87` 的 `button, select` 已经给了 `min-height: var(--tap)`，`select` 天生满足 48px；五个中文名做成页签在 390px 宽下必溢出，而做成可横滑页签要新增滚动逻辑与断言，属于 M3 不该带的重量。 —— 代价：想换成页签时要把 Task 4 的 `.tab` 相关判据（本计划没有）一起补上，并同步改 `trends.test.ts` 里 `select` 的两条断言。

`Ruling: 雷达标题写「能力雷达（近 3 次训练均值）」，不写「五维」—— 轴数由 `GAMES` 派生，M2 合并前是 2 轴，把「五维」写进文案就是当场说谎。spec 成功标准 5 的「五维」由注册表长到 5 个游戏后自动成立（Task 5 的验收记录要写明当时 `GAMES.length`）。 —— 代价：如果 M2 最终没合到 5 个，成功标准 5 只能在 M4 复跑时才算关闭，这一点在覆盖检查里如实记下。

`Ruling: `curve-host` 里的空态由页面判断（`win.points.length === 0`），`lineChart` 不知道空态文案 —— 几何层只管坐标，文案改动不该回来改几何函数与它的坐标断言。 —— 代价：`trends.test.ts` 要多一条空态断言（Step 1 已写）。

- [ ] **Step 6: 接上装配与首页入口**

Modify `focus-trainer/src/main.ts`，两处：

1. 在 `import { renderResult } from './ui/pages/result';` 之后加一行：
```ts
import { renderTrends } from './ui/pages/trends';
```
2. `show()` 的 `switch` 里，在 `case 'result':` 分支之后、`case 'settings':` 之前加：
```ts
    case 'trend':
      return renderTrends(view, ctx, signal);
```

Modify `focus-trainer/src/ui/pages/home.ts`，把

```ts
      h('button', { disabled: true, title: '趋势页在 M3 提供' }, '趋势'),
```
改成

```ts
      h('button', { onclick: () => navigate({ name: 'trend' }) }, '趋势'),
```
`home.ts` 其余一个字不改（`navigate` 已在第 5 行导入）。这条改动同时让 `title: '趋势页在 M3 提供'` 从仓库里消失 —— 提交前用 `grep -rn "趋势页在 M3" focus-trainer/src` 自查，Expected: 零命中。

- [ ] **Step 7: 跑测试确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/pages/trends.test.ts src/ui/router.test.ts src/core/stats.test.ts src/ui/charts.test.ts && npx tsc --noEmit
```
Expected: 四个文件全绿，`tsc --noEmit` 零输出。特别确认 `show()` 的 `switch` 没有落到 `noFallthroughCasesInSwitch` 报错，且 `Route` 加了成员后 `main.ts` 的穷尽 `switch`（返回 `Promise<void>`，无 default）仍通过类型检查 —— 少一个 `case` 会报 `Function lacks ending return statement`。

- [ ] **Step 8: 全量门禁后提交**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run && npx vite build
cd "E:/WORK/脑力训练" && git add focus-trainer/src/ui/pages/trends.ts focus-trainer/src/ui/pages/trends.test.ts focus-trainer/src/ui/router.ts focus-trainer/src/ui/router.test.ts focus-trainer/src/main.ts focus-trainer/src/ui/pages/home.ts && git commit -m "feat(ui): 趋势页接通 #/trend 路由与首页入口（雷达/30天曲线/5周日历）" && git log --format='%h %s' -1
```
Expected: 全量 `vitest run` 全绿。若 `src/ui/pages/play.test.ts` 的 K-11 用例（`toMatchObject({ games: [...] })`）报红，**不要改它** —— 那是控制器 M2 汇总步骤的产物，红说明汇总步骤还没跑；把现象写进报告并停止本任务提交。

**交付物：** 从首页点「趋势」能到一个真实页面，三张图都在，spec §5.8 的趋势页四条要素（雷达 / 游戏切换 + 30 天折线 / 5 周日历 / 连续打卡天数）落地，且这一页零写入。

---

### Task 4: 界面打磨 —— 完成态可读性与 48px 触控目标

**Files:**
- Modify: `focus-trainer/src/ui/styles.css`（两处动作：改写既有 `.schulte-cell.done` 块；在**文件末尾**追加一个带 `/* ===== M3 趋势页 ===== */` 标记的块）
- Test: `focus-trainer/src/ui/styles.test.ts`

**Interfaces:**
- Consumes: Task 3 产出的 class 名（`.trend-radar` / `.trend-curve` / `.trend-calendar` / `.radar-legend` / `.trend-empty` / `.trend-streak` / `.trend-title`）与 Task 2 写在 SVG 上的 class（`radar-ring` / `radar-axis` / `radar-area` / `radar-label` / `curve-line` / `curve-dot` / `curve-edge` / `calendar-cell` + `done|partial|none` / `calendar-week`）。
- Produces: 两个新 CSS 变量 `--done-fg`、`--done-bg`（写进 `:root`）；`--tap` 保持 `48px` 不变；`.schulte-grid` 的 `gap` 由 `4px` 改为 `2px` 并加满宽（`width: calc(100% + 24px); margin: 0 -12px;`）。

**前置（硬）：** 控制器的 M2 汇总步骤必须已经落地。跑一次确认再动手：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -c "^\." src/ui/styles.css && grep -n "game-" src/ui/styles.css | head
cd "E:/WORK/脑力训练" && git log --oneline -5
```
Expected: `.game-` 选择器出现 5 个游戏的段（schulte / stroop / seqmem / mot / gestalt），`git log` 里能看到 M2 汇总提交。若只有 2 个游戏的段，**停下**（S-1：现在动 `styles.css` 会和汇总步骤互相覆盖），把现象写进报告。

**两条缺陷的实测出处（不要重新论证，直接按此修）：**
`docs/superpowers/plans/2026-10-18-m1-core-and-schulte.md:4123` —— 「完成格（`opacity: 0.2`）… 完成格自身数字只剩 1.59–1.69 对比度，几乎读不出 … 回不回头做『完成态仍可读数』由 M3 打磨时裁定」。
同文件 `:4164` —— 「360px 宽的屏幕上 7×7 每格约 44.6px，低于 48px 触控目标；高档位手感问题留到 M3 打磨」。

- [ ] **Step 1: 写失败的测试**

Create `focus-trainer/src/ui/styles.test.ts`，逐字照抄。node 环境没有 CSS 引擎，所以判据只有两条路：把 CSS 当文本取出来断言字面声明（`?raw`），以及在测试里**重算**布局算式与 WCAG 对比度。这两条都是可执行的算术，不是「看着像」。

```ts
import { describe, expect, it } from 'vitest';
import css from './styles.css?raw';

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 取某条规则里某个属性的值（去尾空格）。选择器与属性都要转义，否则会匹到别的规则。
function decl(selector: string, prop: string): string | null {
  const body = css.match(new RegExp(`${esc(selector)}\\s*\\{([^}]*)\\}`))?.[1];
  if (body === undefined) return null;
  return body.match(new RegExp(`(?:^|;)\\s*${esc(prop)}\\s*:([^;]*)`))?.[1]?.trim() ?? null;
}

const chan = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * chan(((n >> 16) & 255) / 255) + 0.7152 * chan(((n >> 8) & 255) / 255) + 0.0722 * chan((n & 255) / 255);
};

const ratio = (fg: string, bg: string): number => {
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const px = (v: string | null | undefined): number => Number(v?.replace('px', '') ?? Number.NaN);

describe('完成态可读性（M1 遗留缺陷 1）', () => {
  it('done 格不再用 opacity 抹掉数字，改为一对专用颜色变量', () => {
    expect(decl('.schulte-cell.done', 'opacity')).toBeNull();
    expect(decl('.schulte-cell.done', 'color')).toBe('var(--done-fg)');
    expect(decl('.schulte-cell.done', 'background')).toBe('var(--done-bg)');
    expect(decl(':root', '--done-fg')).toBe('#9aa4b2');
    expect(decl(':root', '--done-bg')).toBe('#191c21');
  });

  it('done 数字对本格底色 ≥ 4.5:1（M1 实测只剩 1.59–1.69）', () => {
    const done = ratio('#9aa4b2', '#191c21');
    const undone = ratio('#e8eaed', '#22262d');
    expect(done).toBeGreaterThanOrEqual(4.5);
    // 「完成 = 更暗」这条视觉语义必须还在，只是不再暗到读不出
    expect(done).toBeLessThan(undone);
    expect(lum('#191c21')).toBeLessThan(lum('#22262d'));
  });
});

describe('48px 触控目标（M1 遗留缺陷 2）', () => {
  it('--tap 仍是 48px，按钮与 select 仍锚在它上面', () => {
    expect(decl(':root', '--tap')).toBe('48px');
    expect(css).toMatch(/button,\s*select\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(css).toMatch(/button,\s*select\s*\{[^}]*min-width:\s*var\(--tap\)/);
  });

  it('方格改成 gap 2px + 满宽，负外边距恰好等于 #view 的内边距', () => {
    expect(decl('.schulte-grid', 'gap')).toBe('2px');
    expect(decl('.schulte-grid', 'width')).toBe('calc(100% + 24px)');
    expect(decl('.schulte-grid', 'margin')).toBe('0 -12px');
    expect(decl('#view', 'padding')).toBe('12px');
    expect(decl('.schulte-cell', 'min-height')).toBe('0');
  });

  it('按 CSS 里的数字重算：360px 屏上 7×7 每格 ≥ 48px（M1 实测 44.6px）', () => {
    const gap = px(decl('.schulte-grid', 'gap'));
    const pad = px(decl('#view', 'padding'));
    const bleed = Math.abs(px(decl('.schulte-grid', 'margin')?.split(' ')[1]));
    expect(gap).toBe(2);
    expect(bleed).toBe(pad);
    const cellAt = (viewport: number, cols: number): number => (viewport - 2 * (pad - bleed) - (cols - 1) * gap) / cols;
    expect(cellAt(360, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(390, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(360, 3)).toBeGreaterThanOrEqual(48);
    expect(Math.floor(cellAt(360, 7))).toBe(49);
    expect(Math.floor(cellAt(390, 7))).toBe(54);
  });
});

describe('趋势页样式与离线红线', () => {
  it('Task 3 的每个 class 都有对应规则，SVG 走 viewBox 自适应', () => {
    for (const cls of ['trend-radar', 'trend-curve', 'trend-calendar', 'radar-legend', 'trend-empty']) {
      if (!css.includes(`.${cls}`)) throw new Error(`styles.css 里缺少 .${cls} 规则`);
    }
    expect(css).toMatch(/\.trend-radar svg,\s*\.trend-curve svg,\s*\.trend-calendar svg\s*\{[^}]*width:\s*100%[^}]*height:\s*auto/);
    expect(decl('.calendar-cell.done', 'fill')).toBe('var(--accent)');
    expect(decl('.calendar-cell.none', 'fill')).toBe('var(--panel)');
    expect(decl('.calendar-cell.partial', 'fill')).toBe('#3d4a63');
  });

  it('整份 CSS 里没有任何外部地址、@import、@font-face 或 url()', () => {
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/url\(/);
  });
});
```

- [ ] **Step 2: 跑测试确认它失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/styles.test.ts
```
Expected: FAIL，且失败项是**属性值不匹配**（`decl('.schulte-cell.done', 'opacity')` 返回 `'0.2'`、`decl(':root','--done-fg')` 返回 `null`、`decl('.schulte-grid','gap')` 返回 `'4px'`），不是模块加载失败 —— 后者说明 `?raw` 没解析成，先确认文件名与 `import css from './styles.css?raw'` 的相对路径。

- [ ] **Step 3: 改 `styles.css`**

三处动作，全部按内容锚定（禁止整文件重写、禁止按行号定位）。

**3a. `:root` 里加两个变量。** 把

```css
  --tap: 48px;
```
改成

```css
  --tap: 48px;
  --done-fg: #9aa4b2;
  --done-bg: #191c21;
```

**3b. 改写既有的 `.schulte-cell.done` 块**（缺陷 1）。把

```css
.schulte-cell.done {
  opacity: 0.2;
}
```
改成

```css
/* 完成格要「更暗但读得出」：opacity 会把数字一起抹掉，所以改用一对专用颜色 */
.schulte-cell.done {
  color: var(--done-fg);
  background: var(--done-bg);
}
```

**3c. 改写既有的 `.schulte-grid` 块**（缺陷 2）。把

```css
.schulte-grid {
  display: grid;
  gap: 4px;
  width: min(100%, 520px);
  margin: 0 auto;
  aspect-ratio: 1;
}
```
改成

```css
/* 满宽 + 2px 间距：360px 屏上 7×7 每格 49.7px，390px 屏上 54.0px */
.schulte-grid {
  display: grid;
  gap: 2px;
  width: calc(100% + 24px);
  margin: 0 -12px;
  aspect-ratio: 1;
}
```

**3d. 在文件末尾追加趋势页样式**（紧跟既有的 `.schulte-cell.flash` 块之后，作为文件的最后一段）：

```css
/* ===== M3 趋势页 ===== */

.trend-radar svg,
.trend-curve svg,
.trend-calendar svg {
  display: block;
  width: 100%;
  height: auto;
}

.radar-ring,
.radar-axis,
.curve-axis {
  fill: none;
  stroke: var(--line);
  stroke-width: 1;
}

.radar-area {
  fill: rgba(138, 180, 248, 0.22);
  stroke: var(--accent);
  stroke-width: 2;
}

.radar-label,
.radar-none,
.curve-edge {
  fill: var(--muted);
  font-size: 12px;
  text-anchor: middle;
}

.curve-edge {
  font-variant-numeric: tabular-nums;
}

.edge-end {
  text-anchor: end;
}

.curve-line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}

.curve-dot {
  fill: var(--accent);
}

.calendar-cell {
  stroke: var(--line);
  stroke-width: 1;
}

.calendar-cell.none {
  fill: var(--panel);
}

.calendar-cell.partial {
  fill: #3d4a63;
}

.calendar-cell.done {
  fill: var(--accent);
}

.radar-legend {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.radar-legend li {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
  padding: 0 12px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-variant-numeric: tabular-nums;
}

.curve-host {
  margin-top: 8px;
}

.trend-empty {
  color: var(--muted);
  padding: 16px 0;
  text-align: center;
}
```

`Ruling: 完成态用「专用颜色对」而不是 `opacity` —— `opacity` 会把整格连数字一起按比例融进背景，1.59:1 就是这么来的；换成 `color` + `background` 才能同时拿到「更暗」和「读得出」。底色 `#191c21` 比未完成的 `#22262d` 更暗（亮度 0.0115 < 0.0192），所以 spec §3.1「点对：格子变暗」的语义没有丢。 —— 代价：多两个变量；如果以后要做浅色主题，这一对要一起进主题表。

`Ruling: `.card.done` 的 `opacity: 0.6` **不改** —— 按 Step 1 的 `ratio()` 公式把 `rgba` 合成到 `--panel` 上算得约 5.7:1（本计划算的数，不是 M1 实测），已过 4.5 线；它不属于本次缺陷，动它只会让 diff 变宽。本任务的对比度断言只覆盖 `.schulte-cell.done`。 —— 代价：若以后调整 `--panel`/`--text`，`.card.done` 可能掉到 4.5 以下，届时由那次改动补一条断言。

`Ruling: 48px 的修法是把格子做到满宽并把间距压到 2px，而不是给格子加 `min-height: 48px` —— 360px 屏上 7×7 的可用宽度只有 336px（`#view` 左右各 12px 内边距），`48×7 + 4×6 = 360` 放不下，硬写 `min-height` 只会让方格溢出或把 `aspect-ratio` 撑歪。 —— 代价：`min(100%, 520px)` 的宽度上限被去掉，桌面 `npm run dev` 预览时格子会跟着窗口变宽（应用是竖屏锁定，真机不受影响）；负外边距 `-12px` 与 `#view` 的 `padding: 12px` 是一对隐式耦合，Step 2 的 `expect(bleed).toBe(pad)` 就是钉住这一对，改任一侧都会红。

`Ruling: 日历三态用中性蓝阶（`--panel` / `#3d4a63` / `--accent`），不引入绿/红 —— spec §5.8 要求「游戏区不用彩色装饰，避免干扰颜色任务」，而 stroop 的判定正好建立在颜色语义上；把「打卡」做成绿色会让绿色在应用里有两种含义。 —— 代价：完成与否只靠深浅区分，色觉障碍用户读不出；已用 `<title>`（Task 2）给出「已完成 3/3」的文字兜底，浏览器验收里确认读屏可读。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/styles.test.ts && npx tsc --noEmit
```
Expected: 全绿；`tsc --noEmit` 零输出（`?raw` 的类型来自 `tsconfig.json` 已配的 `types: ["vite/client"]`，不需要新增 `.d.ts`）。对比度断言若失败，打印 `ratio('#9aa4b2','#191c21')` 的实际值再调颜色，**不要**把 4.5 降下来。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/ui/styles.css focus-trainer/src/ui/styles.test.ts && git commit -m "fix(ui): 完成格改为可读的专用配色，方格满宽使 360px 屏 7×7 每格 ≥48px" && git log --format='%h %s' -1
```
`git add` 前先看 `git diff --cached`：`styles.css` 若带进别人的 `.game-*` hunk，停下先处理冲突（S-1）。

**交付物：** 两条 M1 遗留缺陷各有一条可执行判据（对比度 ≥ 4.5、`cellAt(360,7) ≥ 48`），趋势页配色到位，`styles.css` 全文无外链。

---

### Task 5: 全量门禁 + 离线自查 + 390×844 浏览器验收

**Files:**
- Modify: `docs/superpowers/plans/2026-10-20-m3-trend-polish.md`（本文件：在末尾「M3 验收记录」小节追加实测数字与 `git log` 哈希）

**Interfaces:**
- Consumes: Task 1–4 的全部产出。
- Produces: spec 第 1 节成功标准 5 的关闭证据、两条打磨判据的实测 px/对比度、`dist/` 外链自查结果，交给 M4（M4 Task 9 会在 M3 合并后复跑离线审计）。

**前置：** Task 1–4 全部已提交。验收通道的一切操作按 `docs/superpowers/plans/_browser-acceptance-channel.md` 执行（要点：驱动的是 Qoder 内置 webview，顶层视口实测 **531×557**，390×844 只能用同源 iframe 量；逐格点击用合成 `PointerEvent`；`window.confirm()` 会阻塞整条 CDP 通道；webview 切后台会节流 rAF）。

- [ ] **Step 1: 全量门禁**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx tsc --noEmit && npx vitest run && npx vite build
```
Expected: `tsc --noEmit` 零输出；`vitest run` 里 `0 failed`，且新增的四个测试文件（`stats.test.ts` / `charts.test.ts` / `trends.test.ts` / `styles.test.ts`）都出现在通过列表里；`vite build` 产出 `dist/`。把 `Test Files x passed` 与 `Tests y passed` 两行原文抄进记录（**不要**把计划里写的用例数当实测值填）。

- [ ] **Step 2: 离线自查（M4 审计的预跑）**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -rnoE "https?://[A-Za-z0-9._-]+" dist/assets | grep -v "www\.w3\.org"
cd "E:/WORK/脑力训练/focus-trainer" && grep -rn "趋势页在 M3" src
```
Expected: 第一条命令**零行输出**（唯一放行的 `http://www.w3.org/2000/svg` 被 `-v` 滤掉）。有任何一行输出就是违反离线红线：从源码里删掉那个地址，回到 Task 2/4 修，不许「记下再说」。第二条命令**零命中**（首页那个占位 `title` 必须已被 Task 3 删净）。

- [ ] **Step 3: 起 dev server 并挂 390×844 iframe**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vite --host 127.0.0.1 --port 5173 --strictPort
```
（`run_in_background: true`）。然后在浏览器里导航到 `http://127.0.0.1:5173/#/`，等 `#view` 非空后挂量排版的 iframe：

```js
const f = document.createElement('iframe');
f.style.cssText = 'width:390px;height:844px;border:0;position:fixed;left:0;top:0';
f.src = '/#/';
document.body.append(f);
'iframe-mounted';
```
Expected: `f.contentWindow.innerWidth === 390 && f.contentWindow.innerHeight === 844`。同时记下顶层 `window.innerWidth`（预期 531）—— 触控结论要按「390 排版 + 顶层实际视口」两条一起写。

- [ ] **Step 4: 真点「趋势」按钮，证明路由不是纸上的**

在**顶层文档**（不是 iframe）用 `take_snapshot` 找到「趋势」按钮的 uid，真实点击，然后：

```js
JSON.stringify({ hash: location.hash, sections: [...document.querySelectorAll('#view section')].map((s) => s.className), trendBtn: [...document.querySelectorAll('#view button')].some((b) => b.textContent === '趋势' && !b.disabled) })
```
Expected:
```json
{"hash":"#/trend","sections":["trend-radar","trend-curve","trend-calendar"],"trendBtn":false}
```
`trendBtn: false` 是对的 —— 点了之后已经在趋势页，首页按钮不在了。若 `hash` 还是 `#/`，说明首页按钮的 `onclick` 没接上（回 Task 3 Step 6）。

- [ ] **Step 5: 先造一条真实记录，再看曲线**

趋势页只读，空库是正常的初始态。先验空态、再练一次把数据造出来：

```js
const d = f.contentDocument;
JSON.stringify({ empty: d.querySelector('.trend-curve .trend-empty')?.textContent ?? null, dots: d.querySelectorAll('.curve-dot').length, cells: d.querySelectorAll('.calendar-cell').length, legend: [...d.querySelectorAll('.radar-legend li')].map((li) => li.textContent) })
```
Expected（全新库）: `empty` 为 `"近 30 天还没有训练记录"`、`dots` 为 `0`、`cells` 为 `35`、`legend` 每一项都含 `未练`。

然后在顶层走一次舒尔特训练（`#/play/schulte/plan`）：真实点「开始」，3-2-1 倒计时后按 `_browser-acceptance-channel.md` 的合成事件把 3×3 点完（第 1 档，9 格），逐格：

```js
const cells = [...document.querySelectorAll('.schulte-cell')];
const next = cells.find((c) => c.textContent === String(targetLabel));
next.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
```
按 `1→9` 顺序点完 → 真实点「继续」→ 再点两轮 → 落到 `#/result/1`。然后 `navigate('#/trend')` 重进趋势页：

```js
const d = f.contentDocument;
JSON.stringify({ dots: d.querySelectorAll('.curve-dot').length, line: !!d.querySelector('.curve-line'), empty: !!d.querySelector('.trend-empty'), legend: [...d.querySelectorAll('.radar-legend li')].map((li) => li.textContent) })
```
Expected: `dots ≥ 1`、`empty` 为 `false`、`legend` 里第一项不再是 `未练` 而是一个 0–100 的整数。若 `dots === 0`，先确认训练确实落库（`#/result/1` 能打开、结算页有「能力指数」行）。

- [ ] **Step 6: 缺陷 1 实测 —— 完成格数字的对比度**

回到训练页（或复用 Step 5 里点过的前几格：点对的格子带 `.done`）。在 390 iframe 里量并算：

```js
const d = f.contentDocument;
const done = d.querySelector('.schulte-cell.done');
const cs = done ? f.contentWindow.getComputedStyle(done) : null;
const chan = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (m) => 0.2126 * chan(m[0]) + 0.7152 * chan(m[1]) + 0.0722 * chan(m[2]);
const parse = (s) => s.match(/\d+/g).map(Number);
const ratio = (fg, bg) => { const a = lum(parse(fg)), b = lum(parse(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
JSON.stringify({ color: cs?.color, bg: cs?.backgroundColor, opacity: cs?.opacity, ratio: cs ? +ratio(cs.color, cs.backgroundColor).toFixed(2) : null })
```
Expected: `opacity` 为 `"1"`；`ratio ≥ 4.5`（单测算出约 6.77，浏览器里因 `--done-fg`/`--done-bg` 是同一对十六进制值，实测应在 6.6–6.9 区间）。把 M1 的基线 `1.59–1.69` 与本次实测值并排写进记录。若 `.done` 格找不到，先在 iframe 里点掉一格再量。

- [ ] **Step 7: 缺陷 2 实测 —— 7×7 的格子宽度**

第 9 档要练很久，所以直接量「同一套 CSS 在 7 列下算出多大」，探针挂进 `#view` 以继承真实的 12px 内边距：

```js
const mk = (doc, win) => {
  const probe = doc.createElement('div');
  probe.className = 'schulte-grid';
  probe.style.gridTemplateColumns = 'repeat(7, 1fr)';
  probe.innerHTML = Array.from({ length: 49 }, (_, i) => `<button class="schulte-cell">${i + 1}</button>`).join('');
  doc.querySelector('#view').append(probe);
  const cell = probe.querySelector('.schulte-cell').getBoundingClientRect();
  const out = { grid: +probe.getBoundingClientRect().width.toFixed(2), cell: +cell.width.toFixed(2), h: +cell.height.toFixed(2) };
  probe.remove();
  return out;
};
```
在 390 iframe 里跑 `mk(f.contentDocument, f.contentWindow)`，再把 iframe 改成 360 宽（`f.style.width='360px'`，等一帧）跑第二次。

Expected: 390 排版下 `cell ≈ 54.0`（`(390 - 6×2)/7`），360 排版下 `cell ≈ 49.71`（`(360 - 6×2)/7`），两次都 `≥ 48`；`h` 因 `aspect-ratio: 1` 与 `w` 相等。把两组数字原文抄进记录，并写明顶层视口是 531×557（M1 的 44.6px 缺陷在 360 排版下已被修掉）。若 `cell` 明显小于算式值，说明还有别处宽度约束在起作用（`#view` 内边距、`body`  margin），按实际差值回 Task 4 调负外边距，不要在验收里放宽阈值。

- [ ] **Step 8: 趋势页触控目标与整体观感**

```js
const d = f.contentDocument;
const rect = (sel) => { const el = d.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
JSON.stringify({ select: rect('.trend-curve select'), back: rect('#view .row button'), svg: rect('.trend-calendar svg') })
```
Expected: `select.h ≥ 48` 且 `back.h ≥ 48`（两者都靠 `button, select { min-height: var(--tap) }` 兜住，`back` 是趋势页的「返回」按钮）；`svg.w` 等于容器内容宽（390 − 24 = 366），说明 `width: 100%` 生效。再截一张趋势页整屏图（`take_screenshot`）附进记录，写明「三张图都在、没有溢出、没有横向滚动条」：

```js
JSON.stringify({ scrollW: f.contentDocument.documentElement.scrollWidth, clientW: f.contentDocument.documentElement.clientWidth })
```
Expected: `scrollW === clientW`（390 排版下不出现横向溢出）。

- [ ] **Step 9: 停掉 dev server**

按通道须知停进程，判据是「没有 LISTENING 行」（`TIME_WAIT` 残留正常）：

```bash
netstat -ano | grep ":5173 " | grep LISTENING
```
拿到 PID 后 `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'` 核对命令行确实是本项目的 vite，再 `Stop-Process -Id <pid> -Force`。别误杀 Qoder 自己。

- [ ] **Step 10: 写验收记录并提交（只动本文档）**

在本文件末尾的「M3 验收记录」小节，把 Step 1–8 的命令输出原文粘进去，逐条给出判定。**只准 `git add` 这一个文件**：

```bash
cd "E:/WORK/脑力训练" && git add docs/superpowers/plans/2026-10-20-m3-trend-polish.md && git commit -m "docs(m3): 趋势页与界面打磨验收记录" && git log --format='%h %s' -1
```

**交付物：** 成功标准 5 的三张图有实测证据（35 格 / ≤30 点 / 轴数 = `GAMES.length`），两条 M1 遗留缺陷各有一组「基线值 → 修后值」的实测数字，`dist/` 零外链，M4 可以直接接手。

---

## M3 验收记录

执行者在这里逐条落笔（每条都要带命令原文输出，不接受「通过」两个字）。

| # | 判据 | 阈值 | 实测 | 判定 |
|---|---|---|---|---|
| 1 | `npx tsc --noEmit` | 零输出 | | |
| 2 | `npx vitest run` | `0 failed`，四个新测试文件都在通过列表 | | |
| 3 | `npx vite build` | 产出 `dist/` | | |
| 4 | `dist/assets` 扫外链（滤掉 `www.w3.org`） | 零行 | | |
| 5 | 源码里 `趋势页在 M3` | 零命中 | | |
| 6 | 顶层点「趋势」后的 `location.hash` | `#/trend` | | |
| 7 | 趋势页 section 顺序 | `trend-radar, trend-curve, trend-calendar` | | |
| 8 | 空库时的曲线区文案与日历格数 | `近 30 天还没有训练记录` / 35 | | |
| 9 | 练完一次舒尔特后的曲线点数与图例 | `dots ≥ 1`，图例出现数字而非「未练」 | | |
| 10 | `.schulte-cell.done` 的 `opacity` | `1` | | |
| 11 | `.schulte-cell.done` 数字对比度（基线 1.59–1.69） | ≥ 4.5 | | |
| 12 | 7×7 探针在 390 排版下的格宽（基线 48.9） | ≥ 48 | | |
| 13 | 7×7 探针在 360 排版下的格宽（基线 44.6） | ≥ 48 | | |
| 14 | 趋势页 `select` 与「返回」按钮高度 | ≥ 48 | | |
| 15 | 390 排版下横向溢出 | `scrollW === clientW` | | |
| 16 | 顶层视口实测（通道限制，不是产品缺陷） | 记录为 531×557 量级 | | |
| 17 | 轴数与 `GAMES.length` 一致（M2 是否已合并都要写明） | 相等 | | |

### 已知残余项（如实记录，不许抹）

- 顶层视口 531×557：390×844 的判据全部来自同源 iframe，真机手感仍由 M4 Task 8 的飞行模式实测补最后一条（spec §7 的「界面验收」在 APK 上复跑）。
- 趋势页三张图的**配色**（尤其日历三态的深浅差）在这个通道里只能读 `getComputedStyle` 的值，色觉层面的判断留给用户真人看一眼。
- 成功标准 5 里的「五维」要等 M2 汇总步骤把 5 个游戏注册进 `GAMES` 才成立；M3 的页面按注册表派生轴数，合并后自动变 5 条，本计划不改代码去凑。

---

## 覆盖检查（写计划的人自查，执行者不必再做）

| spec 判据 | 落在哪个任务 |
|---|---|
| §1 成功标准 5：五维能力雷达图 | Task 1 `radarAxes` + Task 2 `radarChart` + Task 3 `section.trend-radar`；轴数由 `GAMES` 派生，「五」这一维数依赖 M2 汇总（见残留 3） |
| §1 成功标准 5：单个游戏近 30 天能力曲线 | Task 1 `abilityWindow`（`TREND_DAYS = 30`、每日期键取最高）+ Task 2 `lineChart` + Task 3 `select` 切换 |
| §1 成功标准 5：近 5 周打卡日历 | Task 1 `calendarCells`（`CALENDAR_CELLS = 35`）+ Task 2 `calendarGrid` + Task 3 `section.trend-calendar` |
| §1 成功标准 4 的首页趋势入口（§5.8「底部入口 趋势」） | Task 3 Step 6（`disabled` 占位改真路由） |
| §5.3 能力指数口径（近 3 次均值 / 折线取当天最高 / 没练过显示 0 并标注未练） | Task 1 `radarAxes` + `abilityWindow`；未练的「0 + 未练」文案在 Task 3 的 `ul.radar-legend` |
| §5.4 日期键（本地 04:00 分界） | Task 1 的凌晨用例（`stats.test.ts`「凌晨 02:00 的记录归前一天」）+ Task 3 的凌晨用例（日历末格 = 昨天）；`stats.ts` 里禁止出现第二套时钟由该文件的源码正则守卫 |
| §5.6 连续打卡（今天未完成不打断） | Task 3 直接 `import { streak }`，测试断言 `1天连续打卡`，页面不重算 |
| §5.7 存储 / 只读 | Task 3 Step 1「只读三个方法，一个写方法都不碰」 |
| §5.8 视觉约束：中性深色底 / 触控 ≥ 48px / 适配安全区 | 48px：Task 4 的算式与 Task 5 的探针实测；深色底与配色：Task 4 追加块（全部走既有的 `--bg`/`--panel`/`--line`/`--text`/`--muted`/`--accent`）；安全区已由 `styles.css:41` 的 `#app` padding 承担，M3 不新增 |
| §5.8 视觉约束「游戏区不用彩色装饰」 | Task 4 的裁定：日历三态只用蓝阶，不引入绿/红 |
| §7 单元测试（core 纯逻辑 + 视图） | Task 1（纯函数）、Task 2（SVG 结构）、Task 3（页面 + 路由）、Task 4（CSS 文本判据） |
| §7 界面验收（browser-use，390×844，趋势页三张图正常渲染） | Task 5 Step 3–8 |
| §9 风险「WebView 按帧刷新」/ §6 错误处理 | 不属于 M3，M1/M2 已承担 |
| §8 里程碑 M4（APK） | 不在本计划；M3 对 M4 的唯一约束（SVG 只允许 `w3.org` 命名空间字符串）已写进 Global Constraints 并在 Task 2 Step 5、Task 4 测试、Task 5 Step 2 三处把关 |

**未能覆盖的 spec 要求：** 无。§1 成功标准 5 的三个子项全部有任务承接；唯一不能由 M3 单独关闭的是「五维」的字面数量，它取决于 M2 汇总步骤把 `GAMES` 补到 5 个游戏（这是 M2 的交付物，不是 M3 可以代办的）。
