# M2 计划写手共用简报（controller-authored，不是计划本体）

给写 `2026-10-19-m2-<id>.md` 的 agent。你的产物是**一份计划文档**，不是代码。

## 0. 硬规矩（违反 = 返工）

- 只准创建/修改你自己那一个计划文件。**禁止**：改 `focus-trainer/` 下任何文件、`npm`/`npx` 任何命令、`git` 任何写操作（包括 `git add`/`commit`/`stash`/`checkout`）。控制器正在仓里跑实现，你跑测试会拿到别人的半成品。
- 计划里给执行者的命令照写，但**你自己不要执行**。所有事实钉子从**读代码**取得（见 §2 清单），版本号从 `npm view` 这类只读查询取得（本项目 M2 不加依赖，通常不需要）。
- **不要整份读 `2026-10-18-m1-core-and-schulte.md`**（164 KB，读完你的上下文就没了）。需要它的形状时只 `grep -n` 取你要的那一段。

## 1. 计划文档必须长什么样

第一行是标题，接着是 For agentic workers 引语、Goal / Architecture / Tech Stack / Spec 四行，然后 Global Constraints，然后 `### Task N` 序列。每个 Task 的骨架（照抄结构）：

```markdown
### Task 4: <组件名>

**Files:**
- Create: `focus-trainer/src/games/<id>/engine.ts`
- Modify: `focus-trainer/src/games/registry.ts`（若本任务负责注册）
- Test: `focus-trainer/src/games/<id>/engine.test.ts`

**Interfaces:**
- Consumes: 上游已存在的东西，写**真实签名**（从代码里抄，别猜）
- Produces: 下游要用什么，写真实函数名/类型/返回形状

- [ ] **Step 1: 写失败的测试** （贴完整测试代码，不许写「参照 Task 3」）
- [ ] **Step 2: 跑到它失败** （`cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/games/<id>`，写明期望的失败信息）
- [ ] **Step 3: 写最小实现** （贴完整实现代码）
- [ ] **Step 4: 跑到它通过** （写明期望通过数）
- [ ] **Step 5: 提交** （`git add <逐个文件>`，`git commit -m "feat(<id>): …"`）
```

禁止占位语：TBD / TODO / 「适当处理」/ 「加上校验」/ 「同上」/ 只说「为上面的写测试」而不给代码。步骤是 2–5 分钟一粒，一个 Task 以「可独立测试的产物」收尾，5–9 个 Task 为宜。文档末尾要有「对照 spec 的完成判据」表和「需要执行时才能发现的事」清单。

## 2. 动手前必读的代码（小文件，读了就有全部契约）

```
focus-trainer/src/core/types.ts        # InputEvent / TrialRecord / RoundResult / GameEngine / GameView / GameModule / RoundRecord
focus-trainer/src/core/session.ts      # 轮次编排器：谁调 configure/start/tick/input/isDone/result，作废与结算的时机
focus-trainer/src/core/adaptive.ts     # 升降档（step 是唯一改档入口）
focus-trainer/src/core/scoring.ts      # score01 / abilityIndex 口径
focus-trainer/src/core/rng.ts          # mulberry32，`seed >>> 0`
focus-trainer/src/games/schulte/rules.ts      # 纯规则 + 字面值钉子的写法范例
focus-trainer/src/games/schulte/engine.ts     # 引擎写法范例（configure 全量重置、snapshot 防御拷贝）
focus-trainer/src/games/schulte/view.ts       # 视图写法范例（emit 必带 timeStamp、destroy 摘监听）
focus-trainer/src/games/schulte/view.test.ts  # node 环境下**手写零依赖 DOM 桩**的唯一范式，照它的形状给你的视图测试
focus-trainer/src/games/registry.ts           # GAMES 数组与保序断言
focus-trainer/src/games/schulte/index.ts      # GameModule 的组装体（instructions/staircase/judge/summarize/formatSummary）
```

