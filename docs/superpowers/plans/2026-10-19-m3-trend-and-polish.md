# M3 趋势页与界面打磨 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 交付趋势页（五维能力雷达 + 单游戏近 30 天曲线 + 近 5 周打卡日历，全部手写 SVG）并接通 `#/trend` 路由与首页入口，同时关掉 M1 遗留的两条打磨判定（完成格数字对比度、窄屏触控目标尺寸），使 spec 第 1 节成功标准 5 可关闭。

**架构：** 聚合口径全部放在 `src/core/stats.ts`（纯函数，只吃 `SessionRecord[]` / `DayPlan[]`，不碰 DOM、不碰 Repository 实例）；SVG 的几何与建节点放在 `src/ui/charts.ts`（几何函数纯、建节点函数只用 `document.createElementNS`）；页面装配放 `src/ui/pages/trends.ts`。趋势页**只读**：全程不调用任何 `Repository` 写方法。能力指数沿用 `SessionRecord.ability`（由 `SessionRunner.finish()` 用 `scoring.abilityIndex` 算好并落库），图表层不重算第二套 AI 公式。

**技术选型：** TypeScript 5.9.3（`strict` + `verbatimModuleSyntax`）、Vite 8.3.4、Vitest 5.0.5（`environment: 'node'`，没有 jsdom）、fake-indexeddb 6.2.6、原生 DOM + 手写 SVG，**M3 不新增任何依赖**。

**Spec：** `docs/superpowers/specs/2026-10-18-focus-trainer-design.md`（趋势页判据：第 1 节成功标准 5、§5.3 折线/雷达口径、§5.4 日期键、§5.6 连续打卡、§5.8 页面与视觉约束、§7 测试）

## Global Constraints

- 项目根：`E:\WORK\脑力训练\focus-trainer\`；Git 仓库根：`E:\WORK\脑力训练\`（git 命令在仓库根执行，路径写 `focus-trainer/...`）。
- 依赖版本精确锁定：`vite@8.3.4`、`vitest@5.0.5`、`typescript@5.9.3`、`fake-indexeddb@6.2.6`。**M3 不加、不升、不删任何依赖**（图表全部手写 SVG，禁止引 chart 库 / d3 / 任何 runtime 包）。
- 允许出现在打包产物里的、长得像外部地址的字符串**只有一个**：SVG 命名空间 `http://www.w3.org/2000/svg`。M4 的 `assembleDebug` 后离线审计（`2026-10-20-m4-android-apk.md` Task 7）逐个资源扫 `https?://…`，allowlist 只认 `w3.org`；`localhost` / `127.0.0.1` / CDN / 字体 / 图标 URL 出现在源码里即 **hard constraint violation**，处理方式是删掉，不是往 allowlist 里加。
- 测试文件与源码同目录，命名 `*.test.ts`；Vitest 环境 `node`（无 `document` / 无 CSS 引擎）。视图类测试照 `src/games/schulte/view.test.ts` 的**手写零依赖 DOM 桩**形状来；CSS 内容用 `import css from './styles.css?raw'` 取文本（`tsconfig.json` 已 `types: ["vite/client"]`，`?raw` 有现成类型声明，不需要新增依赖）。
- `verbatimModuleSyntax`：类型只准 `import type { … }` 或 `import { type X }`。
- 时钟契约（spec §4.3）：轮内计时只用 rAF 帧时间戳与 `PointerEvent.timeStamp`。趋势页**不在轮内**，只允许 `Date.now()` 用作「今天属于哪个 dayKey」的日期键入参（与 `today.ts:12` 的 `now = Date.now()` 默认参同形态），且必须以可注入参数写出（`now?: number`）以便测试。禁止给时钟加负值/NaN 钳制（M1 Task 5 裁定 N-5）。
- 日界是**本地 04:00**（`src/core/daykey.ts`，`Settings.dayStartHour`，默认 4）。任何 30 天曲线、日历、近 3 次均值都必须按 `dayKey` 分桶，**不许**用 `toISOString().slice(0,10)` 或 UTC 日期。Task 3 用「凌晨 02:00 的单算前一天」的边界测试钉死这条。
- 只读规则（M1 裁定的延续）：消费记录的页面不得改写记录。趋势页只准调 `listSessions()` / `listPlans()` / `getPlan()`（本页实际用到这三个只读方法；`lastSession()` / `listGameStates()` 同样是只读的，但趋势页不需要，用了就是多余）；**禁止** `saveSession` / `putPlan` / `putSettings` / `clearAll`，也**禁止**调用会写库的 `ensureTodayPlan()`（`today.ts:23` 有 `repo.putPlan`）。Task 1/6 的记录型 fake repo 比这条更严：除 `listSessions` / `listPlans` / `getPlan` / `getSettings` 外的方法（含只读的 `lastSession` / `listGameStates` / `getSession`）一被调用就记名并 reject，把「这一页只读了四个方法」钉成测试。
- 能力指数只有一个来源：`src/core/scoring.ts` 的 `abilityIndex(rounds, maxLevel)`（最后 ⌈R/2⌉ 个 `counted` 轮的 `level-1+score01` 均值，夹 [0,100]），落库为 `SessionRecord.ability`。趋势页一律读 `ability` 字段，**不得**再写第二套 AI 公式。
- 注册表是唯一的迭代来源：雷达轴、曲线切换页签、日历「计划是否完整」都从 `src/games/registry.ts` 的 `GAMES` 派生（`GAMES.map((g) => g.id)`）；**不要**把 `GAME_IDS` 当数据源——未注册游戏没有成绩也不该出现在轴上（M1 的同类裁定：`GAME_IDS` 当计划源会让 `isPlanComplete` 恒 false、`streak()` 恒 0）。
- 计划来源照旧：`scheduler.ts` 的 `streak()` / `isPlanComplete()` / `PLAN_SIZE = 3`，`buildPlan` 只从 `GAMES` 生成。日历格的 done/partial 判定复用 `isPlanComplete`，不许在 UI 层重写完成判定。
- 界面文案中文；代码标识符英文；默认不写注释，只在原因不明显处写一行中文注释。空态文案三句已在 Task 1 定死，后续任务不得改成「看起来更好」的版本。
- 渲染上限：本页派生并落到 DOM 的图形节点数量必须有界——雷达 ≤ 5 轴、曲线 ≤ 30 个点、日历 = 35 格；`SessionRecord` 有多少条都不影响这个上限（Task 6 有 600 条历史的断言）。
- 修改代码只用编辑工具（Write / Edit），不用 sed / heredoc / 脚本改代码。
- 提交：逐文件 `git add`，禁止 `git add -A` / `git add .` / `git stash`；不碰别人的脏文件。M2 四份计划正在合并期，**本计划的 Task 只碰下列清单里的文件**，其余文件一律不改。
- 测试计数纪律：计划里的期望数字以执行者实测为准；不得为凑数删测试或造无断言的测试。变异探针是复核手段：每条断言要能杀掉一个对应的变异。
- 本计划**不碰** `src/core/types.ts`、`session.ts`、`adaptive.ts`、`scoring.ts`、`storage.ts`、`scheduler.ts`、`daykey.ts` 的实现（只 import），也不碰 `src/games/**`（M2 正在写，Task 7 的打磨只动 `src/ui/styles.css`）。

## 前置条件与执行顺序

1. 顺序：Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8。Task 7 有一条硬依赖：它断言 `.tab { min-height: var(--tap) }`（`styles.test.ts` Step 2 的 `DECL('.tab', …)`），而 `.tab` 是 Task 6 Step 4 才写进 `styles.css` 的，所以 Task 7 必须在 Task 6 之后。Task 1–6 内部按序；只有 Task 2/3 与 Task 4/5 之间互不依赖（stats 与 charts 谁先都行）。
2. Task 1 起 `#/trend` 即已可用，后续任务只是往同一页面骨架里替换章节，**每一步都出可运行、可提交的 app**（不会出现「合了一半就打不开」）。
3. M2 未合并也能跑完 Task 1–7：此时 `GAMES.length === 1`，雷达走「单轴降级」分支（Task 4/5 定义并断言）。Task 8 的浏览器验收要分别记录 M2 已合并 / 未合并两种情况。
4. Task 8 之前先跑一次全量门禁：`cd "E:/WORK/脑力训练/focus-trainer" && npx tsc --noEmit && npx vitest run && npx vite build`。

## 文件结构（本计划全部改动面）

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/ui/router.ts` | 修改 | 加 `{ name: 'trend' }` 路由；`GameId` 校验顺序不变 |
| `src/ui/router.test.ts` | 修改 | 趋势路由 + 未知游戏仍回首页的次序断言 |
| `src/main.ts` | 修改 | `show()` 加 `trend` 分支（Task 1） |
| `src/ui/pages/trends.ts` | 新建 | 趋势页装配：取数 → 调 stats → 调 charts → 排空态；只读 |
| `src/ui/pages/trends.test.ts` | 新建 | 空态/降级/只读/上限/日界分桶的页面级测试 |
| `src/ui/pages/home.ts` | 修改 | 底部 `disabled` 占位按钮换成可点入口（`home.ts:69`） |
| `src/core/stats.ts` | 新建 | 纯聚合：近 30 天序列、近 3 次均值雷达、5 周日历格、有界分桶 |
| `src/core/stats.test.ts` | 新建 | 聚合口径与 04:00 日界、空态、600 条历史的测试 |
| `src/ui/charts.ts` | 新建 | 几何纯函数 + 手写 SVG 构建（`createElementNS`） |
| `src/ui/charts.test.ts` | 新建 | 几何单测 + 零依赖 SVG 桩测（含命名空间白名单断言） |
| `src/ui/styles.css` | 修改 | 完成格可读性、窄屏触控尺寸、趋势页三块版面 |
| `src/ui/styles.test.ts` | 新建 | 用 `?raw` 读 CSS 文本，跑 WCAG 对比度与规则存在性断言 |

## Interfaces 总表（跨任务契约，命名以此为准）

- `src/core/stats.ts` 导出：
  - `interface DayPoint { dayKey: string; ability: number | null; sessions: number }`
  - `dailyAbilitySeries(sessions: readonly SessionRecord[], todayKey: string, gameId: GameId, days?: number): DayPoint[]`
  - `interface RadarAxis { gameId: GameId; label: string; ability: number; practiced: boolean }`
  - `radarAxes(games: readonly GameModule[], sessions: readonly SessionRecord[], recentCount?: number): RadarAxis[]`
  - `type CalendarStatus = 'done' | 'partial' | 'empty' | 'future'`
  - `interface CalendarCell { dayKey: string; weekday: number; status: CalendarStatus }`
  - `calendarCells(plans: readonly DayPlan[], todayKey: string, weeks?: number): CalendarCell[]`
  - `latestAbility(sessions: readonly SessionRecord[], gameId: GameId): number | null`
  - 常量：`SERIES_DAYS = 30`、`RADAR_RECENT = 3`、`CALENDAR_WEEKS = 5`
- `src/ui/charts.ts` 导出：
  - `const SVG_NS = 'http://www.w3.org/2000/svg'`
  - `polarPoint(cx: number, cy: number, r: number, index: number, count: number): { x: number; y: number }`
  - `radarOutline(values: readonly number[], count: number, cx: number, cy: number, radius: number): string`
  - `lineX(i: number, count: number, box: PlotBox): number` / `lineY(ability: number, box: PlotBox): number`
  - `lineVertices(points: readonly DayPoint[], box: PlotBox): LineVertex[]`（所有有数据的点）
  - `lineRuns(points: readonly DayPoint[], box: PlotBox): LineVertex[][]`（按缺口断开的连续段，段长 ≥ `LINE_MIN_POINTS`）
  - `calendarRects(cells: readonly CalendarCell[], origin: Point2, size: number, gap: number): CalendarRect[]`
  - `createRadarChart(axes: readonly RadarAxis[], size: number): SVGSVGElement`
  - `createLineChart(points: readonly DayPoint[], width: number, height: number): SVGSVGElement`
  - `createCalendarChart(cells: readonly CalendarCell[], cell: number, gap: number): SVGSVGElement`
- `src/ui/pages/trends.ts` 导出：`renderTrends(view: HTMLElement, ctx: AppContext, signal: AbortSignal, now?: number): Promise<void>`

---

### Task 1: `#/trend` 路由放行与页面骨架

**Files:**
- Modify: `focus-trainer/src/ui/router.ts`
- Modify: `focus-trainer/src/ui/router.test.ts`
- Create: `focus-trainer/src/ui/pages/trends.ts`
- Modify: `focus-trainer/src/main.ts`
- Modify: `focus-trainer/src/ui/pages/home.ts`（第 69 行的 `disabled` 占位按钮）
- Test: `focus-trainer/src/ui/pages/trends.test.ts`

**Interfaces:**
- Consumes: `parseRoute(hash: string): Route`、`href(r: Route): string`（`router.ts:13-35`）；`AppContext = { repo: Repository; storageOk: boolean; settings: Settings }`（`context.ts:4`）；`h(...)`（`dom.ts:5`）；`MemoryRepository`（`storage.ts:35`）
- Produces: `Route` 联合新增 `{ name: 'trend' }` 与 `#/trend` 地址；`renderTrends(view: HTMLElement, ctx: AppContext, signal: AbortSignal, now?: number): Promise<void>`；三句空态文案常量

- [ ] **Step 1: 写路由的失败测试**

把 `focus-trainer/src/ui/router.test.ts` **整文件替换**成下面这份（原有 3 条用例：第 1 条改名并加 `#/trend` 断言，第 2 条 `无法识别的地址回首页` 被下面的「非游戏路由只吃 #/trend」吸收进去、用例从 1 个地址扩到 11 个，第 3 条加 `trend`。不要只追加，否则会留一条旧用例继续断言四种路由）：

```ts
import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './router';

describe('parseRoute', () => {
  it('识别五种路由', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/play/schulte/plan')).toEqual({ name: 'play', gameId: 'schulte', mode: 'plan' });
    expect(parseRoute('#/play/schulte/free')).toEqual({ name: 'play', gameId: 'schulte', mode: 'free' });
    expect(parseRoute('#/result/12')).toEqual({ name: 'result', sessionId: 12 });
    expect(parseRoute('#/trend')).toEqual({ name: 'trend' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  // 次序钉子：trend 是「非游戏路由」，但它只能在 head === 'trend' 且只有一段时放行。
  // 写错次序（head === 'trend' 之前不加 parts.length === 1、或把兜底分支改成 trend）会让
  // 未知游戏 id 与手抖多打一段的地址不再回首页，而是渲染一个空趋势页 —— 用户以为是 bug。
  it('非游戏路由只吃 #/trend，其余未知地址仍回首页', () => {
    for (const bad of [
      '#/trend/',            // 空段被 filter 掉 → 等价 #/trend，允许
      '#/trend/x',           // 多一段 → 首页
      '#/trends',            // 拼错的复数 → 首页
      '#/play/xxx/plan',     // 未知游戏 id → 首页（不得被 trend 分支吞掉）
      '#/play/trend/plan',   // head 是 play → 走 isGameId 校验 → 首页
      '#/trend/play',        // 首页
      '#/play/schulte/zzz',
      '#/result/abc',
      '#/result/-1',
      '#/settings/x',
      '#/nope',
    ]) {
      expect(parseRoute(bad), bad).toEqual(bad === '#/trend/' ? { name: 'trend' } : { name: 'home' });
    }
  });

  it('href 与 parseRoute 互为逆运算', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'play', gameId: 'schulte', mode: 'plan' },
      { name: 'play', gameId: 'gestalt', mode: 'free' },
      { name: 'result', sessionId: 3 },
      { name: 'trend' },
      { name: 'settings' },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});
```

