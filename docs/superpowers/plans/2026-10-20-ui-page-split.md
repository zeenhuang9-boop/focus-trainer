# UI 分页减负（纸质手册第二轮）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「一屏装下所有事」的首页拆成 今日 / 训练库 / 趋势 / 设置 四个页面，底部加一条常驻页签，让每一屏只承担一件事。

**Architecture:** 路由扩一个 `games` 分支；页签是纯逻辑模块 `src/ui/nav.ts`（表驱动 + `renderNav`），由 `main.ts` 在每次路由回调里渲染进 `index.html` 新增的 `<nav id="tabbar">`；`#tabbar` 用 `position: fixed` 挂视口底，正文避让用**另一条更具体的选择器**加 `padding-bottom`，绝不改被测试与 7×7 触控算式钉死的 `#view { padding: 12px }`。训练库页复用首页已经立好的 `.plan-row` 行语法，只多一行「练什么」。

**Tech Stack:** TypeScript 5.9 `strict` + `verbatimModuleSyntax`、Vite 8.3.4、Vitest 5.0.5（**node 环境、无 jsdom**，视图测试自带手写 DOM 桩）、零新依赖。

**Spec:** `docs/superpowers/specs/2026-10-18-focus-trainer-design.md`（成功标准 4「首页每日 3 个游戏计划」+ 成功标准 2「五款都能从说明页走通」）；第一轮纸质手册的 tokens 已由 `focus-trainer/src/ui/styles.test.ts:143-255` 逐字钉死，本计划以它为权威，不再引用 `.superpowers/sdd/` 里的纲要文件。

## Global Constraints

每一片都必须同时满足，违反任一条就是返工：

- **不新增任何依赖**；样式表里不许出现 `@import`、`@font-face`、`url(`、`https?://` —— 这四条已经由 `src/ui/styles.test.ts:133-137` 用整份 CSS 文本断言，写坏了门槛直接红（离线红线）。
- **`#view { padding: 12px }` 一字不动**（`styles.test.ts:72`）。页签对正文的避让只准用 `body:not(.training) #view { padding-bottom: … }` 这种**不同选择器**另起一条规则；`.schulte-grid` 的 `gap: 1px` / `width: calc(100% + 24px)` / `margin: 0 -12px` 三件套也不动。
- **深色刺激区禁改**：`body.training` 的 7 个变量取值（`styles.test.ts:181-193`）、五个游戏视图的颜色与几何（含 `src/games/schulte/view.ts:7` 的 `TINT_COLORS`）、`.schulte-cell.done` 的 `--done-fg` / `--done-bg` 全部照旧。本计划只动页面 chrome 与导航。
- **触控下限 `--tap: 48px`**：`styles.test.ts:62-65` 只给 `button, select` 兜底，`<a>` 页签必须自己写 `min-height: var(--tap)`。
- **不许用 `opacity` 抹掉信息**（`styles.test.ts` 已有两条同类断言）；完成态/未激活态一律改颜色。
- **`EXIT_CONFIRM` 文案不动**（`src/ui/back-rule.ts:4`）；`GAMES` 注册表顺序不动（`scheduler.ts` 的 tie-break 依赖它）。
- **文字以既有词表为准**：页签标签「今日 / 库 / 趋势 / 设置」；训练库每行的「练什么」直接取 `GameModule.ability`（持续注意 / 抑制控制 / 工作记忆 / 动态感知 / 完型整合），**不新造文案**。
- 测试计数只认实测：验收以 `npx vitest run` 的实际输出为准，禁止为凑数增删用例。
- 提交信息沿用仓库风格：`feat(ui): …` / `test(ui): …` / `refactor(ui): …`，中文描述。
- **一次只改一片**：`styles.css`、`main.ts` 是共享写点，禁止并行派单；每片单独跑门槛并单独提交。

**门槛命令（每片收尾都要跑，在 `focus-trainer/` 目录内）：**

```bash
npx tsc --noEmit && npx vitest run
```

预期：tsc 无输出退出 0；vitest 全绿。**当前基线 = 41 个文件 / 497 个用例（2026-10-20 21:06 实测）**，后续片只允许在这个数上加。

---

### Task 1: 路由扩 `games` 分支 + 页签纯逻辑 `nav.ts`

本片不碰 CSS、不碰 `main.ts`，只把「有哪些页签、哪一页该隐藏」做成可测的纯逻辑。

**Files:**
- Create: `focus-trainer/src/ui/nav.ts`
- Create: `focus-trainer/src/ui/nav.test.ts`
- Modify: `focus-trainer/src/ui/router.ts`（`Route` 联合类型、`parseRoute`、`href`）
- Modify: `focus-trainer/src/ui/router.test.ts`

**Interfaces:**
- Consumes: `href(r: Route): string` 与 `parseRoute(hash: string): Route`（`src/ui/router.ts:14-39` 现状）。
- Produces:
  - `Route` 增加 `{ name: 'games' }` 分支，`href` 给 `#/games`。
  - `nav.ts`：`export const TABS: readonly Tab[]`、`export function renderNav(root: HTMLElement, route: Route): void`。Task 3 只接线这两个名字 —— 隐藏规则是 `renderNav` 的内部实现，**不单独导出**（导出了就只有测试在用，等于给仓库新增一个死面，M4 终审的 SF-5 刚为同类问题定过性）。

