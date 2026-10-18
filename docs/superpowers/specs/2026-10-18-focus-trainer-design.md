# 专注力训练 App 设计文档

- 日期：2026-10-18
- 状态：第 1 节（玩法）、第 2 节（分层）逐节确认；第 3 节（训练闭环）按用户「按你的想法来」授权定稿
- 实施：一个 spec，四个里程碑（见第 8 节）

## 1. 目标与成功标准

自用、每天练。装在安卓手机上（APK），完全离线。

成功标准（全部满足才算交付）：

1. 产出可安装的 Android debug APK，应用名「专注力训练」，包名 `com.focustrainer.app`，竖屏，离线可用。
2. 五个游戏都能从说明页 → 倒计时 → 多轮训练 → 结算页完整走通，成绩写入本地库。
3. 难度按表现自动升降档；同一游戏下次进入，从上次结束时的档位继续。
4. 首页每天给出 3 个游戏的「今日计划」，3 个都完成即当天打卡，并显示连续打卡天数。
5. 趋势页显示五维能力雷达图、单个游戏近 30 天能力曲线、近 5 周打卡日历。
6. `core/` 与五个 engine 的纯逻辑都有单元测试且全部通过；关键时序（呈现时长、反应时）按帧时间戳实测并写入试次记录。

非目标（v1 明确不做）：账号与云同步、数据导出、iOS、排行榜、推送提醒、音效与震动、多用户。

## 2. 技术路线

| 层 | 选型 | 说明 |
|---|---|---|
| 语言与构建 | TypeScript + Vite | 不用 UI 框架，原生 DOM + Canvas 2D |
| 单元测试 | Vitest + fake-indexeddb | core 与 engine 都是纯函数或纯状态机，用模拟时钟测 |
| 界面验收 | browser-use 插件，手机视口 390×844 | 每个游戏走黄金路径 + 边界 |
| 打包 | Capacitor 8 → Android debug APK | compileSdk 36、minSdk 24、AGP 8.13、JDK 21 |
| 存储 | IndexedDB + `navigator.storage.persist()` | Capacitor 文档：Android 上 persist 后 IndexedDB 不会被系统回收；卸载即清空 |

构建环境（2026-10-18 实测）：JDK 21、Node、Python 已有；Android SDK、Gradle 没有。Gradle 由 wrapper 自动下载；Android SDK 装命令行工具到 ASCII 路径（不改 PATH、不改注册表、不提权）。

为以后用原生重写留的约束：`src/core/` 与各游戏的 `rules.ts`（档位表 + 判定）是平台无关的规格。原生版照搬同一组数字和公式，只重写 UI 与 view。

## 3. 五个游戏

通用结构：一次「训练」（session）由若干「轮」（round）组成。每轮在固定档位下进行，结束后由该游戏的 `judge` 判为 pass / hold / fail，交给 adaptive 升降档，下一轮用新档位。

### 3.1 舒尔特方格 `schulte`（持续注意 · 视觉搜索）

- 一轮 = 一张方格，按顺序点完所有格子。点对：格子变暗，目标前进一位；点错：误点 +1，格子闪红 150ms。
- 计时：方格出现开始，点完最后一格结束。
- 每次训练 3 轮，轮间显示档位变化并点「继续」。
- 档位表（10 档）：

| 档 | 方格 | 内容与顺序 | 干扰色 | 目标用时 T（秒） |
|---|---|---|---|---|
| 1 | 3×3 | 1→9 | 无 | 8 |
| 2 | 4×4 | 1→16 | 无 | 15 |
| 3 | 5×5 | 1→25 | 无 | 25 |
| 4 | 5×5 | 25→1 | 无 | 28 |
| 5 | 5×5 | A→Y | 无 | 30 |
| 6 | 5×5 | 1→25 | 有 | 30 |
| 7 | 6×6 | 1→36 | 无 | 42 |
| 8 | 6×6 | 36→1 | 有 | 48 |
| 9 | 7×7 | 1→49 | 无 | 60 |
| 10 | 7×7 | 49→1 | 有 | 70 |

  「干扰色」：每格底色从 4 种低饱和色里随机取，字色不变。
- 判定（用时 t 秒、误点 e）：t ≤ T 且 e ≤ 2 → pass；t > 1.5T 或 e > 5 → fail；其余 hold。
- 轮得分：score01 = clamp(T / t, 0, 1) × max(0, 1 − 0.1e)。
- 结算指标：最佳用时、平均每格用时、总误点。