- [ ] **Step 2: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/router.test.ts`
Expected: FAIL —— `识别五种路由` 里 `expect(parseRoute('#/trend')).toEqual({ name: 'trend' })` 报 `expected { name: 'home' } ...`；`href 与 parseRoute` 那条也会因为 `{ name: 'trend' }` 不在 `Route` 联合里而先报 TS 类型错（vitest 走 esbuild，类型错只在 `npx tsc --noEmit` 出现，测试仍按运行结果判失败）。

- [ ] **Step 3: 改 `router.ts`**

`focus-trainer/src/ui/router.ts` 的 `Route` 与 `parseRoute` 改成（`href` 同步加分支；`isGameId` **不动**）：

```ts
export type Route =
  | { name: 'home' }
  | { name: 'play'; gameId: GameId; mode: Mode }
  | { name: 'result'; sessionId: number }
  | { name: 'trend' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter((p) => p.length > 0);
  const [head, a, b] = parts;
  if (head === 'play' && parts.length === 3 && isGameId(a) && (b === 'plan' || b === 'free')) {
    return { name: 'play', gameId: a, mode: b };
  }
  if (head === 'result' && parts.length === 2 && /^\d+$/.test(a)) return { name: 'result', sessionId: Number(a) };
  // 趋势页是第一个「非游戏」子路由：只接受恰好一段，未知 head 一律继续往下掉到首页兜底。
  if (head === 'trend' && parts.length === 1) return { name: 'trend' };
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
    case 'trend':
      return '#/trend';
    case 'settings':
      return '#/settings';
  }
}
```

- [ ] **Step 4: 跑到它通过**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/router.test.ts && npx tsc --noEmit`
Expected: `router.test.ts` 3 个测试通过（原文件是 3 条：`识别四种路由`/`无法识别的地址回首页`/`href 与 parseRoute 互为逆运算`；Step 1 把第一条改名为 `识别五种路由`、把第二条并入 `非游戏路由只吃 #/trend`，条数不变）。`tsc --noEmit` **此刻必须还有一条报错**：`src/main.ts` 的 `show()` 声明返回 `Promise<void>`，而 `switch` 没有覆盖新加的 `trend` 分支，函数可能走到「没有 return」的尽头 → TS2366 `Function lacks ending return statement and return type does not include 'undefined'`（`noFallthroughCasesInSwitch` 只管 case 穿透，不是这条报错的来源）。这正是 Step 7 要补的接线；补完后 `tsc` 才干净。

- [ ] **Step 5: 写页面骨架的失败测试**

新建 `focus-trainer/src/ui/pages/trends.test.ts`。node 环境没有 DOM，桩照 `src/games/schulte/view.test.ts` 的形状写，只实现本页用到的那几件（`createElement` / `append` / `replaceChildren` / `className` / `setAttribute` / `textContent`）：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRepository } from '../../core/storage';
import type { DayPlan, Repository, SessionRecord } from '../../core/types';
import { EMPTY_CALENDAR, EMPTY_RADAR, EMPTY_SERIES, renderTrends } from './trends';

class StubEl {
  readonly children: StubEl[] = [];
  readonly attrs: Record<string, string> = {};
  textContent = '';
  className = '';
  parent: StubEl | null = null;

  constructor(readonly tag: string) {}

  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }

  append(...nodes: (StubEl | string)[]): void {
    for (const n of nodes) {
      if (typeof n === 'string') {
        this.textContent += n;
        continue;
      }
      n.parent = this;
      this.children.push(n);
    }
  }

  replaceChildren(...nodes: (StubEl | string)[]): void {
    this.children.length = 0;
    this.textContent = '';
    this.append(...nodes);
  }

  addEventListener(): void {}

  descendants(): StubEl[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }
}

function installDom(): void {
  vi.stubGlobal('document', { createElement: (tag: string) => new StubEl(tag) });
}

afterEach(() => vi.unstubAllGlobals());

const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  gameId: 'schulte',
  mode: 'plan',
  dayKey: '2026-10-18',
  startedAt: 1,
  durationMs: 1000,
  startLevel: 1,
  endLevel: 1,
  rounds: [],
  summary: {},
  ability: 50,
  ...over,
});

const plan = (dayKey: string, completed: DayPlan['completed'], games: DayPlan['games'] = ['schulte']): DayPlan => ({
  dayKey,
  games,
  completed,
});

// 只读钉子：写方法一旦被调用就记名并 reject，测试同时断言 writes 为空。
function readOnlyRepo(sessions: SessionRecord[], plans: DayPlan[]): { repo: Repository; writes: string[] } {
  const writes: string[] = [];
  const deny = (name: string): Promise<never> => {
    writes.push(name);
    return Promise.reject(new Error(`趋势页不许写库：${name}`));
  };
  return {
    writes,
    repo: {
      listSessions: async () => sessions.slice(),
      listPlans: async () => plans.slice(),
      getPlan: async (k: string) => plans.find((p) => p.dayKey === k) ?? null,
      getSettings: async () => ({ dayStartHour: 4 }),
      getGameState: () => deny('getGameState'),
      listGameStates: () => deny('listGameStates'),
      lastSession: () => deny('lastSession'),
      getSession: () => deny('getSession'),
      putPlan: () => deny('putPlan'),
      saveSession: () => deny('saveSession'),
      putSettings: () => deny('putSettings'),
      clearAll: () => deny('clearAll'),
    },
  };
}

async function render(sessions: SessionRecord[], plans: DayPlan[], aborted = false) {
  installDom();
  const { repo, writes } = readOnlyRepo(sessions, plans);
  const ctx = { repo, storageOk: true, settings: { dayStartHour: 4 } };
  const view = new StubEl('main');
  const ac = new AbortController();
  if (aborted) ac.abort();
  await renderTrends(view as unknown as HTMLElement, ctx, ac.signal);
  return { view, writes };
}

const texts = (view: StubEl): string[] => view.descendants().map((d) => d.textContent);

describe('renderTrends 骨架', () => {
  it('零记录时三块各自给出中文空态文案', async () => {
    const { view, writes } = await render([], []);
    expect(writes).toEqual([]);
    expect(texts(view)).toContain('趋势');
    expect(texts(view)).toContain(EMPTY_RADAR);
    expect(texts(view)).toContain(EMPTY_SERIES);
    expect(texts(view)).toContain(EMPTY_CALENDAR);
  });

  it('有成绩后雷达与曲线不再报空态；日历只有整计划完成才算有点', async () => {
    const scored = await render([session()], []);
    const t1 = texts(scored.view);
    expect(t1).not.toContain(EMPTY_RADAR);
    expect(t1).not.toContain(EMPTY_SERIES);
    const checked = await render([], [plan('2026-10-18', ['schulte'])]);
    expect(texts(checked.view)).not.toContain(EMPTY_CALENDAR);
    const partial = await render([], [plan('2026-10-18', [], ['schulte', 'stroop'])]);
    expect(texts(partial.view)).toContain(EMPTY_CALENDAR);
  });

  it('渲染出三块 trend-block 与三个 h2 章节名', async () => {
    const { view } = await render([], []);
    const blocks = view.children.filter((c) => c.className === 'trend-block');
    expect(blocks).toHaveLength(3);
    expect(blocks.map((b) => b.children[0].textContent)).toEqual(['能力雷达', '近 30 天曲线', '近 5 周打卡']);
    expect(view.descendants().filter((d) => d.className === 'trend-slot')).toHaveLength(3);
  });

  it('signal 已 abort 时什么都不渲染、也不读第二遍', async () => {
    const { view } = await render([], [], true);
    expect(view.children).toHaveLength(0);
  });

  it('用真 MemoryRepository 跑一遍也不写库（getPlan 之外的写入路径为 0 条）', async () => {
    installDom();
    const repo = new MemoryRepository();
    const before = await repo.listSessions();
    await renderTrends(
      new StubEl('main') as unknown as HTMLElement,
      { repo, storageOk: true, settings: { dayStartHour: 4 } },
      new AbortController().signal,
    );
    expect(await repo.listSessions()).toEqual(before);
    expect(await repo.listPlans()).toEqual([]);
  });
});
```

- [ ] **Step 6: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/pages/trends.test.ts`
Expected: FAIL —— 整文件在加载阶段就红：`Failed to resolve import "./trends" from "src/ui/pages/trends.test.ts". Does the file exist?`（`trends.ts` 是 Step 7 才建的新文件，此刻不存在；这一条不是断言失败，别去改断言）。

- [ ] **Step 7: 建页面骨架并接线**

新建 `focus-trainer/src/ui/pages/trends.ts`（Task 6 会把 slot 换成三张图，本任务先把文案与结构定死）：

```ts
import { isPlanComplete } from '../../core/scheduler';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

// 空态文案是产品决策，spec §5.8 只规定了「趋势页三块内容」。这三句一旦定死，
// 后续任务不得为了「看起来更好」而改字面 —— trends.test.ts 按字面断言。
export const EMPTY_RADAR = '还没有成绩，先练一次再来。';
export const EMPTY_SERIES = '近 30 天还没有训练记录。';
export const EMPTY_CALENDAR = '完成当天的全部计划就会点亮一格。';

function block(title: string, empty: string | null): HTMLElement {
  return h(
    'section',
    { class: 'trend-block' },
    h('h2', null, title),
    h('p', { class: 'muted', 'data-empty': 'true' }, empty ?? ''),
    h('div', { class: 'trend-slot' }),
  );
}

export async function renderTrends(
  view: HTMLElement,
  ctx: AppContext,
  signal: AbortSignal,
  now = Date.now(),
): Promise<void> {
  // 只读：趋势页绝不生成今日计划（ensureTodayPlan 会 putPlan，见 today.ts:23），
  // 也不写任何记录。计划进行中一样可进。
  const [sessions, plans] = await Promise.all([ctx.repo.listSessions(), ctx.repo.listPlans()]);
  if (signal.aborted) return;
  const hasScore = sessions.length > 0;
  const hasCheckin = plans.some((p) => isPlanComplete(p));
  view.replaceChildren(
    h(
      'div',
      { class: 'row' },
      h('button', { onclick: () => navigate({ name: 'home' }) }, '返回'),
      h('h1', null, '趋势'),
    ),
    block('能力雷达', hasScore ? null : EMPTY_RADAR),
    block('近 30 天曲线', hasScore ? null : EMPTY_SERIES),
    block('近 5 周打卡', hasCheckin ? null : EMPTY_CALENDAR),
  );
}
```

`focus-trainer/src/main.ts` 加两行（import 与 switch 分支）：

```ts
import { renderTrends } from './ui/pages/trends';
```

```ts
    case 'result':
      return renderResult(view, ctx, route.sessionId, signal);
    case 'trend':
      return renderTrends(view, ctx, signal);
    case 'settings':
      return renderSettings(view, ctx, signal);
```

`focus-trainer/src/ui/pages/home.ts:69` 的占位按钮换成真入口（`title` 属性一并删掉）：

```ts
      h('button', { onclick: () => navigate({ name: 'trend' }) }, '趋势'),
```

- [ ] **Step 8: 跑到它通过并确认没踩别人**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/pages/trends.test.ts && npx tsc --noEmit && npx vitest run`
Expected: 本文件 5 个测试通过；`tsc --noEmit` 此刻才干净（Step 4 那条 `main.ts` 的 `show()` 未覆盖 `trend` 的返回类型报错，被上面那两行接线补掉）；全量 `vitest run` 全绿 = M1 的 135 个 + 本页 5 个 = **140 个**（router 那 3 条是改写不是新增，条数不变；M2 若已合并则以实测数为准，多出的都是 M2 的）。

- [ ] **Step 9: 提交**

```bash
cd "E:/WORK/脑力训练"
git add focus-trainer/src/ui/router.ts focus-trainer/src/ui/router.test.ts focus-trainer/src/ui/pages/trends.ts focus-trainer/src/ui/pages/trends.test.ts focus-trainer/src/main.ts focus-trainer/src/ui/pages/home.ts
git commit -m "feat(trend): 接通 #/trend 路由并落趋势页骨架与空态文案"
```

### Task 2: `src/core/stats.ts` 的近 30 天序列与雷达轴聚合

**Files:**
- Create: `focus-trainer/src/core/stats.ts`
- Test: `focus-trainer/src/core/stats.test.ts`

**Interfaces:**
- Consumes: `SessionRecord`（`types.ts:88`）、`GameId`、`GameModule`（`types.ts:61`）、`addDays(key, delta)`（`daykey.ts:16`）、`SessionRecord.ability`（由 `scoring.abilityIndex` 产出）
- Produces: `DayPoint` / `dailyAbilitySeries` / `RadarAxis` / `radarAxes` / `latestAbility` / `SERIES_DAYS` / `RADAR_RECENT`

- [ ] **Step 1: 写失败的测试**

新建 `focus-trainer/src/core/stats.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { addDays } from './daykey';
import { RADAR_RECENT, SERIES_DAYS, dailyAbilitySeries, latestAbility, radarAxes } from './stats';
import type { GameId, GameModule, SessionRecord } from './types';

const session = (gameId: GameId, dayKey: string, ability: number, startedAt = 1): SessionRecord => ({
  gameId,
  mode: 'plan',
  dayKey,
  startedAt,
  durationMs: 1000,
  startLevel: 1,
  endLevel: 1,
  rounds: [],
  summary: {},
  ability,
});

const mod = (id: GameId, ability: string): GameModule => ({ ability, id } as unknown as GameModule);

const GAMES_1 = [mod('schulte', '持续注意')];
const GAMES_5 = [
  mod('schulte', '持续注意'),
  mod('stroop', '选择性注意'),
  mod('seqmem', '视觉工作记忆'),
  mod('mot', '动态视觉'),
  mod('gestalt', '闭合识别'),
];

const TODAY = '2026-10-18';

describe('dailyAbilitySeries', () => {
  it('输出长度恒为 days，首尾按 dayKey 窗口对齐', () => {
    const out = dailyAbilitySeries([], TODAY, 'schulte');
    expect(out).toHaveLength(SERIES_DAYS);
    expect(out[0].dayKey).toBe(addDays(TODAY, -29));
    expect(out[out.length - 1].dayKey).toBe(TODAY);
  });

  it('同一天多次取当天最高 AI，不是均值也不是最后一次', () => {
    const out = dailyAbilitySeries(
      [session('schulte', TODAY, 40, 1), session('schulte', TODAY, 70, 2), session('schulte', TODAY, 55, 3)],
      TODAY,
      'schulte',
    );
    expect(out[out.length - 1]).toEqual({ dayKey: TODAY, ability: 70, sessions: 3 });
  });

  it('缺口是 null 而不是 0（0 是真实的低分，两者不能混）', () => {
    const out = dailyAbilitySeries([session('schulte', addDays(TODAY, -2), 0)], TODAY, 'schulte');
    expect(out.find((p) => p.dayKey === addDays(TODAY, -1))!.ability).toBeNull();
    expect(out.find((p) => p.dayKey === addDays(TODAY, -2))!.ability).toBe(0);
  });

  it('窗口外的记录被丢掉，别的游戏的记录被丢掉', () => {
    const out = dailyAbilitySeries(
      [session('schulte', addDays(TODAY, -31), 99), session('stroop', TODAY, 99)],
      TODAY,
      'schulte',
    );
    expect(out.every((p) => p.ability === null)).toBe(true);
    expect(out.reduce((n, p) => n + p.sessions, 0)).toBe(0);
  });

  it('600 条历史仍然只出 30 个点（有界，不随记录数增长）', () => {
    const many: SessionRecord[] = [];
    for (let i = 0; i < 600; i++) many.push(session('schulte', addDays(TODAY, -(i % 200)), i % 101, i));
    expect(dailyAbilitySeries(many, TODAY, 'schulte')).toHaveLength(30);
  });

  it('days < 1 直接 RangeError', () => {
    expect(() => dailyAbilitySeries([], TODAY, 'schulte', 0)).toThrow(RangeError);
  });
});