- [ ] **Step 1: 写 `games` 路由失败的测试**

在 `src/ui/router.test.ts` 的 `describe('parseRoute')` 里，把 `it('识别四种路由')` 的标题改成 `it('识别五种路由')`，并在 `expect(parseRoute('#/settings')).toEqual({ name: 'settings' });` 之前插入：

```ts
    expect(parseRoute('#/games')).toEqual({ name: 'games' });
    expect(parseRoute('#games')).toEqual({ name: 'games' });
```

同一段里 `无法识别的地址回首页` 的 `bad` 数组追加两个串：`'#/games/x'`、`'#/games/1'`（和 `'#/settings/x'` 同一口径：多余段落回落 home）。

`href 与 parseRoute 互为逆运算` 那条的 `routes` 数组加一行 `{ name: 'games' },`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/ui/router.test.ts`
Expected: FAIL —— TS 编译期就会报 `Type '"games"' is not assignable to type …`；若跑到断言层，则是 `parseRoute('#/games')` 返回 `{ name: 'home' }` 而期望 `{ name: 'games' }`。

- [ ] **Step 3: 改 `router.ts`**

`Route` 联合类型（`src/ui/router.ts:3-8`）在 `{ name: 'trend' }` 之前加一行：

```ts
  | { name: 'games' }
```

`parseRoute`（`src/ui/router.ts:14-24`）里，在 `if (head === 'trend' …)` 之前加：

```ts
  if (head === 'games' && parts.length === 1) return { name: 'games' };
```

`href`（`src/ui/router.ts:26-39`）的 `switch` 里，`case 'home':` 之后加：

```ts
    case 'games':
      return '#/games';
```

- [ ] **Step 4: 写页签逻辑失败的测试**

新建 `src/ui/nav.test.ts`。这个仓库的测试跑在 node 环境、没有 jsdom，DOM 全靠手写桩；下面这份桩只覆盖 `renderNav` 用到的那几个 API（`createElement` / `className` / `setAttribute` / `append` / `replaceChildren` / `hidden`），取子节点的方式与 `home.test.ts:126-128` 的 `byClass` 同意 —— 桩必须自带 `replaceChildren`，因为 `renderNav` 就是靠它清空容器的：

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Route } from './router';
import { renderNav, TABS } from './nav';

class StubEl {
  readonly children: StubEl[] = [];
  readonly classes = new Set<string>();
  readonly attrs = new Map<string, string>();
  hidden = false;
  text = '';

  constructor(readonly tag: string) {}

  set className(v: string) {
    this.classes.clear();
    for (const c of v.split(' ')) if (c) this.classes.add(c);
  }

  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }

  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }

  append(...items: Array<StubEl | string>): void {
    for (const item of items) {
      if (typeof item === 'string') this.text += item;
      else this.children.push(item);
    }
  }

  replaceChildren(...items: Array<StubEl | string>): void {
    this.text = '';
    this.children.length = 0;
    this.append(...items);
  }

  byClass(cls: string): StubEl[] {
    const out: StubEl[] = [];
    if (this.classes.has(cls)) out.push(this);
    for (const c of this.children) out.push(...c.byClass(cls));
    return out;
  }
}

function mount(route: Route): StubEl {
  vi.stubGlobal('document', { createElement: (tag: string) => new StubEl(tag) });
  const root = new StubEl('nav');
  renderNav(root as unknown as HTMLElement, route);
  return root;
}

describe('页签表', () => {
  it('四个页签按 今日 / 库 / 趋势 / 设置 排，标签与路由名一一对应', () => {
    expect(TABS.map((t) => t.label)).toEqual(['今日', '库', '趋势', '设置']);
    expect(TABS.map((t) => t.route.name)).toEqual(['home', 'games', 'trend', 'settings']);
  });
});

describe('renderNav', () => {
  it('训练中与结算页把容器交出去：hidden 且一个字都不写', () => {
    for (const r of [
      { name: 'play', gameId: 'schulte', mode: 'plan' },
      { name: 'play', gameId: 'mot', mode: 'free' },
      { name: 'result', sessionId: 7 },
    ] as Route[]) {
      const root = mount(r);
      expect(root.hidden).toBe(true);
      expect(root.children).toHaveLength(0);
    }
  });

  it('四个常驻页各给一个链接，href 就是路由的 href', () => {
    for (const name of ['home', 'games', 'trend', 'settings'] as const) {
      const root = mount({ name });
      expect(root.hidden).toBe(false);
      expect(root.children.map((c) => c.attrs.get('href'))).toEqual(['#/', '#/games', '#/trend', '#/settings']);
    }
  });

  it('当前页只有一条带 aria-current，且用 class 而不是 opacity 区分', () => {
    const root = mount({ name: 'games' });
    const current = root.children.filter((c) => c.attrs.get('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe('库');
    expect(root.byClass('active')).toHaveLength(1);
    expect(root.byClass('active')[0].attrs.get('aria-current')).toBe('page');
    // 非当前页不许靠降低不透明度变「次要」：那是 M1 遗留缺陷 1 的同一条纪律
    expect(root.children.some((c) => c.attrs.has('style'))).toBe(false);
  });
});
```