### 3.2 颜色认知 `stroop`（抑制控制 · 规则切换）

- 色集：红 `#E53935`、绿 `#43A047`、蓝 `#1E88E5`、黄 `#FDD835`，显示在中性深色底上。
- 试次流程：注视点 300ms（规则横幅此时已更新）→ 颜色词以某种墨色出现，直到作答或超时 → 按钮反馈 200ms → 下一试次。
- 规则横幅常驻顶部。「按颜色」：选墨色对应的颜色名；「按字义」：选与这个词相同的颜色名。按钮上是颜色名文字。
- 一轮 = 12 个试次；每次训练 4 轮，轮间点「继续」。
- 档位表（10 档）：

| 档 | 选项数 | 超时 ms | 规则 | 冲突比例 | 按钮位置 | 按钮字色 |
|---|---|---|---|---|---|---|
| 1 | 2 | 2000 | 固定按颜色 | 50% | 固定 | 白 |
| 2 | 3 | 1800 | 固定按颜色 | 50% | 固定 | 白 |
| 3 | 4 | 1600 | 固定按颜色 | 60% | 固定 | 白 |
| 4 | 4 | 1500 | 每轮交替 | 60% | 固定 | 白 |
| 5 | 4 | 1400 | 每试次 25% 概率切换 | 65% | 固定 | 白 |
| 6 | 4 | 1250 | 每试次 35% 概率切换 | 70% | 固定 | 白 |
| 7 | 4 | 1100 | 每试次 50% 概率切换 | 70% | 固定 | 白 |
| 8 | 4 | 1000 | 每试次 50% 概率切换 | 75% | 每试次打乱 | 白 |
| 9 | 4 | 850 | 每试次 50% 概率切换 | 75% | 每试次打乱 | 干扰色 |
| 10 | 4 | 700 | 每试次 50% 概率切换 | 80% | 每试次打乱 | 干扰色 |

  - 选项数小于 4 时，每轮从 4 色里随机取对应数量，词和墨色都只在这几色里取。
  - 冲突试次：词义 ≠ 墨色；一致试次：词义 = 墨色。
  - 「每轮交替」：轮号为奇数时按颜色，偶数时按字义。轮号从 1 开始，补轮沿用被补那一轮的轮号。
  - 「干扰色」：每个按钮的文字用一种与其文字含义不同的颜色。
- 判定（每轮 12 试次，超时算错）：正确 ≥ 10 → pass；正确 ≤ 7 → fail；其余 hold。
- 轮得分：score01 = 正确数 / 12。
- 结算指标：正确率、平均反应时（只算正确试次）、干扰效应 = 「按颜色」规则下冲突正确试次平均 RT − 一致正确试次平均 RT（任一组为空时显示「—」）。

### 3.3 序列记忆 `seqmem`（视觉工作记忆广度）

- 一轮：从起始长度 L0 开始，格子依次高亮（亮 d ms，间隔 g ms），播完后按同样顺序点回（逆序档要倒着点）。整串点对 → 长度 +1，出一条新序列，仍在本轮；点错任一格 → 本轮结束，回放一次正确序列。单轮长度上限 L0 + 6，到上限且答对也结束本轮。
- 每条序列重新随机生成，相邻两项不落在同一格。
- 每次训练 3 轮，轮间点「继续」。
- 档位表（10 档）：

| 档 | 方向 | 起始长度 L0 | 网格 | 亮 d ms | 间隔 g ms |
|---|---|---|---|---|---|
| 1 | 正序 | 3 | 3×3 | 800 | 300 |
| 2 | 正序 | 4 | 3×3 | 750 | 280 |
| 3 | 正序 | 4 | 4×4 | 700 | 260 |
| 4 | 正序 | 5 | 4×4 | 650 | 240 |
| 5 | 正序 | 6 | 4×4 | 600 | 220 |
| 6 | 正序 | 6 | 5×5 | 550 | 200 |
| 7 | 正序 | 7 | 5×5 | 500 | 180 |
| 8 | 逆序 | 4 | 4×4 | 650 | 240 |
| 9 | 逆序 | 5 | 4×4 | 600 | 220 |
| 10 | 逆序 | 6 | 5×5 | 500 | 200 |

