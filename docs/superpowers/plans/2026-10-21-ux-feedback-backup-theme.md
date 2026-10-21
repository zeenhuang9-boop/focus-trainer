# 反馈 / 备份 / 深色主题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每次点按都有可感知的回执（90ms 最短按压驻留 + 震动，声音默认关）、把训练数据做成可导出/可导入的备份、并给整套页面加一层跟随系统的深色主题。

**Architecture:** 反馈分成两条互不依赖的通道：`src/ui/press.ts` 只负责「按下类至少驻留 90ms」的纯 DOM 行为，`src/ui/fx.ts` 只负责震动/声音（按 `Settings` 开关门控，注入 `FxEnv` 以便在 node 环境测试）。五个游戏视图在 `render(snapshot)` 里做**上升沿检测**（每试次只触发一次），`GameModule.createView` 增加可选的第三参 `fx?: Fx`，`play.ts` 把 `createFx(ctx.settings)` 传进去。备份走 `Repository.dumpAll()/loadAll()` 两个新方法 + 纯逻辑模块 `src/core/backup.ts`（导出格式、解析校验、合并规则），设置页只做剪贴板导出与文件/粘贴导入。深色主题用 `html[data-theme='dark']` 一组 token 覆盖（不是第二个 `:root`，因为 `styles.test.ts` 的 `decl()` 只认第一条），`src/ui/theme.ts` 解析 `auto/light/dark`，`boot()` 时应用。

**Tech Stack:** TypeScript 5.9 `strict` + `verbatimModuleSyntax`、Vite 8.3.4、Vitest 5.0.5（node 环境、无 jsdom，手写 DOM 桩）、Web Audio + `navigator.vibrate`、IndexedDB、Capacitor 8.5.3 / AGP 8.13。**零新依赖。**

**Spec:** `docs/superpowers/specs/2026-10-18-focus-trainer-design.md`（成功标准 1/3/4 的离线、续档、数据面约束继续有效）。本次三项优化的口径来自用户 2026-10-21 的确认：最短按压驻留 **90ms**；**震动开、声音默认关**；只加**深色主题**（不做其它外观改造）；备份用**剪贴板 + 文件导入**。计划本身把这几条落成可执行的验收判据。

## Global Constraints

每一片都必须同时满足，违反任一条就是返工：

- **不新增任何依赖**。样式表里不许出现 `@import`、`@font-face`、`url(`、`https?://`（离线红线，`src/ui/styles.test.ts` 已有整份文本断言）。
- **`#view { padding: 12px }` 与 `.schulte-grid` 的 `gap: 1px` / `width: calc(100% + 24px)` / `margin: 0 -12px` 一字不动**（分页轮的承重结构，`styles.test.ts` 与 7×7 的 48px 算式都钉着）。
- **`body.training` 的 7 个变量取值与五个游戏视图的刺激色不动**；深色主题只改页面 chrome 的 token，训练态配色仍由 `body.training` 接管。
- **深色 token 块必须写成 `html[data-theme='dark']`**，不能是第二个 `:root`：`styles.test.ts:20-24` 的 `decl()` 只返回第一条匹配，写第二个 `:root` 会让现有断言继续读浅色值而「深色其实没生效」。
- **深色纸纹必须写成 `html[data-theme='dark'] body:not(.training)`**：`html[data-theme='dark'] body` 的特异度是 (0,1,2)，会稳定压过 `body.training` 的 (0,1,1)，训练页的 `background-image: none` 会静默失效，且 `styles.test.ts:198` 断的是 `body.training` 自己的声明、抓不到这种写法。顺序救不了它，只能靠 `:not(.training)` 让它不匹配训练页。
- **深色下 `#banner` 单独覆盖背景**：`--bad` 在深色里被调亮成 `#f28b82`（danger 文字对卡面才够 4.5:1），而 `#banner` 的 `color` 是写死的 `#fbfbf8`，白字压在亮红上只有约 2.5:1；用 `html[data-theme='dark'] #banner { background: #7a2e26; }` 保住横幅可读性。
- **`Settings` 的新字段是必填**（`theme` / `hapticsEnabled` / `soundEnabled`），默认值只在 `DEFAULT_SETTINGS` 一处定义；所有测试里的字面量必须同步成完整对象（漏一个 tsc 就红）。
- **计时纪律不变**：`beginRound/tick` 的 `now` 只取 rAF 参数，`InputEvent.t` 只取 `PointerEvent.timeStamp`；`Date.now()` 只准用于种子、记录时间、日期键、备份导出时间。
- **视图里不做计时**：`src/games/gestalt/view.test.ts:272-279` 禁止 `setTimeout/setInterval/Date.now/requestAnimationFrame/performance.now` 出现在 gestalt 视图源码里。反馈一律由 `render(snapshot)` 的相位/计数变化驱动，视图不持有计时器。90ms 驻留只允许放在 `src/ui/press.ts`（由 `play.ts` 挂载）。
- **共享写点串行**：`src/core/types.ts`、`src/core/storage.ts`、`src/ui/pages/settings.ts`、`src/ui/pages/play.ts`、`src/ui/styles.css`、`src/main.ts` 每片只由当前任务的实现者改，禁止并行派单。
- **测试计数只认实测**：开工前先跑一遍门槛记录基线（当前为 43 文件 / 522 用例）；收尾以 `npx vitest run` 的实际输出为准，禁止为凑数增删用例。
- **提交信息沿用仓库风格**：`feat(ux): …` / `feat(theme): …` / `feat(data): …` / `test(…): …` / `chore(android): …`，中文描述。
- **任何 `adb` 写操作都要用户本人在场并明确同意**；本计划第 8 片只做机器侧构建与文档同步。

**门槛命令（每片收尾都要跑，在 `focus-trainer/` 目录内）：**

```bash
npx tsc --noEmit && npx vitest run
```

预期：tsc 无输出退出 0；vitest 全绿。**基线在开工前实测一次并写进 SDD 台账**，后续片只允许在这个数上加。

---

## Controller amendments（2026-10-21，优先级高于下文代码片段）

用户确认的五节设计有三处在下文被收窄或换了数值。凡与本节冲突，以本节为准；下文未提及的部分照旧。

### A1 `Fx` 必须是三个方法，`tap()` 不能省

用户设计原文是「play.ts 包一层 emit，每次有效输入 fx.tap()」。下文 Task 2 只写了 `hit/miss`，Task 3 的 play.ts 也没包 `tap`，属于无声的缩水。恢复为：

```ts
export interface Fx {
  tap(): void;
  hit(): void;
  miss(): void;
}
```

测试里的假 FX 也要带 `tap: () => calls.push('tap')`（视图测试只断言 hit/miss，不受影响）。

### A2 固定值按设计原文，不按 Task 2 的 25/60/70

`FxEnv.vibrate` 接受 `number | number[]`。`createFx` 的三条通道：

```ts
tap() {
  if (settings.hapticsEnabled) env.vibrate(8);
},
hit() {
  if (settings.hapticsEnabled) env.vibrate(12);
  if (settings.soundEnabled) env.tone(880, 60);
},
miss() {
  if (settings.hapticsEnabled) env.vibrate([18, 40, 18]);
  if (settings.soundEnabled) env.tone(220, 120);
}
```

Task 2 的测试改成先 `fx.tap(); fx.hit(); fx.miss();`，断言：

```ts
expect(e.vibrate.mock.calls).toEqual([[8], [12], [[18, 40, 18]]]);
expect(e.tone.mock.calls).toEqual([[880, 60], [220, 120]]);
```

关闭两开关的用例也要把 `tap()` 一起调掉并断言零调用。

### A3 play.ts 每次有效输入先 `tap()`，再交给引擎

```ts
const fx = createFx(ctx.settings);
const gameView = game.createView(
  stageGame,
  (e) => {
    fx.tap();
    runner.input(e);
  },
  fx,
);
```

视图只会 emit 有效输入（按钮命中或 MOT 的阶段点击），所以包在 emit 外层即可，不碰计时与判分。

### A4 备份载荷带 `format` 标记，兼容 `app`

```ts
export const BACKUP_APP = 'focus-trainer';
export const BACKUP_FORMAT = 'focus-trainer/backup';
export const BACKUP_VERSION = 1;

export interface BackupData extends RepoDump {
  format: typeof BACKUP_FORMAT;
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
}
```

`createBackup` 同时写 `format` 与 `app`。`parseBackup` 的标记判据：

```ts
if (o.format !== BACKUP_FORMAT && o.app !== BACKUP_APP) {
  throw new Error('不是本应用的备份（缺少 format 标记）');
}
```

Task 5/8 里「文本以 `{"app":"focus-trainer"` 开头」的验收改判 `{"format":"focus-trainer/backup"`。

### A5 合并键与档位比较按设计原文

- session 去重键：`` `${s.gameId}|${s.startedAt}` ``（不带 dayKey；`dayKey` 由开始时间与分界时间派生）。
- gameState：档位高者胜；同档位时 `lastPlayedDayKey` 较新者胜（null 视作空串）。实现：

```ts
const newerState = (a: GameState, b: GameState): boolean =>
  a.level !== b.level ? a.level > b.level : (a.lastPlayedDayKey ?? '') > (b.lastPlayedDayKey ?? '');
```

- plan：同 dayKey 的 `completed` 取并集（下文原样）。

### A6 导入必须同时提供「合并」与「覆盖」

下文 Task 6 只做了合并。恢复设计：

```ts
export async function importBackup(
  repo: Repository,
  data: BackupData,
  mode: 'merge' | 'overwrite' = 'merge',
): Promise<ImportSummary>;
```

- `overwrite`：给缺 id 的 session 依次补 id，然后 `repo.loadAll({ sessions, gameStates, plans, settings: data.settings })`，整库替换；summary 的计数就是备份里的条数。设置也随备份恢复。
- `merge`：按 A5 合并；本地设置不是默认值时不覆盖（下文原判定保留）。

设置页交互：文件选择器只把文件内容读进「导入内容」文本框并提示「已读取，请选择合并或覆盖」，不自动导入。页面提供两个按钮「合并导入」「覆盖导入」；覆盖按钮先 `confirm('覆盖导入会清空现有记录，继续？')`，合并也保留现有的确认。

### A7 按压驻留多认一类目标：MOT 的点

五个游戏里四个的输入是 `<button>`；MOT 是 `.mot-field` 里的 `.mot-dot`（div）。选择器改成：

```ts
const PRESS_SELECTOR = 'button, .mot-dot';
```

CSS 分开写，避免给 MOT 的点加 transform（它的位置由 inline transform 驱动）：