- [ ] **Step 5: 跑测试确认失败**

Run: `npx vitest run src/ui/nav.test.ts`
Expected: FAIL —— `Cannot find module './nav'`（或等价的解析失败）。

- [ ] **Step 6: 写 `nav.ts`**

```ts
import { h } from './dom';
import { href, type Route } from './router';

export interface Tab {
  readonly route: Route;
  readonly label: string;
}

// 顺序就是使用频率：先看今天要练什么，再挑一款加练，然后回看趋势，设置是最少进的一格。
export const TABS: readonly Tab[] = [
  { route: { name: 'home' }, label: '今日' },
  { route: { name: 'games' }, label: '库' },
  { route: { name: 'trend' }, label: '趋势' },
  { route: { name: 'settings' }, label: '设置' },
];

// 训练进行中与结算页不给导航：手里有一条随时能点走的页签，就等于给「离开这一轮」开了后门。
const NAV_HIDDEN: readonly Route['name'][] = ['play', 'result'];

function isNavHidden(route: Route): boolean {
  return NAV_HIDDEN.includes(route.name);
}

export function renderNav(root: HTMLElement, route: Route): void {
  if (isNavHidden(route)) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.hidden = false;
  root.replaceChildren(
    ...TABS.map((tab) => {
      const active = tab.route.name === route.name;
      return h('a', {
        class: active ? 'tab active' : 'tab',
        href: href(tab.route),
        'aria-current': active ? 'page' : undefined,
      }, tab.label);
    }),
  );
}
```

`h()` 的 `Attrs` 允许 `undefined` 值并在赋值前跳过（`src/ui/dom.ts:13`），所以 `aria-current` 只在当前页出现，不需要额外分支。`nav.test.ts` 末尾照 `src/ui/pages/home.test.ts:207-211` 补一个 `afterEach(() => vi.unstubAllGlobals())`，把 `vi.stubGlobal('document', …)` 收回去。

- [ ] **Step 7: 跑测试确认通过**

Run: `npx vitest run src/ui/nav.test.ts src/ui/router.test.ts`
Expected: PASS。

- [ ] **Step 8: 全量门槛**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 退出 0；vitest 41→42 个文件、497→500+ 个用例全绿（以实际输出为准）。

- [ ] **Step 9: Commit**

```bash
git add focus-trainer/src/ui/nav.ts focus-trainer/src/ui/nav.test.ts focus-trainer/src/ui/router.ts focus-trainer/src/ui/router.test.ts
git commit -m "feat(ui): 路由加 games 分支，页签表与隐藏规则抽成 nav 纯逻辑"
```

---

### Task 2: 训练库页（新页面，装走首页的「自由练」）

**Files:**
- Create: `focus-trainer/src/ui/pages/library.ts`
- Create: `focus-trainer/src/ui/pages/library.test.ts`
- Modify: `focus-trainer/src/ui/styles.css`（只在文件末尾追加 `.plan-ability` 一条规则，别碰已有块）

**Interfaces:**
- Consumes: `GAMES`、`getGame(id)`（`src/games/registry.ts`）、`AppContext`（`src/ui/context.ts`）、`h`（`src/ui/dom.ts`）、`navigate`（`src/ui/router.ts`）、`GameModule.ability` / `.maxLevel` / `.roundsPerSession`（`src/core/types.ts:61-75`）、`Repository.listGameStates()`（`src/core/storage.ts`，首页 `home.ts:86` 已在用）。
- Produces: `export async function renderLibrary(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void>` —— Task 3 的 `main.ts` 按这个签名接线，参数顺序与 `renderHome` 一致（`home.ts:84`）。这一页不读时钟，所以没有 `now` 形参。

- [ ] **Step 1: 写失败的测试**

新建 `src/ui/pages/library.test.ts`。DOM 桩与 `setup` 照 `src/ui/pages/home.test.ts:12-205` 的那一份搬：同一个仓库里三个页面测试各带一份手写桩是既有约定，**不要为了去重去改 `home.test.ts`**；仓库也不用假的一律用真 `MemoryRepository`（`home.test.ts:151`）。搬过来之后只保留这一批断言：