- 判定（本轮答对的序列条数 s）：s ≥ 2 → pass；s = 0 → fail；s = 1 → hold。
- 轮得分：score01 = min(1, s / 3)。
- 结算指标：最大广度（本次训练答对的最长序列长度，正序、逆序分开显示）。
- 第 1 节提到的「位置 + 颜色双序列」不做：触屏上要两步输入（先点格再选色），会打断回忆；逆序档承担同等的「操作型工作记忆」负荷。

### 3.4 视觉动态感知 `mot`（多目标追踪）

- 场地是正方形，坐标归一化到 [0,1]²，点半径 r = 0.035，点选容差 2r。
- 试次流程：提示 2000ms（目标点为橙色并闪烁）→ 全部变白并开始运动，持续 D 秒 → 停止 → 作答：点选 K 个点（再点一次取消），选满 K 个自动提交 → 反馈 1000ms（正确目标绿圈、误选红圈）→ 下一试次。
- 运动模型：固定步长 1/120 秒的确定性模拟；匀速 v（单位：场地边长/秒）；碰壁反射；点与点等质量弹性碰撞并推开，碰后把速率归一回 v；每过 1 秒，每个点方向随机偏转 ±30°；初始位置随机且互不重叠。
- 一轮 = 1 个试次；每次训练 8 个试次，试次间自动衔接。
- 档位表（10 档）：

| 档 | 总点数 | 目标数 K | 速度 v | 时长 D（秒） |
|---|---|---|---|---|
| 1 | 6 | 2 | 0.15 | 5 |
| 2 | 8 | 2 | 0.18 | 6 |
| 3 | 8 | 3 | 0.20 | 6 |
| 4 | 10 | 3 | 0.22 | 7 |
| 5 | 10 | 4 | 0.24 | 7 |
| 6 | 12 | 4 | 0.27 | 8 |
| 7 | 12 | 4 | 0.30 | 8 |
| 8 | 14 | 5 | 0.32 | 9 |
| 9 | 14 | 5 | 0.36 | 9 |
| 10 | 16 | 5 | 0.40 | 10 |

- 判定（命中数 h）：h = K → pass；h ≤ K − 2 → fail；其余 hold。
- 轮得分：score01 = h / K。
- 结算指标：命中率（总命中 / 总目标）、本次追踪过的最高目标数。

### 3.5 视觉完型整合 `gestalt`（闭合 · 整体识别）

- 图形库：27 个由代码生成的轮廓图形，分 6 族：
  - 多边形：三角形、正方形、五边形、六边形、八边形
  - 星形：四角星、五角星、六角星、八角星
  - 曲线：圆、椭圆、心形、水滴、月牙
  - 箭头：右箭头、双向箭头、V 形折线、掉头箭头
  - 符号：十字、X 形、闪电、对勾
  - 物体：房子、鱼、树、伞、杯子

  每个图形是归一化到 [-1,1]² 的若干条折线（曲线预先按弧长采样成折线）。
- 碎片化：沿轮廓按弧长切成长 0.08 的小段，每段独立以保留率 k 保留；再加 n 段同长、方向随机的噪声线段，均匀撒在 [-1,1]² 内；整体旋转 θ。
- 试次流程：注视点 500ms → 碎片图暴露 T ms → 掩蔽 200ms（满屏随机线段）→ 4 个完整图形按 2×2 排列（不旋转），点选作答 → 反馈 600ms。
- 干扰项：「异族」从目标所在族以外的族里抽 3 个；「同族」从目标所在族抽，不够 3 个时从其他族补足。目标与干扰项互不相同。
- 一轮 = 1 个试次；每次训练 16 个试次，试次间自动衔接。
- 档位表（12 档）：

| 档 | 暴露 T ms | 保留率 k | 噪声段 n | 旋转 θ | 干扰项 |
|---|---|---|---|---|---|
| 1 | 600 | 0.75 | 0 | 0 | 异族 |
| 2 | 500 | 0.70 | 0 | 0 | 异族 |
| 3 | 420 | 0.66 | 5 | 0 | 异族 |
| 4 | 350 | 0.62 | 10 | 0 | 异族 |
| 5 | 300 | 0.58 | 15 | ±30° 内随机 | 异族 |
| 6 | 250 | 0.54 | 20 | ±30° 内随机 | 异族 |
| 7 | 210 | 0.50 | 25 | ±30° 内随机 | 同族 |
| 8 | 180 | 0.47 | 30 | ±30° 内随机 | 同族 |
| 9 | 150 | 0.44 | 35 | 0–360° 随机 | 同族 |
| 10 | 125 | 0.41 | 40 | 0–360° 随机 | 同族 |
| 11 | 100 | 0.38 | 50 | 0–360° 随机 | 同族 |
| 12 | 80 | 0.35 | 60 | 0–360° 随机 | 同族 |