```css
button.is-pressed {
  transform: translateY(1px) scale(0.985);
  filter: brightness(0.92);
}

.mot-dot.is-pressed {
  filter: brightness(1.35);
}
```

MOT 点空白处仍只有 `tap()` 的触觉回执，不追求视觉驻留。

### A8 不做的：结果色的 90ms transition-delay

设计原文提到「对错变色再叠 transition-delay: 90ms」。实现时只保留按压驻留这一处 90ms；给判分结果再加延迟会让「答完到看见对错」变慢，且与减少等待的目标相反。若真机上仍觉得反馈太急，再用一条独立 CSS 补。

---

## 文件结构

| 文件 | 新建/修改 | 责任 |
|---|---|---|
| `focus-trainer/src/core/types.ts` | 改 | `Settings` 扩三字段、`ThemeMode`、`Fx`、`createView` 第三参 |
| `focus-trainer/src/core/storage.ts` | 改 | `DEFAULT_SETTINGS`、`RepoDump`、`dumpAll/loadAll` 两种实现、`getSettings` 补齐旧行 |
| `focus-trainer/src/core/backup.ts` | 新 | 备份格式、`createBackup/parseBackup/importBackup` |
| `focus-trainer/src/core/backup.test.ts` | 新 | 导出→解析→导入、合并规则、坏数据拒绝、幂等 |
| `focus-trainer/src/ui/fx.ts` | 新 | 震动/声音通道，按开关门控 |
| `focus-trainer/src/ui/fx.test.ts` | 新 | 通道门控与无环境兜底 |
| `focus-trainer/src/ui/press.ts` | 新 | 90ms 最短按压驻留 |
| `focus-trainer/src/ui/press.test.ts` | 新 | 驻留时长、清理、非按钮不触发 |
| `focus-trainer/src/ui/theme.ts` | 新 | `auto/light/dark` 解析 + 写 `dataset.theme` |
| `focus-trainer/src/ui/theme.test.ts` | 新 | 解析表、无 matchMedia 兜底、写入 |
| `focus-trainer/src/games/*/view.ts`（5 个） | 改 | `render` 上升沿触发 `fx.hit()/miss()` |
| `focus-trainer/src/games/*/view.test.ts`（5 个） | 改 | 每个视图一条「只触发一次」的用例 |
| `focus-trainer/src/ui/pages/play.ts` | 改 | 创建 `fx`、传入视图、挂载/卸载 press |
| `focus-trainer/src/ui/pages/settings.ts` | 改 | 主题/震动/声音开关 + 备份区 |
| `focus-trainer/src/ui/styles.css` | 改 | `.is-pressed`、深色 token、备份文本框 |
| `focus-trainer/src/ui/styles.test.ts` | 改 | 深色 token 与对比度护栏、层叠顺序 |
| `focus-trainer/src/main.ts` | 改 | boot 时应用主题 + 监听系统主题变化 |
| `focus-trainer/src/main.test.ts` | 改 | `documentElement` 桩、设置字面量、主题断言 |
| `focus-trainer/src/core/storage.test.ts` | 改 | 设置默认值/往返、`dumpAll/loadAll` 三例（两种实现各跑一遍） |
| `focus-trainer/src/ui/pages/*.test.ts`（四份） | 改 | 只改 `ctx.settings` 字面量 |
| `focus-trainer/android/app/src/main/AndroidManifest.xml` | 改 | `VIBRATE` 权限 |
| `focus-trainer/scripts/verify-apk.mjs` | 改 | 第 14 项断言 |
| `docs/superpowers/plans/2026-10-20-m4-acceptance.md` | 改 | §13 记录新包身份与新口径 |
| `docs/superpowers/plans/2026-10-20-m4-realdevice-runbook.md` | 改 | 包体积/时间/正身判据同步 |
| `README.md` | 改 | 功能清单、门槛数、verify 项数 |

---

### Task 1: `Settings` 扩三字段，存储读取补齐旧行

这一片只动数据模型和读取路径，不碰任何 UI。完成后 App 行为与现在完全一致，但设置里已经能存下主题与两个反馈开关。

**Files:**
- Modify: `focus-trainer/src/core/types.ts:108-110`
- Modify: `focus-trainer/src/core/storage.ts:4`、`:94-100`、`:202-205`
- Modify: `focus-trainer/src/core/storage.test.ts:87-91`、`:139-147`
- Modify: `focus-trainer/src/main.test.ts:431`
- Modify: `focus-trainer/src/ui/pages/home.test.ts:165`
- Modify: `focus-trainer/src/ui/pages/library.test.ts:165`
- Modify: `focus-trainer/src/ui/pages/play.test.ts:134`
- Modify: `focus-trainer/src/ui/pages/trends.test.ts:140`、`:168`

**Interfaces:**
- Consumes: 现有 `Settings`（只有 `dayStartHour`）。
- Produces:
  - `export type ThemeMode = 'auto' | 'light' | 'dark';`
  - `export interface Settings { dayStartHour: number; theme: ThemeMode; hapticsEnabled: boolean; soundEnabled: boolean; }`
  - `DEFAULT_SETTINGS: Settings`（`4 / 'auto' / true / false`）——Task 2/3/4/6 一律从这里取默认值，不再各自写字面量。

- [ ] **Step 1: 改类型与默认值**

`src/core/types.ts:108-110` 整段替换为：

```ts
export type ThemeMode = 'auto' | 'light' | 'dark';

export interface Settings {
  dayStartHour: number;
  theme: ThemeMode;
  hapticsEnabled: boolean;
  soundEnabled: boolean;
}
```

`src/core/storage.ts:4` 替换为：

```ts
export const DEFAULT_SETTINGS: Settings = { dayStartHour: 4, theme: 'auto', hapticsEnabled: true, soundEnabled: false };
```

- [ ] **Step 2: 让 IndexedDB 的 `getSettings` 补旧行缺的字段**

`src/core/storage.ts:202-205` 的 `IdbRepository.getSettings` 替换为（`row` 按 `Partial<Settings>` 读，旧库只有 `dayStartHour` 时用默认值补齐；显式逐字段写，不能 `{...DEFAULT_SETTINGS, ...row}`，否则 `key` 字段会被带进返回值，`toEqual` 就会看见多余键）：

```ts
  async getSettings(): Promise<Settings> {
    const row = await req<(Partial<Settings> & { key: string }) | undefined>(this.store('settings').get(SETTINGS_KEY));
    return {
      dayStartHour: row?.dayStartHour ?? DEFAULT_SETTINGS.dayStartHour,
      theme: row?.theme ?? DEFAULT_SETTINGS.theme,
      hapticsEnabled: row?.hapticsEnabled ?? DEFAULT_SETTINGS.hapticsEnabled,
      soundEnabled: row?.soundEnabled ?? DEFAULT_SETTINGS.soundEnabled,
    };
  }
```

`MemoryRepository.getSettings`（`:94-96`）已经返回完整对象，不动；`putSettings`（`:98-100`、`:207-212`）本来就整对象写入，不动。

- [ ] **Step 3: 先把测试改成新口径（此时会红）**

`src/core/storage.test.ts:87-91` 的「设置有默认值并能往返」替换为：

```ts
  it('设置有默认值并能往返', async () => {
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    await repo.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    expect(await repo.getSettings()).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
  });
```

同文件 `:141` 的 `await repo.putSettings({ dayStartHour: 0 });` 改成：

```ts
    await repo.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 0 });
```

`:146` 的 `expect(await repo.getSettings()).toEqual({ dayStartHour: 4 });` 改成：

```ts
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
```

文件顶部 `:3` 的导入追加 `DEFAULT_SETTINGS`：

```ts
import { DEFAULT_SETTINGS, MemoryRepository, defaultGameState, openIdbRepository, type Repository } from './storage';
```

`src/main.test.ts:431` 改成：

```ts
    expect(entry.ctx.settings).toEqual({ dayStartHour: 4, theme: 'auto', hapticsEnabled: true, soundEnabled: false });
```

四份页面测试的 `ctx.settings` 字面量统一替换为完整对象：

```ts
  const ctx: AppContext = { repo, storageOk: true, settings: { dayStartHour: 4, theme: 'auto', hapticsEnabled: true, soundEnabled: false } };
```

对应位置：`home.test.ts:165`、`library.test.ts:165`、`play.test.ts:134`、`trends.test.ts:168`。`trends.test.ts:140` 的假仓库改成同一形状：

```ts
    getSettings: async () => ({ dayStartHour: 4, theme: 'auto', hapticsEnabled: true, soundEnabled: false }),
```

- [ ] **Step 4: 跑门槛确认红→绿**

Run: `npx tsc --noEmit`
Expected: 无输出（若在改测试字面量之前跑，会看到 `Property 'theme' is missing …` 指向尚未同步的测试对象；按 Step 3 改完即消失）。

Run: `npx vitest run src/core/storage.test.ts src/main.test.ts src/ui/pages`
Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
git add focus-trainer/src/core/types.ts focus-trainer/src/core/storage.ts focus-trainer/src/core/storage.test.ts focus-trainer/src/main.test.ts focus-trainer/src/ui/pages/home.test.ts focus-trainer/src/ui/pages/library.test.ts focus-trainer/src/ui/pages/play.test.ts focus-trainer/src/ui/pages/trends.test.ts
git commit -m "feat(settings): 设置扩出主题与反馈开关，旧库读取按默认值补齐"
```

---

### Task 2: `Fx` 通道（震动 + 声音）

纯逻辑模块：把「命中/未命中该发什么」与「设备怎么发」分开，测试注入假 `FxEnv`，node 环境不需要 `navigator.vibrate` 或 `AudioContext`。

**Files:**
- Modify: `focus-trainer/src/core/types.ts`（新增 `Fx` 接口，供 `GameModule.createView` 使用）
- Create: `focus-trainer/src/ui/fx.ts`
- Create: `focus-trainer/src/ui/fx.test.ts`

**Interfaces:**
- Consumes: `Settings` 的 `hapticsEnabled` / `soundEnabled`（Task 1）。
- Produces:
  - `core/types.ts`: `export interface Fx { hit(): void; miss(): void; }`
  - `ui/fx.ts`: `export type FxSettings = Pick<Settings, 'hapticsEnabled' | 'soundEnabled'>;`、`export interface FxEnv { vibrate(ms: number): void; tone(freq: number, ms: number): void; }`、`export function createFx(settings: FxSettings, env?: FxEnv): Fx`。
  - 时长/频率是本计划的固定值：命中震动 25ms、声音 880Hz/70ms；未命中震动 60ms、声音 220Hz/120ms。Task 3 的视图只调 `hit()/miss()`，不关心这些数。

- [ ] **Step 1: 在 `core/types.ts` 加 `Fx`**

在 `GameView` 接口之前插入：

```ts
export interface Fx {
  hit(): void;
  miss(): void;
}
```

- [ ] **Step 2: 写失败的测试**

新建 `src/ui/fx.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest';
import { createFx } from './fx';