```ts
import { describe, expect, it } from 'vitest';
import { renderLibrary } from './library';

describe('训练库页', () => {
  it('列出注册表里的全部五款，顺序与 GAMES 一致', async () => {
    const h = setup();
    await h.render();
    const rows = h.view.byClass('plan-row');
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.byClass('eyebrow')[0].textContent)).toEqual(['schulte', 'stroop', 'seqmem', 'mot', 'gestalt']);
    expect(rows.map((r) => r.byClass('plan-name')[0].textContent)).toEqual(['舒尔特方格', '颜色认知', '序列记忆', '视觉动态感知', '视觉完型整合']);
  });

  it('每行的「练什么」直接取 GameModule.ability，页面不自己编文案', async () => {
    const h = setup();
    await h.render();
    expect(h.view.byClass('plan-ability').map((e) => e.textContent)).toEqual([
      '练持续注意',
      '练抑制控制',
      '练工作记忆',
      '练动态感知',
      '练完型整合',
    ]);
  });

  it('档位读 listGameStates；没有记录的游戏按第 1 档显示', async () => {
    const h = setup({ levels: [['schulte', 4]] });
    await h.render();
    const metas = h.view.byClass('plan-meta').map((e) => e.textContent);
    expect(metas[0]).toBe('第 4 档');
    expect(metas[1]).toBe('第 1 档');
  });

  it('点第三行的「去练」进 free 模式：路由写成 #/play/seqmem/free', async () => {
    const h = setup();
    await h.render();
    const row = h.view.byClass('plan-row')[2];
    const go = row.children.find((c) => c.tag === 'button');
    if (!go) throw new Error('计划行里没有按钮');
    go.fire('click');
    expect(h.hashSet).toEqual(['#/play/seqmem/free']);
  });

  it('signal 已 abort 时一个字都不写', async () => {
    const h = setup();
    h.ac.abort();
    await h.render();
    expect(h.view.children).toHaveLength(0);
  });

  it('这一页不带「去练」以外的按钮，也不自带返回首页的按钮', async () => {
    const h = setup();
    await h.render();
    expect(h.view.all((e) => e.tag === 'button')).toHaveLength(5);
    expect(h.view.textContent).not.toContain('返回');
  });
});
```

`setup({ levels })` 要做三件事，全部沿用 `home.test.ts` 的形状：① `render: (): Promise<void> => renderLibrary(view as unknown as HTMLElement, ctx, ac.signal)`（没有第 4 个参数）；② 给档位铺数据走 `home.test.ts:152-167` 同一条通路 —— 对每个 `[gameId, level]` 调 `repo.saveSession(rec(gameId, TODAY), { gameId, level, passStreak: 0, failStreak: 0, lastPlayedDayKey: TODAY }, { dayKey: TODAY, games: GAMES.map((g) => g.id), completed: [] })`，`levels` 省略时不铺任何状态，「第 1 档」那条断言测的就是库里没有这行记录；③ 把 `location.hash` 的 setter 记进 `hashSet`（`home.test.ts:176-185` 已有这段），最后一条用例才有东西可比。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/ui/pages/library.test.ts`
Expected: FAIL —— `Cannot find module './library'`。

- [ ] **Step 3: 写 `library.ts`**

```ts
import { GAMES } from '../../games/registry';
import type { AppContext } from '../context';
import { h } from '../dom';
import { navigate } from '../router';

/**
 * 训练库：把「今天没排上但想练」的五款收在一页里。
 * 行的语法与首页的今日计划完全一致（眉标 id + 中文名 + 档位读数 + 去练），
 * 只多一行 ability —— 它既是这页的「练什么」，也是趋势页雷达图那五根轴的名字。
 */
export async function renderLibrary(view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  const states = await ctx.repo.listGameStates();
  if (signal.aborted) return;
  const levelOf = new Map(states.map((s) => [s.gameId, s.level]));

  const row = (gameId: GameId): HTMLElement => {
    const game = getGame(gameId);
    return h(
      'div',
      { class: 'plan-row' },
      h(
        'div',
        { class: 'plan-main' },
        h('span', { class: 'eyebrow' }, gameId),
        h('span', { class: 'plan-name' }, game?.name ?? gameId),
        h('span', { class: 'plan-ability' }, `练${game?.ability ?? ''}`),
      ),
      h('span', { class: 'spacer' }),
      h('span', { class: 'plan-meta' }, `第 ${levelOf.get(gameId) ?? 1} 档`),
      h('button', { onclick: () => navigate({ name: 'play', gameId, mode: 'free' }) }, '去练'),
    );
  };

  view.replaceChildren(
    h('div', { class: 'row' }, h('h1', null, '训练库'), h('span', { class: 'spacer' }), h('span', { class: 'home-date' }, `${GAMES.length} 款`)),
    h(
      'div',
      { class: 'section-head' },
      h('span', { class: 'eyebrow' }, 'library'),
      h('h2', null, '想练哪个就点哪个'),
    ),
    h('div', { class: 'list' }, ...GAMES.map((g) => row(g.id))),
  );
}
```

补 import（`verbatimModuleSyntax` 下类型必须用 `import type`）：

```ts
import type { GameId } from '../../core/types';
import { getGame } from '../../games/registry';
```

并把 `GAMES` 的 import 合并成同一行：`import { GAMES, getGame } from '../../games/registry';`。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/ui/pages/library.test.ts`
Expected: PASS。

- [ ] **Step 5: 给 `.plan-ability` 补一条规则**

在 `focus-trainer/src/ui/styles.css` 末尾（`@media (prefers-reduced-motion: reduce)` 那块**之前**）追加。字号必须是档内的 13px，颜色必须是 `--ink-2`，因为它和 `.home-date` 是同一类「日志本上的注记」：

```css
/* 训练库的「练什么」：取 GameModule.ability，和趋势页雷达图的五根轴同名 */
.plan-ability {
  font-size: 13px;
  color: var(--ink-2);
}
```