- 判定：选对 → pass；选错 → fail（没有 hold）。
- 轮得分：score01 = 选对为 1，选错为 0。
- 结算指标：正确率、识别阈值 = 最后 6 个计分试次的实测暴露时长均值（ms，越低越强；不足 6 个时取全部）。

## 4. 架构

### 4.1 目录（项目根 `E:\WORK\脑力训练\focus-trainer\`）

```
focus-trainer/
├─ index.html
├─ package.json  tsconfig.json  vite.config.ts  capacitor.config.ts
├─ src/
│  ├─ core/
│  │  ├─ types.ts        共享类型（GameModule、GameEngine、记录类型）
│  │  ├─ rng.ts          可播种随机数 mulberry32
│  │  ├─ daykey.ts       日期键（默认 04:00 分界）
│  │  ├─ adaptive.ts     升降档（唯一改 level 的地方）
│  │  ├─ scoring.ts      能力指数（唯一算能力分的地方）
│  │  ├─ scheduler.ts    今日计划 + 连续打卡
│  │  ├─ session.ts      SessionRunner：轮次编排、作废与补轮
│  │  └─ storage.ts      Repository 接口 + IndexedDB 实现 + 内存实现
│  ├─ games/
│  │  ├─ registry.ts     五个 GameModule 的注册表
│  │  ├─ schulte/   rules.ts  engine.ts  view.ts  index.ts
│  │  ├─ stroop/    rules.ts  engine.ts  view.ts  index.ts
│  │  ├─ seqmem/    rules.ts  engine.ts  view.ts  index.ts
│  │  ├─ mot/       rules.ts  physics.ts  engine.ts  view.ts  index.ts
│  │  └─ gestalt/   rules.ts  figures.ts  fragment.ts  engine.ts  view.ts  index.ts
│  ├─ ui/
│  │  ├─ dom.ts          h() 建元素的小工具
│  │  ├─ router.ts       hash 路由（安卓返回键走 history.back）
│  │  ├─ charts.ts       雷达图 / 折线 / 日历的 SVG 生成（纯函数）
│  │  ├─ pages/          home.ts  play.ts  result.ts  trends.ts  settings.ts
│  │  └─ styles.css
│  └─ main.ts           装配：storage → scheduler → router
└─ android/             由 npx cap add android 生成
```

单元测试和源码放在同一目录，命名 `*.test.ts`。`index.ts` 负责把该游戏的 rules / engine / view 组装成一个 `GameModule`。

### 4.2 关键接口

```ts
type GameId = 'schulte' | 'stroop' | 'seqmem' | 'mot' | 'gestalt';
type Outcome = 'pass' | 'hold' | 'fail';

type InputEvent =
  | { kind: 'cell'; index: number; t: number }          // 舒尔特、序列记忆
  | { kind: 'choice'; index: number; t: number }        // 颜色认知、完型
  | { kind: 'point'; x: number; y: number; t: number }; // MOT，归一化坐标

interface TrialRecord {
  onset: number;          // 刺激出现的帧时间戳（ms）
  rt: number | null;      // 反应时（ms），超时为 null
  correct: boolean;
  [field: string]: unknown; // 各游戏自定义的刺激 / 作答字段
}

interface RoundResult {
  level: number;
  seed: number;
  trials: TrialRecord[];
  metrics: Record<string, number>; // 本轮原始指标，如 timeMs、errors、hits
  timingValid: boolean;            // 时序关键阶段出现 > 50ms 的帧间隔则为 false
}

interface GameEngine<S = unknown> {
  configure(level: number, seed: number, roundNo: number): void; // 每轮开始前调用
  start(now: number): void;
  input(e: InputEvent): void;
  tick(now: number): void;   // 由 requestAnimationFrame 驱动，now 为 rAF 时间戳
  snapshot(): S;             // view 只读
  isDone(): boolean;
  result(): RoundResult;
}

interface GameView<S = unknown> {
  render(snapshot: S): void;
  destroy(): void;
}

interface GameModule {
  id: GameId;
  name: string;               // 中文名
  ability: string;            // 雷达图维度名
  maxLevel: number;
  roundsPerSession: number;
  roundBreak: 'tap' | 'auto'; // 轮间：点「继续」或 600ms 自动衔接
  staircase: { upAfter: number; downAfter: number };
  instructions: string;       // 说明页文案
  createEngine(): GameEngine;
  createView(host: HTMLElement, emit: (e: InputEvent) => void): GameView;
  judge(r: RoundResult): { outcome: Outcome; score01: number };
  summarize(rounds: RoundRecord[]): Record<string, number>; // 结算指标
}

interface RoundRecord extends RoundResult {
  roundNo: number;
  outcome: Outcome;
  score01: number;
  counted: boolean;           // 作废轮为 false
}
```