function env() {
  return { vibrate: vi.fn(), tone: vi.fn() };
}

describe('createFx', () => {
  it('两个通道都开时，命中与未命中各触发一次且参数不同', () => {
    const e = env();
    const fx = createFx({ hapticsEnabled: true, soundEnabled: true }, e);
    fx.hit();
    fx.miss();
    expect(e.vibrate.mock.calls).toEqual([[25], [60]]);
    expect(e.tone.mock.calls).toEqual([[880, 70], [220, 120]]);
  });

  it('开关关闭时对应通道一次都不调用', () => {
    const e = env();
    const fx = createFx({ hapticsEnabled: false, soundEnabled: false }, e);
    fx.hit();
    fx.miss();
    expect(e.vibrate).not.toHaveBeenCalled();
    expect(e.tone).not.toHaveBeenCalled();
  });

  it('默认环境在没有 vibrate / AudioContext 时不抛错', () => {
    const fx = createFx({ hapticsEnabled: true, soundEnabled: true });
    expect(() => {
      fx.hit();
      fx.miss();
    }).not.toThrow();
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/ui/fx.test.ts`
Expected: FAIL —— 找不到模块 `./fx`。

- [ ] **Step 4: 写实现**

新建 `src/ui/fx.ts`：

```ts
import type { Fx, Settings } from '../core/types';

export type FxSettings = Pick<Settings, 'hapticsEnabled' | 'soundEnabled'>;

export interface FxEnv {
  vibrate(ms: number): void;
  tone(freq: number, ms: number): void;
}

function defaultEnv(): FxEnv {
  let ctx: AudioContext | null = null;

  const audio = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  };

  return {
    vibrate(ms) {
      const nav = (globalThis as { navigator?: { vibrate?: (n: number) => boolean } }).navigator;
      nav?.vibrate?.(ms);
    },
    tone(freq, ms) {
      const ac = audio();
      if (!ac) return;
      // 首次发声一定发生在一次真实点按之后的 rAF 里；若上下文仍是 suspended，
      // 这里 resume 一次，失败也只是这一声不响，不影响游戏。
      if (ac.state === 'suspended') void ac.resume();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ac.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + ms / 1000);
    },
  };
}

export function createFx(settings: FxSettings, env: FxEnv = defaultEnv()): Fx {
  return {
    hit() {
      if (settings.hapticsEnabled) env.vibrate(25);
      if (settings.soundEnabled) env.tone(880, 70);
    },
    miss() {
      if (settings.hapticsEnabled) env.vibrate(60);
      if (settings.soundEnabled) env.tone(220, 120);
    },
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/ui/fx.test.ts`
Expected: 3 passed。

- [ ] **Step 6: 提交**

```bash
git add focus-trainer/src/core/types.ts focus-trainer/src/ui/fx.ts focus-trainer/src/ui/fx.test.ts
git commit -m "feat(ux): 新增震动/声音反馈通道，按设置开关门控"
```

---

### Task 3: 五个视图接反馈 + 90ms 按压驻留 + 设置页开关

`createView` 加可选第三参，五个视图在 `render` 里做上升沿检测；`play.ts` 创建并传入 `fx`、挂载 `attachPressDwell`；设置页补两个开关。**每试次只触发一次**是本任务的核心判据。

**Files:**
- Modify: `focus-trainer/src/core/types.ts:71`（`createView` 签名）
- Modify: `focus-trainer/src/games/schulte/view.ts:9`、`:31-56`
- Modify: `focus-trainer/src/games/stroop/view.ts:5`、`:31-59`
- Modify: `focus-trainer/src/games/seqmem/view.ts:17`、`:39-62`
- Modify: `focus-trainer/src/games/mot/view.ts:7`、`:47-72`
- Modify: `focus-trainer/src/games/gestalt/view.ts:42`、`:89-110`
- Modify: 五份 `view.test.ts`（`mount` 加可选 `fx` 参数 + 各一条新用例）
- Modify: `focus-trainer/src/ui/pages/play.ts:1-8`、`:85`、`:203-213`
- Create: `focus-trainer/src/ui/press.ts`
- Create: `focus-trainer/src/ui/press.test.ts`
- Modify: `focus-trainer/src/ui/pages/settings.ts`
- Modify: `focus-trainer/src/ui/styles.css:173-175` 附近、`:951-964`

**Interfaces:**
- Consumes: `Fx`（Task 2）、`createFx`（Task 2）、`Settings`（Task 1）。
- Produces:
  - `GameModule.createView(host: HTMLElement, emit: (e: InputEvent) => void, fx?: Fx): GameView;`
  - `ui/press.ts`: `export const PRESS_MS = 90;`、`export function attachPressDwell(root: HTMLElement, ms?: number): () => void;`（返回卸载函数，`play.ts` 在 abort 里调用）。
  - 设置页新增两个复选框，标签分别是「震动反馈」「声音反馈」。

- [ ] **Step 1: 改 `createView` 签名**

`src/core/types.ts:71`：

```ts
  createView(host: HTMLElement, emit: (e: InputEvent) => void, fx?: Fx): GameView;
```

五个 `index.ts` 都是直接传函数引用（如 `createView: createSchulteView`），函数多一个可选参数即可，不需要改注册表。

- [ ] **Step 2: 写五个视图的失败测试**

每个 `view.test.ts` 的 `mount` 函数加可选第三参并透传。以舒尔特为例（`src/games/schulte/view.test.ts:129-137`）：

```ts
function mount(s: SchulteSnapshot, fx?: Fx): Mounted {
  installDom();
  const host = new StubEl('div');
  const inputs: InputEvent[] = [];
  const view = createSchulteView(host as unknown as HTMLElement, (e) => inputs.push(e), fx);
  view.render(s);
  const root = host.children[0];
  return { host, grid: root.children[1], inputs, view };
}
```

文件顶部 `import type { Fx, GameView, InputEvent } from '../../core/types';`（其余四处把 `Fx` 加进已有的类型导入）。

其余四处的改法相同，只换快照类型与工厂名，第三参一律透传 `fx`：

- `function mount(s: StroopSnapshot, fx?: Fx): Mounted` → `createStroopView(host as unknown as HTMLElement, (e) => inputs.push(e), fx)`
- `function mount(s: SeqmemSnapshot, fx?: Fx): Mounted` → `createSeqmemView(host as unknown as HTMLElement, (e) => inputs.push(e), fx)`
- `function mount(s: MotSnapshot, fx?: Fx): Mounted` → `createMotView(host as unknown as HTMLElement, (e) => inputs.push(e), fx)`
- `function mount(s: GestaltSnapshot, fx?: Fx): Mounted` → `createGestaltView(host as unknown as HTMLElement, (e) => inputs.push(e), fx)`

每个文件新增一条用例（放在 `describe('createXxxView')` 末尾）：

舒尔特：

```ts
  it('答对一格只 hit 一次、误点只 miss 一次（每帧 render 不重复触发）', () => {
    const calls: string[] = [];
    const fx = { hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    const oneDone = [cell('1', true), ...snap().cells.slice(1)];
    view.render(snap({ cells: oneDone }));
    view.render(snap({ cells: oneDone }));
    expect(calls).toEqual(['hit']);
    view.render(snap({ cells: oneDone, errors: 1, flashIndex: 0 }));
    expect(calls).toEqual(['hit', 'miss']);
  });
```

Stroop：

```ts
  it('进入 feedback 的上升沿按对错各触发一次', () => {
    const calls: string[] = [];
    const fx = { hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    view.render(snap({ phase: 'feedback', feedbackChoice: 1, feedbackOk: true }));
    view.render(snap({ phase: 'feedback', feedbackChoice: 1, feedbackOk: true }));
    expect(calls).toEqual(['hit']);
    view.render(snap());
    view.render(snap({ phase: 'feedback', feedbackChoice: null, feedbackOk: false }));
    expect(calls).toEqual(['hit', 'miss']);
  });
```

Seqmem：

```ts
  it('进入 reveal 的上升沿按对错触发，回放后再错一次仍会 miss', () => {
    const calls: string[] = [];
    const fx = { hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    view.render(snap({ phase: 'reveal', tapped: [0, 1, 2], wrongIndex: null }));
    view.render(snap({ phase: 'reveal', tapped: [0, 1, 2], wrongIndex: null }));
    expect(calls).toEqual(['hit']);
    view.render(snap({ phase: 'replay' }));
    view.render(snap({ phase: 'reveal', wrongIndex: 4 }));
    expect(calls).toEqual(['hit', 'miss']);
  });
```

MOT（漏选优先于命中，因为「少追到一个」比「追对了几个」更需要立刻被感知）：

```ts
  it('进入 feedback 时按标记触发：有漏选/错选就 miss，全中才 hit', () => {
    const calls: string[] = [];
    const fx = { hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    const mixed = [vd({ id: 0, target: true, mark: 'hit' }), vd({ id: 1, target: true, mark: 'missed' })];
    view.render(snap({ phase: 'feedback', dots: mixed }));
    view.render(snap({ phase: 'feedback', dots: mixed }));
    expect(calls).toEqual(['miss']);
    view.render(snap({ phase: 'motion', dots: mixed }));
    view.render(snap({ phase: 'feedback', dots: [vd({ id: 0, target: true, mark: 'hit' })] }));
    expect(calls).toEqual(['miss', 'hit']);
  });
```

Gestalt：

```ts
  it('进入 feedback 的上升沿按对错各触发一次', () => {
    const calls: string[] = [];
    const fx = { hit: () => calls.push('hit'), miss: () => calls.push('miss') };
    const { view } = mount(snap(), fx);
    const choices = [choice('circle'), choice('bolt'), choice('star5'), choice('house')];
    view.render(snap({ phase: 'feedback', choices, answeredIndex: 1, correctIndex: 1 }));
    view.render(snap({ phase: 'feedback', choices, answeredIndex: 1, correctIndex: 1 }));
    expect(calls).toEqual(['hit']);
    view.render(snap({ phase: 'answer', choices }));
    view.render(snap({ phase: 'feedback', choices, answeredIndex: 0, correctIndex: 1 }));
    expect(calls).toEqual(['hit', 'miss']);
  });
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/games`
Expected: 5 条新用例 FAIL（`fx` 没被调用），其余全绿。

- [ ] **Step 4: 给五个视图接上升沿**

`src/games/schulte/view.ts`：签名改成 `(host: HTMLElement, emit: (e: InputEvent) => void, fx?: Fx)`，顶部导入 `Fx`；在 `let buttons` 旁加：

```ts
  let prevDone = -1;
  let prevErrors = -1;
```

在 `render(s)` 的 `s.cells.forEach(...)` 之后、`info.textContent = ...` 之前插入：

```ts
      const doneCount = s.cells.filter((c) => c.done).length;
      if (prevDone >= 0) {
        if (s.errors > prevErrors) fx?.miss();
        else if (doneCount > prevDone) fx?.hit();
      }
      prevDone = doneCount;
      prevErrors = s.errors;
```

`src/games/stroop/view.ts`：签名加 `fx?: Fx`；加 `let prevPhase: StroopSnapshot['phase'] | null = null;`；在 `render` 末尾插入：

```ts
      if (s.phase === 'feedback' && prevPhase !== 'feedback') {
        if (s.feedbackOk) fx?.hit();
        else fx?.miss();
      }
      prevPhase = s.phase;
```

`src/games/seqmem/view.ts`：签名加 `fx?: Fx`；加 `let prevPhase: SeqmemSnapshot['phase'] | null = null;`；在 `render` 末尾插入：

```ts
      if (s.phase === 'reveal' && prevPhase !== 'reveal') {
        if (s.wrongIndex === null) fx?.hit();
        else fx?.miss();
      }
      prevPhase = s.phase;
```

`src/games/mot/view.ts`：签名加 `fx?: Fx`；加 `let prevPhase: MotSnapshot['phase'] | null = null;`；在 `render` 末尾插入：

```ts
      if (s.phase === 'feedback' && prevPhase !== 'feedback') {
        const hits = s.dots.filter((d) => d.mark === 'hit').length;
        const misses = s.dots.filter((d) => d.mark === 'wrong' || d.mark === 'missed').length;
        if (misses > 0) fx?.miss();
        else if (hits > 0) fx?.hit();
      }
      prevPhase = s.phase;
```

`src/games/gestalt/view.ts`：签名加 `fx?: Fx`；加 `let prevPhase: GestaltSnapshot['phase'] | null = null;`；在 `render` 末尾插入：

```ts
      if (s.phase === 'feedback' && prevPhase !== 'feedback' && s.answeredIndex !== null) {
        if (s.answeredIndex === s.correctIndex) fx?.hit();
        else fx?.miss();
      }
      prevPhase = s.phase;
```

注意：五个视图都不新增任何计时器；gestalt 的「源码里不许出现 setTimeout」那条护栏必须继续绿。

- [ ] **Step 5: 写 `press.ts` 的失败测试**

新建 `src/ui/press.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRESS_MS, attachPressDwell } from './press';

class El {
  readonly classes = new Set<string>();
  private readonly handlers: Array<{ type: string; fn: (ev: never) => void }> = [];

  constructor(readonly tag: string) {}

  get classList(): { add(c: string): void; remove(c: string): void; contains(c: string): boolean } {
    const classes = this.classes;
    return {
      add: (c) => void classes.add(c),
      remove: (c) => void classes.delete(c),
      contains: (c) => classes.has(c),
    };
  }

  closest(sel: string): El | null {
    return sel === 'button' && this.tag === 'button' ? this : null;
  }

  addEventListener(type: string, fn: (ev: never) => void): void {
    this.handlers.push({ type, fn });
  }

  removeEventListener(type: string, fn: (ev: never) => void): void {
    const i = this.handlers.findIndex((h) => h.type === type && h.fn === fn);
    if (i >= 0) this.handlers.splice(i, 1);
  }

  fire(type: string, ev: Record<string, unknown>): void {
    for (const h of this.handlers.filter((x) => x.type === type)) (h.fn as (e: unknown) => void)(ev);
  }
}

function stubDom(): void {
  vi.stubGlobal('Element', El);
  vi.stubGlobal('HTMLElement', El);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('attachPressDwell', () => {
  it('按下加 .is-pressed，满 90ms 才摘掉', () => {
    stubDom();
    vi.useFakeTimers();
    const root = new El('div');
    const btn = new El('button');
    const detach = attachPressDwell(root as unknown as HTMLElement);
    root.fire('pointerdown', { target: btn });
    expect(btn.classes.has('is-pressed')).toBe(true);
    vi.advanceTimersByTime(PRESS_MS - 1);
    expect(btn.classes.has('is-pressed')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(btn.classes.has('is-pressed')).toBe(false);
    detach();
  });

  it('非按钮目标不加类', () => {
    stubDom();
    const root = new El('div');
    const plain = new El('div');
    const detach = attachPressDwell(root as unknown as HTMLElement);
    root.fire('pointerdown', { target: plain });
    expect(plain.classes.size).toBe(0);
    detach();
  });

  it('卸载后清掉未到期的计时器，不再回调', () => {
    stubDom();
    vi.useFakeTimers();
    const root = new El('div');
    const btn = new El('button');
    const detach = attachPressDwell(root as unknown as HTMLElement);
    root.fire('pointerdown', { target: btn });
    detach();
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 6: 跑测试确认失败，然后写实现**

Run: `npx vitest run src/ui/press.test.ts`
Expected: FAIL —— 找不到模块 `./press`。

新建 `src/ui/press.ts`：

```ts
export const PRESS_MS = 90;

// 极快的点按在视觉上只有一帧，和「没点到」分不清。按下态至少驻留 PRESS_MS，
// 让每一次有效输入都留下一次可见的压下-回弹；到点后由计时器摘除，不依赖 pointerup。
export function attachPressDwell(root: HTMLElement, ms = PRESS_MS): () => void {
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  const onDown = (ev: PointerEvent): void => {
    const target = ev.target instanceof Element ? ev.target.closest('button') : null;
    if (!(target instanceof HTMLElement)) return;
    target.classList.add('is-pressed');
    const old = timers.get(target);
    if (old !== undefined) clearTimeout(old);
    timers.set(
      target,
      setTimeout(() => {
        timers.delete(target);
        target.classList.remove('is-pressed');
      }, ms),
    );
  };

  root.addEventListener('pointerdown', onDown);
  return () => {
    root.removeEventListener('pointerdown', onDown);
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
  };
}
```

Run: `npx vitest run src/ui/press.test.ts`
Expected: 3 passed。

- [ ] **Step 7: 在 `play.ts` 接线**

顶部导入：

```ts
import { createFx } from '../fx';
import { attachPressDwell } from '../press';
```

`play.ts:85` 的 `const gameView = ...` 前加一行，并把它改成三参：

```ts
  const fx = createFx(ctx.settings);
  const gameView = game.createView(stageGame, (e) => runner.input(e), fx);
  const detachPress = attachPressDwell(stageGame);
```

在 `signal.addEventListener('abort', () => { ... })` 的回调里、`gameView.destroy()` 之前加一行：

```ts
      detachPress();
```

- [ ] **Step 8: 设置页补两个开关**

`src/ui/pages/settings.ts` 顶部导入：

```ts
import type { Settings } from '../../core/types';
```

插入在 `HOURS` 之后：

```ts
async function save(ctx: AppContext, patch: Partial<Settings>, note: HTMLElement, text: string): Promise<void> {
  const settings: Settings = { ...ctx.settings, ...patch };
  await ctx.repo.putSettings(settings);
  ctx.settings = settings;
  note.textContent = text;
}
```

把现有的 `select.addEventListener('change', async () => { ... })`（`:19-24`）整段替换成走 `save` 的这一段——全页只留一条写设置的路径：

```ts
  select.addEventListener('change', () => {
    const dayStartHour = Number(select.value);
    void save(ctx, { dayStartHour }, note, `已保存：每天 ${dayStartHour}:00 开始新的一天。`);
  });
```

（Task 4 会在这个函数体里补 `applyTheme`，所以先把它做成单独函数。）

在 `const clear = ...` 之前插入：

```ts
  const haptics = h('input', { type: 'checkbox', 'aria-label': '震动反馈' });
  haptics.checked = ctx.settings.hapticsEnabled;
  haptics.addEventListener('change', () => {
    void save(ctx, { hapticsEnabled: haptics.checked }, note, `震动反馈已${haptics.checked ? '开启' : '关闭'}。`);
  });
  const sound = h('input', { type: 'checkbox', 'aria-label': '声音反馈' });
  sound.checked = ctx.settings.soundEnabled;
  sound.addEventListener('change', () => {
    void save(ctx, { soundEnabled: sound.checked }, note, `声音反馈已${sound.checked ? '开启' : '关闭'}。`);
  });
```

`view.replaceChildren(...)` 里，在每日分界时间的卡片后面加两行 `<label class="card">`——整行可点，复选框本身不用撑到 48px 也就有了 56px 的触控行高：

```ts
    h('label', { class: 'card' }, h('span', null, '震动反馈'), h('span', { class: 'spacer' }), haptics),
    h('label', { class: 'card' }, h('span', null, '声音反馈'), h('span', { class: 'spacer' }), sound),
```

- [ ] **Step 9: 加 `.is-pressed` 样式**

`src/ui/styles.css` 在 `button:disabled { ... }`（`:173-175`）之后插入：

```css
/* 按下态至少驻留 90ms（src/ui/press.ts）。只用于训练区按钮：play.ts 把监听挂在
   .stage-game 上，说明层与页签都不会被这条规则影响。 */
button.is-pressed {
  transform: translateY(1px) scale(0.985);
  filter: brightness(0.92);
}

/* 设置页的两个开关用整行 <label class="card"> 当触控面（56px 行高），复选框只负责看得清。 */
label.card {
  cursor: pointer;
}

.card input[type='checkbox'] {
  width: 24px;
  height: 24px;
  margin: 0;
  accent-color: var(--focus);
}
```

`@media (prefers-reduced-motion: reduce)` 块（`:951-964`）里追加：

```css
  button.is-pressed {
    transform: none;
  }
```

- [ ] **Step 10: 跑门槛**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全绿；新用例 = 5 个视图 + 3 个 press。

- [ ] **Step 11: 提交**

```bash
git add focus-trainer/src/core/types.ts focus-trainer/src/games focus-trainer/src/ui/fx.ts focus-trainer/src/ui/press.ts focus-trainer/src/ui/press.test.ts focus-trainer/src/ui/pages/play.ts focus-trainer/src/ui/pages/settings.ts focus-trainer/src/ui/styles.css
git commit -m "feat(ux): 五个游戏接上升沿反馈，点按驻留 90ms，设置页补震动/声音开关"
```

---

### Task 4: 深色主题（跟随系统 / 浅色 / 深色）

`html[data-theme]` + 一组 token 覆盖；`boot()` 应用并在 `auto` 下监听系统变化；设置页加主题选择。训练态的取值全部声明在 `body.training` 上，对 `body` 及其后代永远优先于从 `html` 继承下来的深色 token；唯一要防的是纸纹那条**选择器带 `body`** 的规则——它必须写成 `body:not(.training)`，否则 (0,1,2) 会压过 `body.training` 的 (0,1,1)，训练页的 `background-image: none` 静默失效。

**Files:**
- Create: `focus-trainer/src/ui/theme.ts`
- Create: `focus-trainer/src/ui/theme.test.ts`
- Modify: `focus-trainer/src/main.ts:1-13`、`:50`
- Modify: `focus-trainer/src/main.test.ts:225-246`（document 桩）、`:345-369`（返回值）
- Modify: `focus-trainer/src/ui/pages/settings.ts`
- Modify: `focus-trainer/src/ui/styles.css:34-40`（插入深色块）
- Modify: `focus-trainer/src/ui/styles.test.ts`（文件末尾新增 describe）

**Interfaces:**
- Consumes: `ThemeMode`、`Settings.theme`（Task 1）。
- Produces:
  - `export type ResolvedTheme = 'light' | 'dark';`
  - `export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme;`
  - `export function systemPrefersDark(): boolean;`
  - `export function applyTheme(root: HTMLElement | null | undefined, mode: ThemeMode): void;`
  - 设置页第三个下拉「主题」，取值就是 `ThemeMode` 三档。

- [ ] **Step 1: 写失败的测试**

新建 `src/ui/theme.test.ts`：

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, resolveTheme, systemPrefersDark } from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('主题解析与应用', () => {
  it('auto 跟随系统，light/dark 直接采用', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('没有 matchMedia 的环境按浅色处理', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersDark()).toBe(false);
  });

  it('applyTheme 把解析结果写进 dataset.theme', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark') }));
    const root = { dataset: {} } as unknown as HTMLElement;
    applyTheme(root, 'auto');
    expect(root.dataset.theme).toBe('dark');
    applyTheme(root, 'light');
    expect(root.dataset.theme).toBe('light');
  });

  it('root 为空时静默返回', () => {
    expect(() => applyTheme(null, 'dark')).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/ui/theme.test.ts`
Expected: FAIL —— 找不到模块 `./theme`。

- [ ] **Step 3: 写 `theme.ts`**

```ts
import type { ThemeMode } from '../core/types';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'auto') return systemDark ? 'dark' : 'light';
  return mode;
}

export function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// 只写 dataset，不碰 class：训练态用 body.training，两者互不覆盖。
export function applyTheme(root: HTMLElement | null | undefined, mode: ThemeMode): void {
  if (!root) return;
  root.dataset.theme = resolveTheme(mode, systemPrefersDark());
}
```

Run: `npx vitest run src/ui/theme.test.ts`
Expected: 4 passed。

- [ ] **Step 4: 写深色 token（CSS）**

`src/ui/styles.css` 在 `:root { ... }` 结束（`:34`）与 `body.training` 的注释（`:36`）之间插入：

```css
/* 深色主题：只覆盖页面 chrome 的九个 token，不碰 --stage 与训练态取值。
   别名 --bg/--panel/--line/--text/--muted/--accent 都在 :root 里以 var() 指向这些名字，
   这里改名字本身即可跟着变；训练态的七个旧名都声明在 body.training 上，
   对 body 及其后代永远优先于从 html 继承下来的值。 */
html[data-theme='dark'] {
  color-scheme: dark;
  --paper: #15181c;
  --card: #1d2126;
  --ink: #e6e8ea;
  --ink-2: #9aa4b0;
  --rule: #343a42;
  --focus: #8ab4f8;
  --done: #6fbf8a;
  --bad: #f28b82;
  --on-accent: #0b1a2e;
}

/* 纸纹这条规则带 body，特异度 (0,1,2) 会压过 body.training 的 (0,1,1)：
   必须排除 .training，训练页才能保住 background-image: none。 */
html[data-theme='dark'] body:not(.training) {
  background-image: repeating-linear-gradient(to right, rgba(138, 180, 248, 0.05) 0 1px, transparent 1px 24px),
    repeating-linear-gradient(to bottom, rgba(138, 180, 248, 0.05) 0 1px, transparent 1px 24px);
}

/* --bad 在深色调亮成 #f28b82（danger 文字对卡面才够 4.5:1）；
   #banner 的白字压在亮红上只剩约 2.5:1，横幅单独换深红底。 */
html[data-theme='dark'] #banner {
  background: #7a2e26;
  color: #fbfbf8;
}
```

- [ ] **Step 5: 写样式护栏**

`src/ui/styles.test.ts` 末尾新增：

```ts
describe('深色主题', () => {
  it('html[data-theme=dark] 覆盖九个 chrome token 并切换 color-scheme', () => {
    expect(decl("html[data-theme='dark']", '--paper')).toBe('#15181c');
    expect(decl("html[data-theme='dark']", '--card')).toBe('#1d2126');
    expect(decl("html[data-theme='dark']", '--ink')).toBe('#e6e8ea');
    expect(decl("html[data-theme='dark']", '--ink-2')).toBe('#9aa4b0');
    expect(decl("html[data-theme='dark']", '--rule')).toBe('#343a42');
    expect(decl("html[data-theme='dark']", '--focus')).toBe('#8ab4f8');
    expect(decl("html[data-theme='dark']", '--done')).toBe('#6fbf8a');
    expect(decl("html[data-theme='dark']", '--bad')).toBe('#f28b82');
    expect(decl("html[data-theme='dark']", '--on-accent')).toBe('#0b1a2e');
    expect(decl("html[data-theme='dark']", 'color-scheme')).toBe('dark');
  });

  it('深色正文/弱字/强调/完成/错误对各自底色 ≥ 4.5:1', () => {
    expect(ratio('#e6e8ea', '#15181c')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#9aa4b0', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#8ab4f8', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#6fbf8a', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#f28b82', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#0b1a2e', '#8ab4f8')).toBeGreaterThanOrEqual(4.5);
  });

  it('深色纸纹只落在非训练页（训练态必须保住 background-image: none）', () => {
    expect(decl("html[data-theme='dark'] body:not(.training)", 'background-image')).toContain('repeating-linear-gradient');
    // 负向护栏：写成 html[data-theme='dark'] body 时，body.training 自己的 background-image: none
    // 声明还在（styles.test.ts:198 照样绿），但训练页实际会被纸纹盖掉，而真机才会看见。
    expect(cssStripped).not.toMatch(/html\[data-theme='dark'\]\s+body\s*\{/);
  });

  it('深色横幅换深红底，白字仍 ≥4.5:1（--bad 调亮后不能直接当横幅底色）', () => {
    expect(decl("html[data-theme='dark'] #banner", 'background')).toBe('#7a2e26');
    expect(ratio('#fbfbf8', '#7a2e26')).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 6: boot 时应用主题**

`src/main.ts` 顶部加导入：

```ts
import { applyTheme } from './ui/theme';
```

`src/main.ts:50` 之后插入：

```ts
  applyTheme(document.documentElement, ctx.settings.theme);
  const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener('change', () => applyTheme(document.documentElement, ctx.settings.theme));
```

- [ ] **Step 7: 补 boot 桩并断言**

`src/main.test.ts` 的 document 桩（`:225-246`）加一行 `documentElement`：

```ts
  const doc = {
    visibilityState: 'visible',
    body,
    documentElement: new StubEl('html'),
    getElementById: (id: string): StubEl | null => byId[id] ?? null,
```

`doc` 本来就原样放在 harness 的返回值里（`:350`），断言走 `h.doc.documentElement` 即可，不用新增返回字段。

在「IndexedDB 正常打开时顶部提示保持隐藏」那条用例里加一条断言（`auto` + 桩里没有 matchMedia ⇒ 浅色）：

```ts
    expect(h.doc.documentElement.dataset.theme).toBe('light');
```

- [ ] **Step 8: 设置页加主题下拉**

`src/ui/pages/settings.ts` 顶部：把 Task 3 加的那行类型导入换成同时取 `ThemeMode`，并加 `applyTheme`：

```ts
import type { Settings, ThemeMode } from '../../core/types';
import { applyTheme } from '../theme';
```

`HOURS` 之后加：

```ts
const THEMES: ReadonlyArray<readonly [ThemeMode, string]> = [
  ['auto', '跟随系统'],
  ['light', '浅色'],
  ['dark', '深色'],
];
```

在 `const clear = ...` 之前加：

```ts
  const themeSelect = h(
    'select',
    { 'aria-label': '主题' },
    ...THEMES.map(([value, label]) => {
      const option = h('option', { value }, label);
      option.selected = value === ctx.settings.theme;
      return option;
    }),
  );
  themeSelect.addEventListener('change', () => {
    void save(ctx, { theme: themeSelect.value as ThemeMode }, note, '主题已保存。');
  });
```

`save` 函数体里补一行（放在 `ctx.settings = settings;` 之后）：

```ts
  applyTheme(document.documentElement, settings.theme);
```

`view.replaceChildren(...)` 里，把主题卡片插在每日分界时间卡片之后、震动卡片之前：

```ts
    h('div', { class: 'card' }, h('span', null, '主题'), h('span', { class: 'spacer' }), themeSelect),
```

清空数据的处理器在 `ctx.settings = await ctx.repo.getSettings();` 之后、`navigate(...)` 之前补：

```ts
        applyTheme(document.documentElement, ctx.settings.theme);
```

- [ ] **Step 9: 跑门槛**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全绿；新用例 = 4 个 theme + 4 个 styles。

- [ ] **Step 10: 提交**

```bash
git add focus-trainer/src/ui/theme.ts focus-trainer/src/ui/theme.test.ts focus-trainer/src/ui/styles.css focus-trainer/src/ui/styles.test.ts focus-trainer/src/main.ts focus-trainer/src/main.test.ts focus-trainer/src/ui/pages/settings.ts
git commit -m "feat(theme): 深色主题跟随系统或手动切换，九项对比度护栏入库"
```

---

### Task 5: 备份核心（dumpAll/loadAll + 导出/解析/合并）

数据层只负责「把四类数据原样取出/整体写回」，格式与合并规则放在 `core/backup.ts`。合并规则是本任务最需要测试的部分：重复训练不翻倍、档位不倒退、打卡取并集、本地非默认设置不被备份覆盖。

**Files:**
- Modify: `focus-trainer/src/core/storage.ts:10-23`、`:94-108`、`:202-220`
- Modify: `focus-trainer/src/core/storage.test.ts`（新增 3 条，两种实现各跑一遍）
- Create: `focus-trainer/src/core/backup.ts`
- Create: `focus-trainer/src/core/backup.test.ts`
- Modify: `focus-trainer/src/main.test.ts:442-...`（假 `Repository` 补两个方法）
- Modify: `focus-trainer/src/ui/pages/trends.test.ts:127-161`（假 `Repository` 补两个方法）

**Interfaces:**
- Consumes: `MemoryRepository`、`IdbRepository`、`SessionRecord/GameState/DayPlan/Settings`。
- Produces:
  - `export interface RepoDump { sessions: SessionRecord[]; gameStates: GameState[]; plans: DayPlan[]; settings: Settings; }`
  - `Repository.dumpAll(): Promise<RepoDump>;`、`Repository.loadAll(data: RepoDump): Promise<void>;`
  - `core/backup.ts`: `BACKUP_APP`、`BACKUP_VERSION`、`BackupData extends RepoDump { app; version; exportedAt }`、`ImportSummary { addedSessions; mergedStates; mergedPlans }`、`createBackup(repo, now)`、`parseBackup(text)`、`importBackup(repo, data)`。
  - `loadAll` 是**整体替换**（不是合并）：合并逻辑只在 `importBackup` 里。

- [ ] **Step 1: 写存储层失败的测试**

`src/core/storage.test.ts` 的 `describe.each` 里、`clearAll` 用例之前新增：

```ts
  it('dumpAll 返回四类数据的副本', async () => {
    await repo.saveSession(rec('schulte', 100), state('schulte', 3), dayPlan('2026-10-18', ['schulte']));
    await repo.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    const dump = await repo.dumpAll();
    expect(dump.sessions).toHaveLength(1);
    expect(dump.gameStates).toEqual([state('schulte', 3)]);
    expect(dump.plans).toEqual([dayPlan('2026-10-18', ['schulte'])]);
    expect(dump.settings).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    dump.sessions[0].ability = 999;
    expect((await repo.lastSession('schulte'))?.ability).not.toBe(999);
  });

  it('loadAll 整体替换四类数据，自增 id 接在导入的最大 id 之后', async () => {
    await repo.saveSession(rec('schulte', 1), state('schulte'), null);
    const imported: RepoDump = {
      sessions: [{ ...rec('stroop', 500), id: 7 }],
      gameStates: [state('stroop', 4)],
      plans: [dayPlan('2026-10-20', ['stroop'])],
      settings: { ...DEFAULT_SETTINGS, theme: 'dark' },
    };
    await repo.loadAll(imported);
    expect(await repo.listSessions()).toEqual([{ ...rec('stroop', 500), id: 7 }]);
    expect(await repo.getGameState('schulte')).toEqual(defaultGameState('schulte'));
    expect(await repo.getPlan('2026-10-20')).toEqual(dayPlan('2026-10-20', ['stroop']));
    expect(await repo.getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
    const newId = await repo.saveSession(rec('mot', 900), state('mot'), null);
    expect(newId).toBe(8);
  });

  it('loadAll 里重复的 session id 整体失败，不留半份数据', async () => {
    const dup: RepoDump = {
      sessions: [
        { ...rec('schulte', 1), id: 1 },
        { ...rec('mot', 2), id: 1 },
      ],
      gameStates: [],
      plans: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    await expect(repo.loadAll(dup)).rejects.toThrow();
    expect(await repo.listSessions()).toEqual([]);
  });
```

把 `:3` 的导入补上 `type RepoDump`：

```ts
import { DEFAULT_SETTINGS, MemoryRepository, defaultGameState, openIdbRepository, type RepoDump, type Repository } from './storage';
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/core/storage.test.ts`
Expected: FAIL —— `repo.dumpAll is not a function`（TS 也会先报接口缺方法）。

- [ ] **Step 3: 扩 `Repository` 与两种实现**

`src/core/storage.ts` 在 `Repository` 接口之前加：

```ts
export interface RepoDump {
  sessions: SessionRecord[];
  gameStates: GameState[];
  plans: DayPlan[];
  settings: Settings;
}
```

接口里 `clearAll` 之前加：

```ts
  dumpAll(): Promise<RepoDump>;
  loadAll(data: RepoDump): Promise<void>;
```

`MemoryRepository` 在 `putSettings` 之后加：

```ts
  async dumpAll(): Promise<RepoDump> {
    return {
      sessions: await this.listSessions(),
      gameStates: await this.listGameStates(),
      plans: await this.listPlans(),
      settings: await this.getSettings(),
    };
  }

  async loadAll(data: RepoDump): Promise<void> {
    const ids = new Set<number>();
    for (const s of data.sessions) {
      if (s.id === undefined) throw new TypeError('loadAll 的 session 缺 id');
      if (ids.has(s.id)) throw new TypeError(`loadAll 的 session id 重复：${s.id}`);
      ids.add(s.id);
    }
    // 先全部校验再落库：内存实现没有事务回滚，半份数据比抛错更难查。
    this.sessions = data.sessions.map((s) => structuredClone(s));
    this.states = new Map(data.gameStates.map((g) => [g.gameId, structuredClone(g)]));
    this.plans = new Map(data.plans.map((p) => [p.dayKey, structuredClone(p)]));
    this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    this.nextId = this.sessions.reduce((m, s) => Math.max(m, s.id ?? 0), 0) + 1;
  }
```

`IdbRepository` 在 `putSettings` 之后、`clearAll` 之前加：

```ts
  async dumpAll(): Promise<RepoDump> {
    const [sessions, gameStates, plans, settings] = await Promise.all([
      this.listSessions(),
      this.listGameStates(),
      this.listPlans(),
      this.getSettings(),
    ]);
    return { sessions, gameStates, plans, settings };
  }

  async loadAll(data: RepoDump): Promise<void> {
    const tx = this.db.transaction(ALL_STORES, 'readwrite');
    const done = txDone(tx);
    try {
      const sessions = tx.objectStore('sessions');
      const states = tx.objectStore('gameState');
      const plans = tx.objectStore('plans');
      const settings = tx.objectStore('settings');
      sessions.clear();
      states.clear();
      plans.clear();
      settings.clear();
      for (const s of data.sessions) {
        if (s.id === undefined) throw new TypeError('loadAll 的 session 缺 id');
        sessions.add(s);
      }
      for (const g of data.gameStates) states.put(g);
      for (const p of data.plans) plans.put(p);
      settings.put({ key: SETTINGS_KEY, ...DEFAULT_SETTINGS, ...data.settings });
    } catch (err) {
      tx.abort();
      await done.catch(() => undefined);
      throw err;
    }
    await done;
  }
```

- [ ] **Step 4: 给两个假 `Repository` 补方法**

`src/main.test.ts:442` 起的 `idbRepo` 对象里加（顺手把 `:440` 注释里的「12 个方法」改成「14 个方法」）：

```ts
      dumpAll: () => backing.dumpAll(),
      loadAll: (d) => backing.loadAll(d),
```

`src/ui/pages/trends.test.ts:127-161` 的 `makeRepo` 里加：

```ts
    dumpAll: boom('dumpAll') as Repository['dumpAll'],
    loadAll: boom('loadAll') as Repository['loadAll'],
```

- [ ] **Step 5: 跑测试确认存储层绿**

Run: `npx vitest run src/core/storage.test.ts src/main.test.ts src/ui/pages/trends.test.ts`
Expected: 全绿（存储层新增用例两种实现各 3 条 = 6 条）。

- [ ] **Step 6: 写备份逻辑的失败测试**

新建 `src/core/backup.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { BACKUP_APP, BACKUP_VERSION, createBackup, importBackup, parseBackup } from './backup';
import { DEFAULT_SETTINGS, MemoryRepository } from './storage';
import type { DayPlan, GameId, GameState, SessionRecord } from './types';

const rec = (gameId: GameId, startedAt: number): SessionRecord => ({
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
});

const state = (gameId: GameId, level = 2): GameState => ({
  gameId,
  level,
  passStreak: 0,
  failStreak: 0,
  lastPlayedDayKey: '2026-10-18',
});

const plan = (dayKey: string, completed: GameId[] = []): DayPlan => ({ dayKey, games: ['schulte'], completed });

async function seeded(): Promise<MemoryRepository> {
  const repo = new MemoryRepository();
  await repo.saveSession(rec('schulte', 100), state('schulte', 3), plan('2026-10-18', ['schulte']));
  await repo.putSettings({ ...DEFAULT_SETTINGS, theme: 'dark' });
  return repo;
}

const roundTrip = async (repo: MemoryRepository, now = 1000): Promise<string> =>
  JSON.stringify(await createBackup(repo, now));

describe('备份导出与导入', () => {
  it('导出的 JSON 能解析回来并完整写进空库', async () => {
    const data = parseBackup(await roundTrip(await seeded()));
    expect(data.app).toBe(BACKUP_APP);
    expect(data.version).toBe(BACKUP_VERSION);
    expect(data.exportedAt).toBe(1000);

    const target = new MemoryRepository();
    const s = await importBackup(target, data);
    expect(s).toEqual({ addedSessions: 1, mergedStates: 1, mergedPlans: 1 });
    expect((await target.listSessions()).map((x) => [x.gameId, x.startedAt])).toEqual([['schulte', 100]]);
    expect(await target.getGameState('schulte')).toEqual(state('schulte', 3));
    expect(await target.getPlan('2026-10-18')).toEqual(plan('2026-10-18', ['schulte']));
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });
  });

  it('合并：同一条训练不重复、档位取高、打卡取并集', async () => {
    const target = new MemoryRepository();
    await target.saveSession(rec('schulte', 100), state('schulte', 2), plan('2026-10-18', []));

    const source = new MemoryRepository();
    await source.saveSession(rec('schulte', 100), state('schulte', 5), plan('2026-10-18', ['schulte']));
    await source.saveSession(rec('mot', 300), state('mot', 4), plan('2026-10-18', []));

    const s = await importBackup(target, parseBackup(await roundTrip(source)));
    expect(s).toEqual({ addedSessions: 1, mergedStates: 2, mergedPlans: 1 });
    expect((await target.listSessions()).map((x) => x.gameId)).toEqual(['schulte', 'mot']);
    expect((await target.getGameState('schulte')).level).toBe(5);
    expect(await target.getPlan('2026-10-18')).toEqual({
      dayKey: '2026-10-18',
      games: ['schulte'],
      completed: ['schulte'],
    });
  });

  it('本地设置不是默认值时，不被备份里的设置覆盖', async () => {
    const target = await seeded();
    await target.putSettings({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
    const s = await importBackup(target, parseBackup(await roundTrip(await seeded())));
    expect(s).toEqual({ addedSessions: 0, mergedStates: 0, mergedPlans: 0 });
    expect(await target.getSettings()).toEqual({ ...DEFAULT_SETTINGS, dayStartHour: 2 });
  });

  it('同一份备份导入两次是幂等的', async () => {
    const target = new MemoryRepository();
    const data = parseBackup(await roundTrip(await seeded()));
    await importBackup(target, data);
    const again = await importBackup(target, data);
    expect(again).toEqual({ addedSessions: 0, mergedStates: 0, mergedPlans: 0 });
    expect((await target.listSessions()).length).toBe(1);
  });

  it('拒绝坏 JSON、别的应用、版本不符与缺字段', () => {
    expect(() => parseBackup('{')).toThrow('JSON');
    expect(() => parseBackup('{}')).toThrow('本应用的备份');
    expect(() => parseBackup(JSON.stringify({ app: BACKUP_APP, version: 99 }))).toThrow('版本');
    expect(() =>
      parseBackup(
        JSON.stringify({ app: BACKUP_APP, version: 1, sessions: [], gameStates: [], plans: [], settings: {} }),
      ),
    ).toThrow('设置');
    expect(() =>
      parseBackup(
        JSON.stringify({
          app: BACKUP_APP,
          version: 1,
          sessions: [{}],
          gameStates: [],
          plans: [],
          settings: { dayStartHour: 4 },
        }),
      ),
    ).toThrow('训练记录');
  });
});
```

- [ ] **Step 7: 跑测试确认失败**

Run: `npx vitest run src/core/backup.test.ts`
Expected: FAIL —— 找不到模块 `./backup`。

- [ ] **Step 8: 写 `backup.ts`**

新建 `src/core/backup.ts`：

```ts
import { DEFAULT_SETTINGS, type RepoDump, type Repository } from './storage';
import type { DayPlan, GameState, SessionRecord, Settings } from './types';

export const BACKUP_APP = 'focus-trainer';
export const BACKUP_VERSION = 1;

export interface BackupData extends RepoDump {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
}

export interface ImportSummary {
  addedSessions: number;
  mergedStates: number;
  mergedPlans: number;
}

const sessionKey = (s: SessionRecord): string => `${s.gameId}|${s.startedAt}|${s.dayKey}`;

export async function createBackup(repo: Repository, now: number): Promise<BackupData> {
  const dump = await repo.dumpAll();
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, ...dump };
}

function asArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`备份格式错误：${name} 不是数组`);
  return value;
}

function asObject(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) throw new Error(`备份格式错误：${name} 不是对象`);
  return value as Record<string, unknown>;
}

export function parseBackup(text: string): BackupData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('备份不是合法的 JSON');
  }
  const o = asObject(raw, '根');
  if (o.app !== BACKUP_APP) throw new Error('不是本应用的备份（缺少 app 标记）');
  if (o.version !== BACKUP_VERSION) throw new Error(`备份版本不支持：${String(o.version)}`);

  const sessions = asArray(o.sessions, 'sessions');
  const gameStates = asArray(o.gameStates, 'gameStates');
  const plans = asArray(o.plans, 'plans');
  for (const item of sessions) {
    const r = asObject(item, 'sessions 条目') as Partial<SessionRecord>;
    if (typeof r.gameId !== 'string' || typeof r.dayKey !== 'string' || typeof r.startedAt !== 'number') {
      throw new Error('备份里的训练记录不完整');
    }
  }
  for (const item of gameStates) {
    if (typeof (asObject(item, 'gameStates 条目') as Partial<GameState>).gameId !== 'string') {
      throw new Error('备份里的档位记录不完整');
    }
  }
  for (const item of plans) {
    if (typeof (asObject(item, 'plans 条目') as Partial<DayPlan>).dayKey !== 'string') {
      throw new Error('备份里的计划记录不完整');
    }
  }
  const settings = asObject(o.settings, 'settings') as Partial<Settings>;
  if (typeof settings.dayStartHour !== 'number') throw new Error('备份里缺少设置');

  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: typeof o.exportedAt === 'number' ? o.exportedAt : 0,
    sessions: sessions as SessionRecord[],
    gameStates: gameStates as GameState[],
    plans: plans as DayPlan[],
    settings: { ...DEFAULT_SETTINGS, ...settings },
  };
}

const isDefaultSettings = (s: Settings): boolean =>
  s.dayStartHour === DEFAULT_SETTINGS.dayStartHour &&
  s.theme === DEFAULT_SETTINGS.theme &&
  s.hapticsEnabled === DEFAULT_SETTINGS.hapticsEnabled &&
  s.soundEnabled === DEFAULT_SETTINGS.soundEnabled;

export async function importBackup(repo: Repository, data: BackupData): Promise<ImportSummary> {
  const local = await repo.dumpAll();

  const seen = new Set(local.sessions.map(sessionKey));
  let nextId = local.sessions.reduce((m, s) => Math.max(m, s.id ?? 0), 0) + 1;
  const sessions: SessionRecord[] = local.sessions.map((s) => ({ ...s, id: s.id ?? nextId++ }));
  let addedSessions = 0;
  for (const s of data.sessions) {
    const key = sessionKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    sessions.push({ ...s, id: nextId++ });
    addedSessions += 1;
  }

  const stateByGame = new Map(local.gameStates.map((g) => [g.gameId, g]));
  let mergedStates = 0;
  for (const g of data.gameStates) {
    const cur = stateByGame.get(g.gameId);
    if (!cur || g.level > cur.level) {
      stateByGame.set(g.gameId, { ...g });
      mergedStates += 1;
    }
  }

  const planByDay = new Map(local.plans.map((p) => [p.dayKey, p]));
  let mergedPlans = 0;
  for (const p of data.plans) {
    const cur = planByDay.get(p.dayKey);
    if (!cur) {
      planByDay.set(p.dayKey, { ...p, games: [...p.games], completed: [...p.completed] });
      mergedPlans += 1;
      continue;
    }
    const completed = [...cur.completed, ...p.completed.filter((id) => !cur.completed.includes(id))];
    if (completed.length !== cur.completed.length) {
      planByDay.set(p.dayKey, { ...cur, completed });
      mergedPlans += 1;
    }
  }

  const settings = isDefaultSettings(local.settings) ? { ...data.settings } : local.settings;

  await repo.loadAll({
    sessions,
    gameStates: [...stateByGame.values()],
    plans: [...planByDay.values()],
    settings,
  });
  return { addedSessions, mergedStates, mergedPlans };
}
```

- [ ] **Step 9: 跑测试确认通过**

Run: `npx vitest run src/core/backup.test.ts`
Expected: 5 passed。

- [ ] **Step 10: 跑全门槛并提交**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全绿。

```bash
git add focus-trainer/src/core/storage.ts focus-trainer/src/core/storage.test.ts focus-trainer/src/core/backup.ts focus-trainer/src/core/backup.test.ts focus-trainer/src/main.test.ts focus-trainer/src/ui/pages/trends.test.ts
git commit -m "feat(data): 仓库支持整体导出/写回，备份解析与合并规则入库"
```

---

### Task 6: 设置页备份区（剪贴板导出 + 文件/粘贴导入）

**Files:**
- Modify: `focus-trainer/src/ui/pages/settings.ts`
- Modify: `focus-trainer/src/ui/styles.css`（`.backup-text`，放在 reduced-motion 块之前）

**Interfaces:**
- Consumes: `createBackup/parseBackup/importBackup`（Task 5）、`applyTheme`（Task 4）、`save`（Task 3）。
- Produces: 无新导出；页面行为固定为「导出 = 写剪贴板并填入只读文本框」「导入 = 合并，不覆盖」。

- [ ] **Step 1: 在设置页底部加备份区**

`src/ui/pages/settings.ts` 顶部导入：

```ts
import { createBackup, importBackup, parseBackup } from '../../core/backup';
```

在 `const clear = ...` 之前插入：

```ts
  const backupNote = h(
    'p',
    { class: 'muted' },
    '备份包含全部训练记录、档位、计划和设置。导入会合并到现有记录；想彻底恢复旧备份，请先清空数据。',
  );
  const backupText = h('textarea', { class: 'backup-text', readonly: true, 'aria-label': '备份内容', rows: 6 });
  const pasteText = h('textarea', {
    class: 'backup-text',
    'aria-label': '导入内容',
    rows: 6,
    placeholder: '把备份内容粘贴到这里',
  });
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': '选择备份文件' });
  fileInput.hidden = true;

  async function doExport(): Promise<void> {
    const text = JSON.stringify(await createBackup(ctx.repo, Date.now()), null, 2);
    backupText.value = text;
    try {
      await navigator.clipboard.writeText(text);
      backupNote.textContent = `备份已复制到剪贴板（${text.length} 字符），也可从下方文本框手动复制。`;
    } catch {
      backupNote.textContent = '已生成备份，请从下方文本框长按复制。';
    }
  }

  async function doImport(text: string): Promise<void> {
    if (!text.trim()) {
      backupNote.textContent = '没有可导入的内容。';
      return;
    }
    if (!confirm('导入会合并到现有记录，继续？')) return;
    try {
      const summary = await importBackup(ctx.repo, parseBackup(text));
      ctx.settings = await ctx.repo.getSettings();
      applyTheme(document.documentElement, ctx.settings.theme);
      pasteText.value = '';
      backupNote.textContent = `导入完成：新增 ${summary.addedSessions} 次训练，合并 ${summary.mergedStates} 条档位、${summary.mergedPlans} 天计划。`;
    } catch (err) {
      backupNote.textContent = `导入失败：${err instanceof Error ? err.message : String(err)}`;
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file
      .text()
      .then((text) => doImport(text))
      .finally(() => {
        fileInput.value = '';
      });
  });

  const exportBtn = h('button', { onclick: () => void doExport() }, '导出备份');
  const importFileBtn = h('button', { onclick: () => fileInput.click() }, '选择备份文件');
  const importPasteBtn = h('button', { onclick: () => void doImport(pasteText.value) }, '导入粘贴内容');
```

`view.replaceChildren(...)` 里，在每日分界时间说明 `note` 之后、`clear` 之前插入：

```ts
    h('h2', null, '数据备份'),
    backupNote,
    h('div', { class: 'row' }, exportBtn, importFileBtn, importPasteBtn),
    fileInput,
    backupText,
    pasteText,
```

- [ ] **Step 2: 加文本框样式**

`src/ui/styles.css` 在 `body.training #tabbar { ... }` 之后、动效注释（`:949`）之前插入：

```css
/* 备份文本框：body 上有 user-select: none，这里必须显式恢复，
   否则「剪贴板失败 → 长按手动复制」这条兜底路径在真机上根本用不了。 */
.backup-text {
  width: 100%;
  min-height: 96px;
  padding: 8px;
  font: inherit;
  color: var(--ink);
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: 6px;
  resize: vertical;
  -webkit-user-select: text;
  user-select: text;
}
```

- [ ] **Step 3: 跑门槛**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 全绿（本任务不新增单测；导出/导入的纯逻辑已在 Task 5 覆盖，页面流程交 Task 8 浏览器验收）。

- [ ] **Step 4: 提交**

```bash
git add focus-trainer/src/ui/pages/settings.ts focus-trainer/src/ui/styles.css
git commit -m "feat(data): 设置页支持备份导出到剪贴板与文件/粘贴合并导入"
```

---

### Task 7: `VIBRATE` 权限 + `verify:apk` 第 14 项

震动是本次唯一需要网络/系统权限的新能力。Android WebView 的 `navigator.vibrate` 在 App 没有 `VIBRATE` 权限时不会生效，必须写进 Manifest；同时把这条写进出包自检，防止以后换工程模板时丢权限而单测全绿。

**Files:**
- Modify: `focus-trainer/android/app/src/main/AndroidManifest.xml:39-41`
- Modify: `focus-trainer/scripts/verify-apk.mjs:62`

**Interfaces:**
- Consumes: 现有 `check(name, pass, detail)`。
- Produces: `verify:apk` 从 13 项变 14 项（脚本末尾的计数是动态的，不需要手改）。

- [ ] **Step 1: 加权限**

`AndroidManifest.xml` 的 `<uses-permission android:name="android.permission.INTERNET" />` 下面加一行：

```xml
    <uses-permission android:name="android.permission.VIBRATE" />
```

- [ ] **Step 2: 加自检项**

`scripts/verify-apk.mjs:62` 的 INTERNET 检查之后插入：

```js
check(
  '声明 VIBRATE 权限（点击反馈震动所需）',
  badging.includes("uses-permission: name='android.permission.VIBRATE'"),
  (badging.match(/uses-permission:[^\n]*/g) ?? []).join(' | ')
);
```

- [ ] **Step 3: 提交**

本项要等 Task 8 重出包后才有 APK 可验，先提交源文件：

```bash
git add focus-trainer/android/app/src/main/AndroidManifest.xml focus-trainer/scripts/verify-apk.mjs
git commit -m "chore(android): 声明 VIBRATE 权限，出包自检增第 14 项"
```

---

### Task 8: 浏览器验收 + 重出 APK + 文档同步

这一片由控制器执行（不派实现者）：先在浏览器里把三条轴的黄金路径走一遍，再重出包并按正身判据收口，最后同步三份长期文档。

**Files:**
- Modify: `docs/superpowers/plans/2026-10-20-m4-acceptance.md`（§13）
- Modify: `docs/superpowers/plans/2026-10-20-m4-realdevice-runbook.md`（包身份与残余项）
- Modify: `README.md`（功能、门槛数、verify 项数）

**前置依赖:** Task 1–7 全部合并；工作树干净；`git status` 确认没有未提交改动。

- [ ] **Step 1: 跑全门槛并记录实际数字**

```bash
cd focus-trainer
npx tsc --noEmit && npx vitest run
```

Expected: 全绿。把 `Test Files` / `Tests` 两个实际数字写进 SDD 台账与 §13，不沿用 43/522。

- [ ] **Step 2: 浏览器验收（390×844 同源 iframe，按 `_browser-acceptance-channel.md`）**

启动与判定口径照长期文档：`npm run dev`，在 `http://127.0.0.1:5173` 建 390×844 同源 iframe，`requestAnimationFrame` 换成自控队列、逻辑时钟每帧 +16ms、点击 `timeStamp` 与逻辑时刻对齐。逐项记录「实测原文」：

1. **按压驻留**：在舒尔特第一格按下，立即读 `classList` 含 `is-pressed`；90ms 逻辑时钟后读一次，必须已摘掉。五个游戏各抽一格重复一次。
2. **反馈上升沿**：不注入探针，直接读 DOM——每个游戏答对/答错后，`.right/.wrong/.done/.flash/.hit/.missed` 等状态类只在该试次出现，下一试次开始前不回弹、不重复触发（「只触发一次」已由视图单测逐款钉住，这里验的是真 DOM 路径）。震动/声音在桌面 Chrome 无法证明，明确标注「交真机」。
3. **五个游戏整场闭环**：按 M4 验收记录 §14 的做法，每款从说明页 → 倒计时 → 3 轮 → 结算页走完，结算页文本有本轮读数。
4. **深色主题**：设置页切「深色」→ `document.documentElement.dataset.theme === 'dark'`；依次打开 今日/库/趋势/设置 四页与五款训练页，读 `getComputedStyle(document.body).backgroundColor`（应为 `rgb(21, 24, 28)`）与 `getComputedStyle(document.body).color`（应为 `rgb(230, 232, 234)`）；训练页底色仍为舞台色（`--stage #10151a`），页签隐藏。再切「浅色」→ `dataset.theme === 'light'`，底色回到 `rgb(238, 240, 234)`。`auto` 档的解析（含无 `matchMedia` 兜底）由 `theme.test.ts` 单测承接，浏览器这里只认 light/dark 两档的实际落值。
5. **备份往返（真 IndexedDB）**：先在当前库导出 → 文本框内容以 `{"app":"focus-trainer"` 开头；点「清空数据」后再导入同一段文本 → 今日计划、档位、sessions 行数与导出前一致（用一次 `evaluate_script` 只读库，另一次只写，遵守「一次调用只做一件事」的通道纪律）。
6. **坏数据拒绝**：粘贴 `{"app":"x"}` → 提示「不是本应用的备份」，库不变。
7. **无回归**：首页打卡、趋势页三块图、返回键确认、页签四页切换各点一次。

把每条判据的「实测/测试承接/交真机」归属写进 §13。

- [ ] **Step 3: 重出 APK（`src/` 已变，必须重出）**

```bash
cd /e/WORK/脑力训练/focus-trainer
rm -f android/app/build/outputs/apk/debug/app-debug.apk
npm run build
export ANDROID_HOME="E:/APPS/Android/Sdk" JAVA_HOME="D:/APPS/Java"
npx cap sync android
cd android
cmd //c "gradlew.bat assembleDebug --no-daemon"
cd ..
npm run verify:apk
```

Expected: `共 14 项，失败 0 项。`；记录新包的字节数与 mtime。

- [ ] **Step 4: 包内正身判据（`unzip -p`，不用磁盘 `assets/public`）**

```bash
APK=android/app/build/outputs/apk/debug/app-debug.apk
unzip -Z1 "$APK" | grep '^assets/public/assets/'
JS=$(unzip -Z1 "$APK" | grep -E '^assets/public/assets/index-.*\.js$' | head -1)
unzip -p "$APK" "$JS" | grep -c 'is-pressed'
unzip -p "$APK" "$JS" | grep -c 'backup-text'
unzip -p "$APK" "$JS" | grep -c '震动反馈'
unzip -p "$APK" "$JS" | grep -c '答对一格只 hit 一次' || true   # 负控：必须 0
```

（`index.html` 里没有新增字面量：`data-theme` 由 `theme.ts` 在运行时写进 `<html>`，`#tabbar` 更是从来不在源码里带 `#`。新代码只在 JS chunk 里，所以正控/负控都打在 chunk 上。）

再按 §13 的「新鲜度复检」重建 `dist` 并逐条目比对 MD5（`index.html` 比较前先 CR 剥离）；主 chunk 的正控用上面 `is-pressed`/`backup-text` 的命中数，负控用只在 `*.test.ts` 里出现的用例标题（命中 0 次）。

- [ ] **Step 5: 同步三份文档**

- `2026-10-20-m4-acceptance.md` §13：新增一段「2026-10-21 反馈/备份/深色主题」——门槛实际数字、浏览器七项判据的归属、新包字节数/mtime、第 14 项自检、正身判据结论；把旧的包体积/时间句子标注为「上一轮」。
- `2026-10-20-m4-realdevice-runbook.md`：更新包身份（字节数、时间、`Get-Item` 自证）；真机残余补两条：**震动是否真的触发**（设置里开/关各练一轮）、**深色主题在系统深色模式下的首屏与训练页观感**。
- `README.md`：功能清单加「震动/声音反馈、深色主题、数据备份」；门槛数字改成实测；「13 项」改「14 项」。
- 文档-only 提交不触发重出包（判据：`git log -1 -- focus-trainer/src` 不动）。

- [ ] **Step 6: 提交并（经用户同意后）推送**

```bash
git add docs/superpowers/plans/2026-10-20-m4-acceptance.md docs/superpowers/plans/2026-10-20-m4-realdevice-runbook.md README.md
git commit -m "docs(m4): 记录反馈/备份/深色主题的验收与新包身份"
```

推送与合并是用户的决定，不在本任务内自动执行；把提交号与待办（真机震动/深色 + 标准 1 收口）报给用户再动。

---

## 验证清单（全部任务完成后）

- [ ] `npx tsc --noEmit` 退出 0。
- [ ] `npx vitest run` 全绿，实际文件/用例数已写入台账与 §13。
- [ ] 五款游戏里每次作答只触发一次 `hit/miss`（视图测试逐款钉住）。
- [ ] `is-pressed` 至少驻留 90ms（press 测试钉住），`prefers-reduced-motion` 下只保留变色。
- [ ] `Settings` 旧库缺字段时按 `DEFAULT_SETTINGS` 补齐（storage 测试两种实现各跑一遍）。
- [ ] 备份导出/解析/合并/幂等/坏数据拒绝五条逻辑测试全绿；真库导入导出在浏览器实测。
- [ ] 深色 token 九项 + 六组对比度 ≥ 4.5:1 + 纸纹只落在 `body:not(.training)` + 横幅深红底白字，四条护栏绿。
- [ ] `npm run build`（不是 `vite build`）通过；`npm run verify:apk` 14 项、失败 0。
- [ ] 新 APK 晚于最后一次非测试 `src/` 提交；包内 `index.html`/chunk 与重建 `dist` 的 MD5 全等。
- [ ] README / 验收记录 §13 / 真机手册的包身份三处数字一致。