- [ ] **Step 6: 全量门槛**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 退出 0；vitest 全绿（用例数只增不减，以实际输出为准）。

- [ ] **Step 7: Commit**

```bash
git add focus-trainer/src/ui/pages/library.ts focus-trainer/src/ui/pages/library.test.ts focus-trainer/src/ui/styles.css
git commit -m "feat(ui): 训练库页收走五款自由练，行语法沿用首页计划行"
```

---

### Task 3: 页签外壳接线（`index.html` + `main.ts` + CSS）

**Files:**
- Modify: `focus-trainer/index.html:5-13`
- Modify: `focus-trainer/capacitor.config.ts:8`（`backgroundColor` 还留着改版前的深底 `#14161a`，纸底应用冷启动会闪一下深色 —— 第一轮美化漏掉的，本片补上）
- Modify: `focus-trainer/src/main.ts:13-26`、`:48-58`
- Modify: `focus-trainer/src/main.test.ts:172`（桩的 `byId` 要能取到 `tabbar`）
- Modify: `focus-trainer/src/ui/styles.css`（`:root` 加 `--nav-h`、末尾追加页签规则、`#view` 的避让另起一条）
- Modify: `focus-trainer/src/ui/styles.test.ts`（追加页签护栏）

**Interfaces:**
- Consumes: `renderNav(root, route)`（Task 1）、`renderLibrary(view, ctx, signal)`（Task 2）、`startRouter`（`src/ui/router.ts:51`）。
- Produces: 真机上一路可见的底部页签；`index.html` 的 `theme-color` 与 `capacitor.config.ts` 的 `backgroundColor` 都跟纸底同步。

- [ ] **Step 1: 先写 CSS 文本护栏（失败测试）**

在 `src/ui/styles.test.ts` 的 `describe('首页活体方格（招牌）')` 之后新增一个 describe。注意本文件的 `decl(sel, prop)` 只认「选择器后紧跟 `{`」的第一块，`blocksFor(sel)` 才认分组与多条规则 —— 需要判多条时用 `blocksFor`：

```ts
describe('底部页签与正文避让', () => {
  it('页签挂在 #tabbar 上固定到视口底，高度记在 --nav-h', () => {
    expect(decl(':root', '--nav-h')).toBe('60px');
    expect(decl('#tabbar', 'position')).toBe('fixed');
    expect(decl('#tabbar', 'bottom')).toBe('0');
    expect(decl('#tabbar', 'border-top')).toBe('1px solid var(--rule)');
  });

  it('页签自己锚到 48px（<a> 吃不到 button,select 那条全局规则）', () => {
    expect(decl('#tabbar .tab', 'min-height')).toBe('var(--tap)');
    expect(decl('#tabbar .tab', 'text-decoration')).toBe('none');
  });

  it('当前页用颜色区分，不用 opacity', () => {
    expect(decl('#tabbar .tab.active', 'opacity')).toBeNull();
    expect(decl('#tabbar .tab.active', 'color')).toBe('var(--focus)');
  });

  it('避让写在另一条选择器上，被钉死的 #view padding:12px 一个字没动', () => {
    expect(decl('#view', 'padding')).toBe('12px');
    expect(blocksFor('body:not(.training) #view').some((b) => /padding-bottom:\s*calc\(12px \+ var\(--nav-h\)\)/.test(b))).toBe(true);
  });

  it('训练路由里页签隐藏由 body.training 兜第二层，JS 的 hidden 是第一层', () => {
    expect(blocksFor('body.training #tabbar').some((b) => /display:\s*none/.test(b))).toBe(true);
  });
});
```

Run: `npx vitest run src/ui/styles.test.ts`
Expected: FAIL —— `--nav-h`、`#tabbar` 相关断言全部拿到 `undefined`。

- [ ] **Step 2: 写 CSS**

`:root`（`src/ui/styles.css:10-36`）里，`--tap: 48px;` 之前插入一行；同时把 `:root` 上方注释块的「9 个命名值」改成「9 个命名值 + 1 个尺寸值 `--nav-h`（底部页签的高度，正文靠它避让）」，别留下对不上的数字：

```css
  --nav-h: 60px;
```

文件末尾（`@media (prefers-reduced-motion: reduce)` 之前）追加：

```css
/* ── 底部页签：把「今日 / 库 / 趋势 / 设置」从正文里拿走 ─────────────────
   fixed 挂视口底，不参与 #app 的 flex 记账；正文避让另起一条
   body:not(.training) #view 的规则，不去改被 styles.test.ts 与 7×7 触控算式
   钉死的 #view { padding: 12px }。两层隐藏：main.ts 置 root.hidden（第一层），
   body.training 的 display:none（第二层，防止路由回调与样式应用之间的闪一下）。 */
#tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 4px;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
  background: var(--card);
  border-top: 1px solid var(--rule);
}

body:not(.training) #view {
  padding-bottom: calc(12px + var(--nav-h));
}

body.training #tabbar {
  display: none;
}

#tabbar .tab {
  flex: 1;
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--ink-2);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}

#tabbar .tab.active {
  color: var(--focus);
  background: var(--paper);
  border-color: var(--rule);
}
```