### 4.3 数据流

pointerdown（取 `event.timeStamp`）→ view 命中测试 → InputEvent → engine → `isDone()` → RoundResult → `module.judge` → `adaptive.step` → 下一轮 …… → `SessionRunner.finish()` → `scoring.abilityIndex` → `repository.saveSession`（与 gameState、plan 在同一事务里写）→ 首页 / 趋势页读取。

## 5. 训练闭环

### 5.1 SessionRunner

- 创建时传入：GameModule、该游戏当前 AdaptiveState、模式（plan / free）、基础 seed（`Date.now()`）。
- 每轮：`engine.configure(state.level, seed + attempt, roundNo)` → `start` → 循环 `tick` / `input` → `isDone` → `result`。`attempt` 是本次训练内的开轮计数（含补轮与作废重开，从 0 起），保证重开的轮用新 seed；`roundNo` 是计分轮号（从 1 起），补轮和重开沿用被替换那一轮的轮号。
- `timingValid = false` 的轮：不计分、不升降档，自动补一轮。一次训练最多补 3 次，再出现时该轮按 hold 计入。
- 应用切到后台（`visibilitychange` 变为 hidden）：当前轮作废；回到前台显示「本轮已作废，点击继续」，用同档位、新 seed 重开这一轮（不占补轮次数）。
- 中途点「退出」：二次确认后整次训练丢弃，档位不变，不写库。
- 正常结束：生成 SessionRecord 并写库。

### 5.2 自适应（staircase）

```
AdaptiveState = { level, passStreak, failStreak }

step(state, outcome, { upAfter, downAfter }, maxLevel):
  pass → passStreak + 1，failStreak = 0；passStreak ≥ upAfter 时 level + 1，passStreak = 0
  fail → failStreak + 1，passStreak = 0；failStreak ≥ downAfter 时 level − 1，failStreak = 0
  hold → passStreak = 0，failStreak = 0
  level 夹在 [1, maxLevel]
```

| 游戏 | upAfter | downAfter | 理由 |
|---|---|---|---|
| schulte、stroop、seqmem | 1 | 1 | 一轮本身包含多次作答，每次训练轮数少，需要快速校准 |
| mot、gestalt | 2 | 1 | 一轮只有一个试次且存在猜中概率；2 升 1 降收敛到约 71% 正确率 |

所有游戏初始档位为 1。状态跨训练保存，下次从上次结束时的 level 和 streak 继续。

### 5.3 能力指数（`scoring.ts`）

- 单次训练：取最后 ⌈R/2⌉ 个计分轮（R 为计分轮总数），AI = round(100 × mean(level_r − 1 + score01_r) / maxLevel)，夹在 [0, 100]。
- 雷达图：每个游戏取最近 3 次训练 AI 的均值；从没练过显示 0 并标注「未练」。
- 折线图：每个日期键取当天该游戏 AI 的最高值，显示最近 30 个日期键。

### 5.4 日期键

`dayKey(epochMs, dayStartHour = 4)`：先减去 dayStartHour 小时，再取本地日期 `YYYY-MM-DD`。凌晨 0:00–3:59 的训练算作前一天。

### 5.5 今日计划

- 当天首次打开时生成并写库，当天内不再变化。
- 排序规则：① lastPlayedDayKey 升序（从没练过的排最前）；② 最近一次训练的 AI 升序（没有记录按 0）；③ 固定顺序 schulte、stroop、seqmem、mot、gestalt。取前 3 个。
- 当天某游戏完成任意一次训练（plan 或 free 都算），计划里该项即标记完成。
- 首页「开始训练」进入第一个未完成项；结算页「下一个」进入下一个未完成项；全部完成后显示「今日完成」。

### 5.6 连续打卡

从今天往前数，连续「计划全部完成」的日期键个数。今天还没完成时从昨天开始数，今天不打断连续。