describe('radarAxes', () => {
  it('每个已注册游戏一轴，标签取 GameModule.ability（雷达维度名，spec:261）', () => {
    expect(radarAxes(GAMES_5, []).map((a) => a.label)).toEqual([
      '持续注意',
      '选择性注意',
      '视觉工作记忆',
      '动态视觉',
      '闭合识别',
    ]);
    expect(radarAxes(GAMES_1, [])).toHaveLength(1);
  });

  it('近 3 次均值：4 次记录只取最后 3 次（按 startedAt，不看数组顺序）', () => {
    const s = [
      session('schulte', '2026-10-01', 10, 1),
      session('schulte', '2026-10-02', 20, 2),
      session('schulte', '2026-10-03', 30, 3),
      session('schulte', '2026-10-04', 40, 4),
    ];
    expect(radarAxes(GAMES_1, [s[2], s[0], s[3], s[1]])[0].ability).toBe(Math.round((30 + 40 + 20) / 3));
  });

  it('不足 3 次就按实际次数取均值；从没练过是 0 且 practiced=false（图上标「未练」）', () => {
    expect(radarAxes(GAMES_5, [session('schulte', TODAY, 63)])[0]).toEqual({
      gameId: 'schulte',
      label: '持续注意',
      ability: 63,
      practiced: true,
    });
    expect(radarAxes(GAMES_5, [session('schulte', TODAY, 63)])[4]).toEqual({
      gameId: 'gestalt',
      label: '闭合识别',
      ability: 0,
      practiced: false,
    });
  });

  it('能力值只读 SessionRecord.ability，绝不在此重算 abilityIndex', () => {
    expect(radarAxes(GAMES_1, [session('schulte', TODAY, 87)])[0].ability).toBe(87);
    expect(RADAR_RECENT).toBe(3);
  });

  it('recentCount < 1 抛 RangeError（slice(-0) 会返回全量，这是个静默 bug）', () => {
    expect(() => radarAxes(GAMES_1, [], 0)).toThrow(RangeError);
  });
});

describe('latestAbility', () => {
  it('无记录返回 null，有记录返回 startedAt 最大那条', () => {
    expect(latestAbility([], 'schulte')).toBeNull();
    const s = [
      session('schulte', '2026-10-02', 20, 2),
      session('schulte', '2026-10-01', 10, 1),
      session('stroop', '2026-10-03', 99, 3),
    ];
    expect(latestAbility(s, 'schulte')).toBe(20);
  });
});
```

- [ ] **Step 2: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/stats.test.ts`
Expected: FAIL —— 整个文件加载失败：`Failed to resolve import "./stats" from "src/core/stats.test.ts". Does the file exist?`

- [ ] **Step 3: 写实现**

新建 `focus-trainer/src/core/stats.ts`：

```ts
import { addDays } from './daykey';
import type { GameId, GameModule, SessionRecord } from './types';

export const SERIES_DAYS = 30;
export const RADAR_RECENT = 3;

export interface DayPoint {
  dayKey: string;
  ability: number | null;
  sessions: number;
}

// 聚合口径全部留在 core（纯函数、不碰 DOM、不碰 Repository 实例），与 scoring/scheduler 同级；
// charts.ts 只管「数据 → 几何 → SVG 节点」。这样「能力分怎么算」和「线怎么画」不会互相渗透，
// 也保证 stats 的测试不需要 DOM 桩。
export function dailyAbilitySeries(
  sessions: readonly SessionRecord[],
  todayKey: string,
  gameId: GameId,
  days = SERIES_DAYS,
): DayPoint[] {
  if (!Number.isInteger(days) || days < 1) throw new RangeError(`days must be >= 1: ${days}`);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(addDays(todayKey, -i));
  const inWindow = new Set(keys);
  const best = new Map<string, { ability: number; sessions: number }>();
  for (const s of sessions) {
    if (s.gameId !== gameId || !inWindow.has(s.dayKey)) continue;
    const cur = best.get(s.dayKey);
    if (cur) {
      cur.ability = Math.max(cur.ability, s.ability);
      cur.sessions += 1;
    } else {
      best.set(s.dayKey, { ability: s.ability, sessions: 1 });
    }
  }
  // 缺口用 null，不用 0：0 是「练了但只拿 0 分」的真实值。画成 0 会让断练的一周看起来像能力崩盘。
  return keys.map((k) => {
    const b = best.get(k);
    return { dayKey: k, ability: b ? b.ability : null, sessions: b ? b.sessions : 0 };
  });
}

export interface RadarAxis {
  gameId: GameId;
  label: string;
  ability: number;
  practiced: boolean;
}

export function radarAxes(
  games: readonly GameModule[],
  sessions: readonly SessionRecord[],
  recentCount = RADAR_RECENT,
): RadarAxis[] {
  if (!Number.isInteger(recentCount) || recentCount < 1) throw new RangeError(`recentCount must be >= 1: ${recentCount}`);
  const ordered = sessions.slice().sort((a, b) => a.startedAt - b.startedAt);
  return games.map((g) => {
    const tail = ordered.filter((s) => s.gameId === g.id).slice(-recentCount);
    const sum = tail.reduce((acc, s) => acc + s.ability, 0);
    return {
      gameId: g.id,
      label: g.ability,
      ability: tail.length === 0 ? 0 : Math.round(sum / tail.length),
      practiced: tail.length > 0,
    };
  });
}

export function latestAbility(sessions: readonly SessionRecord[], gameId: GameId): number | null {
  const mine = sessions.filter((s) => s.gameId === gameId);
  if (mine.length === 0) return null;
  return mine.reduce((m, s) => (s.startedAt >= m.startedAt ? s : m)).ability;
}
```

- [ ] **Step 4: 跑到它通过**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/stats.test.ts && npx tsc --noEmit`
Expected: 12 个测试通过；`tsc` 干净。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练"
git add focus-trainer/src/core/stats.ts focus-trainer/src/core/stats.test.ts
git commit -m "feat(stats): 近 30 天最高 AI 序列与雷达近 3 次均值聚合"
```

---

### Task 3: `dayKey` 日界分桶测试与 5 周打卡日历

**Files:**
- Modify: `focus-trainer/src/core/stats.ts`
- Modify: `focus-trainer/src/core/stats.test.ts`
- Test: `focus-trainer/src/core/stats.test.ts`（新增 `describe` 块）

**Interfaces:**
- Consumes: `DayPlan`（`types.ts:102`）、`isPlanComplete(plan)`、`streak(plans, todayKey)`、`PLAN_SIZE`（`scheduler.ts:10,37,45`）、`dayKey(epochMs, dayStartHour)`（`daykey.ts:10`）、`addDays`
- Produces: `CalendarStatus` / `CalendarCell` / `calendarCells(plans, todayKey, weeks?)` / `CALENDAR_WEEKS`

- [ ] **Step 1: 写失败的测试**

改 `focus-trainer/src/core/stats.test.ts` 顶部的 import（Task 2 写的 `./daykey`、`./stats`、`./types` 三行整段替换成下面第一段，`vitest` 那行原样留着），并在文件末尾追加两个 `describe`：

```ts
import { addDays, dayKey } from './daykey';
import { streak } from './scheduler';
import {
  CALENDAR_WEEKS,
  RADAR_RECENT,
  SERIES_DAYS,
  calendarCells,
  dailyAbilitySeries,
  latestAbility,
  radarAxes,
} from './stats';
import type { DayPlan, GameId, GameModule, SessionRecord } from './types';
```

```ts
// 与 daykey.test.ts 同形：用本地时间构造器（dayKey 本身就按本地墙上小时分界），
// 不要 new Date('2026-10-18T02:00:00Z')，那是 UTC，会把分界测成假绿。
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const planOf = (dayKeyStr: string, games: GameId[], completed: GameId[]): DayPlan => ({
  dayKey: dayKeyStr,
  games,
  completed,
});

describe('04:00 日界（趋势页最容易踩的坑）', () => {
  it('凌晨 02:00 的单算前一天，04:30 才算当天', () => {
    const early = at(2026, 10, 18, 2, 0);
    const late = at(2026, 10, 18, 4, 30);
    expect(dayKey(early, 4)).toBe('2026-10-17');
    expect(dayKey(late, 4)).toBe('2026-10-18');

    const series = dailyAbilitySeries(
      [session('schulte', dayKey(early, 4), 60, early), session('schulte', dayKey(late, 4), 80, late)],
      '2026-10-18',
      'schulte',
    );
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    expect(last).toEqual({ dayKey: '2026-10-18', ability: 80, sessions: 1 });
    expect(prev).toEqual({ dayKey: '2026-10-17', ability: 60, sessions: 1 });
  });

  it('分界改成 06:00 时，04:30 的那单回落到前一天', () => {
    const ts = at(2026, 10, 18, 4, 30);
    expect(dayKey(ts, 6)).toBe('2026-10-17');
    const cells = calendarCells([planOf('2026-10-17', ['schulte'], ['schulte'])], '2026-10-18');
    expect(cells.find((c) => c.dayKey === '2026-10-17')!.status).toBe('done');
    expect(cells.find((c) => c.dayKey === '2026-10-18')!.status).toBe('empty');
  });
});

describe('calendarCells', () => {
  // 2026-10-18 是周日，2026-10-21 是周三（本仓已有的日期事实，别改成运行时的「今天」）
  it('恒 weeks*7 格，周一开头，最后一行含今天，今天之后是 future', () => {
    const cells = calendarCells([], '2026-10-21');
    expect(cells).toHaveLength(CALENDAR_WEEKS * 7);
    expect(cells[0].dayKey).toBe('2026-09-21');
    expect(cells[0].weekday).toBe(0);
    expect(cells[30]).toEqual({ dayKey: '2026-10-21', weekday: 2, status: 'empty' });
    expect(cells.slice(31).every((c) => c.status === 'future')).toBe(true);
    expect(cells[34].dayKey).toBe('2026-10-25');
    expect(calendarCells([], '2026-10-18', 1)).toHaveLength(7);
  });

  it('今天是周日时没有 future 格；周三时有 4 格', () => {
    expect(calendarCells([], '2026-10-18').filter((c) => c.status === 'future')).toHaveLength(0);
    expect(calendarCells([], '2026-10-21').filter((c) => c.status === 'future')).toHaveLength(4);
  });

  it('done / partial / empty 三态由 scheduler.isPlanComplete 决定，不在这里重实现完成判定', () => {
    const plans = [
      planOf('2026-10-16', ['schulte', 'stroop', 'seqmem'], ['schulte', 'stroop', 'seqmem']),
      planOf('2026-10-17', ['schulte', 'stroop', 'seqmem'], ['schulte']),
    ];
    const cells = calendarCells(plans, '2026-10-18');
    expect(cells.find((c) => c.dayKey === '2026-10-16')!.status).toBe('done');
    expect(cells.find((c) => c.dayKey === '2026-10-17')!.status).toBe('partial');
    expect(cells.find((c) => c.dayKey === '2026-10-15')!.status).toBe('empty');
  });

  it('与连续打卡同一套口径：日历里最近的连续 done 数 === streak()', () => {
    const plans = [
      planOf('2026-10-15', ['schulte'], ['schulte']),
      planOf('2026-10-16', ['schulte'], ['schulte']),
      planOf('2026-10-17', ['schulte'], ['schulte']),
      planOf('2026-10-18', ['schulte'], []),
    ];
    expect(streak(plans, '2026-10-18')).toBe(3);
    expect(calendarCells(plans, '2026-10-18').filter((c) => c.status === 'done')).toHaveLength(3);
  });

  it('weeks < 1 抛 RangeError', () => {
    expect(() => calendarCells([], '2026-10-18', 0)).toThrow(RangeError);
  });

  it('5 周输出恒 35 格，与计划条数无关（有界）', () => {
    const many: DayPlan[] = [];
    for (let i = 0; i < 200; i++) many.push(planOf(addDays('2026-10-18', -i), ['schulte'], ['schulte']));
    expect(calendarCells(many, '2026-10-18')).toHaveLength(35);
  });
});
```

- [ ] **Step 2: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/stats.test.ts`
Expected: FAIL —— `SyntaxError: The requested module './stats' does not provide an export named 'CALENDAR_WEEKS'`（Task 2 的 12 个测试此刻也跑不起来，整个文件红）

- [ ] **Step 3: 写实现**

`focus-trainer/src/core/stats.ts` 顶部已经有 `import { addDays } from './daykey';` 和 `import type { GameId, GameModule, SessionRecord } from './types';`（Task 2 Step 3 写的两行）。**别再补一遍同名绑定**——ESM 同一模块作用域里声明两次 `addDays` 会在加载阶段就 `SyntaxError: Identifier 'addDays' has already been declared`，Task 2 的 12 条测试会被一起拖红。这里只做两件事：把 `./types` 那行**整行替换**成下面第一条，再在它上面插入第二条。

```ts
import type { DayPlan, GameId, GameModule, SessionRecord } from './types';
```

```ts
import { isPlanComplete } from './scheduler';
```

```ts
export const CALENDAR_WEEKS = 5;

export type CalendarStatus = 'done' | 'partial' | 'empty' | 'future';

export interface CalendarCell {
  dayKey: string;
  weekday: number;
  status: CalendarStatus;
}

// 正午构造：与 daykey.ts 的 formatLocal/addDays 同一手法，避开夏令时切换日 00:00 不存在的情况。
function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

// weekday：0 = 周一 … 6 = 周日（列顺序按 一二三四五六日）
function weekdayOf(key: string): number {
  return (parseKey(key).getDay() + 6) % 7;
}