- [ ] **Step 3: 跑 CSS 护栏确认通过**

Run: `npx vitest run src/ui/styles.test.ts`
Expected: PASS。

已接受的取舍：**结算页不带 `body.training`，所以它也吃到这 72px 的底部留白**。结算页底下没有内容会被遮，多一段留白看不见；不许为了省这一段去动 `#view { padding: 12px }` 那条（它同时被 `styles.test.ts:72` 和 7×7 的出血算式钉着）。

- [ ] **Step 4: `index.html` 加挂载点并同步主题色**

把 `focus-trainer/index.html` 改成（两处改动：第 6 行 `theme-color` 从 `#14161a` 换成纸底 `#eef0ea`，`main#view` 之后加 `<nav id="tabbar">`）：

```html
    <meta name="theme-color" content="#eef0ea" />
```

```html
    <div id="app">
      <div id="banner" hidden></div>
      <main id="view"></main>
      <nav id="tabbar" aria-label="主导航" hidden></nav>
    </div>
```

`hidden` 写在初始标记里是刻意的：`boot()` 是 async（要先开 IndexedDB），首帧没有路由信息，宁可先不出现页签，也不要出现一个没有 `aria-current` 的空页签条。

同一片里把 `focus-trainer/capacitor.config.ts:8` 的 `backgroundColor: '#14161a'` 改成 `backgroundColor: '#eef0ea'` —— 第一轮美化把页面转成纸底时没动它，Android 侧 WebView 的底色还停在深色，冷启动与过度滚动时会闪一块深色补丁。这一句要过 `npx cap sync android` 才落进原生工程，Task 6 的 Step 1 已经排了 sync。

- [ ] **Step 5: `main.ts` 接线**

`show()` 的 `switch` 里加 `games` 分支（放在 `home` 之后，与 `TABS` 的顺序一致）：

```ts
    case 'games':
      return renderLibrary(view, ctx, signal);
```

import 区加：

```ts
import { renderLibrary } from './ui/pages/library';
import { renderNav } from './ui/nav';
```

`boot()` 里，`const view = document.getElementById('view') as HTMLElement;` 之后加一行：

```ts
  const tabbar = document.getElementById('tabbar') as HTMLElement;
```

`startRouter((route) => { … })` 的回调里，`currentRoute = route;` 之后、`current?.abort();` 之前加一行（先换导航再拆页面，abort 之后 `document` 还在，顺序反了也不会错，但这条顺序读起来就是「先定壳再填芯」）：

```ts
    renderNav(tabbar, route);
```

- [ ] **Step 6: `main.test.ts` 的桩补 `tabbar`**

`src/main.test.ts:172` 现在是 `const byId: Record<string, StubEl> = { banner, view };`，改成把页签容器也挂上：

```ts
  const byId: Record<string, StubEl> = { banner, view, tabbar: new StubEl('nav') };
```

并在该文件里已有 `boot()` 断言的位置（`src/main.test.ts` 的 `describe('boot() …')` 组内，取现有用例同款 `setup(initialHash)` 写法）补两条：`#/` 时 `byId.tabbar.hidden === false` 且 `tabbar.children` 有 4 个、其中恰一个 `attrs.get('aria-current') === 'page'`；`#/play/schulte/plan` 时 `hidden === true` 且 `children` 为空。桩里取 `tabbar` 要走 `byId`（`getElementById` 就是它），别新造一个变量，否则断言的是桩不是产品。

Run: `npx vitest run src/main.test.ts`
Expected: 先 FAIL（找不到 `./ui/nav` 的导出或 `tabbar` 为 null），补完桩与代码后 PASS。

- [ ] **Step 7: 全量门槛**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 退出 0；vitest 全绿。

- [ ] **Step 8: Commit**

```bash
git add focus-trainer/index.html focus-trainer/capacitor.config.ts focus-trainer/src/main.ts focus-trainer/src/main.test.ts focus-trainer/src/ui/styles.css focus-trainer/src/ui/styles.test.ts
git commit -m "feat(ui): 底部页签外壳接线，正文避让另起选择器并同步纸底主题色"
```

---

### Task 4: 各页减负（首页删自由练，趋势/设置删「返回」）

**Files:**
- Modify: `focus-trainer/src/ui/pages/home.ts:110-152`
- Modify: `focus-trainer/src/ui/pages/home.test.ts:365-400`（自由练与底部出口两条用例）
- Modify: `focus-trainer/src/ui/pages/trends.ts:75`
- Modify: `focus-trainer/src/ui/pages/trends.test.ts:321-330`
- Modify: `focus-trainer/src/ui/pages/settings.ts:39`

**Interfaces:**
- Consumes: Task 3 已上线的页签（趋势/设置/库的入口从正文搬到了页签）。
- Produces: `renderHome` 的正文只剩 6 个区块；`Route['name']`、`GAMES`、`plan` 相关行为不变（打卡判定仍看 `plan.completed`）。

- [ ] **Step 1: 把首页的测试改成「减负后」的判据**