### 5.7 存储（IndexedDB 库名 `focus-trainer`，版本 1）

| store | 主键 | 内容 |
|---|---|---|
| sessions | id（自增） | SessionRecord：gameId、mode、dayKey、startedAt、durationMs、startLevel、endLevel、rounds（RoundRecord[]）、summary、ability |
| gameState | gameId | AdaptiveState + lastPlayedDayKey |
| plans | dayKey | games（3 个 GameId）、completed（GameId[]） |
| settings | key | dayStartHour（默认 4） |

- sessions 建两个索引：`[gameId, startedAt]` 和 `dayKey`。
- 启动时调用 `navigator.storage.persist()`。

### 5.8 页面

- 首页：连续打卡天数；今日计划 3 张卡片（完成打 ✓）；「开始训练」；五个游戏的自由练入口（显示当前档位）；底部入口「趋势」「设置」。
- 训练页：顶栏（游戏名、第 x / R 轮、退出）；说明层 → 3-2-1 倒计时 → 游戏区。
- 结算页：结算指标、档位变化（↑ / ↓ / →）、本次 AI 与上次对比、「下一个」或「回首页」。
- 趋势页：五维雷达图；游戏切换 + 近 30 天折线；近 5 周打卡日历。
- 设置页：每日分界时间（0–6 点可选）；清空数据（二次确认）。
- 视觉约束：中性深色底；游戏区不用彩色装饰，避免干扰颜色任务；触控目标 ≥ 48px；竖屏锁定；适配安全区。具体视觉风格在实施时用 frontend-design 技能确定。

## 6. 错误处理

- IndexedDB 打开失败：顶部提示「本次成绩无法保存」，改用内存仓库，游戏照常可玩。
- 切后台、作废、退出：见 5.1。
- 帧间隔：时序关键阶段（完型的暴露与掩蔽、序列的高亮播放、MOT 的运动阶段）中任一帧间隔 > 50ms → 该轮 `timingValid = false`。舒尔特与颜色认知只测反应时，不做帧间隔判定。

## 7. 测试

- 单元测试（Vitest）：
  - rng：同种子同序列。
  - daykey：04:00 分界、跨日、设置改分界时间。
  - adaptive：pass / hold / fail 各种 streak 组合、上下限夹取。
  - scoring：后半段均值、夹取、雷达图均值与「未练」。
  - scheduler：首日与次日轮换、当日计划不变、完成判定、连续打卡跨天与「今天未完成不打断」。
  - 五个 engine：模拟时钟 + 脚本化输入跑通整轮，核对指标与判定。
  - MOT 物理：同种子确定、不出界、碰撞后不重叠、速率保持 v。
  - 完型碎片：实际保留率接近 k、干扰项互不相同且不等于目标、同族 / 异族规则。
  - storage：fake-indexeddb 往返读写、同事务写入。
- 界面验收（browser-use 插件，390×844 视口）：五个游戏各完成一次完整训练；计划全部完成后打卡天数 +1；趋势页三张图正常渲染；训练中切后台出现作废提示。
- APK：`assembleDebug` 成功；用 `aapt dump badging` 核对包名 `com.focustrainer.app` 与应用名。真机安装由用户完成。

## 8. 里程碑

- M1 基础 + 舒尔特方格：core 全部模块、外壳（首页、训练页、结算页、设置页）、舒尔特方格；手机浏览器可玩。
- M2 其余四个游戏：颜色认知、序列记忆、视觉动态感知、视觉完型整合。
- M3 趋势页 + 整体界面打磨。
- M4 APK：安装 Android SDK 命令行工具、接入 Capacitor、构建 debug APK。

## 9. 风险

| 风险 | 对策 |
|---|---|
| 项目路径含中文，AGP 在 Windows 上会做非 ASCII 路径检查 | `gradle.properties` 加 `android.overridePathCheck=true`；如果 aapt2 仍然失败，用 `subst` 把目录映射成 ASCII 盘符再构建 |
| Android SDK 需要下载约 1–2 GB，并需要接受 SDK 许可协议 | 装到 `E:\APPS\Android\Sdk`；接受许可前征得用户确认 |
| WebView 按帧刷新（60Hz 约 16.7ms），短暴露时长不精确 | 记录实测时长，阈值用实测值；帧间隔超限的轮作废 |
| 数据随卸载丢失 | v1 已知限制（数据导出属于非目标） |