export function calendarCells(
  plans: readonly DayPlan[],
  todayKey: string,
  weeks = CALENDAR_WEEKS,
): CalendarCell[] {
  if (!Number.isInteger(weeks) || weeks < 1) throw new RangeError(`weeks must be >= 1: ${weeks}`);
  const byKey = new Map(plans.map((p) => [p.dayKey, p]));
  const start = addDays(todayKey, -weekdayOf(todayKey) - 7 * (weeks - 1));
  const cells: CalendarCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const key = addDays(start, i);
    const plan = byKey.get(key);
    // YYYY-MM-DD 的字典序 == 时间序（dayKey.ts 已补零），所以这里可以直接比字符串。
    const status: CalendarStatus =
      key > todayKey ? 'future' : plan === undefined ? 'empty' : isPlanComplete(plan) ? 'done' : 'partial';
    cells.push({ dayKey: key, weekday: i % 7, status });
  }
  return cells;
}
```

- [ ] **Step 4: 跑到它通过**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/core/stats.test.ts && npx tsc --noEmit`
Expected: 20 个测试通过（Task 2 的 12 + 本任务 8：04:00 日界 2 + `calendarCells` 6）；`tsc` 干净。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练"
git add focus-trainer/src/core/stats.ts focus-trainer/src/core/stats.test.ts
git commit -m "feat(stats): 5 周打卡日历与 04:00 日界分桶钉子"
```

---

### Task 4: `src/ui/charts.ts` 的几何纯函数（无 DOM）

**Files:**
- Create: `focus-trainer/src/ui/charts.ts`
- Test: `focus-trainer/src/ui/charts.test.ts`

**Interfaces:**
- Consumes: `DayPoint`、`RadarAxis`、`CalendarCell`、`CalendarStatus`（Task 2/3）、`GameId`
- Produces: `PlotBox` / `Point2` / `LineVertex` / `CalendarRect` / `PAD` / `LINE_MIN_POINTS` / `polarPoint` / `radarOutline` / `lineX` / `lineY` / `lineVertices` / `lineRuns` / `calendarRects`

- [ ] **Step 1: 写失败的测试**

新建 `focus-trainer/src/ui/charts.test.ts`（本任务只测纯几何，**不碰 DOM**，所以不需要桩）：

```ts
import { describe, expect, it } from 'vitest';
import type { DayPoint, CalendarCell, CalendarStatus } from '../core/stats';
import {
  LINE_MIN_POINTS,
  PAD,
  calendarRects,
  lineRuns,
  lineVertices,
  lineX,
  lineY,
  polarPoint,
  radarOutline,
  type PlotBox,
} from './charts';

const BOX: PlotBox = { x: 0, y: 0, w: 200, h: 100 };
const near = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

const point = (dayKey: string, ability: number | null): DayPoint => ({ dayKey, ability, sessions: ability === null ? 0 : 1 });

describe('polarPoint / radarOutline', () => {
  it('0 号轴指向正上方，其后顺时针', () => {
    near(polarPoint(50, 50, 10, 0, 4), 50, 40);
    near(polarPoint(50, 50, 10, 1, 4), 60, 50);
    near(polarPoint(50, 50, 10, 2, 4), 50, 60);
    near(polarPoint(50, 50, 10, 3, 4), 40, 50);
  });

  it('满值落在半径上，零值落在圆心', () => {
    const full = polarPoint(50, 50, 40 * (100 / 100), 0, 5);
    near(full, 50, 10);
    near(polarPoint(50, 50, 40 * (0 / 100), 0, 5), 50, 50);
  });

  it('count >= 3 画出 count 个顶点；1 轴与 2 轴降级成空串（画不出闭合多边形）', () => {
    expect(radarOutline([100, 100, 100], 3, 50, 50, 10).split(' ')).toHaveLength(3);
    expect(radarOutline([100, 0, 50], 3, 50, 50, 10).split(' ')).toHaveLength(3);
    expect(radarOutline([100], 1, 50, 50, 10)).toBe('');
    expect(radarOutline([100, 50], 2, 50, 50, 10)).toBe('');
    expect(radarOutline([], 0, 50, 50, 10)).toBe('');
  });

  it('values 长度与 count 不一致是调用方 bug，直接 RangeError', () => {
    expect(() => radarOutline([100, 100], 5, 50, 50, 10)).toThrow(RangeError);
  });

  it('超出 [0,100] 的入参被夹进半径，不会画出图框外的顶点', () => {
    expect(radarOutline([150, -20], 2, 50, 50, 10)).toBe('');
    const pts = radarOutline([150, 100, -20], 3, 50, 50, 10).split(' ');
    expect(pts[0]).toBe(pts[1]);
  });
});

describe('lineX / lineY / lineRuns', () => {
  it('横轴按 30 格等距铺开，首尾贴住内边距', () => {
    expect(lineX(0, 30, BOX)).toBe(PAD);
    expect(lineX(29, 30, BOX)).toBe(BOX.w - PAD);
    expect(lineX(1, 30, BOX)).toBeGreaterThan(lineX(0, 30, BOX));
    expect(lineX(0, 1, BOX)).toBe(PAD + (BOX.w - 2 * PAD) / 2);
  });

  it('纵轴固定 0–100，不自动缩放；越界入参夹在框内', () => {
    expect(lineY(100, BOX)).toBe(PAD);
    expect(lineY(0, BOX)).toBe(BOX.h - PAD);
    expect(lineY(50, BOX)).toBeCloseTo(BOX.h / 2, 6);
    expect(lineY(150, BOX)).toBe(PAD);
    expect(lineY(-30, BOX)).toBe(BOX.h - PAD);
  });

  it('LINE_MIN_POINTS === 2', () => {
    expect(LINE_MIN_POINTS).toBe(2);
  });

  it('全空窗口既没有折线也没有点', () => {
    const pts = [point('2026-10-01', null), point('2026-10-02', null), point('2026-10-03', null)];
    expect(lineVertices(pts, BOX)).toEqual([]);
    expect(lineRuns(pts, BOX)).toEqual([]);
  });

  it('单日一个点只出圆点不出折线；缺口把线断成多段（不跨缺口连线）', () => {
    const lone = [point('2026-10-01', null), point('2026-10-02', 40), point('2026-10-03', null)];
    expect(lineRuns(lone, BOX)).toEqual([]);
    expect(lineVertices(lone, BOX)).toHaveLength(1);

    const gapped = [point('a', 10), point('b', 20), point('c', null), point('d', 40), point('e', 50)];
    const runs = lineRuns(gapped, BOX);
    expect(runs).toHaveLength(2);
    expect(runs[0].map((v) => v.dayKey)).toEqual(['a', 'b']);
    expect(runs[1].map((v) => v.dayKey)).toEqual(['d', 'e']);
    expect(runs[0][0].ability).toBe(10);
  });

  it('点数有界：600 条历史进来也只有 30 个可画点', () => {
    const pts: DayPoint[] = [];
    for (let i = 0; i < 30; i++) pts.push(point(`d${i}`, i % 101));
    expect(lineVertices(pts, BOX)).toHaveLength(30);
    expect(lineRuns(pts, BOX).reduce((n, r) => n + r.length, 0)).toBeLessThanOrEqual(30);
  });
});