`src/ui/pages/home.test.ts` 里（这个文件的桩没有 `querySelectorAll`/`innerText`，取元素一律走 `byClass` 与 `textContent`，见 `home.test.ts:119-128`）：
- 把 `it('自由练列出注册表里的全部游戏，点进去是 free 模式')`（约 365 行）整条替换成下面这条 —— 自由练已经搬到训练库，首页**不该再有**它，这是一条防回归的减法断言：

```ts
  it('自由练已经搬走：首页只剩今日计划三行，也不再自带趋势/设置出口', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EPOCH);
    const h = setup();
    await h.render();
    expect(h.view.byClass('plan-row')).toHaveLength(3);
    expect(h.view.byClass('list')).toHaveLength(1);
    expect(h.view.textContent).not.toContain('自由练');
    expect(h.view.textContent).not.toContain('趋势');
    expect(h.view.textContent).not.toContain('设置');
  });
```

- 删掉 `it('趋势与设置两个出口都在页面底部，点得动')`（约 392 行）整条 —— 出口由页签承担，`nav.test.ts` 已经覆盖。
- `setup` 里若有对 `.list` 个数的断言，改为 1（只剩今日计划一组）。

Run: `npx vitest run src/ui/pages/home.test.ts`
Expected: FAIL —— 首页仍渲染自由练与底部按钮行。

- [ ] **Step 2: 改 `home.ts`**

删掉 `const freeRows = GAMES.map((g) => row(g.id, 'free', false));`（`home.ts:111`），以及 `view.replaceChildren(…)` 里这两项：

```ts
    h('div', { class: 'section-head' }, h('span', { class: 'eyebrow' }, 'free'), h('h2', null, '自由练')),
    h('div', { class: 'list' }, ...freeRows),
```

和末尾那一组：

```ts
    h(
      'div',
      { class: 'row' },
      h('button', { onclick: () => navigate({ name: 'trend' }) }, '趋势'),
      h('button', { onclick: () => navigate({ name: 'settings' }) }, '设置'),
    ),
```

`row()` 的 `mode` 形参保留（`plan` 仍要用），但 `GAMES.map` 那处调用没了之后，若 `navigate` 只剩「去练」与「开始训练」两处调用点就别多删 import。首页区块从 9 个降到 6 个：抬头 / 连续天数 / 活体方格 / today 区段头 / 计划列表 / 开始按钮。

Run: `npx vitest run src/ui/pages/home.test.ts`
Expected: PASS。

- [ ] **Step 3: 趋势页与设置页删「返回」**

`src/ui/pages/trends.ts:75` 现在把返回按钮和标题挤在同一行，页签常驻之后它是重复出口。整行换成一个裸标题（**不要顺手补一句「近 30 天」之类的新文案**：这一页同时有 近 N 次均值、近 30 天曲线、近 5 周日历三种窗口，任何单窗口标签都会说错一半）：

```ts
    h('h1', null, '趋势'),
```

`src/ui/pages/settings.ts:39` 同口径，且它的换日说明已经在 `note`（`settings.ts:9`）里写过了，抬头不再重复：

```ts
    h('h1', null, '设置'),
```

两处的 `navigate` import 是否还需要要自己核：`tsconfig.json` **没有**开 `noUnusedLocals`，悬空 import 不会被编译器抓，得靠 grep。趋势页删掉返回后若再无跳转点就把 import 一起删；设置页仍要在清空数据后 `navigate({ name: 'home' })`，import 保留。

- [ ] **Step 4: 改 `trends.test.ts` 的返回按钮用例**

`src/ui/pages/trends.test.ts:321` 的 `it('返回按钮走 navigate 回首页')` 整条替换（该文件已有自己的桩与取元素的写法，跟着它走，别自造 `querySelectorAll`）：

```ts
  it('趋势页不再自带返回首页的按钮：页签常驻，重复出口就是噪声', async () => {
    const h = await render();
    expect(h.view.textContent).not.toContain('返回');
    expect(h.view.all((e) => e.tag === 'button' && e.textContent === '返回')).toHaveLength(0);
  });
```

`render()` / `view` 的取法照该文件既有用例（它取按钮用的是 `h.button('返回')` 那一式，见 `trends.test.ts:324`）。`settings.ts` 没有对应测试文件，本片不为它新增。

- [ ] **Step 5: 全量门槛**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 退出 0；vitest 全绿。

- [ ] **Step 6: Commit**

```bash
git add focus-trainer/src/ui/pages/home.ts focus-trainer/src/ui/pages/home.test.ts focus-trainer/src/ui/pages/trends.ts focus-trainer/src/ui/pages/trends.test.ts focus-trainer/src/ui/pages/settings.ts
git commit -m "refactor(ui): 首页删自由练与自带出口，趋势与设置改用常驻页签"
```

---

### Task 5: 浏览器验收（控制器执行，不派实现者）

前置：`src/` 已被写完再验收 —— `docs/superpowers/plans/_browser-acceptance-channel.md` §6 记了「写 `src/` 与浏览器验收不能并行，vite HMR 会整页 reload 把 harness 清空」。

- [ ] **Step 1: 起 dev server 并挂 390×844 同源 iframe**