`docs/…/spec` 里你那个游戏的参数表、判分公式、档位上限以 spec 为准（用 grep 定位到该游戏的行，别整读）。

## 3. 全局约束（每个 Task 都隐含遵守）

- 依赖锁定：TypeScript 5.9.3 `strict` + `verbatimModuleSyntax`（类型只准 `import type`）、Vite 8.3.4、Vitest 5.0.5 跑在 **node 环境（没有 jsdom）**、fake-indexeddb 6.2.6。**M2 不新增任何依赖**。
- 时钟契约（spec §4.3）：轮内计时只用 rAF 帧时间戳与 `PointerEvent.timeStamp`；`Date.now()` 只允许用于 seed、记录时间戳、日键。同域取差可用 `performance.now()`。**禁止给时钟加负值/NaN 钳制**（M1 Task 5 裁定 N-5）。
- `configure(level, seed, roundNo)` 必须重置**全部**轮内状态。作废轮（切后台）能否不留残留，100% 取决于这条纪律 —— 引擎没有 abort API。
- `snapshot()` 返回防御拷贝；视图对快照只读。`result()` 的拷贝口径要在计划里显式裁定（M1 有一条未决项 T40，你若让 `result()` 直接返回内部数组就必须给出理由）。
- 注册：在 `registry.ts` 的 `GAMES` 里按 `GAME_IDS` 声明顺序追加；`registry.test.ts` 的保序子序列断言会当场抓住顺序错误。今日计划只由**已注册**游戏生成，`GAMES.map((g) => g.id)` 是唯一的计划来源 —— 不要引入 `GAME_IDS` 当计划源（会让 `isPlanComplete` 恒 false、`streak()` 恒 0）。
- 测试计数纪律：计划里写期望数字，但**以执行者实测为准**；不得为凑数删测试或造无断言的测试。变异探针是复核手段：每条断言要能杀掉一个对应的变异。
- 提交：逐文件 `git add`，禁止 `git add -A` / `.`；不碰别人的脏文件。

## 4. 你这个游戏必须在计划里定死的事（不许留给执行者）

- **档位曲线**：`maxLevel`、每档的具体参数表（由 `level` 映射到尺寸/时长/数量的公式），以及 `staircase` 的 `upAfter`/`downAfter`。
- **judge 的 score01 公式**：写成可测的字面公式，并给出 3–5 组「输入 → 期望 outcome/score01」的表驱动用例（含边界）。
- **timingValid**：谁判定帧间隔是否可信、阈值多少。注意舒尔特恒 `true`（spec:361），若你的游戏真做帧间隔判定，就该显式覆盖 INVALID 分支（M1 的 `session.ts:130` 强制 hold 分支已有一条被否掉的旧裁定，别重复那个错误）。
- **输入事件怎么映射**：`InputEvent` 只有 `cell` / `choice` / `point` 三种（见 types.ts）。如果你的游戏需要别的输入形态（拖拽、按住、序列回放），**只能在 `point` + 时间戳上组合**，并且必须在计划里写清组合协议；不要改 `types.ts`（改联合类型 = 越界，会炸 M1 全部测试）。
- **谁拥有回放/曝光的时间**：这是最容易掉进「视图自己 setTimeout」的坑。规则：所有时间只来自 `tick(now)` / `start(now)` / `input(e.t)`，视图不做计时。
- **可复现性用例**：同一 `(level, seed, roundNo)` 两次 `configure` 后，`snapshot()` 与整轮模拟输入产生的 `result()` 必须逐字段相等。这一条必须有真测试。
- **视图桩**：照 `view.test.ts` 的手写桩给你的 `view.ts` 写用例，至少覆盖「emit 必带 timeStamp」「轮结束残留清除」「destroy 摘掉监听」。

写完自审三遍：spec 覆盖、占位语、类型/命名前后一致（Task 3 叫 `buildStimulus` 而 Task 5 叫 `makeStimulus` 就是 bug）。