describe('calendarRects', () => {
  const cell = (dayKey: string, status: CalendarStatus): CalendarCell => ({ dayKey, weekday: 0, status });
  const cells = Array.from({ length: 35 }, (_, i) => cell(`k${i}`, i % 2 ? 'empty' : 'done'));

  it('周一开头、按行推进，位置 = 列*(size+gap)', () => {
    const rects = calendarRects(cells, { x: 4, y: 6 }, 20, 2);
    expect(rects).toHaveLength(35);
    expect(rects[0]).toMatchObject({ x: 4, y: 6, size: 20, dayKey: 'k0', status: 'done' });
    expect(rects[1]).toMatchObject({ x: 26, y: 6 });
    expect(rects[7]).toMatchObject({ x: 4, y: 28 });
    expect(rects[34]).toMatchObject({ x: 4 + 6 * 22, y: 6 + 4 * 22 });
  });

  it('格子数恒等于入参长度，不做二次扩展（上限由 calendarCells 保证 35）', () => {
    expect(calendarRects(cells.slice(0, 7), { x: 0, y: 0 }, 12, 2)).toHaveLength(7);
    expect(calendarRects([], { x: 0, y: 0 }, 12, 2)).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/charts.test.ts`
Expected: FAIL —— `Failed to resolve import "./charts" from "src/ui/charts.test.ts". Does the file exist?`

- [ ] **Step 3: 写实现**

新建 `focus-trainer/src/ui/charts.ts`（本任务只写几何部分，Task 5 再往同一文件追加 SVG 构建）：

```ts
import type { CalendarCell, CalendarStatus, DayPoint } from '../core/stats';

// 图表全部手写：Vitest 跑在 node（无 jsdom），所以「数据 → 坐标」先做成纯函数，
// 「坐标 → SVG 节点」单独一层，纯几何这层不需要任何 DOM 桩就能测干净。
export const PAD = 8;
export const LINE_MIN_POINTS = 2;

export interface PlotBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point2 {
  x: number;
  y: number;
}

export interface LineVertex extends Point2 {
  dayKey: string;
  ability: number;
}

export interface CalendarRect extends Point2 {
  size: number;
  dayKey: string;
  status: CalendarStatus;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// 0 号轴朝上（-90°），之后顺时针：五轴时最上面那根正好是第一个注册的游戏。
export function polarPoint(cx: number, cy: number, r: number, index: number, count: number): Point2 {
  const angle = (Math.PI * 2 * index) / Math.max(1, count) - Math.PI / 2;
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function radarOutline(values: readonly number[], count: number, cx: number, cy: number, radius: number): string {
  if (values.length !== count) throw new RangeError(`radar values/count mismatch: ${values.length} vs ${count}`);
  // M2 未合并时只有 1 个注册游戏，1 轴 / 2 轴画不出闭合多边形：返回空串，
  // 降级成「单根轴 + 数值」由 createRadarChart 负责（Task 5 有断言）。
  if (count < 3) return '';
  return values
    .map((v, i) => polarPoint(cx, cy, radius * clamp01(v / 100), i, count))
    .map((p) => `${p.x},${p.y}`)
    .join(' ');
}

export function lineX(i: number, count: number, box: PlotBox): number {
  const inner = box.w - 2 * PAD;
  if (count <= 1) return box.x + PAD + inner / 2;
  return box.x + PAD + (inner * i) / (count - 1);
}

// 纵轴固定 0–100（ability 的构造值域），不自动缩放：自动缩放会把「40→45」画成翻倍。
export function lineY(ability: number, box: PlotBox): number {
  const inner = box.h - 2 * PAD;
  return box.y + PAD + inner * (1 - clamp01(ability / 100));
}

function vertexAt(p: DayPoint, i: number, count: number, box: PlotBox): LineVertex {
  return { x: lineX(i, count, box), y: lineY(p.ability as number, box), dayKey: p.dayKey, ability: p.ability as number };
}

export function lineVertices(points: readonly DayPoint[], box: PlotBox): LineVertex[] {
  return points.flatMap((p, i) => (p.ability === null ? [] : [vertexAt(p, i, points.length, box)]));
}

// 缺口断线：null 的日子不占顶点，也不允许把左右两段连成一条 —— 连起来就是「编出一条没练过的周也有趋势」的假数据。
export function lineRuns(points: readonly DayPoint[], box: PlotBox): LineVertex[][] {
  const runs: LineVertex[][] = [];
  let cur: LineVertex[] = [];
  points.forEach((p, i) => {
    if (p.ability === null) {
      if (cur.length >= LINE_MIN_POINTS) runs.push(cur);
      cur = [];
      return;
    }
    cur.push(vertexAt(p, i, points.length, box));
  });
  if (cur.length >= LINE_MIN_POINTS) runs.push(cur);
  return runs;
}

export function calendarRects(cells: readonly CalendarCell[], origin: Point2, size: number, gap: number): CalendarRect[] {
  return cells.map((c, i) => ({
    x: origin.x + (i % 7) * (size + gap),
    y: origin.y + Math.floor(i / 7) * (size + gap),
    size,
    dayKey: c.dayKey,
    status: c.status,
  }));
}
```

`radarOutline` 那条 `expect(radarOutline([150, -20], 2, …)).toBe('')` 是先验证「2 轴直接降级、不做夹取画图」，夹取本身由 `lineY(150)` / `lineY(-30)` 两条断言覆盖，别把它理解成雷达也接受越界。

- [ ] **Step 4: 跑到它通过**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/charts.test.ts && npx tsc --noEmit`
Expected: 13 个测试通过（`polarPoint`/`radarOutline` 5 + 折线几何 6 + `calendarRects` 2）；`tsc` 干净。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练"
git add focus-trainer/src/ui/charts.ts focus-trainer/src/ui/charts.test.ts
git commit -m "feat(charts): 雷达/折线/日历的图表几何纯函数"
```

---

### Task 5: 手写 SVG 图表构建（`createElementNS`）

**Files:**
- Modify: `focus-trainer/src/ui/charts.ts`
- Modify: `focus-trainer/src/ui/charts.test.ts`

**Interfaces:**
- Consumes: Task 4 的全部几何函数；`RadarAxis`（Task 2）、`DayPoint`（Task 2）、`CalendarCell` / `CalendarStatus`（Task 3）
- Produces: `SVG_NS`、`createRadarChart(axes: readonly RadarAxis[], size: number): SVGSVGElement`、`createLineChart(points: readonly DayPoint[], width: number, height: number): SVGSVGElement`、`createCalendarChart(cells: readonly CalendarCell[], cell: number, gap: number): SVGSVGElement`、`STATUS_TEXT`

- [ ] **Step 1: 写失败的测试**

`focus-trainer/src/ui/charts.test.ts`：把首行 import 换成下面这行（`afterEach / vi` 是新加的），把 `'./charts'` 那条 import 整段换成下面第二条（新增 5 个导出），然后在文件末尾追加一节。桩的形状照 `src/games/schulte/view.test.ts`：手写、零依赖、只实现本文件用得到的那几件（`createElementNS` / `setAttribute` / `append` / `textContent`）。

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
```

```ts
import {
  LINE_MIN_POINTS,
  PAD,
  SVG_NS,
  calendarRects,
  createCalendarChart,
  createLineChart,
  createRadarChart,
  lineRuns,
  lineVertices,
  lineX,
  lineY,
  polarPoint,
  radarOutline,
  STATUS_TEXT,
  type PlotBox,
} from './charts';
```

```ts
class StubSvg {
  readonly children: StubSvg[] = [];
  readonly attrs: Record<string, string> = {};
  textContent = '';

  constructor(readonly ns: string | null, readonly tag: string) {}

  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }

  append(...nodes: StubSvg[]): void {
    this.children.push(...nodes);
  }

  descendants(): StubSvg[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }

  withClass(cls: string): StubSvg[] {
    return this.descendants().filter((d) => (d.attrs.class ?? '').split(' ').includes(cls));
  }
}

// nsCalls 记录每一次 createElementNS 的命名空间参数：M4 的离线审计（Task 7）只放行 w3.org，
// 所以「除了 SVG_NS 之外没有任何 http(s) 字符串」必须由这里在合并前就钉住。
const nsCalls: Array<[string, string]> = [];

function installSvgDom(): void {
  nsCalls.length = 0;
  vi.stubGlobal('document', {
    createElement: (tag: string) => new StubSvg(null, tag),
    createElementNS: (ns: string, tag: string) => {
      nsCalls.push([ns, tag]);
      return new StubSvg(ns, tag);
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

const axis = (label: string, ability: number, practiced = true) => ({
  gameId: 'schulte' as const,
  label,
  ability,
  practiced,
});

describe('SVG 构建', () => {
  it('只用 SVG 命名空间建节点，产物里除 SVG_NS 外没有任何 http(s) 字符串', () => {
    installSvgDom();
    const cal = createCalendarChart([
      { dayKey: '2026-10-18', weekday: 0, status: 'done' },
      { dayKey: '2026-10-19', weekday: 1, status: 'future' },
    ], 20, 2);
    expect(SVG_NS).toBe('http://www.w3.org/2000/svg');
    expect(nsCalls.length).toBeGreaterThan(0);
    expect([...new Set(nsCalls.map(([ns]) => ns))]).toEqual([SVG_NS]);
    const urls = [cal, ...cal.descendants()].flatMap((n) => Object.values(n.attrs)).filter((v) => /https?:\/\//.test(v));
    expect(urls).toEqual([]);
  });

  it('五轴雷达：4 圈网格 + 5 根轴 + 1 个数据多边形 + 5 个点 + 5 个标签', () => {
    installSvgDom();
    const g = createRadarChart([axis('持续注意', 80), axis('选择性注意', 60), axis('视觉工作记忆', 40), axis('动态视觉', 20), axis('闭合识别', 0, false)], 220);
    expect(g.attrs.viewBox).toBe('0 0 220 220');
    expect(g.withClass('chart-ring')).toHaveLength(4);
    expect(g.withClass('chart-spoke')).toHaveLength(5);
    expect(g.withClass('chart-dot')).toHaveLength(5);
    expect(g.withClass('chart-shape')).toHaveLength(1);
    expect(g.withClass('chart-shape')[0].attrs.points.split(' ')).toHaveLength(5);
    const labels = g.withClass('chart-label').map((l) => l.textContent);
    expect(labels[0]).toBe('持续注意 80');
    // spec:318 从没练过显示 0 并标注「未练」
    expect(labels[4]).toBe('闭合识别 未练');
  });

  it('M2 未合并时只有 1 个注册游戏：降级成一根轴 + 一个点 + 一个标签，不画多边形也不画网格圈', () => {
    installSvgDom();
    const g = createRadarChart([axis('持续注意', 80)], 220);
    expect(g.withClass('chart-shape')).toHaveLength(0);
    expect(g.withClass('chart-ring')).toHaveLength(0);
    expect(g.withClass('chart-spoke')).toHaveLength(1);
    expect(g.withClass('chart-dot')).toHaveLength(1);
    expect(g.withClass('chart-label')[0].textContent).toBe('持续注意 80');
    // 单轴时 0 号轴朝上：点落在圆心正上方（110,110）与 (110,110-radius*0.8) 之间
    const dot = g.withClass('chart-dot')[0];
    expect(Number(dot.attrs.cx)).toBeCloseTo(110, 6);
    expect(Number(dot.attrs.cy)).toBeLessThan(110);
    const none = createRadarChart([axis('持续注意', 0, false)], 220);
    expect(none.withClass('chart-label')[0].textContent).toBe('持续注意 未练');
    expect(Number(none.withClass('chart-dot')[0].attrs.cy)).toBeCloseTo(110, 6); // 0 分正好在圆心
  });

  it('两轴时也不画多边形（否则三个以下顶点会画出一条自交假形）', () => {
    installSvgDom();
    const g = createRadarChart([axis('持续注意', 50), axis('选择性注意', 50)], 220);
    expect(g.withClass('chart-shape')).toHaveLength(0);
    expect(g.withClass('chart-spoke')).toHaveLength(2);
  });

  it('折线：30 天有缺口时按段画 polyline，点数不超 30', () => {
    installSvgDom();
    const pts: DayPoint[] = [];
    for (let i = 0; i < 30; i++) pts.push({ dayKey: `2026-09-0${(i % 9) + 1}`, ability: i === 3 ? null : i * 3, sessions: 1 });
    const g = createLineChart(pts, 320, 140);
    expect(g.withClass('chart-grid')).toHaveLength(2);
    expect(g.withClass('chart-axis')).toHaveLength(1);
    // i=3 的空缺把 30 天切成两段（polyline 的 class 是 chart-series）
    expect(g.withClass('chart-series')).toHaveLength(2);
    expect(g.withClass('chart-dot')).toHaveLength(29);
    expect(g.attrs['aria-label']).toBe('近 30 天能力曲线');
  });

  it('只有一个数据点时只画圆点，不画折线（否则一条零长度线会被当成平台趋势）', () => {
    installSvgDom();
    const pts: DayPoint[] = [
      { dayKey: '2026-10-17', ability: null, sessions: 0 },
      { dayKey: '2026-10-18', ability: 62, sessions: 1 },
    ];
    const g = createLineChart(pts, 320, 140);
    expect(g.withClass('polyline')).toHaveLength(0);
    expect(g.withClass('chart-dot')).toHaveLength(1);
    expect(g.withClass('chart-tick').map((t) => t.textContent)).toEqual(['10-17', '10-18']);
  });

  it('日历：一格一个 rect + 一个 title，class 带状态、data-daykey 可查', () => {
    installSvgDom();
    const cells: CalendarCell[] = Array.from({ length: 35 }, (_, i) => ({
      dayKey: `2026-09-${String(i + 1).padStart(2, '0')}`,
      weekday: i % 7,
      status: i === 0 ? 'done' : i === 1 ? 'partial' : i === 2 ? 'future' : 'empty',
    }));
    const g = createCalendarChart(cells, 20, 2);
    expect(g.withClass('cal')).toHaveLength(35);
    expect(g.withClass('cal-done')).toHaveLength(1);
    expect(g.withClass('cal-partial')).toHaveLength(1);
    expect(g.withClass('cal-future')).toHaveLength(1);
    expect(g.withClass('cal-empty')).toHaveLength(32);
    expect(g.withClass('title')).toHaveLength(35);
    expect(g.withClass('title')[0].textContent).toBe(`2026-09-01　${STATUS_TEXT.done}`);
    expect(g.withClass('cal')[0].attrs['data-daykey']).toBe('2026-09-01');
  });

  it('三张图都不注册任何监听（趋势页是静态图，不留摘除负担）', () => {
    installSvgDom();
    const nodes = [
      createRadarChart([axis('持续注意', 1)], 220),
      createLineChart([{ dayKey: '2026-10-18', ability: 1, sessions: 1 }], 320, 140),
      createCalendarChart([{ dayKey: '2026-10-18', weekday: 0, status: 'done' }], 20, 2),
    ];
    expect(nodes.flatMap((n) => [n, ...n.descendants()]).some((d) => 'addEventListener' in d)).toBe(false);
  });

  it('零记录时三张图各自仍可构建，不抛错、不产出 NaN 坐标', () => {
    installSvgDom();
    const charts = [
      createRadarChart([], 220),
      createLineChart([], 320, 140),
      createCalendarChart([], 20, 2),
    ];
    const bad = charts
      .flatMap((c) => [c, ...c.descendants()])
      .flatMap((n) => Object.values(n.attrs))
      .filter((v) => v.includes('NaN'));
    expect(bad).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/charts.test.ts`
Expected: FAIL —— `SyntaxError: The requested module './charts' does not provide an export named 'SVG_NS'`。SVG 这 9 条与 Task 4 的 13 条几何用例同在 `charts.test.ts`，加载期报错会把 22 条一起拖红——这是预期的整文件失败，不是几何回归，不要去改 Task 4 的实现。

- [ ] **Step 3: 写实现**

在 `focus-trainer/src/ui/charts.ts` 顶部补 `RadarAxis` / `CalendarCell` 之外的类型 import（本文件已有的 `import type { CalendarCell, CalendarStatus, DayPoint } from '../core/stats';` 整段替换成下面这行），并在文件末尾追加：

```ts
import type { CalendarCell, CalendarStatus, DayPoint, RadarAxis } from '../core/stats';
```

```ts
// 全工程唯一一条长得像外部地址的字符串：SVG 命名空间。M4 的离线审计（Task 7）allowlist 只认 w3.org，
// 这一条放行；任何 CDN / localhost / 字体 / 图标 URL 出现即为违反本计划 Global Constraints。
export const SVG_NS = 'http://www.w3.org/2000/svg';

function make(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const f = (n: number): string => n.toFixed(2);
const toPoints = (vs: readonly LineVertex[]): string => vs.map((v) => `${f(v.x)},${f(v.y)}`).join(' ');

const RINGS = [25, 50, 75, 100];

export function createRadarChart(axes: readonly RadarAxis[], size: number): SVGSVGElement {
  const count = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.max(10, size / 2 - 26);
  const root = make('svg', {
    viewBox: `0 0 ${size} ${size}`,
    class: 'chart chart-radar',
    role: 'img',
    'aria-label': `能力雷达，${count} 个维度`,
  }) as SVGSVGElement;

  // count < 3 时 radarOutline 返回空串：画不出闭合多边形，也不硬凑一个自交假形。
  if (count >= 3) {
    for (const q of RINGS) {
      root.append(make('polygon', { points: radarOutline(Array.from({ length: count }, () => q), count, cx, cy, radius), class: 'chart-ring' }));
    }
  }
  axes.forEach((a, i) => {
    const tip = polarPoint(cx, cy, radius, i, count);
    root.append(make('line', { x1: f(cx), y1: f(cy), x2: f(tip.x), y2: f(tip.y), class: 'chart-spoke' }));
  });
  if (count >= 3) {
    root.append(make('polygon', { points: radarOutline(axes.map((a) => a.ability), count, cx, cy, radius), class: 'chart-shape' }));
  }
  axes.forEach((a, i) => {
    const p = polarPoint(cx, cy, radius * clamp01(a.ability / 100), i, count);
    root.append(make('circle', { cx: f(p.x), cy: f(p.y), r: 3, class: 'chart-dot' }));
  });
  axes.forEach((a, i) => {
    const lab = polarPoint(cx, cy, radius + 14, i, count);
    const t = make('text', { x: f(lab.x), y: f(lab.y), class: 'chart-label' });
    t.textContent = a.practiced ? `${a.label} ${a.ability}` : `${a.label} 未练`;
    root.append(t);
  });
  return root;
}

export function createLineChart(points: readonly DayPoint[], width: number, height: number): SVGSVGElement {
  const box: PlotBox = { x: 0, y: 0, w: width, h: height };
  const root = make('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'chart chart-line',
    role: 'img',
    'aria-label': '近 30 天能力曲线',
  }) as SVGSVGElement;
  for (const q of [0, 50, 100]) {
    const y = f(lineY(q, box));
    root.append(make('line', { x1: f(PAD), y1: y, x2: f(width - PAD), y2: y, class: q === 0 ? 'chart-axis' : 'chart-grid' }));
  }
  for (const run of lineRuns(points, box)) root.append(make('polyline', { points: toPoints(run), class: 'chart-series' }));
  for (const v of lineVertices(points, box)) root.append(make('circle', { cx: f(v.x), cy: f(v.y), r: 3, class: 'chart-dot' }));
  if (points.length > 0) {
    const anchor = (x: string, dayKey: string, textAnchor: string) => {
      const t = make('text', { x, y: f(height - 2), class: 'chart-tick', 'text-anchor': textAnchor });
      t.textContent = dayKey.slice(5);
      return t;
    };
    root.append(anchor(f(PAD), points[0].dayKey, 'start'));
    root.append(anchor(f(width - PAD), points[points.length - 1].dayKey, 'end'));
  }
  return root;
}

export const STATUS_TEXT: Record<CalendarStatus, string> = {
  done: '已打卡',
  partial: '练了一部分',
  empty: '没练',
  future: '还没到',
};

export function createCalendarChart(cells: readonly CalendarCell[], cell: number, gap: number): SVGSVGElement {
  const rows = Math.max(1, Math.ceil(cells.length / 7));
  const width = 7 * cell + 6 * gap;
  const height = rows * cell + (rows - 1) * gap;
  const root = make('svg', {
    viewBox: `0 0 ${f(width)} ${f(height)}`,
    class: 'chart chart-cal',
    role: 'img',
    'aria-label': `近 ${rows} 周打卡日历`,
  }) as SVGSVGElement;
  for (const r of calendarRects(cells, { x: 0, y: 0 }, cell, gap)) {
    // SVG 上的 class 必须走 setAttribute：SVGElement.className 是只读的 SVGAnimatedString。
    const rect = make('rect', {
      x: f(r.x),
      y: f(r.y),
      width: r.size,
      height: r.size,
      rx: 3,
      class: `cal cal-${r.status}`,
      'data-daykey': r.dayKey,
    });
    const title = make('title');
    title.textContent = `${r.dayKey}　${STATUS_TEXT[r.status]}`;
    rect.append(title);
    root.append(rect);
  }
  return root;
}
```

`expect(g.withClass('title')).toHaveLength(35)` 里 `<title>` 是 SVG 元素、由 `createElementNS` 创建，所以它同样落在 `SVG_NS` 白名单内；不要改成 `document.createElement('title')`（那会生成一个 HTML 元素，浏览器里 title 直接失效）。

- [ ] **Step 4: 跑到它通过**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/charts.test.ts && npx tsc --noEmit`
Expected: 22 个测试通过（几何 13 + SVG 9）；`tsc` 干净。

- [ ] **Step 5: 提交**

```bash
cd "E:/WORK/脑力训练"
git add focus-trainer/src/ui/charts.ts focus-trainer/src/ui/charts.test.ts
git commit -m "feat(charts): 手写 SVG 雷达/折线/日历构建（零依赖，命名空间白名单）"
```

---

### Task 6: 趋势页装配（三图 + 游戏切换 + 只读 + 有界）

**Files:**
- Modify: `focus-trainer/src/ui/pages/trends.ts`
- Modify: `focus-trainer/src/ui/pages/trends.test.ts`
- Modify: `focus-trainer/src/ui/styles.css`（趋势页版面）

**Interfaces:**
- Consumes: `ctx.repo.listSessions/listPlans`（`storage.ts:16,15`）、`dayKey`、`streak`、`isPlanComplete`、`radarAxes`、`dailyAbilitySeries`、`latestAbility`、`calendarCells`、`createRadarChart`、`createLineChart`、`createCalendarChart`、`STATUS_TEXT`、`GAMES`、`AppContext`
- Produces: 最终版 `renderTrends(view, ctx, signal, now?)`（Task 1 的骨架被整段替换）、常量 `EMPTY_RADAR` / `EMPTY_SERIES` / `EMPTY_CALENDAR` 保持字面不变

- [ ] **Step 1: 把页面测试整段换成最终版**

`focus-trainer/src/ui/pages/trends.test.ts` **整文件重写**为下面这份（Task 1 的 5 条断言里，「零记录三块空态」「abort 不渲染」「真 MemoryRepository 不写库」三条原样保留；「三个 trend-block 与三个 h2」保留并扩展；「`.trend-slot` 恰有 3 个」是骨架期的一次性结构断言，本任务起不再成立，删除并在提交信息里说明）。

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayKey } from '../../core/daykey';
import { MemoryRepository } from '../../core/storage';
import type { DayPlan, GameId, Repository, SessionRecord } from '../../core/types';
import { GAMES } from '../../games/registry';
import { EMPTY_CALENDAR, EMPTY_RADAR, EMPTY_SERIES, renderTrends } from './trends';

class StubEl {
  readonly children: StubEl[] = [];
  readonly attrs: Record<string, string> = {};
  readonly handlers: Array<[string, () => void]> = [];
  textContent = '';
  className = '';

  constructor(readonly tag: string) {}

  setAttribute(k: string, v: string): void {
    this.attrs[k] = v;
  }

  addEventListener(type: string, fn: () => void): void {
    this.handlers.push([type, fn]);
  }

  append(...nodes: (StubEl | string)[]): void {
    for (const n of nodes) {
      if (typeof n === 'string') {
        this.textContent += n;
        continue;
      }
      this.children.push(n);
    }
  }

  replaceChildren(...nodes: (StubEl | string)[]): void {
    this.children.length = 0;
    this.textContent = '';
    this.append(...nodes);
  }

  descendants(): StubEl[] {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }

  withClass(cls: string): StubEl[] {
    return this.descendants().filter((d) => (d.attrs.class ?? d.className).split(' ').includes(cls));
  }

  tagCount(tag: string): number {
    return this.descendants().filter((d) => d.tag === tag).length;
  }

  fire(type: string): void {
    for (const [t, fn] of this.handlers) if (t === type) fn();
  }
}

function installDom(): void {
  vi.stubGlobal('document', {
    createElement: (tag: string) => new StubEl(tag),
    createElementNS: (_ns: string, tag: string) => new StubEl(tag),
  });
}

afterEach(() => vi.unstubAllGlobals());

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

const session = (gameId: GameId, dayKeyStr: string, ability: number, startedAt = 1): SessionRecord => ({
  gameId,
  mode: 'plan',
  dayKey: dayKeyStr,
  startedAt,
  durationMs: 1000,
  startLevel: 1,
  endLevel: 1,
  rounds: [],
  summary: {},
  ability,
});

const planOf = (dayKeyStr: string, games: GameId[], completed: GameId[]): DayPlan => ({
  dayKey: dayKeyStr,
  games,
  completed,
});

function readOnlyRepo(sessions: SessionRecord[], plans: DayPlan[]): { repo: Repository; writes: string[] } {
  const writes: string[] = [];
  const deny = (name: string): Promise<never> => {
    writes.push(name);
    return Promise.reject(new Error(`趋势页不许写库：${name}`));
  };
  return {
    writes,
    repo: {
      listSessions: async () => sessions.slice(),
      listPlans: async () => plans.slice(),
      getPlan: async (k: string) => plans.find((p) => p.dayKey === k) ?? null,
      getSettings: async () => ({ dayStartHour: 4 }),
      getGameState: () => deny('getGameState'),
      listGameStates: () => deny('listGameStates'),
      lastSession: () => deny('lastSession'),
      getSession: () => deny('getSession'),
      putPlan: () => deny('putPlan'),
      saveSession: () => deny('saveSession'),
      putSettings: () => deny('putSettings'),
      clearAll: () => deny('clearAll'),
    },
  };
}

const NOW = at(2026, 10, 18, 12, 0);

async function render(sessions: SessionRecord[], plans: DayPlan[], opts: { aborted?: boolean; now?: number; dayStartHour?: number } = {}) {
  installDom();
  const { repo, writes } = readOnlyRepo(sessions, plans);
  const view = new StubEl('main');
  const ac = new AbortController();
  if (opts.aborted) ac.abort();
  await renderTrends(
    view as unknown as HTMLElement,
    { repo, storageOk: true, settings: { dayStartHour: opts.dayStartHour ?? 4 } },
    ac.signal,
    opts.now ?? NOW,
  );
  return { view, writes };
}

const texts = (view: StubEl): string[] => view.descendants().map((d) => d.textContent);

describe('趋势页空态', () => {
  it('零记录时三块各自给出中文空态文案，且一次写库都没有', async () => {
    const { view, writes } = await render([], []);
    expect(writes).toEqual([]);
    expect(texts(view)).toContain('趋势');
    expect(texts(view)).toContain(EMPTY_RADAR);
    expect(texts(view)).toContain(EMPTY_SERIES);
    expect(texts(view)).toContain(EMPTY_CALENDAR);
    expect(view.children.filter((c) => c.className === 'trend-block')).toHaveLength(3);
    expect(view.children).toHaveLength(5); // row、统计行、3 个 section
  });

  it('signal 已 abort 时什么都不渲染', async () => {
    const { view } = await render([], [], { aborted: true });
    expect(view.children).toHaveLength(0);
  });

  it('真 MemoryRepository 跑一遍也不写库', async () => {
    installDom();
    const repo = new MemoryRepository();
    await renderTrends(
      new StubEl('main') as unknown as HTMLElement,
      { repo, storageOk: true, settings: { dayStartHour: 4 } },
      new AbortController().signal,
      NOW,
    );
    expect(await repo.listSessions()).toEqual([]);
    expect(await repo.listPlans()).toEqual([]);
  });

  it('计划进行中照样能进：今天 partial 不拦截、不补计划、日历今天显示为 partial', async () => {
    const { view, writes } = await render([], [
      planOf('2026-10-17', ['schulte'], ['schulte']),
      planOf('2026-10-18', ['schulte', 'stroop'], ['schulte']),
    ]);
    expect(writes).toEqual([]);
    const today = view.withClass('cal').find((c) => c.attrs['data-daykey'] === '2026-10-18')!;
    expect(today.attrs.class).toBe('cal cal-partial');
  });
});

describe('趋势页三张图', () => {
  it('雷达轴数恒等于注册表长度（M2 未合并是 1，合并后是 5）', async () => {
    const { view } = await render([session('schulte', '2026-10-18', 60)], []);
    expect(view.withClass('chart-radar')).toHaveLength(1);
    expect(view.withClass('chart-radar')[0].attrs['aria-label']).toBe(`能力雷达，${GAMES.length} 个维度`);
    expect(view.withClass('chart-spoke')).toHaveLength(GAMES.length);
    expect(view.withClass('chart-label').map((l) => l.textContent)).toEqual([
      ...(GAMES[0]?.ability ? [`${GAMES[0].ability} 60`] : []),
      ...GAMES.slice(1).map((g) => `${g.ability} 未练`),
    ]);
  });

  it('曲线默认选中「有成绩的那个游戏」', async () => {
    const { view } = await render([session('schulte', '2026-10-18', 60)], []);
    expect(view.withClass('chart-line')).toHaveLength(1);
    expect(view.withClass('chart-dot')).toHaveLength(1);
    expect(texts(view)).not.toContain(EMPTY_SERIES);
    // 曲线下方一行「最近一次 N」，取的是 latestAbility（最后一条记录），不是 30 天里的最大值
    expect(texts(view).some((t) => t === '最近一次 60')).toBe(true);
  });

  it('页签来自 GAMES，点一次只重画曲线，不重读库、不写库', async () => {
    const { view, writes } = await render([session('schulte', '2026-10-18', 60)], []);
    const tabs = view.withClass('tab');
    expect(tabs).toHaveLength(GAMES.length);
    expect(tabs[0].className).toBe('tab tab-on');
    tabs[0].fire('click');
    expect(writes).toEqual([]);
    expect(view.withClass('chart-line')).toHaveLength(1);
  });

  it('日历恒 35 格 + 三图例，且 today 之后是 future', async () => {
    const { view } = await render([session('schulte', '2026-10-18', 60)], [planOf('2026-10-17', ['schulte'], ['schulte'])]);
    expect(view.withClass('cal')).toHaveLength(35);
    expect(view.withClass('legend')).toHaveLength(3);
    expect(view.withClass('cal-future')).toHaveLength(0); // 2026-10-18 是周日，一周的最后格
  });

  it('04:00 分界：中午 12 点打开时今天 = 10-18，凌晨 2 点打开时今天 = 10-17', async () => {
    expect(dayKey(at(2026, 10, 18, 2, 0), 4)).toBe('2026-10-17');
    // 给一条历史上的已完成计划，日历才会出图（没打过卡时这一格位置显示文案）。
    const past = planOf('2026-09-20', ['schulte'], ['schulte']);
    const { view } = await render([], [past], { now: at(2026, 10, 18, 2, 0) });
    const cells = view.withClass('cal');
    expect(cells).toHaveLength(35);
    expect(cells[cells.length - 1].attrs['data-daykey']).toBe('2026-10-18');
    expect(cells[cells.length - 1].attrs.class).toBe('cal cal-future');
    expect(cells.some((c) => c.attrs['data-daykey'] === '2026-10-19')).toBe(false);
  });

  it('分界时间设成 6 点时，凌晨 2 点与 4 点半都归前一天', async () => {
    const { view } = await render([], [planOf('2026-09-20', ['schulte'], ['schulte'])], {
      now: at(2026, 10, 18, 4, 30),
      dayStartHour: 6,
    });
    // 今天 = 10-17（周六）→ 本行从周一 10-12 起，回溯 5 周 → 第一格 09-14
    expect(view.withClass('cal')[0].attrs['data-daykey']).toBe('2026-09-14');
  });

  it('600 条历史下三张图的节点数有界（曲线 ≤ 30 点，总计 ≤ 200 节点）', async () => {
    const many: SessionRecord[] = [];
    for (let i = 0; i < 600; i++) many.push(session('schulte', dayKey(at(2026, 10, 18, 12, 0) - i * 86400000, 4), i % 101, i));
    const { view, writes } = await render(many, []);
    expect(writes).toEqual([]);
    expect(view.tagCount('circle')).toBeLessThanOrEqual(30 + GAMES.length);
    expect(view.descendants().length).toBeLessThanOrEqual(200);
  });

  it('连续打卡数与 scheduler.streak 同一个数（页顶那行不是重算出来的）', async () => {
    const plans = [
      planOf('2026-10-15', ['schulte'], ['schulte']),
      planOf('2026-10-16', ['schulte'], ['schulte']),
      planOf('2026-10-17', ['schulte'], ['schulte']),
    ];
    const { view } = await render([session('schulte', '2026-10-18', 50)], plans);
    // 统计行是一整句（`连续打卡 3 天　累计 1 次训练`），所以用 includes 而不是数组精确匹配
    expect(texts(view).some((t) => t.includes('连续打卡 3 天'))).toBe(true);
  });
});
```

- [ ] **Step 2: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/pages/trends.test.ts`
Expected: FAIL —— 骨架版只渲染 slot 不渲染图表，`趋势页三张图` 整节红：`expected [] to have length 1`（`withClass('chart-radar')`）；`连续打卡 3 天` 那条 `toContain` 失败；Task 1 里「3 个 trend-slot」那条已被删除，不再制造假失败。

- [ ] **Step 3: 重写页面**

`focus-trainer/src/ui/pages/trends.ts` 整文件替换：

```ts
import { dayKey } from '../../core/daykey';
import { isPlanComplete, streak } from '../../core/scheduler';
import { calendarCells, dailyAbilitySeries, latestAbility, radarAxes, type CalendarStatus } from '../../core/stats';
import type { GameId } from '../../core/types';
import { GAMES } from '../../games/registry';
import { createCalendarChart, createLineChart, createRadarChart, STATUS_TEXT } from '../charts';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

// 空态文案是产品决策（spec §5.8 只规定趋势页有这三块内容）。字面被 trends.test.ts 断言，别改字。
export const EMPTY_RADAR = '还没有成绩，先练一次再来。';
export const EMPTY_SERIES = '近 30 天还没有训练记录。';
export const EMPTY_CALENDAR = '完成当天的全部计划就会点亮一格。';

const RADAR_SIZE = 220;
const LINE_W = 340;
const LINE_H = 140;
const CAL_CELL = 26;
const CAL_GAP = 4;
const LEGEND: readonly CalendarStatus[] = ['done', 'partial', 'empty'];

function block(title: string, ...children: Node[]): HTMLElement {
  return h('section', { class: 'trend-block' }, h('h2', null, title), ...children);
}

export async function renderTrends(
  view: HTMLElement,
  ctx: AppContext,
  signal: AbortSignal,
  now = Date.now(),
): Promise<void> {
  // 只读：绝不调用 ensureTodayPlan（它会 putPlan，见 today.ts:23），也不 saveSession。
  // 计划进行中一样可进，今天的格子显示 partial。
  const [sessions, plans] = await Promise.all([ctx.repo.listSessions(), ctx.repo.listPlans()]);
  if (signal.aborted) return;

  // Date.now() 只用来定「今天属于哪个 dayKey」，与 today.ts 的默认参同形态；本页没有轮内计时。
  const todayKey = dayKey(now, ctx.settings.dayStartHour);
  const axes = radarAxes(GAMES, sessions);
  const hasScore = sessions.length > 0;
  // 默认选中第一个有成绩的游戏；全没成绩就退回注册表第一个。绝不从 GAME_IDS 造页签。
  let selected: GameId = axes.find((a) => a.practiced)?.gameId ?? axes[0]?.gameId ?? 'schulte';

  const lineSlot = h('div', { class: 'trend-slot' });
  const paintTabs = (): void => {
    GAMES.forEach((g, i) => {
      tabEls[i].className = g.id === selected ? 'tab tab-on' : 'tab';
    });
  };
  const paintLine = (): void => {
    const series = dailyAbilitySeries(sessions, todayKey, selected);
    const present = series.filter((p) => p.ability !== null).length;
    const latest = latestAbility(sessions, selected);
    // caption 用 div 不用 p：p.muted 在本页专属于「空态文案」，Task 8 Step 6 数 .trend-slot p 判空。
    lineSlot.replaceChildren(
      ...(present === 0 ? [h('p', { class: 'muted' }, EMPTY_SERIES)] : [createLineChart(series, LINE_W, LINE_H)]),
      ...(latest === null ? [] : [h('div', { class: 'muted' }, `最近一次 ${latest}`)]),
    );
  };
  const tabEls = GAMES.map((g) =>
    h(
      'button',
      {
        class: 'tab',
        onclick: () => {
          selected = g.id;
          paintTabs();
          paintLine();
        },
      },
      g.name,
    ),
  );

  const hasCheckin = plans.some((p) => isPlanComplete(p));
  view.replaceChildren(
    h(
      'div',
      { class: 'row' },
      h('button', { onclick: () => navigate({ name: 'home' }) }, '返回'),
      h('h1', null, '趋势'),
    ),
    h('div', { class: 'muted' }, `连续打卡 ${streak(plans, todayKey)} 天　累计 ${sessions.length} 次训练`),
    block('能力雷达', hasScore ? createRadarChart(axes, RADAR_SIZE) : h('p', { class: 'muted' }, EMPTY_RADAR)),
    block('近 30 天曲线', h('div', { class: 'trend-tabs' }, ...tabEls), lineSlot),
    block(
      '近 5 周打卡',
      hasCheckin
        ? createCalendarChart(calendarCells(plans, todayKey), CAL_CELL, CAL_GAP)
        : h('p', { class: 'muted' }, EMPTY_CALENDAR),
      h('div', { class: 'trend-legend' }, ...LEGEND.map((s) => h('span', { class: `legend legend-${s}` }, STATUS_TEXT[s]))),
    ),
  );
  paintTabs();
  paintLine();
}
```

注意三处易错点：`paintTabs()` / `paintLine()` 必须在 `replaceChildren` 之后各调一次（初始 `tab-on` 与曲线内容都靠它们落）；`tabEls` 的 `onclick` 闭包引用了声明在后的 `paintTabs`/`paintLine`，只在点击时求值所以合法；本页不注册任何 window/document 监听，路由切换由 `main.ts` 的 `view.replaceChildren()` 收尾，不需要 `destroy()`。

- [ ] **Step 4: 加趋势页样式**

先在 `focus-trainer/src/ui/styles.css` 的 `:root` 块里（第 10 行 `--tap: 48px;` **之前**）插入日历三色。必须放在 `:root`：图例 `.legend-done` 是 `<span>`、在 `svg` 外面，属性写在 `svg.chart` 上时它取不到，`var(--cal-done)` 会静默回退成继承色，图例三点全灰。`future` 不需要变量——它是 `fill: none` + 虚线框。

```css
  --cal-done: #8ab4f8;
  --cal-partial: #5c6b83;
  --cal-empty: #2c313a;
```

再在文件末尾追加（颜色一律走变量，图表节点只挂 class，不在 SVG 里写颜色字面量）：

```css
.trend-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
}

.trend-block h2 {
  font-size: 15px;
}

.trend-slot {
  min-height: 40px;
}

.trend-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tab {
  min-height: var(--tap);
  padding: 0 14px;
  font-size: 14px;
}

.tab.tab-on {
  background: var(--accent);
  color: #0b1a2e;
  border-color: transparent;
  font-weight: 600;
}

.trend-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
}

.legend::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 5px;
  border-radius: 2px;
  background: currentColor;
}

.legend-done { color: var(--cal-done); }
.legend-partial { color: var(--cal-partial); }
.legend-empty { color: var(--cal-empty); }

svg.chart {
  display: block;
  width: 100%;
  height: auto;
}

.chart-radar .chart-ring,
.chart-radar .chart-shape {
  fill: none;
  stroke: var(--line);
}

.chart-radar .chart-shape {
  fill: rgb(138 180 248 / 0.24);
  stroke: var(--accent);
}

.chart-radar .chart-spoke,
.chart-grid,
.chart-axis {
  stroke: var(--line);
}

.chart-radar .chart-dot,
.chart-line .chart-dot {
  fill: var(--accent);
  stroke: none;
}

.chart-label,
.chart-tick {
  fill: var(--muted);
  font-size: 11px;
}

.chart-series {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2;
}

.cal {
  stroke: var(--line);
}

.cal-done { fill: var(--cal-done); }
.cal-partial { fill: var(--cal-partial); }
.cal-empty { fill: var(--cal-empty); }
.cal-future { fill: none; stroke-dasharray: 3 3; }
```

- [ ] **Step 5: 跑到它通过**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/pages/trends.test.ts && npx tsc --noEmit`
Expected: 12 个测试通过（空态 4 + 三张图 8）；`tsc` 干净。

- [ ] **Step 6: 提交**

```bash
cd "E:/WORK/脑力训练"
git add focus-trainer/src/ui/pages/trends.ts focus-trainer/src/ui/pages/trends.test.ts focus-trainer/src/ui/styles.css
git commit -m "feat(trend): 趋势页装配三图、游戏页签切换与只读有界约束"
```

---

### Task 7: 打磨——完成格可读性与窄屏触控尺寸

**Files:**
- Modify: `focus-trainer/src/ui/styles.css`（`.schulte-cell.done`、`--tap` 相关、`#view` 窄屏内边距、`.schulte-grid` gap）
- Create: `focus-trainer/src/ui/styles.test.ts`

**Interfaces:**
- Consumes: `TINT_COLORS`（`games/schulte/view.ts:7`，**只 import、不改**）、`:root` 里的 `--bg/--text/--muted/--panel/--accent/--line`、Task 6 Step 4 刚写进 `styles.css` 的 `.tab { min-height: var(--tap) }`（所以本任务必须排在 Task 6 之后，见「前置条件与执行顺序」第 1 条）
- Produces: CSS 变量 `--done-bg: #1a1d22`、`--done-fg: #9aa0a6`；`@media (max-width: 380px)` 规则块；测试文件内的纯函数 `contrast(fg, bg)`、`blend(fg, bg, alpha)`、`schulteCellPx(vw, size, pad, gap)`

**背景（这条任务为什么存在）**：M1 计划的验收表（`2026-10-18-m1-core-and-schulte.md:4123`）离线算过——`.done { opacity: .2 }` 让完成格数字只剩 **1.59–1.69** 对比度，几乎读不出来，而 4 种干扰色与闪烁红都过 AA。当时判为「M1 按现状接受，M3 打磨时裁定」。本任务裁定：**回退掉 opacity，改成「底色淡出 + 字形保持可读」**，并把数字写成断言，不留「看起来更好」。

- [ ] **Step 1: 算清楚要换成什么色（不许拍脑袋）**

三个候选色的 WCAG 相对亮度已知关系（执行者用 Step 2 的 `contrast()` 复核一遍，跑出来的数必须落在这个邻域，否则说明 helper 写错了）：

| 项 | 值 | 判据 |
|---|---|---|
| `contrast(#9aa0a6, #1a1d22)`（完成格数字 / 完成格底色） | ≈ 6.4 | ≥ 4.5（AA 正文） |
| `contrast(#1a1d22, #14161a)`（完成格底色 / 页面底色） | ≈ 1.07 | ≤ 1.2 —— 保持 M1「淡进背景、让未完成的目标跳出」的设计意图（原表实测 1.03–1.09） |
| `contrast(#e8eaed, #b3261e)`（闪烁格数字） | M1 实测 5.42 | ≥ 4.5，本任务不动 |

选 `#9aa0a6` 是因为它就是现成的 `--muted`（不新增一种灰），`#1a1d22` 比 `--bg` 略亮一档、比 `--panel` 略暗一档，落在「格子还在、但退到背景里」的位置。**关键：淡出必须由 background 承担，不能由 element opacity 承担**——element opacity 会把字形一起淡掉，这正是 1.59 的来源。

- [ ] **Step 2: 写失败的测试**

新建 `focus-trainer/src/ui/styles.test.ts`。CSS 在 node 环境没有 CSSOM，所以用 Vite 的 `?raw` 把文件读成文本再解析（`tsconfig.json` 已 `types: ["vite/client"]`，`*?raw` 有现成类型，不新增依赖；本仓没装 `@types/node`，**不要**用 `readFileSync`）。

```ts
import { describe, expect, it } from 'vitest';
import css from './styles.css?raw';
import { TINT_COLORS } from '../games/schulte/view';

// —— helper（这三个函数只住在这里，不进 src 运行时代码）——
function rootVars(text: string): Record<string, string> {
  const body = text.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6}|[^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

function ruleBody(text: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : '';
}

function resolve(value: string, vars: Record<string, string>): string {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  return (m ? vars[m[1]] : value).trim();
}

function channel(hex: string, i: number): number {
  const c = parseInt(hex.slice(i, i + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// element opacity 没有 CSSOM 可查，只能把「前景以 alpha 压在背景上」折算成实际渲染色再算对比度
function blend(fg: string, bg: string, alpha: number): string {
  const px = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const f = px(fg);
  const b = px(bg);
  return `#${f.map((v, i) => Math.round(alpha * v + (1 - alpha) * b[i]).toString(16).padStart(2, '0')).join('')}`;
}

function schulteCellPx(viewportWidth: number, size: number, pad: number, gap: number): number {
  return (viewportWidth - 2 * pad - gap * (size - 1)) / size;
}

const VARS = rootVars(css);
const DECL = (selector: string, prop: string): string =>
  ruleBody(css, selector).match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1].trim() ?? '';

describe('WCAG helper 自检', () => {
  // helper 必须先自证，否则下面所有阈值都是空中楼阁（这两个值是 WCAG 定义自带的常量）
  it('纯黑纯白是 21，#777777 对白约 4.48', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 6);
  });

  it('M1 离线表的四个干扰色对比度落在 8–11 区间（helper 与原表互验）', () => {
    const cs = TINT_COLORS.map((t) => contrast(VARS['--text'], t)).sort((a, b) => a - b);
    expect(cs[0]).toBeGreaterThanOrEqual(8);
    expect(cs[3]).toBeLessThanOrEqual(11);
    // M1 表：8.13 / 9.02 / 9.64 / 10.73。helper 与原表互验，偏差应 < 0.5；
    // 偏差超过 0.5 说明 helper 的线性化写错了（先修 helper），不是调色板的问题。
    for (const c of cs) expect(Math.min(...[8.13, 9.02, 9.64, 10.73].map((r) => Math.abs(c - r)))).toBeLessThan(0.5);
  });
});