```bash
cd /e/WORK/脑力训练/focus-trainer && nohup npx vite --host 127.0.0.1 --port 5173 --strictPort >/tmp/vite-5173.log 2>&1 &
```

（已在跑就跳过；判据是 `netstat -ano | grep ":5173 "` 有 `LISTENING` 行。）

- [ ] **Step 2: 逐页量「一屏装不装得下」**

在 iframe 里依次把 hash 设成 `#/`、`#/games`、`#/trend`、`#/settings`，每页只读一次：`documentElement.scrollHeight`、`innerHeight`、`#view` 的直接子节点数与各自高度、`#tabbar` 的 `getBoundingClientRect().height` 与每个 `.tab` 的 `getBoundingClientRect()` 宽高。

判据：① `#/` 正文 ≤ 1.15 屏且区块 ≤ 6；② `#/games` 5 行齐、≤ 1 屏；③ `.tab` 实测高度 ≥48px、4 个总宽 ≤ 视口宽且无横向滚动；④ 滚动到底时最后一行不被 `#tabbar` 遮住（`getBoundingClientRect().bottom <= 视口高 - 页签高` 或避让 padding 生效）。
- [ ] **Step 3: 页签与训练态互斥**

`#/` 时 `#tabbar.hidden === false`、`aria-current` 恰有 1 条；点（真实 MCP click）「库」→ `location.hash === '#/games'` 且 `aria-current` 移到「库」；进 `#/play/schulte/plan` → `#tabbar.hidden === true` 且 `display: none` 生效（`body.training` 那条）。
- [ ] **Step 4: 完整走通一款 + 其余四款视图挂载**

按通道文档 §5 的注入帧时钟跑完 schulte 整场（说明页 → 倒计时 → 3 轮 → 结算页 → 落库），确认页签在训练中不出现、结算页也不出现、点「回今日」后页签回来且 `aria-current="page"` 在「今日」。其余四款挂载并进入倒计时即可（标准 2 的整场逐款已在 M2/M3 轮次验过，本轮是改版回归）。
- [ ] **Step 5: 如实把每条判据写进 M4 验收记录**

在 `docs/superpowers/plans/2026-10-20-m4-acceptance.md` 追加一节「§14 纸质手册第二轮：分页减负的浏览器实测」，每条写明实测原文（数字、`getComputedStyle` 取值）与「浏览器实测 / 测试承接」的归属；残余项（如内置浏览器拿不到截图、原生 `confirm` 取消分支）照 M3 的写法如实挂着。
- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-10-20-m4-acceptance.md
git commit -m "docs(m4): 分页减负的浏览器实测判据与残余"
```

---

### Task 6: 重出 APK（`src/` 变了，「最终包晚于最后一次内容合并」重新打开）

- [ ] **Step 1: 构建 + 同步 + 打包（先删旧包，避免 gradle UP-TO-DATE 冻结 mtime）**

```bash
cd /e/WORK/脑力训练/focus-trainer
export ANDROID_HOME='E:\APPS\Android\Sdk'
export JAVA_HOME='D:\APPS\Java'
npm run build && npx cap sync android
rm -f android/app/build/outputs/apk/debug/app-debug.apk
cd android && ./gradlew assembleDebug
```

- [ ] **Step 2: 审计 + 包内一致性 + 新鲜度三条自证**

```bash
cd /e/WORK/脑力训练/focus-trainer
npm run verify:apk
unzip -l android/app/build/outputs/apk/debug/app-debug.apk | grep -E "assets/public/(index\.html|assets/)" | head
```

判据：① `verify:apk` 0 FAIL（离线 origin 白名单只放行 `w3.org`，命中不许加白）；② 包内 `index.html` 的 `theme-color` 是 `#eef0ea`（用 `unzip -p` 直接读包内文件，别只信磁盘 `dist`）；③ APK 的 mtime 晚于 `git log -1 --format=%cd -- focus-trainer/src`。
- [ ] **Step 3: 更新 §13 审计表并提交**

把六条成功标准那一节的「现场审计」时间戳与包体字节数换成这一轮的实测，标注「本轮因 `src/` 改版重出」。

```bash
git add docs/superpowers/plans/2026-10-20-m4-acceptance.md
git commit -m "docs(m4): 分页减负后重出 APK 的新鲜度与包内一致性实测"
```

---

## 后置（不在本计划内，触发条件写在 M4 验收记录 §9）

- 真机清单（应用名/图标、旋屏、安全区、训练中物理返回键的确认与「取消」分支、飞行模式冷启动、**新增：底部页签在刘海屏的 `safe-area-inset-bottom` 实测**）需用户在场，adb 写操作由用户执行。
- SF-8 硬门槛：加第 6 个游戏之前必须把两条跨引擎约定做成表驱动契约测试。
- 趋势页本轮**不拆**：实测 5 个区块 / 1204px（视口 842px），雷达 482px、曲线 251px、日历 265px，是「看图」页，滚动是它的正常用法。若用户反馈趋势也疲劳，再按「雷达一页 / 曲线+日历一页」拆，别提前做。
- `--nav-h: 60px` 是手工与 `.tab` 高度对齐的值。若日后把页签改成带图标的 72px，记得同步它和 `#view` 的避让算式。