describe('完成格可读性（M1 遗留的 M3 打磨项）', () => {
  it('.schulte-cell.done 不再用 element opacity 淡出', () => {
    const body = ruleBody(css, '.schulte-cell.done');
    expect(body).not.toBe('');
    expect(body).not.toMatch(/opacity/);
    expect(body).toMatch(/background/);
    expect(body).toMatch(/color/);
  });

  it('完成格数字对自身底色 ≥ 4.5（AA）', () => {
    const fg = resolve(DECL('.schulte-cell.done', 'color'), VARS);
    const bg = resolve(DECL('.schulte-cell.done', 'background'), VARS);
    expect(fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('完成格底色仍与页面底色几乎同值（≤ 1.2），未完成的目标仍然跳得出来', () => {
    expect(contrast(resolve(DECL('.schulte-cell.done', 'background'), VARS), VARS['--bg'])).toBeLessThanOrEqual(1.2);
  });

  it('默认格（未点）数字仍 ≥ 4.5：--text 对 --tint 默认值', () => {
    expect(contrast(VARS['--text'], resolve(DECL('.schulte-cell', '--tint'), VARS))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(VARS['--text'], '#b3261e')).toBeGreaterThanOrEqual(4.5);
  });

  it('.card.done 的 opacity: 0.6 折算后仍 ≥ 4.5（这条不需要改，钉住别把它继续调暗）', () => {
    const alpha = Number(ruleBody(css, '.card.done').match(/opacity:\s*([\d.]+)/)?.[1]);
    expect(alpha).toBeGreaterThan(0.5);
    const rendered = blend(VARS['--text'], VARS['--panel'], alpha);
    expect(contrast(rendered, VARS['--panel'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#9aa0a6', '#1d2026')).toBeGreaterThanOrEqual(4.5);
  });

  it('禁用态按钮不能用 opacity 把文案洗掉（首页「今日完成」是一句状态说明）', () => {
    expect(ruleBody(css, 'button:disabled')).not.toMatch(/opacity/);
    expect(contrast(VARS['--muted'], VARS['--panel'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('窄屏触控目标（M1 验收记录的 44.6px 限制）', () => {
  it('390×844 验收视口下 7×7 每格 ≥ 48px', () => {
    expect(schulteCellPx(390, 7, 12, 4)).toBeGreaterThanOrEqual(48);
  });

  it('360px 宽屏必须靠 @media 收紧内边距与 gap 才达标（旧值 44.57 记为不达标）', () => {
    expect(schulteCellPx(360, 7, 12, 4)).toBeLessThan(48);
    expect(schulteCellPx(360, 7, 8, 1)).toBeGreaterThanOrEqual(48);
  });

  it('styles.css 里存在这条 media 规则，且取值与算式一致', () => {
    const media = css.match(/@media\s*\(max-width:\s*380px\)\s*\{([\s\S]*)\}\s*$/);
    expect(media, 'media 块必须仍是文件最后一段').not.toBeNull();
    expect(ruleBody(media![1], '#view')).toMatch(/padding:\s*8px/);
    expect(ruleBody(media![1], '.schulte-grid')).toMatch(/gap:\s*1px/);
  });

  it('触控下限仍在：--tap 是 48px，按钮与 .tab 各自引用它', () => {
    expect(VARS['--tap']).toBe('48px');
    expect(css).toMatch(/button,\s*select\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(DECL('.tab', 'min-height')).toBe('var(--tap)');
  });
});
```

- [ ] **Step 3: 跑到它失败**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/styles.test.ts`
Expected: FAIL —— `完成格数字对自身底色` 报 `expected '' to match /^#[0-9a-f]{6}$/`（现在的 `.done` 里没有 `background`/`color`）；`.schulte-cell.done 不再用 element opacity` 报 `expected " opacity: 0.2; " not to match /opacity/`；`禁用态按钮` 与 `media 规则` 两条同样红。helper 自检那 2 条必须**现在就通过**——不过就是 helper 写错了，先修 helper 再往下。

- [ ] **Step 4: 改 CSS**

`focus-trainer/src/ui/styles.css`：

`:root` 里在 `--bad: #f28b82;` 之后插入两行：

```css
  --done-bg: #1a1d22;
  --done-fg: #9aa0a6;
```

把这三行：

```css
.schulte-cell.done {
  opacity: 0.2;
}
```

换成：

```css
.schulte-cell.done {
  /* 淡出只作用在底色上：整块透明度会把数字一起洗掉（M1 实测只剩 1.59–1.69） */
  background: var(--done-bg);
  color: var(--done-fg);
}
```

把这两行：

```css
button:disabled {
  opacity: 0.4;
}
```

换成：

```css
button:disabled {
  color: var(--muted);
  background: var(--panel);
  border-color: var(--line);
}
```

在文件**最末尾**追加（media 块必须是最后一段——Step 2 的正则按「文件尾部」取它）：

```css
@media (max-width: 380px) {
  #view { padding: 8px; }
  .schulte-grid { gap: 1px; }
}
```

`.tab` 的 `min-height: var(--tap)` 已经由 Task 6 Step 4 带上了，本任务不再加 CSS 规则；`触控下限仍在` 那条断言的作用是防止以后有人把它删掉。

- [ ] **Step 5: 跑到它通过**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/styles.test.ts && npx vitest run && npx tsc --noEmit`
Expected: 本文件 12 个测试通过；全量测试通过；`tsc` 干净。若 `?raw` 解析失败（见文末「需要执行时才能发现的事」第 1 条），按那条给的退路改，不要放宽阈值。

- [ ] **Step 6: 提交**

```bash
cd "E:/WORK/脑力训练"
git add focus-trainer/src/ui/styles.css focus-trainer/src/ui/styles.test.ts
git commit -m "fix(ui): 完成格改为底色淡出并保持数字可读，禁用态去 opacity，窄屏补 48px 触控"
```

---

### Task 8: 真机尺寸浏览器验收与成功标准 5 关闭

**Files:**
- 不改代码（只在 `docs/superpowers/plans/2026-10-19-m3-trend-and-polish.md` 的验收记录区补实际结论；若发现问题按 Step 5 修复相应文件）

**Interfaces:**
- Consumes: 全部前序任务；`npx vite` dev server（端口 5173）；browser-use 插件（390×844 与 360×640 两种视口）
- Produces: spec 第 1 节成功标准 5 的实测证据；M4 Task 9 复跑所需的「趋势页已合并」结论

- [ ] **Step 1: 全量门禁**

Run: `cd "E:/WORK/脑力训练/focus-trainer" && npx tsc --noEmit && npx vitest run && npx vite build`
Expected: 三条都成功；`dist/` 产出。build 后先做一次「离线字面量」自查（把 M4 的审计提前跑一遍，避免 Task 9 才发现）：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -rnE "https?://" dist/ src/ | grep -v "www.w3.org/2000/svg"
```
Expected: **无输出**。有输出就是违反本计划 Global Constraints：`src/` 里除了 `charts.ts` 的 `SVG_NS` 不允许任何 URL；`dist/` 里出现的 `localhost` 一律视为把开发服务器地址写进了产物（改源码，不要加白名单）。计划文档里写的 `http://127.0.0.1:5173/` 只是给执行者的命令文本，**不进产物**。

- [ ] **Step 2: 起 dev server**

后台方式启动：`cd "E:/WORK/脑力训练/focus-trainer" && npx vite --host`。先访问 `http://127.0.0.1:5173/` 确认返回页面。

- [ ] **Step 3: 真实路径先练一次（不用手造数据顶替）**

按 M1 Task 10 的手法在当前注册的游戏上完整练一次（说明层 → 倒计时 → 3 轮 → 结算页），拿到一条**真实**的 `SessionRecord`。这一步的产物决定雷达与曲线是否有值；手造数据（Step 4）只用来补「多日历史 / 打卡」这两种一天练不出来的形态，不用来顶替真实写入。

- [ ] **Step 4: 造 40 天历史与打卡（IndexedDB 直写）**

用 `evaluate_script` 往同一个库追加历史记录。**只追加、不改已有记录**，验收结束后 Step 9 清库：

```js
async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('focus-trainer', 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = db.transaction(['sessions', 'plans'], 'readwrite');
  const sessions = tx.objectStore('sessions');
  const plans = tx.objectStore('plans');
  const dk = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const keys = await new Promise((res) => {
    const q = sessions.getAllKeys();
    q.onsuccess = () => res(q.result);
  });
  const maxId = keys.length ? Math.max(...keys) : 0;
  const SEED = ['schulte', 'stroop', 'seqmem'];
  const base = new Date();
  for (let i = 1; i <= 40; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i, 9, 0);
    const key = dk(d);
    SEED.forEach((g, j) => {
      sessions.put({
        id: maxId + i * 10 + j,
        gameId: g,
        mode: 'plan',
        dayKey: key,
        startedAt: d.getTime(),
        durationMs: 120000,
        startLevel: 3,
        endLevel: 4,
        rounds: [],
        summary: {},
        ability: 30 + (i % 50),
      });
    });
    if (i <= 10) plans.put({ dayKey: key, games: SEED, completed: SEED });
    if (i === 11) plans.put({ dayKey: key, games: SEED, completed: ['schulte'] });
  }
  await new Promise((res, rej) => {
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
  return { sessions: 120, maxId, firstDayKey: dk(new Date(base.getFullYear(), base.getMonth(), base.getDate() - 40, 9, 0)) };
}
```

Expected：返回形如 `{ sessions: 120, maxId: 1, firstDayKey: '2026-…' }`，`list_console_messages` 无 `error`。刷新后首页「连续打卡天数」应变成 `10`（今天未完成时从昨天往前数，`scheduler.ts:49` 的规则），这条不是趋势页的判据、只是这批种子数据自洽的证据。

> `SEED` 里写死三个 id 是因为 `sessions` 表允许存**未注册**游戏的记录（`storage.ts` 不校验 `gameId` 是否已注册），而趋势页的轴与页签只按 `GAMES` 出，所以没注册的那些不会显示。**若 M2 尚未合并**，把 `SEED` 改成 `['schulte']`（并把 `id` 的 `+ j` 去掉以免留空洞），Step 10 的记录里写明「单游戏降级已验、五轴未验」。

- [ ] **Step 5: 390×844 看趋势页**

`navigate_page` 到 `http://127.0.0.1:5173/#/trend`，截图 + 快照 + `evaluate_script`：

```js
() => {
  const q = (s) => [...document.querySelectorAll(s)];
  const svgAttrUrls = q('*').flatMap((el) => [...el.attributes].map((a) => a.value)).filter((v) => /https?:\/\//.test(v));
  return {
    title: document.querySelector('h1')?.textContent,
    stat: document.querySelector('#view > div:nth-child(2)')?.textContent,
    blocks: q('.trend-block h2').map((h) => h.textContent),
    radar: { spokes: q('.chart-radar .chart-spoke').length, shape: q('.chart-radar .chart-shape').length, labels: q('.chart-radar .chart-label').map((t) => t.textContent) },
    line: { series: q('.chart-line polyline').length, dots: q('.chart-line circle').length, tabs: q('.tab').map((b) => [b.textContent, b.className]) },
    cal: { cells: q('.cal').length, done: q('.cal-done').length, partial: q('.cal-partial').length, future: q('.cal-future').length, titles: q('.cal title').length },
    svgCount: q('svg').length,
    totalNodes: q('#view *').length,
    emptyCopies: [...document.querySelectorAll('p')].map((p) => p.textContent).filter((t) => t.includes('还没有') || t.includes('完成当天')),
    svgRoots: q('svg').map((s) => s.namespaceURI),
    externalUrls: svgAttrUrls,
  };
}
```

Expected：
- `title === '趋势'`，`blocks === ['能力雷达', '近 30 天曲线', '近 5 周打卡']`；
- `stat` 形如 `连续打卡 10 天　累计 121 次训练`（种子 120 条 + Step 3 的真实训练次数）；
- `svgCount === 3`，且 `svgRoots` 三项全部是 `http://www.w3.org/2000/svg`；`externalUrls` **为空**（根节点没有 `xmlns` 属性，`createElementNS` 已经带了命名空间）；
- M2 已合并：`radar.spokes === 5` 且 `radar.shape === 1`；M2 未合并：`spokes === 1`、`shape === 0`（降级，必须与单测一致）；
- `line.dots <= 30`、`line.series >= 1`、`line.tabs.length` 等于已注册游戏数、其中**恰好一个** tab 的 className 含 `tab-on`；
- `cal.cells === 35`、`cal.titles === 35`、`done === 10`、`partial === 1`（i=11 那天），`future` 取决于今天是周几（周日 → 0）；
- `totalNodes < 400`（120 条种子 + 真实记录都不该让 DOM 爆量）；
- `emptyCopies` 为空（有数据时不许出现空态文案）。

- [ ] **Step 6: 页签切换与只读**

点一个**没有数据**的游戏页签（M2 已合并时任选未练过的；未合并时就点唯一那个），再跑：

```js
() => ({
  tabs: [...document.querySelectorAll('.tab')].map((b) => [b.textContent, b.className]),
  series: document.querySelectorAll('.chart-line polyline').length,
  dots: document.querySelectorAll('.chart-line circle').length,
  copy: document.querySelector('.trend-slot')?.textContent.trim(),
  empty: document.querySelectorAll('.trend-slot p').length,
})
```
Expected：`tab-on` 跟着移动；无数据的游戏 `series === 0 && dots === 0 && empty === 1` 且 `copy === '近 30 天还没有训练记录。'`；`list_console_messages` 无 error。
再回首页 → 进设置 → 回首页，确认趋势页全程没让 `sessions`/`plans` 的条数发生变化（只读钉子）：

```js
async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('focus-trainer', 1); r.onsuccess = () => res(r.result); });
  const c = (s) => new Promise((res) => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => res(q.result); });
  return { sessions: await c('sessions'), plans: await c('plans'), states: await c('gameState') };
}
```
Expected：连跑两次（进趋势页前后）三个数完全相同。

- [ ] **Step 7: 完成格可读性与窄屏触控（Task 7 的实测面）**

在舒尔特方格里点掉 3–4 个格子（保持这一轮进行中），然后：

```js
() => {
  const done = document.querySelector('.schulte-cell.done');
  const cs = done ? getComputedStyle(done) : null;
  const cell = document.querySelector('.schulte-cell');
  const grid = document.querySelector('.schulte-grid');
  const view = getComputedStyle(document.getElementById('view'));
  return {
    doneOpacity: cs?.opacity ?? '本轮还没有完成格',
    doneColor: cs?.color,
    doneBg: cs?.backgroundColor,
    cellPx: cell ? cell.getBoundingClientRect().width : null,
    gridGap: getComputedStyle(grid).gap,
    viewPadding: view.paddingLeft + ' / ' + view.paddingRight,
  };
}
```
Expected：`doneOpacity === '1'`（淡出不再由透明度承担）、`doneColor === 'rgb(154, 160, 166)'`、`doneBg === 'rgb(26, 29, 34)'`（对应单测算出的 6.4:1）。
再把视口切成 **360×640**，重新进任一游戏的训练页，跑上面这段的 `gridGap` / `viewPadding` 两项。Expected：`viewPadding === '8px / 8px'`、`gridGap === '1px'`（media 生效），据此 `每格 = (360 - 16 - 1*(size-1)) / size ≥ 48px`；若仍是 `12px / 4px`，说明 media 规则没落地，回 Task 7 Step 4。

- [ ] **Step 8: 手机浏览器手感复核**

按 M1 Task 10 的清单在 390×844 下过一遍：首页「趋势」按钮可点（不再是 disabled、`title` 提示已消失）、返回键回首页、雷达标签文字不溢出 `viewBox`（截图上看 5 个中文标签完整可见）、日历 35 格在竖屏下一眼能看出深浅、`list_console_messages` 无 `error`。

- [ ] **Step 9: 清掉种子数据**

设置页 →「清空数据」→ 接受确认框。Expected：回首页，打卡归 0，趋势页三块**全部**回到中文空态文案（`连续打卡 0 天　累计 0 次训练`），这一步同时把 Task 1/Task 6 的空态分支在真机上验一遍。截图留档。

- [ ] **Step 10: 结论与收尾**

- 逐条记录 Step 3–9 实际结果，任何一条与 Expected 不符，先用 `superpowers:systematic-debugging` 找根因，修完再跑 `cd "E:/WORK/脑力训练/focus-trainer" && npx tsc --noEmit && npx vitest run && npx vite build` 确认没把测试改坏，然后提交（逐文件 `git add`，禁止 `-A`）。
- 停掉 Step 2 的 dev server（用启动它的后台任务终止接口），`netstat -ano | grep 5173` 无输出。
- 明确写下给 M4 的结论：**M3 已合并，`charts.ts` 只引入 `http://www.w3.org/2000/svg` 一条外部形态字符串**（Step 1 的 grep 空输出 + Step 5 的 `externalUrls` 空数组是两条证据），M4 Task 9 可以按「内容已终态」复跑并把离线审计那行改判为「通过」。
- 已知限制，按现状接受、不要临时改：
  - 趋势页的曲线纵轴固定 0–100、不自动缩放：低档位时期整条线会挤在上半部，这是为了不给用户「翻倍」的错觉而做的取舍。
  - 日历只有「打过卡」才出图，否则显示文案：第一天用户看到的是句子而不是 35 个同色方格。
  - 雷达没有动画、没有点按钻取；数值直接标在轴末端（48px 触控目标下 5 个小圆点按不住）。

---

## M3 完成判据（对照 spec 第 1 节与 §5.3/§5.8/§7）

| spec 判据 | M3 覆盖情况 |
|---|---|
| 成功标准 5：趋势页三张图 | Task 1（路由与骨架）+ Task 2/3（口径）+ Task 4/5（图）+ Task 6（装配）+ Task 8 Step 5（实测） |
| §5.3 雷达 = 每游戏近 3 次 AI 均值，未练标 0 | Task 2 `radarAxes`（含乱序输入、不足 3 次、未练三条边界测试）；Task 5 单轴/两轴降级断言；Task 8 Step 5 实测 `labels` |
| §5.3 曲线 = 每日期键取当天最高 AI，最近 30 个日期键 | Task 2 `dailyAbilitySeries`（含「不是均值也不是最后一次」与 600 条有界两条）；Task 4/5 缺口断线；Task 8 Step 5 `dots <= 30` |
| §5.3/§5.4 一切分桶按 04:00 日界（不用 UTC） | Task 3「凌晨 02:00 算前一天」两条 + Task 6「中午/凌晨/分界改 6 点」三条 + Task 8 Step 5 的 35 格首日键 |
| §5.6 打卡日历与连续打卡 | Task 3 `calendarCells` 复用 `isPlanComplete`/`streak`（含与 `streak()` 数值一致那条）；Task 6 页顶统计行；Task 8 Step 4/5 |
| §5.8 首页底部「趋势」入口 | Task 1 替换 `home.ts:69` 的 `disabled` 占位；Task 8 Step 8 实测可点 |
| §5.8 视觉约束（深色、游戏区不花、≥48px、安全区） | Task 7：完成格对比度（6.4 ≥ 4.5）、禁用态去透明度、360px 窄屏 48px；Task 8 Step 7 实测 |
| §7 界面验收：趋势页三张图正常渲染 | Task 8 全程 |
| §4.3 时钟契约 | 趋势页不在轮内：`renderTrends(..., now = Date.now())` 只用于定 dayKey（Task 6 Step 3 注释），本页无轮内计时 |
| 只读（M1 裁定的延续） | Task 1/6 的记录型 fake repo：`putPlan/saveSession/putSettings/clearAll` 一被调用就 reject；Task 6 有「600 条历史也不写库」与 Task 8 Step 6 的 count 前后比对 |

M3 结束时应当满足：`npx tsc --noEmit` 干净、`npx vitest run` 全绿（本计划新增 **66** 条：`trends.test.ts` 12 + `stats.test.ts` 20 + `charts.test.ts` 22 + `styles.test.ts` 12；`router.test.ts` 仍是 3 条，属改写不是新增。以实测为准，M2 若已合并再叠加它的条数）、`npx vite build` 出 `dist/`、Task 8 Step 1 的 URL grep 无输出、Task 8 的 Step 2–10 全部通过。

## 需要执行时才能发现的事（本文档不下结论）

1. **`?raw` 在 Vitest 5 的 node 环境下能否解析 `./styles.css?raw`**。预期可以（Vite 核心能力，`tsconfig` 已带 `vite/client` 类型）。若真报错，退路已定：把 `--done-bg/--done-fg/--text/--muted/--bg/--panel` 六个字面量抽成 `src/ui/palette.ts` 的导出常量，`styles.css` 的 `:root` 保留同名变量并加一行注释指向 `palette.ts`，`styles.test.ts` 改为断言 `palette.ts` 的值 + 用正则确认 `:root` 里每个变量字面与 `palette.ts` 一致。这条退路仍然测的是真数字，不许改成「肉眼看看」。
2. **雷达标签会不会溢出 `viewBox`**。`radius = size/2 - 26` 加 11px 字号的 4 字中文维度名，理论上刚好，但 M2 合并后的四个维度名长度由 M2 决定（`持续注意`/`选择性注意`/`视觉工作记忆广度`/…），5 字以上就可能贴边。Task 8 Step 8 以截图为准；溢出的话把 `RADAR_SIZE` 提到 240 或把 `chart-label` 字号降到 10px，**不要**把标签改成 HTML 浮层（那会让 Task 5 的节点计数断言与 `svg.chart` 的 `width: 100%` 一起失效）。
3. **M2 的实际注册结果与 `GameModule.ability` 字面值**。Task 2 的 `GAMES_5` 用了推测的五个维度名（`选择性注意`/`视觉工作记忆`/`动态视觉`/`闭合识别`）——那是 `radarAxes` 的入参桩、不读注册表，所以 M2 怎么写都不会让这条测试挂；但 Task 6 的 `labels` 断言是**从 `GAMES` 现算**的，同理安全。真正受影响的是 Task 8 的截图观感与 Step 4 的种子脚本要写哪几个 `gameId`。
4. **WebView 对 `rgb(138 180 248 / 0.24)`（空格斜杠语法）的支持**。Capacitor 用的系统 WebView 在 2026 年必然支持（Chrome 130+），但 M3 只在浏览器验收；若某台老设备上雷达填充不显示，退路是把 `.chart-shape` 的 `fill` 换成 `rgba(138, 180, 248, 0.24)` 的逗号语法，不改变判定。
5. **曲线在 30 天窗口里点数极少时（只有 1–2 天）是否需要给「数据还不够」的额外提示**。本计划裁定：1 个点只画圆点、不画线（Task 5 已断言），文案仍用 `EMPTY_SERIES` 只在 0 个点时出现，不给额外提示。是否要再加一层「至少 3 天才画趋势」由用户在 M3 后决定。
