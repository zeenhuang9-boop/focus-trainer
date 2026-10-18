# M4 安卓 debug APK 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 把 `focus-trainer` 的 Vite 产物用 Capacitor 8 包成原生 Android 工程，产出并通过断言校验一个可安装的 debug APK（应用名「专注力训练」、包名 `com.focustrainer.app`、竖屏、完全离线）。

**架构：** Web 层不动一行游戏逻辑；Capacitor 只做三件事——把 `dist/` 拷进 `android/app/src/main/assets/public/`、用 `localhost` origin 的 WebView 承载它、给原生 Manifest 提供 `appId`/`appName`。原生侧只允许三处人工修改（`gradle.properties` 的非 ASCII 路径豁免、`app/build.gradle` 的 buildTools 版本钉死、`AndroidManifest.xml` 的竖屏），其余生成文件一律保持模板原样并入库。JS 侧只新增一个安卓返回键模块，且把可测的纯决策逻辑与依赖 `@capacitor/app` 的接线分文件，保证 node 环境仍能单测。

**技术选型：** Capacitor 8.5.3（`@capacitor/core` / `@capacitor/cli` / `@capacitor/android`，本机 npm registry 于 2026-10-19 实测 `latest`）+ `@capacitor/app` 8.1.2；AGP 8.13.0 / Gradle wrapper 8.14.3 / compileSdk 36 / targetSdk 36 / minSdk 24 / JDK 21 —— 后五项是 Capacitor 官方文档 `docs/updating/8-0` 的数字，**由 Task 3 Step 2/3 用本机生成的 `android/variables.gradle` + `gradle-wrapper.properties` + 根 `build.gradle` 复核，以生成文件为唯一事实**；JDK 用本机 `D:\APPS\Java`（21.0.8）。验证用 SDK 自带的 `aapt.exe`（`dump badging` 取包名/标签/SDK 级别，`dump xmltree` 取竖屏枚举值）、`build-tools/36.1.0/lib/apksigner.jar`（经 `java -jar` 调用，绕开 PATH）、`platform-tools/adb.exe`，全部走绝对路径。

**Spec:** `docs/superpowers/specs/2026-10-18-focus-trainer-design.md`

## Global Constraints

- 项目根：`E:\WORK\脑力训练\focus-trainer\`；Git 仓库根：`E:\WORK\脑力训练\`（git 命令在仓库根执行，路径写 `focus-trainer/...`）。
- **完全离线是硬要求**：不许引入 CDN、网络字体、远程图片/脚本；APK 内只允许打包进 `assets/public/` 的本地产物。运行时唯一「网络」是 WebView 从 `localhost` 读本地文件，因此 Manifest 里的 `android.permission.INTERNET` 必须保留，不得当作「多余权限」删掉（删了会白屏）。
- **只出 debug APK**：不建 release keystore、不签名发布、不上 Play。签名现实说清楚：`assembleDebug` 会自动在 `C:\Users\24295\.android\debug.keystore` 生成调试密钥库（store password `android`、alias `androiddebugkey`，公开常识、无保密性），所以任何人都能用同一把调试钥匙装这个包；它只用于自用与侧载，不能进应用商店。覆盖安装第三方签名版本会失败，处置见 Task 8。
- 依赖白名单：M4 只允许这 4 个包进入 lockfile —— `@capacitor/core@8.5.3`、`@capacitor/cli@8.5.3`、`@capacitor/android@8.5.3`、`@capacitor/app@8.1.2`。其余一律不加（尤其不加 `@capacitor/screen-orientation`：竖屏改用 Manifest 静态锁定，见 Task 3）。
- 与 M1 的「不加其他依赖」不冲突：M1 的约束作用域是 M1 里程碑（浏览器阶段不需要原生运行时）；spec 第 2 节把「打包 = Capacitor 8」明确划给 M4，spec 第 8 节把「接入 Capacitor、构建 debug APK」写成 M4 的定义。**M4 就是这四个依赖进 lockfile 的唯一时点**，过了 M4 再往 `package.json` 加包仍需要与 M4 同等的显式授权。
- 版本必须钉死为精确版本（不带 `^`/`~`），与 M1 的 version-locked 约定一致。本文档中的版本号来源分两类：`8.5.3` / `8.1.2` 由本机 `npm view` 实测（Task 1 要求执行时复核一次）；`AGP 8.13.0` / `Gradle 8.14.3` / `compileSdk 36` / `minSdk 24` 来自 Capacitor 官方文档 `docs/updating/8-0`，但**权威来源是 `cap add android` 生成到本地的 `android/variables.gradle`**，Task 3 要求以生成文件为准核对，不许拿文档数字代替本地事实。
- Node 必须 ≥ 22：`@capacitor/cli@8.5.3` 的 `engines` 是 `{ node: '>=22.0.0' }`（本机实测）。本机是 Node 24.x，满足；执行时先跑 `node -v` 确认。
- **不改系统环境**：不写注册表、不改 PATH、不提权。`ANDROID_HOME` / `JAVA_HOME` 只在**每条命令内**临时 `export`。SDK 根是 `E:\APPS\Android\Sdk`（不在 PATH），`build-tools\36.1.0`（`aapt.exe` v0.2-14042983 / `aapt2.exe` / `apksigner`）、`platforms\android-36`、`platform-tools\adb.exe` 1.0.41 / 37.0.1、`licenses\` 已接受 8 份许可（2026-10-18 经用户同意）。JDK 21.0.8 在 `D:\APPS\Java`。需要**永久**环境变量或把 SDK 加进 PATH 的话，本计划只写「请用户自己执行的命令」，agent 不代跑。
- **不要重新探测/重装 SDK**：这些事实已在 2026-10-18 核实并落盘（`.superpowers/m4-sdk-phase1.log`、`.superpowers/m4-sdk-phase2.log`、`C:\Users\24295\.qoder\projects\E--WORK-----\memory\m4-android-toolchain.md`）。Task 1 Step 1 只做一次「确认仍然存在」的轻量核对，不下载、不 `sdkmanager --update`。
- 长命令一律输出到仓库根 git-ignored 的 `.superpowers/` 日志文件，用后台任务跑，并在同一任务里给出「如何检查进程/端口已收摊」的命令。Gradle 首次构建固定加 `--no-daemon`（构建结束 JVM 自行退出，不留守护进程）；如果某次跑完确实留下了 java 进程，用 `cmd //c gradlew.bat --stop` 收尾并记录。
- 界面文案与用户可见错误用中文；代码标识符用英文；默认不写注释，只在原因不明显处写一行中文注释。改代码只用 Write / Edit 工具，不用 sed / heredoc / 脚本改源码。
- 中文路径（`脑力训练`）是 spec 第 9 节的头号风险：`android/gradle.properties` 必须加 `android.overridePathCheck=true`；`subst X:` 兜底只在 Task 5 失败分流表命中的**具体错误原文**出现时才启用，不许「预防性」切到 X:。
- 提交节奏：每个 Task 末尾一次提交，只 `git add` 本 Task 明确列出的文件（禁止 `git add -A`：`android/` 下有构建缓存、`local.properties`、`*.apk`，绝不能进库）。
- 真机侧一切操作（开 USB 调试、点安装、旋转手机、飞行模式冷启动）由**用户**完成；agent 只能跑 `adb devices` / `adb install -r` 之类的命令，且必须先得到用户「手机已连接、允许我装包」的明确答复。

## 前置条件

M4 的产物是「装了就能天天练」的 APK，所以内容侧必须齐全；但工具链风险与内容无关，越早暴露越好。据此：

- **M4 主体（Task 1–7）的硬前置 = M1 的 Task 8、9 已合并。** 依据是本仓库当前事实（2026-10-19 核对）：`focus-trainer/src/core/*`、`src/games/schulte/*`、`src/games/registry.ts`、`src/games/registry.test.ts` 已存在（提交 `ae01fcb` 及之前），但 **`focus-trainer/src/ui/` 整个目录还不存在**，`src/main.ts` 仍是 Task 1 留下的占位（`document.getElementById('view')!.textContent = '专注力训练';`）。没有 `src/ui/` 就没有可交互界面，APK 只能证明工具链，不能算交付物；而返回键接线（Task 6）必须改 `src/main.ts` 的路由装配，也依赖 M1 Task 9。
- **M4 验收（Task 8、9）的硬前置 = M2（其余 4 个游戏）已合并。** spec 第 1 节的成功标准 2 要求 5 个游戏都能在 APK 里走通；只用舒尔特一个游戏的 APK 不满足交付。
- **M4 的出包能力不依赖 M3，但「最终交付包」依赖** —— 拆成两句读：Task 1–8（工程接入、出包、返回键、审计脚本、真机冒烟）只要 M1 UI 合并就能跑，趋势页滑期不拖住这条拆雷线；而 Task 9 是全项目最后一次内容合并之后的复跑，M3 若晚于 M2 合并，就以 M3 为准再跑一遍，否则手里那个包没有趋势页，spec 第 5 条无从关闭。M1 首页已用 `disabled` 按钮占住「趋势」入口（`src/ui/pages/home.ts` 里 `h('button', { disabled: true, title: '趋势页在 M3 提供' }, '趋势')`，已核实存在），所以「还没有趋势页的 APK」不会长出坏链接。M4 对 M3 的唯一实质约束是：M3 引入 SVG 后，Task 7 的离线审计只放行 `w3.org` 命名空间字符串（Task 9 Step 3 复跑时验证）；那一行在 M3 合并前写「待 M3 合并后复跑」，**不写「通过」**。
- **两条 M1 裁定在 M4 里必须保持原样，不许「顺手修」**：
  - 每日计划的候选只取**已注册**的 `GAMES`、不取 `GAME_IDS` 全集。后果要在 Task 8 的真机清单里写清：瘦 APK（只注册了舒尔特）的今日计划**只有 1 张卡片**，1 项练完当天即打卡 —— 这是裁定的预期行为，不是打包坏了，别在 M4 改成 3 项。M2 注册满 5 个游戏后才会自然变成 3 项。
  - 轮内计时不做负值/NaN 兜底，其唯一 CI 守卫点是 `play.ts` 的手写桩测。Task 6 对 `play.ts` **只允许一处改动**：把那行硬编码的 `confirm('退出后本次训练不保存，确定退出吗？')` 换成 `confirm(EXIT_CONFIRM)`（同一句文案，见 Task 6 Step 3），以免同一操作存两份字面量各自漂移。除此之外不碰 `play.ts` 的任何计时相关代码，那个桩测不许删、不许因为文案改动而放宽。
- M1 Task 10（browser-use 界面验收）应在 M4 之前完成：Task 8 的真机清单直接沿用它的 Expected 文案，两边不一致时以 M1 为准。
- M1 已合并内容里有两条会被 M4 直接引用，改动前先确认它们仍在原处（**按内容锚点找，不要按行号** —— M1 计划今天已被改过三次，行号会漂）：`src/main.ts` 里的 `navigator.storage?.persist?.().catch(`（spec §5.7），`src/ui/pages/play.ts` 里的 `confirm('退出后本次训练不保存，确定退出吗？')`。核对命令：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -rn "storage?.persist?.(\|退出后本次训练不保存" src/
```

Expected：前者命中 `src/main.ts` 一行，后者命中 `src/ui/pages/play.ts` 一行。返回键文案必须与它**逐字相同**，且改完只剩一处（Task 6 Step 7 用同一条 grep 复查唯一性）。
- spec §7 的 APK 验收口径（`assembleDebug` 成功 + `aapt dump badging` 核对包名与应用名 + 真机安装由用户完成）是本计划 Task 5、7、8 的直接来源；任何放宽都要在验收记录里写明「用户同意」。

## 执行时序与「M1 之后先出一个瘦 APK」的决策

**决定：做，且强烈建议立刻做。** M1 合并后（Task 8、9 进主分支）就把 Task 1–7 跑一遍，出一个只含舒尔特的「瘦 APK」；M2 完成后只需复跑 Task 2→5→7→9（约 5 分钟，M3 是否完成不影响这条线）。理由：

1. M4 的全部真实风险都**与游戏内容无关**：非 ASCII 路径上的 AGP 检查、aapt2 的资源编码、CJK `appName` 落到 `strings.xml` 的编码、Gradle 首次构建的数百 MB 下载、JDK/Gradle/AGP 组合、WebView origin 与相对 `base` 是否白屏。这些在 1 个游戏的包上会一模一样地发生。
2. 反过来，M2/M3 会新引入 SVG（`charts.ts`）、更多 CSS、Canvas 动画——把工具链问题留到那时再撞上，就会同时面对「打包坏了」和「内容坏了」两类原因，定位成本翻倍（spec §9 的中文路径风险正是最难归因的一种）。
3. 成本极低：瘦 APK 只多花一次 Gradle 首次构建（一次性）与一次审计，Task 1–7 一行游戏代码都不用改。
4. 收益可量化：瘦 APK 完成后，用户可以**当场真机装一次**，把 Task 8 里「竖屏、CJK 图标名、飞行模式冷启动、`persisted()`」四项证据提前拿到；这四项与内容无关，提前拿到就不用等 M3。

**边界：** 瘦 APK 只是里程碑内的检查点，不是交付物，不据此关闭成功标准 1。成功标准 1 只在 Task 9 复跑（含 5 个游戏；M3 是否已完成不影响）并写完验收记录后关闭。

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `focus-trainer/package.json` | 新增 `dependencies` 块（3 个运行时包）与 `devDependencies` 里的 `@capacitor/cli` | 修改 |
| `focus-trainer/package-lock.json` | 锁定 4 个包的精确版本 | 由 npm 生成 |
| `focus-trainer/capacitor.config.ts` | Capacitor 唯一配置源：`appId` / `appName` / `webDir` / 日志与 WebView 底色 | 新建 |
| `focus-trainer/tsconfig.json` | `include` 补 `capacitor.config.ts` 与 `scripts`，让 `tsc --noEmit` 覆盖配置文件 | 修改 |
| `focus-trainer/android/**` | 生成的原生工程，入库（Capacitor 官方建议提交原生目录） | `cap add` 生成 |
| `focus-trainer/android/local.properties` | 把 SDK 钉在本机 `E:\APPS\Android\Sdk`，**不入库** | 新建 |
| `focus-trainer/android/gradle.properties` | 非 ASCII 路径豁免 +（按需）JDK 钉死 | 修改 |
| `focus-trainer/android/variables.gradle` | 读取（不修改）：核对 compileSdk / minSdk / AGP / AndroidX 实际数字 | 核对 |
| `focus-trainer/android/app/build.gradle` | `buildToolsVersion = "36.1.0"`，只用本机已装的 build-tools | 修改 |
| `focus-trainer/android/app/src/main/AndroidManifest.xml` | 竖屏锁定 `android:screenOrientation="portrait"` | 修改 |
| `focus-trainer/android/app/src/main/res/values/strings.xml` | 核对 `appName` 生成的 CJK `app_name` 没变乱码 | 核对（必要时修改） |
| `focus-trainer/.gitignore` | 显式排除 `android` 的构建产物与 `local.properties` | 修改 |
| `focus-trainer/src/ui/back-rule.ts` | 返回键的纯决策（可测、不 import Capacitor） | 新建 |
| `focus-trainer/src/ui/back-rule.test.ts` | 决策的单元测试（node 环境、注入替身） | 新建 |
| `focus-trainer/src/ui/android-back.ts` | 唯一 import `@capacitor/app` / `@capacitor/core` 的接线文件 | 新建 |
| `focus-trainer/src/main.ts` | 记录当前路由 + 注册返回键监听 | 修改 |
| `focus-trainer/scripts/verify-apk.mjs` | 全部 APK 断言的可重复执行脚本（aapt badging / aapt xmltree / apksigner / 离线审计） | 新建 |
| `docs/superpowers/plans/2026-10-20-m4-acceptance.md` | 验收记录：机器断言结果 + 真机证据 + `persisted()` 结论 | 新建 |

---

### Task 1: 核对工具链现状并把 4 个 Capacitor 包钉进 lockfile

**Files:**
- Modify: `focus-trainer/package.json`
- Modify: `focus-trainer/package-lock.json`（由 `npm install` 生成）
- Create: `E:\WORK\脑力训练\.superpowers\m4-toolchain-check.txt`（临时事实快照，git-ignored）
- Create: `E:\WORK\脑力训练\.superpowers\m4-npm-install.log`（安装日志，git-ignored）

**Interfaces:**
- Consumes: 无（M4 起点）
- Produces: 已安装的 `@capacitor/cli@8.5.3`（后续 Task 用 `npx cap ...` 调用）、`@capacitor/core@8.5.3`、`@capacitor/android@8.5.3`（Task 3 的 `cap add android` 靠它）、`@capacitor/app@8.1.2`（Task 6 import 它）；`node -v` ≥ 22 的确认结论。

- [ ] **Step 1: 只读地确认工具链仍在（不下载、不安装 SDK）**

```bash
cd "E:/WORK/脑力训练" && mkdir -p .superpowers && {
  echo "node: $(node -v)";
  echo "npm: $(npm -v)";
  echo "java: $(JAVA_HOME='D:/APPS/Java' "D:/APPS/Java/bin/java.exe" -version 2>&1 | head -1)";
  echo "sdk.dir.exists: $([ -d "E:/APPS/Android/Sdk" ] && echo yes || echo NO)";
  echo "aapt: $("E:/APPS/Android/Sdk/build-tools/36.1.0/aapt.exe" version 2>&1 | head -1)";
  ls -d E:/APPS/Android/Sdk/platforms/android-36 E:/APPS/Android/Sdk/build-tools/36.1.0 E:/APPS/Android/Sdk/platform-tools/adb.exe;
} > .superpowers/m4-toolchain-check.txt 2>&1; cat .superpowers/m4-toolchain-check.txt
```

Expected：`node` 是 24.x（≥22 即可，Capacitor CLI 要求 `>=22.0.0`）；`java` 那行含 `21.0.8`；`sdk.dir.exists: yes`；`aapt` 那行含 `0.2-14042983`；三条 `ls` 都不报错。任何一条不符 → 停下，这是环境问题，不要靠改代码绕。

- [ ] **Step 2: 复核版本号（把「文档说的」变成「registry 说的」）**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && for p in core cli android app; do echo "@capacitor/$p -> $(npm view @capacitor/$p version)"; done; npm view @capacitor/cli engines; npm view @capacitor/android peerDependencies
```

Expected（2026-10-19 本机实测值）：`core 8.5.3`、`cli 8.5.3`、`android 8.5.3`、`app 8.1.2`；`engines` 含 `node: '>=22.0.0'`；`@capacitor/android` 的 peer 是 `@capacitor/core: ^8.5.0`。

若 `latest` 已前进到 8.6.x/8.7.x：**保持本文的 8.5.3**（已验证的钉子），除非 8.5.3 安装失败；不要跟进 9.x（registry 的 `next` tag 目前是 `9.0.0-alpha.8`，主版本升级会换 AGP/compileSdk，属另开里程碑）。若 registry 上 8.5.3 已不可用，把发现的新版本记进 `.superpowers/m4-toolchain-check.txt` 并同步改 Step 3 的 4 个数字（必须一起改，保持同批发号）。

- [ ] **Step 3: 写 `package.json`**

`focus-trainer/package.json` 整体替换为（新增 `dependencies` 块、`devDependencies` 里加 `@capacitor/cli`，其余保持 M1 原样）：

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
    "typecheck": "tsc --noEmit",
    "verify:apk": "node scripts/verify-apk.mjs"
  },
  "dependencies": {
    "@capacitor/android": "8.5.3",
    "@capacitor/app": "8.1.2",
    "@capacitor/core": "8.5.3"
  },
  "devDependencies": {
    "@capacitor/cli": "8.5.3",
    "fake-indexeddb": "6.2.6",
    "typescript": "5.9.3",
    "vite": "8.3.4",
    "vitest": "5.0.5"
  }
}
```

`scripts.verify:apk` 指向 Task 7 才创建的脚本，这是有意的：Step 4 只跑 `npm install`，不跑这个 script；Task 7 建好脚本后它会自然生效并被 Task 7 的验收覆盖。`dependencies` 而非 `devDependencies` 的理由：`@capacitor/core`、`@capacitor/app` 被 `src/` 直接 import，`@capacitor/android` 被 `cap add/sync` 用来发现原生平台包，属于工程本体依赖；`@capacitor/cli` 只在构建期用。

- [ ] **Step 4: 后台安装，日志落盘**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npm install --no-audit --no-fund > "E:/WORK/脑力训练/.superpowers/m4-npm-install.log" 2>&1
```

用后台任务方式跑（registry 访问 + lockfile 解析，几十秒到几分钟）。跑完后：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && tail -5 "E:/WORK/脑力训练/.superpowers/m4-npm-install.log" && npm ls @capacitor/core @capacitor/cli @capacitor/android @capacitor/app --depth=0
```

Expected：日志末行没有 `ERESOLVE`、`npm error`；`npm ls` 列出 4 个包且全是 `8.5.3 / 8.5.3 / 8.5.3 / 8.1.2`，无 `invalid` / `UNMET DEPENDENCY` 标记。

- [ ] **Step 5: 确认 CLI 可用且 M1 的测试没被弄坏**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx cap --version && npx tsc --noEmit && npx vitest run
```

Expected：`npx cap --version` 输出 `8.5.3`；`tsc` 无输出；`vitest run` 全绿（M1 已有测试数不变，本 Task 没加测试）。若 `vitest` 报解析不到 `@capacitor/*`，说明 Step 3 的块位置写错（跑 `git diff -- focus-trainer/package.json` 对照）。

- [ ] **Step 6: 检查暂存面，提交**

```bash
cd "E:/WORK/脑力训练" && git status --short && git add focus-trainer/package.json focus-trainer/package-lock.json && git commit -m "build(m4): pin capacitor 8.5.3 for android packaging" && git status --short
```

Expected：`git status --short` 只列出 `focus-trainer/package.json`、`focus-trainer/package-lock.json`（`.superpowers/` 已被根 `.gitignore` 忽略，`node_modules/` 同理）。提交后 `git status --short` 为空。

---

### Task 2: `capacitor.config.ts` 与 Vite 产物基线（防白屏的前置断言）

**Files:**
- Create: `focus-trainer/capacitor.config.ts`
- Modify: `focus-trainer/tsconfig.json`（`include` 数组）
- Test: `npm run build` 产物 `focus-trainer/dist/`（git-ignored，只作断言对象）

**Interfaces:**
- Consumes: Task 1 的 `@capacitor/cli@8.5.3`（提供 `CapacitorConfig` 类型与 `cap` 命令）
- Produces: `capacitor.config.ts` 导出的默认配置对象，`webDir: 'dist'` —— Task 3 的 `npx cap add android` 与后续每次 `npx cap sync android` 都从这里读 `appId`/`appName`/`webDir`。

- [ ] **Step 1: 先核对 `vite.config.ts` 的 `base`（这是白屏的头号成因，别猜，读文件）**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && cat vite.config.ts
```

Expected（2026-10-19 读到的现值）：`base: './'`。这就是 Capacitor 需要的写法——Capacitor 在安卓上以 `localhost` origin 伺服资源，绝对 `base`（`'/'`）会让 `index.html` 里的 `/assets/index-xxx.js` 变成从 Web 根取，某些 Capacitor 版本能兜住、某些兜不住，而 `'./'` 永远正确。**如果这一步读到 `base` 缺失或为 `'/'`：改成 `'./'` 并在提交信息里写明（`fix(m4): use relative vite base for capacitor`），后面的 Task 全部照常。** 不许反过来把 Capacitor 的 `webDir` 改成绝对路径来「适配」。

- [ ] **Step 2: 写 `capacitor.config.ts`**

`focus-trainer/capacitor.config.ts`：

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.focustrainer.app',
  appName: '专注力训练',
  webDir: 'dist',
  loggingBehavior: 'debug',
  backgroundColor: '#14161a',
  zoomEnabled: false,
};

export default config;
```

三点必须照写，不要按文档示例改回普通 import：
- `import type { CapacitorConfig }` —— M1 的 `tsconfig.json` 开了 `verbatimModuleSyntax`，`CapacitorConfig` 是纯类型，用值导入会被 `tsc --noEmit` 判错。
- 这里**没有 `orientation` 字段**：`CapacitorConfig` 顶层没有方向选项（官方推荐的做法是装 `@capacitor/screen-orientation` 插件，本计划受依赖白名单约束不装），竖屏改由 Task 3 直接写进 `AndroidManifest.xml` 静态锁定，对本自用 App 反而更强（启动即竖屏，无闪转）。
- `webDir: 'dist'` 是相对项目根（`focus-trainer/`）的路径，不是 `www`、不是 `build`，必须与 `npm run build` 的输出目录一致（Step 3 验证）。

- [ ] **Step 3: 让 `tsc` 覆盖配置文件，并跑一次生产构建**

把 `focus-trainer/tsconfig.json` 的 `include` 改成一行（其余选项一字不动，保持 M1 的 `strict` / `verbatimModuleSyntax` 等约定）：

```json
  "include": ["src", "vite.config.ts", "vitest.config.ts", "capacitor.config.ts", "scripts"]
```

```bash
cd "E:/WORK/脑力训练/focus-trainer" && rm -rf dist && npm run build
```

Expected：`tsc --noEmit` 无输出（说明 `capacitor.config.ts` 类型正确；`scripts` 目录此时还不存在，`include` 里的空目录不报错，Task 7 建好后自动纳入）；`vite build` 末行形如 `dist/index.html` + `dist/assets/*.js`，退出码 0。

- [ ] **Step 4: 断言产物用的是相对路径（把「不白屏」变成可测事实）**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -oE '(src|href)="[^"]+"' dist/index.html
```

Expected：只有 `./assets/...` 形态（相对路径）和 `./` 前缀，**没有**以单个 `/` 开头的 `/assets/...`，也没有 `http://` / `https://` 外链。若看到 `/assets/` → Step 1 的 `base` 没生效，回去改 `vite.config.ts`；若看到外链 → 违反离线约束，立刻按 Task 7 的离线审计口径查来源。

- [ ] **Step 5: 用 CLI 复核配置能被解析（不建原生工程）**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && npx cap sync android 2>&1 | tee "E:/WORK/脑力训练/.superpowers/m4-cap-sync-0.log"; echo "exit=$?"
```

Expected：**两种结局都算通过**——(a) 非 0 退出并明确抱怨 android 工程不存在（`Platform android is not added` / `not installed` 之类），或 (b) 退出 0 但没有任何 copy/update 动作。**唯一不算通过的是配置本身被拒**：出现 `webDir` 找不到、`appId` 非法、TS 解析/类型错误、`Cannot find module '@capacitor/cli'` 中的任意一个。之所以允许两种结局：`cap sync` 在未添加平台时的具体行为本文档未在本机实测，而它的价值只在「能加载并解析 `capacitor.config.ts`」这一点上。别用 `npx cap doctor` / `npx cap ls` 替代——这两个子命令在 Capacitor CLI 8 里是否存在未经核实。

- [ ] **Step 6: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/capacitor.config.ts focus-trainer/tsconfig.json focus-trainer/vite.config.ts && git commit -m "build(m4): add capacitor config and keep vite base relative"
```

Expected：`git commit` 成功。（`vite.config.ts` 未变时 `git add` 它无害；若 Step 1 改过它，这次一并入库。）

---

### Task 3: `npx cap add android` 并逐字核对生成物（CJK 应用名 / INTERNET 权限 / 版本事实）

**Files:**
- Create: `focus-trainer/android/**`（由 `cap add` 生成后入库）
- Modify: `focus-trainer/android/app/src/main/AndroidManifest.xml`（加竖屏）
- Read-only 核对: `focus-trainer/android/variables.gradle`、`focus-trainer/android/gradle/wrapper/gradle-wrapper.properties`、`focus-trainer/android/app/src/main/res/values/strings.xml`、`focus-trainer/android/app/src/main/java/com/focustrainer/app/MainActivity.java`

**Interfaces:**
- Consumes: Task 2 的 `capacitor.config.ts`（`appId` 决定 Java 包目录与 `applicationId`；`appName` 决定 `strings.xml` 里的 `app_name`）、Task 1 的 `@capacitor/android@8.5.3`
- Produces: `focus-trainer/android/` 工程，含 `gradlew.bat`（Task 5 的构建入口）、`app/src/main/AndroidManifest.xml`（Task 7 断言竖屏的来源）、`app/src/main/assets/public/`（Task 7 离线审计的对象）

- [ ] **Step 1: 添加安卓工程**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && npx cap add android 2>&1 | tee "E:/WORK/脑力训练/.superpowers/m4-cap-add.log"
```

Expected：输出含 `android` 项目创建成功、`✔ copy html` / `Adding android project` 之类，退出码 0，末尾出现 `android/` 目录。常见失败与处置：
- 「web assets directory (dist) not found」→ 回 Task 2 Step 3 先 `npm run build`。
- 「Platform android is already added」→ 说明上一轮跑过；先 `ls focus-trainer/android` 确认内容再决定，**不要**随手 `npx cap remove android`（会删原生改动，含我们 Task 3/4 的修改）。

- [ ] **Step 2: 核对目录骨架与包名落点**

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && ls gradlew.bat gradle.properties variables.gradle app/build.gradle app/src/main/AndroidManifest.xml && find app/src/main/java -name '*.java' && ls gradle/wrapper/ && grep -n "distributionUrl" gradle/wrapper/gradle-wrapper.properties
```

Expected：`gradlew.bat`、`variables.gradle`、`app/build.gradle`、`AndroidManifest.xml` 都在；Java 源文件路径含 `com/focustrainer/app/`（由 `appId` 生成，说明钉子生效）；`distributionUrl` 指向 `gradle-8.14.3-*.zip`（**记为 Gradle 的实际事实**，与文档数字不符时以这里为准，并在提交信息里注明）。

- [ ] **Step 3: 核对版本四元组（用生成文件，不用文档）**

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && cat variables.gradle && grep -nE "com.android.tools.build:gradle|classpath" build.gradle && grep -nE "^\s*(compileSdk|targetSdk|minSdk|namespace|applicationId|buildTools)" app/build.gradle
```

Expected（对照 spec §2 写的 36 / 24 / 8.13 / JDK 21）：`variables.gradle` 里 `minSdkVersion = 24`、`compileSdkVersion = 36`、`targetSdkVersion = 36`；根 `build.gradle` 的 classpath 是 `com.android.tools.build:gradle:8.13.x`；`app/build.gradle` 里 `applicationId "com.focustrainer.app"`、`namespace "com.focustrainer.app"`。把这 6 行原文粘进验收记录的「工具链事实」小节。
**若与 spec §2 不符**（例如 `minSdkVersion = 23` 或 AGP 变成 8.14）：**以生成文件为准**，不要为了迎合 spec 去改 `variables.gradle`（改了会偏离 Capacitor 官方支持矩阵，属自找风险）；在验收记录里写明「spec §2 数字与 Capacitor 8.5.3 模板的差值」并继续，spec 的回写由用户决定。

- [ ] **Step 4: 核对 CJK 应用名落到了字符串资源里（这是 `application-label` 的真实来源）**

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && cat app/src/main/res/values/strings.xml && grep -n "android:label\|android:theme\|configChanges\|screenOrientation\|activity" app/src/main/AndroidManifest.xml && grep -n "INTERNET" app/src/main/AndroidManifest.xml
```

Expected：`strings.xml` 里 `<string name="app_name">专注力训练</string>` —— 即 **`appName` 一定落成字符串资源**，Manifest 里是 `android:label="@string/app_name"`（不是硬编码的字面量）。这是正常且预期的形态，Task 7 的 `aapt dump badging` 会把它解析回 `application-label:'专注力训练'`。同时 Manifest 里必须有 `android.permission.INTERNET`（Capacitor 用来让 WebView 从 `localhost` 读本地文件；**保留它，别当冗余权限删**）。
异常处置：
- `app_name` 出现 `??` 或 `ä¸“æ³¨åŠ›è®­ç»ƒ` 之类乱码 → 是写文件时的编码问题。用 Write 工具把 `strings.xml` 整份重写为模板原文 + 正确的 `<string name="app_name">专注力训练</string>`（UTF-8 无 BOM），然后继续；不要改 `appName` 为英文（成功标准 1 要求中文名）。
- `android:label` 变成了字面量 `专注力训练`（不是 `@string/app_name`）→ 仍可用，但记录该事实；后续 `aapt` 的 `application-label` 直接来自 Manifest。
- `android:screenOrientation` 已存在且值不是 portrait（模板一般不会写）→ Step 5 覆盖它。

- [ ] **Step 5: 锁定竖屏（写进 Manifest，不加插件）**

编辑 `focus-trainer/android/app/src/main/AndroidManifest.xml`，在 `<activity android:name=".MainActivity"` 的属性里加入一行（与既有 `android:theme` / `android:launchMode` / `android:configChanges` 同级、不删除任何既有属性）：

```xml
        android:screenOrientation="portrait"
```

Expected：该 activity 现在同时有 `android:configChanges="orientation|keyboardHidden|keyboard|screenSize|smallestScreenSize|locale|layoutDirection|fontScale|screenLayout|density|uiMode"`（模板原样）和新增的 `android:screenOrientation="portrait"`。两者并存是 Capacitor 工程的常见形态，不影响生效。
（若手机是 Android 12+ 平板形态，系统可能忽略 `screenOrientation`；用户手机是普通竖屏手机，Task 8 用真机旋转验证，不额外加 `resizeableActivity`。）

- [ ] **Step 6: 同步一次并确认 web 产物进了 assets**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && npx cap sync android 2>&1 | tee "E:/WORK/脑力训练/.superpowers/m4-cap-sync-1.log" && ls android/app/src/main/assets/public && head -c 400 android/app/src/main/assets/public/index.html
```

Expected：sync 输出 `✔ copy android` / `✔ update android`，无 `Not all plugins` 类告警；`assets/public/` 下有 `index.html`、`assets/`、`cordova.js`、`cordova_plugins.js`；`index.html` 里仍是 `./assets/...` 相对引用。`@capacitor/app@8.1.2` 会被 sync 自动登记（因为 `package.json` 里有它），这是预期行为。

- [ ] **Step 7: 提交生成工程（先看清要加什么）**

```bash
cd "E:/WORK/脑力训练" && git status --short focus-trainer/android | head -40
```

Expected：只出现 `focus-trainer/android/` 下的源码型文件（`.gitignore`、`build.gradle`、`variables.gradle`、`gradle/wrapper/gradle-wrapper.jar`、`gradlew*`、`app/**`、`capacitor.settings.gradle`、`capacitor.build.gradle` 等）。**不应出现** `app/build/`、`.gradle/`、`*.apk`（这些由 Step 8 的忽略规则拦掉）。

- [ ] **Step 8: 补 `.gitignore`，避免构建产物被顺手提交**

在 `focus-trainer/.gitignore` 末尾追加（该文件已存在，只追加、不覆盖既有行）：

```
# Capacitor 原生工程：构建产物与本机 SDK 路径不入库
android/.gradle/
android/build/
android/app/build/
android/app/src/main/assets/public/
android/local.properties
```

`assets/public/` 不入库是对的：它是 `dist/` 的拷贝，由 `npx cap sync` 生成，入库只会在每次构建后制造假 diff。

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/.gitignore && git add -n focus-trainer/android 2>/dev/null | head -5 && git add focus-trainer/android && git commit -m "build(m4): add capacitor android project with portrait lock and cn app label" && git status --short
```

Expected：`git commit` 成功；提交后 `git status --short` 为空（说明 Step 8 的忽略规则把 `local.properties`（下一步才建）与 `assets/public` 拦住了）。

---

### Task 4: 把构建钉在本机 SDK 上，并落 spec §9 的两条中文路径对策

**Files:**
- Create: `focus-trainer/android/local.properties`（**不入库**）
- Modify: `focus-trainer/android/gradle.properties`
- Modify: `focus-trainer/android/app/build.gradle`

**Interfaces:**
- Consumes: Task 3 生成的 `focus-trainer/android/` 工程、本机 `E:\APPS\Android\Sdk`（只装了 `platforms\android-36` 与 `build-tools\36.1.0`）
- Produces: `assembleDebug` 不再依赖任何环境变量或 PATH 的确定性工程（Task 5 直接用）

- [ ] **Step 1: 写 `local.properties`（Windows 转义是唯一坑，照抄别手搓）**

`focus-trainer/android/local.properties` 全文一行：

```
sdk.dir=E\:\\APPS\\Android\\Sdk
```

为什么是这个怪样子：`local.properties` 由 `java.util.Properties` 解析，值里的单个 `\` 会被当转义符吃掉——写成 `sdk.dir=E:\APPS\Android\Sdk` 会解析成 `E:APPSAndroidSdk`，Gradle 报 `SDK location not found`。上面这行解析结果正是 `E:\APPS\Android\Sdk`。等价且更不易出错的写法是正斜杠 `sdk.dir=E:/APPS/Android/Sdk`；两者选其一，**选定后 Step 2 的核对必须看到解析后带斜杠的正确路径**，别两种混写在一行里。

- [ ] **Step 2: 验证 `local.properties` 真的会被解析成那个路径（不跑 Gradle，1 秒出结论）**

转义写错时最坏的代价是「下载完 Gradle 与全部依赖、构建 15 分钟后才报 `SDK location not found`」，所以先用一个一次性脚本按 `java.util.Properties` 的转义规则（`\\`→`\`、`\:`→`:`）把值解出来，再直接验目录：

`E:\WORK\脑力训练\.superpowers\m4-check-sdk-path.mjs`：

```js
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const raw = readFileSync('android/local.properties', 'utf8').trim();
const value = raw.replace(/^sdk\.dir=/, '').replace(/\\\\/g, '\\').replace(/\\:/g, ':');
console.log(`local.properties 原文: ${raw}`);
console.log(`解析后的路径: ${value}`);
for (const p of [value, join(value, 'build-tools', '36.1.0', 'aapt2.exe'), join(value, 'platforms', 'android-36')]) {
  console.log(`${existsSync(p) ? 'OK  ' : 'MISS'}  ${p}`);
}
```

```bash
cd "E:/WORK/脑力训练/focus-trainer" && node "../.superpowers/m4-check-sdk-path.mjs"
```

Expected：解析后的路径是 `E:\APPS\Android\Sdk`，三行全 `OK`。任何 `MISS` → Step 1 的转义写错（最常见是把单个 `\` 直接写进去了），改对再往下走；`E:\APPS\Android\Sdk` 三条都存在是本机 2026-10-18 已核实的事实，MISS 只可能是文件写错。

- [ ] **Step 3: `gradle.properties` 加非 ASCII 路径豁免（spec §9 第一道对策）**

在 `focus-trainer/android/gradle.properties` 末尾追加（保留模板既有行，尤其 `org.gradle.jvmargs=-Xmx1536m`；若既有 `android.useAndroidX=true` 不要重复）：

```
# spec 9: 项目路径含中文，AGP 在 Windows 上的非 ASCII 路径检查会直接失败
android.overridePathCheck=true
```

Expected：这一行必须落在 **`android/gradle.properties`**，不是仓库根的 `gradle.properties`、不是 `~/.gradle/gradle.properties`——位置错就完全不生效（Task 5 的错误原文会告诉你有没有生效）。

- [ ] **Step 4: 决定 JDK 21 的钉法**

先跑（**注意：`gradlew --version` 会顺手触发 Gradle 发行版下载，约 130 MB**——这是故意的，把网络步骤提前到本 Task，Task 5 的首次构建就只剩依赖下载；用后台任务跑并落日志）：

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && export JAVA_HOME='D:\APPS\Java' && "D:/APPS/Java/bin/java.exe" -version 2>&1 | head -1 && cmd //c "gradlew.bat --version --no-daemon" > "E:/WORK/脑力训练/.superpowers/m4-gradle-version.log" 2>&1; grep -iE "^Gradle |^JVM" "E:/WORK/脑力训练/.superpowers/m4-gradle-version.log"
```

Expected：第一行含 `21.0.8`；日志里 `Gradle 8.14.3`（以 Task 3 Step 2 读到的 `distributionUrl` 为准）与 `JVM: 21.0.x`。**只有当 `JVM:` 不是 21 时**，才在 `gradle.properties` 追加一行把 JDK 钉死（本计划默认不写它，因为 `JAVA_HOME` 已指向 `D:\APPS\Java`，写死绝对路径会让工程在别的机器上直接炸——AGP 8.13 要求 JDK 17+，21 是其推荐值）：

```
org.gradle.java.home=D\:\\APPS\\Java
```

同样要转义（同一个 `Properties` 解析器）。加了这行就要在验收记录里写明「工程因此绑定了本机 JDK 路径」。

- [ ] **Step 5: 把 build-tools 钉在本机已装的 36.1.0（避免 AGP 自动下载别的号）**

编辑 `focus-trainer/android/app/build.gradle`，在 `android {` 块里紧跟 `namespace` 之后加一行：

```groovy
    buildToolsVersion = "36.1.0"
```

Expected：`android { namespace "com.focustrainer.app" compileSdkVersion project.hasProperty(...) ... buildToolsVersion = "36.1.0" }`。理由：本机只有 `build-tools\36.1.0`；AGP 8.13 的默认 build-tools 号若不是它，构建会尝试自动下载安装（多一次网络与磁盘动作）或直接报 `Failed to install the following SDK components`。显式钉住把这件事变成零。若 Step 3 的核对显示模板本来就写了别的号，把它改成 `36.1.0` 并在提交信息里注明。

- [ ] **Step 6: 确认 `local.properties` 没被跟踪，然后提交**

```bash
cd "E:/WORK/脑力训练" && git check-ignore -v focus-trainer/android/local.properties && git status --short focus-trainer/android | head -10
```

Expected：`git check-ignore -v` **有输出**（指向 `focus-trainer/.gitignore:android/local.properties`）；`git status --short` 只列 `build.gradle` 与 `gradle.properties`。若 `check-ignore` 无输出（退出码 1），说明 Task 3 Step 8 的忽略行没生效——先补 `.gitignore` 再继续，**绝不能** `git add` 这个文件（它含本机绝对路径）。

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/android/gradle.properties focus-trainer/android/app/build.gradle && git commit -m "build(m4): pin sdk and build-tools to local install, allow non-ascii path"
```

---

### Task 5: 首次 `assembleDebug`（后台跑、日志落盘、按错误原文分流，含 `subst` 兜底）

**Files:**
- Create: `E:\WORK\脑力训练\.superpowers\m4-gradle-build.log`（git-ignored）
- Create: `focus-trainer/android/app/build/outputs/apk/debug/app-debug.apk`（构建产物，**不入库**，`*.apk` 已被根 `.gitignore` 拦住）
- Create（仅当触发兜底）: `E:\WORK\脑力训练\.superpowers\m4-gradle-build-x.log`

**Interfaces:**
- Consumes: Task 3 的 `android/` 工程与 `assets/public/`、Task 4 的 `local.properties` / `gradle.properties` / `buildToolsVersion`
- Produces: `E:\WORK\脑力训练\focus-trainer\android\app\build\outputs\apk\debug\app-debug.apk` —— Task 7 审计脚本的输入、Task 8 用户安装的输入

- [ ] **Step 1: 先想清楚这一次要下载什么（几百 MB 的网络步骤）**

无 Android Studio、无独立 Gradle：`gradlew.bat` 会自己下载 Gradle 发行版（`gradle-8.14.3-bin.zip`，约 130 MB，进 `C:\Users\24295\.gradle\wrapper\dists\`，该路径是 ASCII，不受中文路径影响），再从 `dl.google.com` / Maven Central 拉 AGP 8.13.x 与模板声明的 AndroidX 依赖（`androidx-appcompat 1.7.x`、`core-ktx`、`webkit`、`splashscreen`、`activity` 等，合计约 150–300 MB，进 `C:\Users\24295\.gradle\caches\modules-2\`）。合计一次 5–20 分钟、数百 MB。**这一步不可离线**（但 APK 运行期仍完全离线，二者别混）。

- [ ] **Step 2: 后台执行，输出重定向，`--no-daemon` 不留守护进程**

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && cmd //c "gradlew.bat assembleDebug --stacktrace --no-daemon" > "E:/WORK/脑力训练/.superpowers/m4-gradle-build.log" 2>&1
```

必须用后台任务方式启动（记录任务 id 便于事后终止）。检查进度的方式不是 sleep 轮询，而是**先看后台任务的输出、再看日志尾部**：

```bash
tail -20 "E:/WORK/脑力训练/.superpowers/m4-gradle-build.log"
```

Expected 末行：`BUILD SUCCESSFUL in Xm Ys` 且含 `> Task :app:assembleDebug`。APK 落点（固定路径，别找）：

```
E:\WORK\脑力训练\focus-trainer\android\app\build\outputs\apk\debug\app-debug.apk
```

```bash
ls -l "E:/WORK/脑力训练/focus-trainer/android/app/build/outputs/apk/debug/"
```

Expected：`app-debug.apk` 存在且大小 > 3 MB（自用壳应用：Capacitor 运行时 + 我们的 dist）。

- [ ] **Step 3: 失败时按「错误原文」分流（照表处置，不要凭感觉试）**

先 `grep -nE "FAILURE|error:|ERROR|Execution failed|Caused by" "E:/WORK/脑力训练/.superpowers/m4-gradle-build.log" | head -20`，再对号入座：

| 日志里出现的原文（触发条件） | 根因 | 处置 |
|---|---|---|
| `Your project path contains non-ASCII characters` | `android.overridePathCheck=true` 没在 `android/gradle.properties` 生效 | 回 Task 4 Step 3 核对位置与拼写；这是唯一一次先修钉子再复跑的情况 |
| `AAPT2 ... Daemon` + `error: failed processing` / `error: file not found` / `Unexpected error during link`，且消息里出现 `脑力训练` 或 `??????`/mojibake 形式的路径 | **中文路径兜底的触发器（spec §9 第二道对策）**：`aapt2` 在把非 ASCII 路径传给子进程或做资源链接时真炸了；`overridePathCheck` 只关掉 AGP 的静态检查、不修工具本身 | 走 Step 4 |
| `CreateProcess error=206, The filename or extension is too long` | 同上（Windows 260 字符限制叠加中文目录） | 走 Step 4 |
| `SDK location not found` | `local.properties` 转义写错 | 回 Task 4 Step 1 |
| `Failed to install the following SDK components` / `You have not accepted the license agreements` | build-tools / platform 号与本机不符，或 `sdk.dir` 指错 | 核对 Task 4 Step 5 的 `buildToolsVersion = "36.1.0"` 与 `platforms/android-36`；许可已在 2026-10-18 接受过（8 份，见 `.superpowers/m4-sdk-phase2.log`），**不要**重新接受或重装 SDK |
| `Unsupported class file major version` / `Gradle project JVM ... requires Java 17+` | Gradle 用错了 JDK | 按 Task 4 Step 4 的条件加 `org.gradle.java.home` |
| `Could not resolve com.android.tools.build:gradle:8.13.x` / `Could not download ... .pom` | 网络/镜像问题 | 复跑一次；连续两次失败就把该 `distributionUrl`/`repository` 原文写进验收记录交用户判断，**不要**擅自换镜像源或改 `settings.gradle` |
| `Deprecated Gradle features were used in this build`（且末行是 `BUILD SUCCESSFUL`） | 无害的弃用警告 | 把原文记进验收记录即可，**不要**去改模板 |

- [ ] **Step 4: 兜底方案（仅在 Step 3 命中前两行时启用）——`subst` 把目录映射成 ASCII 盘符**

`subst` 是每登录会话的虚拟盘符，不需管理员权限、不改注册表、重启即失效；映射前后是同一批物理文件（所以 `android/` 内容、APK 落点都是同一个，只是路径写法变了）。

```bash
cmd //c 'subst X: "E:\WORK\脑力训练"' && cmd //c subst && cd "X:/focus-trainer/android" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && cmd //c "gradlew.bat clean assembleDebug --stacktrace --no-daemon" > "E:/WORK/脑力训练/.superpowers/m4-gradle-build-x.log" 2>&1
```

Expected：`cmd //c subst` 列出 `X: => E:\WORK\脑力训练`；日志末行 `BUILD SUCCESSFUL`；APK 在 `X:\focus-trainer\android\app\build\outputs\apk\debug\app-debug.apk`（= `E:\WORK\...` 同一文件）。
注意：从 `X:` 构建会让 Gradle 的项目级缓存（`android/.gradle/`）按新路径重建，首次会比 Step 2 慢，属正常；命令里的 `clean` 只是清掉 `app/build/` 里从中文路径留下的半成品输出，避免旧产物干扰判断（依赖缓存在 `C:\Users\24295\.gradle\caches\`，不受影响，不会重下）。若 Step 2 的失败原因其实与路径无关，切到 `X:` 会以同样的原因失败——那时回到 Step 3 的其余行，别把 `X:` 当成万能药。
启用过兜底就必须做两件事：(1) 在验收记录写明「触发原文 + 后续构建固定从 `X:` 跑」；(2) 后续 Task（7 的 `--apk` 参数、8 的 `adb install` 路径）统一使用 `X:` 写法，并记住**重启后要重新 `subst X:`**。
用完且确认不再需要时解除映射（保留着也行，只是别在重启后困惑）：

```bash
cd "E:/WORK/脑力训练" && cmd //c 'subst X: /d'
```

- [ ] **Step 5: 复跑一次增量构建，确认从干净状态可重复（证明这不是一次性侥幸）**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && npm run build && npx cap sync android && cd android && cmd //c "gradlew.bat assembleDebug --no-daemon" > "E:/WORK/脑力训练/.superpowers/m4-gradle-build-2.log" 2>&1; tail -3 "E:/WORK/脑力训练/.superpowers/m4-gradle-build-2.log"
```

Expected：`BUILD SUCCESSFUL`，且这一次耗时远小于首次（依赖已缓存）。这条链路（`npm run build` → `cap sync android` → `assembleDebug`）就是日常出包的三步，Task 9 会原样复跑。

- [ ] **Step 6: 确认没有残留进程与守护进程**

```bash
tasklist | grep -iE "java|GradleDaemon" ; echo "grep_exit=$?"
```

Expected：无输出（`grep_exit=1`）——`--no-daemon` 已保证构建 JVM 退出。若有残留：

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && cmd //c "gradlew.bat --stop" && tasklist | grep -iE "java|GradleDaemon"
```

并在验收记录里写清残留进程名与 PID 处置结果。同时确认这次跑没跑起过 `vite dev`（不该跑）：`netstat -ano | grep 5173` 应无输出。

- [ ] **Step 7: 提交（本 Task 只可能提交兜底事实，产物不入库）**

```bash
cd "E:/WORK/脑力训练" && git status --short && git add focus-trainer/android && git status --short && echo "无源码改动则跳过提交"
```

Expected：`git status --short` 只可能列出 `focus-trainer/android/` 下被 Gradle 改动的**已跟踪文本文件**（常见为无）；`app/build/`、`*.apk`、`local.properties` 都不该出现。若 Gradle 意外改了 `app/build.gradle` 或 `variables.gradle`，先 `git diff` 看清改了什么再决定是否入库。没有可提交的源码改动就不提交（不要制造空提交）。

---

### Task 6: 安卓物理返回键 —— 中途离开训练页要弹确认（补 M1 遗留限制）

**Files:**
- Create: `focus-trainer/src/ui/back-rule.ts`
- Test: `focus-trainer/src/ui/back-rule.test.ts`
- Create: `focus-trainer/src/ui/android-back.ts`
- Modify: `focus-trainer/src/main.ts`（M1 Task 9 建立的装配里加两行）
- Modify: `focus-trainer/src/ui/pages/play.ts`（把那处硬编码的退出确认文案换成 `import { EXIT_CONFIRM } from '../back-rule'`）

**Interfaces:**
- Consumes: M1 的 `Route` 类型与 `parseRoute`（`src/ui/router.ts`）、`history.back()` 驱动的 hashchange 路由、M1 `src/ui/pages/play.ts` 的退出确认文案
- Produces: `EXIT_CONFIRM: string`（导出，供测试与 play 页共用）、`handleBackButton(route: Route, deps: BackDeps): void`、`registerBackButton(getRoute: () => Route): Promise<void>`（`main.ts` 调用；web 平台下是 no-op）

**决策：这个改动属于 M4，不做后置。** 三条理由：(1) M1 计划的收尾已把它写成「安卓物理返回键中途离开训练页会丢弃本次训练且不弹确认，M4 用 Capacitor App 插件处理」——M4 后置它就是没人认领的悬空项；(2) 它是 spec 第 1 节成功标准 2（训练闭环）在真机上的破口：用户误按一次返回就白练，而 APK 是「每天练」的工具，这是自用 App 最实际的体验缺陷；(3) 成本可控：纯决策函数 + 5 个单测 + 1 个 20 行的接线文件。代价是多一个运行时依赖 `@capacitor/app@8.1.2`，已在 Task 1 的白名单里钉死。
（对照选项与不选的理由：Capacitor 的默认返回处理就是「WebView 能 `goBack()` 就 `goBack()`」，等于替我们静默丢弃训练——注册 `backButton` 监听本身就会禁用该默认行为（`@capacitor/app` README：「Listening for this event disables the default back button behavior」），所以必须自己接管，而不是「不配就行」。）

- [ ] **Step 1: 写纯决策的失败测试**

`focus-trainer/src/ui/back-rule.test.ts`（Vitest 环境是 `node`，所以 `confirm` / `history` / `minimize` 全部注入替身；这里测的是「返回键该做什么」的编排规则，不是 Capacitor 插件本身——插件的真实行为在 Task 8 真机验收）：

```ts
import { describe, expect, it, vi } from 'vitest';
import { EXIT_CONFIRM, handleBackButton, type BackDeps } from './back-rule';

function deps(overrides: Partial<BackDeps> = {}): BackDeps {
  return {
    confirm: vi.fn(() => true),
    back: vi.fn(),
    minimize: vi.fn(),
    historyDepth: 1,
    ...overrides,
  };
}

describe('handleBackButton', () => {
  it('训练中确认退出才回退，且用与退出按钮同一句文案', () => {
    const d = deps();
    handleBackButton({ name: 'play', gameId: 'schulte', mode: 'free' }, d);
    expect(d.confirm).toHaveBeenCalledWith(EXIT_CONFIRM);
    expect(d.back).toHaveBeenCalledTimes(1);
    expect(d.minimize).not.toHaveBeenCalled();
  });

  it('训练中取消确认则留在原页，不回退也不最小化', () => {
    const d = deps({ confirm: vi.fn(() => false) });
    handleBackButton({ name: 'play', gameId: 'mot', mode: 'plan' }, d);
    expect(d.back).not.toHaveBeenCalled();
    expect(d.minimize).not.toHaveBeenCalled();
  });

  it('非训练页且有历史时走回退', () => {
    const d = deps({ historyDepth: 3 });
    handleBackButton({ name: 'result', sessionId: 7 }, d);
    expect(d.back).toHaveBeenCalledTimes(1);
    expect(d.minimize).not.toHaveBeenCalled();
  });

  it('非训练页且已在根历史时最小化应用', () => {
    const d = deps({ historyDepth: 1 });
    handleBackButton({ name: 'home' }, d);
    expect(d.back).not.toHaveBeenCalled();
    expect(d.minimize).toHaveBeenCalledTimes(1);
  });

  it('historyDepth 为 0 也算没有可回退的历史', () => {
    const d = deps({ historyDepth: 0 });
    handleBackButton({ name: 'settings' }, d);
    expect(d.minimize).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/back-rule.test.ts
```

Expected: FAIL，`Failed to resolve './back-rule'`。

- [ ] **Step 3: 写纯决策实现**

`focus-trainer/src/ui/back-rule.ts`：

```ts
import type { Route } from './router';

// 与 play 页「退出」按钮复用同一句文案，避免同一操作出现两套问法
export const EXIT_CONFIRM = '退出后本次训练不保存，确定退出吗？';

export interface BackDeps {
  confirm(message: string): boolean;
  back(): void;
  minimize(): void;
  historyDepth: number;
}

export function handleBackButton(route: Route, deps: BackDeps): void {
  if (route.name === 'play') {
    if (deps.confirm(EXIT_CONFIRM)) deps.back();
    return;
  }
  if (deps.historyDepth > 1) {
    deps.back();
    return;
  }
  deps.minimize();
}
```

同一处改动还要落到 `focus-trainer/src/ui/pages/play.ts`：把 `if (confirm('退出后本次训练不保存，确定退出吗？')) navigate({ name: 'home' });` 改成 `if (confirm(EXIT_CONFIRM)) navigate({ name: 'home' });`，并在 import 区加 `import { EXIT_CONFIRM } from '../back-rule';`。**这一步不是可选的美化**：注释里写着「与 play 页复用同一句文案」而实际两处各存一份字面量，等于把「同一操作两套问法」的风险留给以后 —— 文案唯一性由 Step 7 的 grep 证明，不靠注释。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run src/ui/back-rule.test.ts && npx tsc --noEmit
```

Expected: 5 个测试 PASS；`tsc` 无输出。若 `Route` 上不存在 `historyDepth` 之类字段——本实现不读 Route 之外的东西，报错只可能是 M1 的 `Route` 变体名与这里不符（M1 约定是 `'home' | 'play' | 'result' | 'settings'`），按 `src/ui/router.ts` 的原文改这里，**不要**改 M1 的 Route。

- [ ] **Step 5: 写唯一接触 Capacitor API 的接线文件**

`focus-trainer/src/ui/android-back.ts`：

```ts
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { handleBackButton } from './back-rule';
import type { Route } from './router';

export async function registerBackButton(getRoute: () => Route): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  await App.addListener('backButton', () => {
    handleBackButton(getRoute(), {
      confirm: (message) => confirm(message),
      back: () => history.back(),
      minimize: () => void App.minimizeApp(),
      historyDepth: history.length,
    });
  });
}
```

API 依据（`@capacitor/app` README，`/ionic-team/capacitor-plugins` 的 `app/README.md`）：`addListener(eventName: 'backButton', listenerFunc)` 仅安卓有效且**注册即禁用默认返回行为**；`minimizeApp()` 仅安卓（最小化应用）；`exitApp()` 用于真正退出——本 App 选择最小化而非退出，因为自用场景下误按返回不该把训练中的进程整个杀掉。`Capacitor.getPlatform()` 让 Web 构建变成 no-op，M1 的 browser-use 验收不受影响。

- [ ] **Step 6: 接进装配（改 `src/main.ts`，两处小改）**

M1 的 `src/main.ts` 里，`startRouter((route) => { ... })` 的回调形参就是当前路由。改成先记录再渲染，并在 `boot()` 末尾注册监听。定位锚点：`startRouter(` 那一行与 `import { startRouter` 那一行。

在 import 区追加一行：

```ts
import { registerBackButton } from './ui/android-back';
```

把路由装配改成（只动 `currentRoute` 与 `registerBackButton` 两处，其余保持 M1 原样）：

```ts
let currentRoute: Route = { name: 'home' };
startRouter((route) => {
  currentRoute = route;
  render(route);
});
void registerBackButton(() => currentRoute);
```

Expected：`npx tsc --noEmit` 通过。若 M1 的实际装配不是 `render(route)` 而是内联体（例如 `startRouter((route) => { view.replaceChildren(...); ... })`），**保留它的函数体**，只在体首插入 `currentRoute = route;` 一行，并在体后补 `void registerBackButton(() => currentRoute);`。若 `Route` 类型没被 M1 的 `main.ts` 导出可用，用 `import type { Route } from './ui/router';` 补上。

- [ ] **Step 7: 全量回归 + 同步进原生工程**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run && npx tsc --noEmit && npm run build && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && npx cap sync android
```

Expected：M1 的全部测试 + 本 Task 5 个测试通过；`npm run build` 成功；sync 输出 `✔ copy android`。确认新代码进了 assets：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -l "退出后本次训练不保存" android/app/src/main/assets/public/assets/*.js
```

Expected：命中 1 个 chunk 文件（说明 CJK 文案在包里，编码没问题）。再证明源码里这句只存一份：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && grep -rn "退出后本次训练不保存" src/
```

Expected：**只命中 `src/ui/back-rule.ts` 一行**（`EXIT_CONFIRM` 的定义处）。若 `src/ui/pages/play.ts` 也命中，Step 3 的替换没做，两处字面量会各自漂移。

- [ ] **Step 8: 重新出包（增量构建，几十秒）**

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && cmd //c "gradlew.bat assembleDebug --no-daemon" > "E:/WORK/脑力训练/.superpowers/m4-gradle-build-3.log" 2>&1; tail -3 "E:/WORK/脑力训练/.superpowers/m4-gradle-build-3.log"
```

Expected：`BUILD SUCCESSFUL`。

- [ ] **Step 9: 提交**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/src/ui/back-rule.ts focus-trainer/src/ui/back-rule.test.ts focus-trainer/src/ui/android-back.ts focus-trainer/src/main.ts focus-trainer/src/ui/pages/play.ts && git commit -m "feat(m4): confirm before leaving a training on android back button"
```

---

### Task 7: APK 审计脚本 —— 用真断言代替「看着像没问题」

**Files:**
- Create: `focus-trainer/scripts/verify-apk.mjs`
- Create: `E:\WORK\脑力训练\.superpowers\m4-verify-apk.log`（脚本输出快照，git-ignored）

**Interfaces:**
- Consumes: Task 5/6 的 `app-debug.apk`、Task 3 的 `AndroidManifest.xml` 与 `assets/public/`、SDK 的 `aapt.exe` / `apksigner.jar` / `java.exe`
- Produces: `npm run verify:apk`（退出码 0 = 全部断言通过；非 0 = 至少一项 FAIL 并打印原因），Task 9 复跑与验收记录引用的唯一权威结论来源

- [ ] **Step 1: 写脚本（全文照抄，无 TODO）**

`focus-trainer/scripts/verify-apk.mjs`：

```js
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SDK = 'E:\\APPS\\Android\\Sdk';
const BUILD_TOOLS = join(SDK, 'build-tools', '36.1.0');
const AAPT = join(BUILD_TOOLS, 'aapt.exe');
const APSIGNER_JAR = join(BUILD_TOOLS, 'lib', 'apksigner.jar');
const JAVA = 'D:\\APPS\\Java\\bin\\java.exe';
const APK = process.argv[2] ?? 'android/app/build/outputs/apk/debug/app-debug.apk';
const PUBLIC_DIR = 'android/app/src/main/assets/public';

const EXPECT = {
  package: 'com.focustrainer.app',
  label: '专注力训练',
  minSdk: '24',
  targetSdk: '36',
  activity: 'com.focustrainer.app.MainActivity',
};

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
}

// 工具不在就直接停，别把「SDK 路径不对」伪装成一条 FAIL
for (const [label, p] of [['aapt.exe', AAPT], ['apksigner.jar', APSIGNER_JAR], ['java.exe', JAVA]]) {
  if (!existsSync(p)) {
    console.error(`找不到 ${label}：${p}`);
    process.exit(2);
  }
}

// 用 Buffer 取 aapt 输出再按 utf8 解码：Windows 控制台代码页会把 CJK 变成问号
function run(cmd, args) {
  return execFileSync(cmd, args, { maxBuffer: 32 * 1024 * 1024 }).toString('utf8');
}

// 工具本身跑不起来（路径错、jar 缺失、JDK 不对）是环境问题，用退出码 2 与「断言失败」的 1 分开
function mustRun(cmd, args) {
  try {
    return run(cmd, args);
  } catch (err) {
    console.error(`${cmd} 调用失败：${String(err).slice(0, 400)}`);
    process.exit(2);
  }
}

if (!existsSync(APK)) {
  console.error(`APK 不存在：${APK}`);
  process.exit(2);
}
const sizeMb = (statSync(APK).size / 1024 / 1024).toFixed(2);
check(`APK 存在（${sizeMb} MB）`, statSync(APK).size > 3 * 1024 * 1024, `${APK}`);

const badging = mustRun(AAPT, ['dump', 'badging', APK]);
check(`包名 name='${EXPECT.package}'`, badging.includes(`package: name='${EXPECT.package}'`), badging.split('\n')[0]);
check(`应用名 application-label:'${EXPECT.label}'`, badging.includes(`application-label:'${EXPECT.label}'`), (badging.match(/application-label:.*$/) ?? [''])[0]);
check(`minSdk '${EXPECT.minSdk}'`, new RegExp(`sdkVersion:'${EXPECT.minSdk}'`).test(badging), (badging.match(/sdkVersion:.*$/) ?? [''])[0]);
check(`targetSdk '${EXPECT.targetSdk}'`, new RegExp(`targetSdkVersion:'${EXPECT.targetSdk}'`).test(badging), (badging.match(/targetSdkVersion:.*$/) ?? [''])[0]);
check(`启动活动 ${EXPECT.activity}`, badging.includes(`launchable-activity: name='${EXPECT.activity}'`), (badging.match(/launchable-activity:.*$/) ?? [''])[0]);
check('保留 INTERNET 权限（WebView 从 localhost 读本地文件所需）', badging.includes("uses-permission: name='android.permission.INTERNET'"), (badging.match(/uses-permission:[^\n]*/g) ?? ['无 uses-permission 行']).join(' | '));

// 方向不在 badging 输出里，只能从 Manifest 的 XML 树读枚举值
const xmltree = run(AAPT, ['dump', 'xmltree', APK, 'AndroidManifest.xml']);
// aapt 把属性打成形如：android:screenOrientation(0x0101001e)=(0x00000001)
// 行内有两个括号组，第一个是属性 resource id，最后一个才是枚举值；值是零补齐十六进制，
// 所以「/0x1\b/」这种写法永远匹配不上，必须解析成整数再比。
const orientLine = (xmltree.match(/android:screenOrientation[^\n]*/g) ?? []).join(' | ');
const orientHexes = [...orientLine.matchAll(/\((0x[0-9a-fA-F]+)\)/g)].map((m) => m[1]);
const orient = orientHexes.length ? parseInt(orientHexes[orientHexes.length - 1], 16) : Number.NaN;
check(
  '竖屏锁定 screenOrientation = 1 (PORTRAIT)',
  orient === 1,
  orientLine
    ? `${orientHexes.join(' ')} -> ${Number.isNaN(orient) ? '解析不出整数' : orient}（1=portrait，7=sensorPortrait，0=landscape，2=user，8=reverseLandscape，4294967295=0xffffffff=unspecified）`
    : 'Manifest 中找不到 android:screenOrientation'
);

let signed = '';
let signErr = '';
try {
  signed = run(JAVA, ['-jar', APSIGNER_JAR, 'verify', '--print-certs', APK]);
} catch (err) {
  signErr = String(err?.message ?? err);
}
check('apksigner verify 通过（debug 签名有效、未损坏）', signErr === '', signErr || (signed.match(/DOES NOT VERIFY.*/)?.[0] ?? '退出码 0'));
check('签名者是调试证书 CN=Android Debug', /CN=Android Debug/.test(signed), (signed.match(/Signer #1 certificate DN:.*$/) ?? ['未取到 DN'])[0]);

// 离线审计：APK 里真正打包的 web 资源不得引用任何外部 origin
const URL_RE = /https?:\/\/[A-Za-z0-9.\-_]+/g;
const ALLOW_ORIGIN = /^https?:\/\/([a-z0-9-]+\.)?w3\.org/i; // 只放行 XML 命名空间字符串，别的一律算外链
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(p));
    else if (/\.(html?|js|css|json|svg|txt|xml|map)$/.test(entry.name)) out.push(p);
  }
  return out;
}
const offenders = new Set();
const fontOffenders = new Set();
for (const file of collect(PUBLIC_DIR)) {
  const text = readFileSync(file, 'utf8');
  for (const raw of text.match(URL_RE) ?? []) {
    if (!ALLOW_ORIGIN.test(raw)) offenders.add(`${raw}  <-  ${file}`);
  }
  for (const hit of text.match(/@font-face|fonts\.googleapis\.com|fonts\.gstatic\.com|@import\s+url\(/g) ?? []) {
    fontOffenders.add(`${hit}  <-  ${file}`);
  }
}
check('web 资源无外部 origin（只允许 w3.org/localhost 之类的命名空间）', offenders.size === 0, [...offenders].slice(0, 5).join('\n'));
check('无网络字体与远程 @import', fontOffenders.size === 0, [...fontOffenders].slice(0, 5).join('\n'));

const indexHtml = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8');
check('index.html 用相对路径引用资源（防白屏）', /(?:src|href)="\.\/assets\//.test(indexHtml) && !/(?:src|href)="\/assets\//.test(indexHtml), (indexHtml.match(/(?:src|href)="[^"]+"/g) ?? []).join(' | '));

const widths = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `   [${r.detail}]` : ''}`);
console.log(`\n共 ${results.length} 项，失败 ${widths.length} 项。`);
process.exit(widths.length === 0 ? 0 : 1);
```

设计说明（写给下一个读它的人）：
- 每条断言都是**字符串/正则硬核对**，失败时打印 aapt 的原文行，方便一眼看出是钉子错了还是产物错了。
- `screenOrientation` 不在 `aapt dump badging` 的输出里（badging 不报方向），必须用 `aapt dump xmltree <apk> AndroidManifest.xml` 读枚举整数值。打出来是**零补齐十六进制**（`(0x0101001e)=(0x00000001)`），所以要解析行内最后一个括号组再比整数；`1` 即 `ActivityInfo.SCREEN_ORIENTATION_PORTRAIT`（下表取自本机 `E:\APPS\Android\Sdk\platforms\android-36\android.jar`，用 `javap -constants android.content.pm.ActivityInfo` 可复现）。成功标准 1 的「竖屏」由此证明，Manifest 是唯一事实源。
- 用 `execFileSync(...).toString('utf8')`（Buffer 解码）而不是 `encoding: 'utf8'` + 控制台直读，避免 Windows 代码页把 `专注力训练` 变成 `????`，导致「明明装对了却判 FAIL」。
- `PUBLIC_DIR`（`cap sync` 的落点）作为离线审计对象，因为它就是 APK 里 `assets/public/` 的内容；APK 内文件的运行时行为另由 Task 8 的飞行模式实测证明，二者互为补充。
- 没有 `apksigner.bat` 而是 `java -jar apksigner.jar`：`.bat` 需要 `java` 在 PATH，本计划不改 PATH。
- `@capacitor/app` 会被 sync 登记进 `cordova_plugins.js`；脚本不把它当「外部 origin」，因为那是包名不是 URL。

- [ ] **Step 2: 跑脚本，确认它真的在断言而不是空转**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npm run verify:apk > "E:/WORK/脑力训练/.superpowers/m4-verify-apk.log" 2>&1; echo "exit=$?"; cat "E:/WORK/脑力训练/.superpowers/m4-verify-apk.log"
```

Expected：13 行 `PASS`，末行 `共 13 项，失败 0 项。`，`exit=0`。
出现 FAIL 的处置：
- `screenOrientation` FAIL 且 detail 是「找不到」→ Task 3 Step 5 的 Manifest 修改没进 APK（多半是改完没重新 `assembleDebug`）；按 Task 6 Step 8 复跑。
- `screenOrientation` 有值但不是 `1` → detail 会打出全部括号组和解析出的整数。对照表（`android.content.pm.ActivityInfo`，取自本机 android-36）：`0`=landscape、`1`=portrait、`2`=user、`3`=behind、`4`=sensor、`5`=nosensor、`6`=sensorLandscape、`7`=sensorPortrait、`8`=reverseLandscape、`9`=reversePortrait、`10`=fullSensor、`11`=userLandscape、`12`=userPortrait、`13`=fullUser、`14`=locked、`4294967295`(=`0xffffffff`)=unspecified。出现 `0`/`8`/`9` 说明属性值写错或写到了别的 activity；`1` 以外若确是 `7`（`sensorPortrait`），也接受，但要在验收记录注明与 spec「竖屏锁定」的口径。
- detail 只有属性名那一个括号组、没有值 → aapt 的打印形态变了（可能把枚举打成了字符串 `portrait`）。这时不要改断言去迁就，先把 `xmltree` 原文贴进验收记录，再按原文改写解析。
- `application-label` FAIL 但 detail 显示 `application-label:'??????'` → CJK 在 `strings.xml` 里就坏了，回 Task 3 Step 4 重写该资源；若 detail 显示的是 `@string/app_name` 字面量 → 说明 label 不是资源引用而是别处覆盖，检查 `AndroidManifest.xml` 的 `android:label`。
- 外部 origin FAIL → 逐条查 detail 的文件名，从源码里去掉外链（这是违反 Global Constraints 的第一优先级问题，不许放宽断言）。allowlist 只认 `w3.org` 的命名空间字符串：`localhost` / `127.0.0.1` 也算 FAIL —— 打包产物里出现开发服务器地址，意味着离线时那一处必然拿不到东西。若 offenders 落在 `capacitor.config.ts` 之外、且文件是 `cap sync` 注入的（`cordova.js`、`index.html` 里 Capacitor 自己写的段落），不要手工改 `dist/` 也不要加白：把原文行贴进验收记录，标为「待上游确认」，并按 Task 9 复跑判定。

- [ ] **Step 3: 故意破坏一次，证明断言有效（这是脚本的「测试的测试」）**

先把注入代码写成一个 git-ignored 的一次性脚本（不在 shell 里手搓嵌套引号，那是 Windows + Git Bash 上最容易假失败的做法）：

`E:\WORK\脑力训练\.superpowers\m4-inject-offlink.mjs`：

```js
import { readFileSync, writeFileSync } from 'node:fs';
const f = 'android/app/src/main/assets/public/index.html';
const text = readFileSync(f, 'utf8');
const poisoned = text.replace('<head>', '<head><script src="https://cdn.example.com/x.js"></script>');
if (poisoned === text) {
  console.error('没找到 <head>，注入失败——先看 index.html 实际结构，别改断言');
  process.exit(2);
}
writeFileSync(f, poisoned, 'utf8');
console.log('已注入一条外链');
```

```bash
cd "E:/WORK/脑力训练/focus-trainer" && node ../.superpowers/m4-inject-offlink.mjs && npm run verify:apk; echo "exit=$?"
```

Expected：`FAIL  web 资源无外部 origin（只允许 w3.org/localhost 之类的命名空间）`，detail 打出 `https://cdn.example.com  <-  android\app\src\main\assets\public\index.html`；退出码 `exit=1`。这一步只临时污染 `assets/public/`（该目录不入库），污染后必须立刻复原并再验一次：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && npx cap sync android && npm run verify:apk | tail -1
```

Expected：`共 13 项，失败 0 项。`（`cap sync` 会用 `dist/` 覆盖被污染的副本，所以污染不可能残留；不要手工 `git checkout` 这个目录——它本来就不在库里。）

- [ ] **Step 4: 提交脚本**

```bash
cd "E:/WORK/脑力训练" && git add focus-trainer/scripts/verify-apk.mjs && git commit -m "test(m4): add apk audit script asserting package label orientation signing and offline"
```

---

### Task 8: 真机安装与离线 / 持久化证据（用户操作，agent 只跑 adb 侧命令）

**Files:**
- Create: `docs/superpowers/plans/2026-10-20-m4-acceptance.md`（验收记录，入库）

**Interfaces:**
- Consumes: Task 5/6 的 `app-debug.apk`、Task 7 的 `npm run verify:apk` 结论、`E:\APPS\Android\Sdk\platform-tools\adb.exe`
- Produces: 验收记录里成功标准 1 的「离线可用」与「IndexedDB 持久化」两项真机事实；`persisted()` 结论决定 §5.7 的持久化风险按哪种口径记录

- [ ] **Step 1: 与用户确认设备接入，再跑 `adb devices`（这一步之前不得执行任何 adb 写操作）**

**必须由用户完成**：手机上打开「开发者选项 → USB 调试」，插线，并在手机弹窗里点「允许 USB 调试」。agent 得到用户明确允许后才继续。

```bash
"E:/APPS/Android/Sdk/platform-tools/adb.exe" devices -l
```

Expected：一行 `<序列号> device product:... model:... device:... transport_id:...`。出现 `unauthorized` → 手机上没授权；一行都没有 → 线/驱动问题，记进验收记录并**终止本 Task**（工具链证据已由 Task 7 拿下，不要把真机项写成通过）。

- [ ] **Step 2: 安装（用户已许可 agent 代跑时执行；否则把命令交给用户）**

```bash
"E:/APPS/Android/Sdk/platform-tools/adb.exe" install -r "E:/WORK/脑力训练/focus-trainer/android/app/build/outputs/apk/debug/app-debug.apk"
```

Expected：`Success`。失败原文处置：
- `INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package ... signatures do not match` → 手机上装过别的签名的同名包。**必须**先 `adb uninstall com.focustrainer.app` 再装，而卸载会清空 IndexedDB（spec §9「数据随卸载丢失」）——先向用户确认历史数据可以丢，再执行。
- `adb: no devices/emulators found` → 回 Step 1。
- 若 Task 5 走了 `subst` 兜底，这里的路径写成 `X:/focus-trainer/android/app/build/outputs/apk/debug/app-debug.apk`（同一文件）。

装完立刻核对包与启动活动确实在系统里：

```bash
"E:/APPS/Android/Sdk/platform-tools/adb.exe" shell pm list packages | grep focustrainer && "E:/APPS/Android/Sdk/platform-tools/adb.exe" shell dumpsys package com.focustrainer.app | grep -E "versionName|targetSdk|minSdk" | head -3
```

Expected：`package:com.focustrainer.app`；`versionName=`、`targetSdk=`、`minSdk=` 与 Task 7 的断言一致。

- [ ] **Step 3: 用户目视四项（逐条记进验收记录，写「通过/不通过 + 现象」）**

1. 桌面图标名是「专注力训练」，不是乱码、不是 `App`/`capacitor`。
2. 启动后在竖屏下进入首页；**把手机转到横向**，界面不跟着转（Task 7 的 Manifest 断言到此闭合）。
3. 顶栏无白边、底部导航不遮控件（安全区，`index.html` 已带 `viewport-fit=cover`）。
4. 训练页进行到第 2 轮时**按一次物理返回键**：出现「退出后本次训练不保存，确定退出吗？」；点取消 → 留在原轮；点确定 → 回首页且自由练档位不变（本次未写库）。这一条是 Task 6 的唯一真机证据，未验证不得写「返回键 OK」。
5. 在首页按物理返回键：应用最小化（回桌面），进程不被杀；再从最近任务回到 App 时仍停在首页。

- [ ] **Step 4: 离线可用实测（不依赖 DevTools 的决定性证据）**

让用户开启飞行模式（或关掉 WiFi + 数据），冷启动应用，走通一次舒尔特 3 轮训练直到结算页。Expected：**照常可玩**，无白屏、无「启动失败」、无 `本次成绩无法保存` 横幅。这是成功标准 1「离线可用」的硬证据。
再跑一次静态证据（agent 侧，飞行模式不需要）：

```bash
"E:/APPS/Android/Sdk/platform-tools/adb.exe" shell "dumpsys netstats | grep -i 'uid=appid=com.focustrainer.app'" | head -5
```

Expected：无输出或没有该应用的持续前台流量统计（Capacitor 从 `localhost` 读本地文件，不产生移动数据）。这条只是辅助，**判定依据是 Step 4 的飞行模式实测 + Task 7 的静态审计**，别把它当唯一证据。

- [ ] **Step 5: `navigator.storage.persist()` 证据（spec §5.7 的关键项，必须落字）**

M1 的装配只调用了 `navigator.storage.persist()`，并且**只在它 reject 时** `console.warn('storage.persist 失败')`。要点：`persist()` 被拒绝/未授予时通常是 **resolve `false`，不是 reject**，所以 M1 那条警告不出现 ≠ 持久化已授予。因此证据要用 `persisted()` 现问现答，两条路径任选（都失败则记「未能取证」）：

**路径 A（首选，桌面 Chrome 远程调试）**：手机连着 adb 的情况下，在桌面 Chrome 打开 `chrome://inspect/#devices` → 找到 `http://localhost/index.html`（或 `https://localhost`）→ `inspect` → 控制台执行：

```js
await navigator.storage.persisted();
```

Expected：`true` 或 `false`，**照实记录数值**。看不到目标 = debug 包的 WebView 调试没开：确认 APK 是 `assembleDebug` 产物（debuggable），换一根能传数据的线，或在 `capacitor.config.ts` 里把 `loggingBehavior` 设为 `'debug'`（Task 2 已是 `'debug'`）后重新 `npm run build && npx cap sync android && assembleDebug`。
顺手记一条 `location.origin` 的实际值（`http://localhost` 还是 `https://localhost`）——本 App 不依赖具体 scheme，但事实要落档。

**路径 B（无 DevTools 时的磁盘侧证据）**：debug 包可 `run-as`，直接看 IndexedDB 落没落盘。

```bash
"E:/APPS/Android/Sdk/platform-tools/adb.exe" shell "run-as com.focustrainer.app ls -l databases/" && "E:/APPS/Android/Sdk/platform-tools/adb.exe" shell "run-as com.focustrainer.app ls -l app_webview/Default/IndexedDB/ 2>/dev/null"
```

Expected：至少一处列出 `focus-trainer` 相关 `.db` 文件（Chromium WebView 的 IndexedDB 通常落在 `app_webview/Default/IndexedDB/https_localhost_0.indexes` 之类的目录下，目录名随 scheme 变）。做完一次训练后应有非零大小文件；杀掉应用再打开、成绩仍在，即持久化路径可用。

**判定与口径（不许含糊）**：
- `persisted() === true` → spec §2 的「Android 上 persist 后 IndexedDB 不会被系统回收」在真机上成立，记录数值与取证路径。
- `persisted() === false` → **不要新增插件、不要加代码「重试 persist」**。处置口径：(1) 在验收记录里写明数值与取证方式；(2) 把风险重新表述为「数据可能因系统空间不足被清理，且卸载必丢（spec §9 已列）」；(3) 告知用户可在手机「设置 → 存储 → 应用」里为本 App 打开「不使用智能存储/固定存储」（系统侧开关，属用户操作，agent 不碰）；(4) 是否把 M1 的 `persist()` 调用改成同时记录布尔值，留给用户决定，本 Task 不动 M1 代码。
- 两条路径都取不到证 → 记「未取证」，并在 Task 9 的对照表里把 §5.7 那一行标为「待用户在手机上自查」，**不得**因为「构建通过」就把它写成通过。

- [ ] **Step 6: 写验收记录（入库）**

创建 `docs/superpowers/plans/2026-10-20-m4-acceptance.md`，内容用下面这份骨架，把每一步的真实输出粘进去（原文粘贴，不要转述）：

```markdown
# M4 验收记录

- 日期：2026-10-__　里程碑：M4（Android debug APK）
- 计划：`docs/superpowers/plans/2026-10-20-m4-android-apk.md`
- 构建机：Windows / Node `24.x` / JDK `21.0.8`（`D:\APPS\Java`）/ SDK `E:\APPS\Android\Sdk`（platforms/android-36、build-tools/36.1.0）
- 兜底启用：否 / 是（`subst X:`，触发原文：……）

## 1. 工具链事实（来自生成的 `android/variables.gradle` 与 `gradle-wrapper.properties`）
compileSdk = 　　minSdk = 　　targetSdk = 　　AGP = 　　Gradle = 　　buildToolsVersion =

## 2. 机器断言（`npm run verify:apk`）
（粘贴 13 行 PASS/FAIL 原文与末行统计）

## 3. Gradle 构建
首次耗时：　　日志：`.superpowers/m4-gradle-build.log`　　增量复跑耗时：　　`BUILD SUCCESSFUL` 原文：
APK：`android/app/build/outputs/apk/debug/app-debug.apk`　　大小：　　MB

## 4. 真机（用户操作）
设备型号 / 安卓版本：
| 项 | 结果 | 现象 |
|---|---|---|
| 桌面图标名「专注力训练」 | | |
| 竖屏锁定（旋屏不跟随） | | |
| 安全区无遮挡 | | |
| 训练中物理返回键弹确认（取消留页 / 确定回首页且不写库） | | |
| 首页返回键最小化、可从最近任务恢复 | | |
| 飞行模式冷启动并完整练一轮 | | |
| 今日计划卡片数 = 已注册游戏数的 min(3, 注册数)（瘦 APK 期望 1 项，M2 后期望 3 项） | | |

## 5. 存储持久化（spec §5.7）
取证路径：A（DevTools）/ B（run-as）　　`navigator.storage.persisted()` = 　true / false
`location.origin` 实测：
若为 false 的处置：已记为「数据可能因系统空间清理而丢失；卸载必丢（spec §9）」；用户侧「固定存储」开关已说明：是 / 否

## 6. 已知限制（按现状接受，不在 M4 修）
- 数据随卸载丢失；v1 无导出（spec §9）。
- 360px 屏上舒尔特 7×7 每格 < 48px（M1 遗留，M3 打磨）。
- 调试签名包仅自用，不可发布。
```

- [ ] **Step 7: 提交**

```bash
cd "E:/WORK/脑力训练" && git add docs/superpowers/plans/2026-10-20-m4-acceptance.md && git commit -m "docs(m4): record apk acceptance evidence"
```

---

### Task 9: 最后一轮内容合并之后的完整复跑，并关闭成功标准 1

> 前置条件（控制者裁定，2026-10-18）：M4 的**出包能力**不依赖 M3 —— Task 1–8 只要 M1 UI 合并就能跑通，这是刻意提前拆雷。但**交付意义上最后一个包**必须在「最后一次内容合并」之后重跑：M3（趋势页）若晚于本任务合并，本任务就还没结束，必须在 M3 合并后把 Step 1–5 整链再跑一遍，并把上一轮的结论标为「非最终包」。判定口径很简单：**APK 的构建时间必须晚于 `src/` 里最后一次改动的合并**。不许拿一个不含趋势页的包去宣告六条成功标准全部关闭 —— 第 5 条要求趋势页。

**Files:**
- Modify: `docs/superpowers/plans/2026-10-20-m4-acceptance.md`（追加「完整 APK」一节）

**Interfaces:**
- Consumes: M2（其余 4 个游戏）合并后的 `src/`；Task 1–7 的固定钉子与工程；Task 8 的真机清单。M3（趋势页 + `src/ui/charts.ts` 的 SVG）合并了也一并复跑，**但没合并也照样出这个包** —— 见前置条件「M4 刻意不依赖 M3」。
- Produces: 交付意义上的 debug APK（5 个游戏 + 竖屏 + 离线 + 返回键确认；趋势页取决于 M3 是否已合并），以及对照 spec 第 1 节六条的关闭结论

- [ ] **Step 1: 全量回归（内容变了，先把测试跑干净再谈打包）**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npx vitest run && npx tsc --noEmit
```

Expected：M1 + M2 的全部测试通过，另加 Task 6 的 5 个返回键测试（M3 已合并则含其测试；测试数应显著多于 M4 之前的数字，把它记进验收记录，与 spec §7 的成功标准 6 对齐）。

- [ ] **Step 2: 三步出包链复跑**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' JAVA_HOME='D:\APPS\Java' && npm run build && npx cap sync android && cd android && cmd //c "gradlew.bat assembleDebug --no-daemon" > "E:/WORK/脑力训练/.superpowers/m4-gradle-final.log" 2>&1; tail -3 "E:/WORK/脑力训练/.superpowers/m4-gradle-final.log"
```

Expected：`BUILD SUCCESSFUL`。（若 Task 5 启用了 `subst` 兜底，`cd X:/focus-trainer/android` 并先重新 `cmd //c 'subst X: "E:\WORK\脑力训练"'`。）

- [ ] **Step 3: 审计断言复跑**

```bash
cd "E:/WORK/脑力训练/focus-trainer" && npm run verify:apk > "E:/WORK/脑力训练/.superpowers/m4-verify-final.log" 2>&1; echo "exit=$?"; tail -2 "E:/WORK/脑力训练/.superpowers/m4-verify-final.log"
```

Expected：`共 13 项，失败 0 项。`、`exit=0`。特别注意离线审计：M3 的 `charts.ts` 若用了 `createElementNS('http://www.w3.org/2000/svg', ...)` 属**命名空间字符串、不联网**，已在 allowlist 里；若这次多出别的 origin，一律当作违反离线约束处理（从源码去掉，不是往 allowlist 里加）。

- [ ] **Step 4: 真机清单复跑（Task 8 Step 1–5 全部项，逐条重记）**

五个游戏各完整练一次（对应 spec 成功标准 2 在 APK 内的复现）、训练中切后台出现作废浮层、返回键确认在 `mot` / `gestalt` 这种「一次训练很长」的游戏里尤其要实测一次。若 M3 已合并，另加趋势页三张图渲染一项；未合并就在验收记录里写「趋势页缺位，成功标准 5 由 M3 关闭」，**不要**因为缺趋势页而判本次复跑失败、也不要为它临时改代码。结果粘进验收记录的新小节「完整 APK 复跑」。

- [ ] **Step 5: 清理与收摊**

```bash
cd "E:/WORK/脑力训练/focus-trainer/android" && cmd //c "gradlew.bat --stop" ; tasklist | grep -iE "java|GradleDaemon" ; echo "grep_exit=$?"; "E:/APPS/Android/Sdk/platform-tools/adb.exe" devices | grep -c device
```

Expected：无残留 java/Gradle 后台进程（`grep_exit=1`）；没有正在跑的后台任务需要终止；`adb devices` 的设备行按用户是否还插着线如实记录。日志都留在 `.superpowers/`（git-ignored）：`m4-gradle-build.log`、`m4-gradle-build-2.log`、`m4-gradle-build-3.log`、`m4-gradle-build-x.log`（如有）、`m4-gradle-final.log`、`m4-npm-install.log`、`m4-cap-add.log`、`m4-cap-sync-1.log`、`m4-verify-apk.log`、`m4-verify-final.log`、`m4-toolchain-check.txt`。

- [ ] **Step 6: 提交**

```bash
cd "E:/WORK/脑力训练" && git add docs/superpowers/plans/2026-10-20-m4-acceptance.md && git commit -m "docs(m4): close apk acceptance after m2 and m3 content merged"
```

---

## M4 完成判据（对照 spec 第 1 节）

| spec 成功标准 | M4 覆盖情况 |
|---|---|
| 1 可安装 debug APK（「专注力训练」/ `com.focustrainer.app` / 竖屏 / 离线） | **M4 关闭**：Task 5 出包 + Task 7 断言（包名、`application-label`、`screenOrientation = 1`、`sdkVersion 24` / `targetSdk 36`、调试签名、无外部 origin、相对资源路径）+ Task 8/9 真机证据（图标名、旋屏、飞行模式可玩）。前置条件：Task 9 已在**最后一次内容合并**（M2 必到；M3 若晚合并则以其为准）之后复跑 |
| 2 五个游戏走通并写库 | M4 **不能**证明：Task 9 Step 4 只是把 2 在 APK 内复现一遍（回归性质），成立与否取决于 M2 是否已实现并验收；M1 只给了舒尔特 |
| 3 自动升降档并续档 | 不在 M4（M1 Task 2/4 的 `step` + `gameState` 已证，M2 要把四个游戏都覆盖）；M4 只在真机重跑一次档位不变量 |
| 4 今日计划与打卡 | 不在 M4（M1 Task 3/8 + M2 注册满 5 个游戏后才有 3 项计划）；M4 的验收记录顺带看一眼当天计划卡片数 |
| 5 趋势页（雷达 / 30 天曲线 / 5 周日历） | 不在 M4，属 M3；M4 的离线审计对 M3 新增的 SVG 只做「无外部 origin」约束（Task 9 Step 3） |
| 6 纯逻辑单测全通过 + 帧时间实测写入试次记录 | 不在 M4：M1 Task 1–8 + M2 各 engine 测试；M4 只跑 `npx vitest run` 做回归确认（Task 9 Step 1），不新增纯逻辑测试。M4 新增的两个测试文件是返回键的编排决策，不属本条口径 |
| （spec §5.7 持久化） | M4 出结论但不改代码：Task 8 Step 5 落 `persisted()` 的 true/false 与取证路径，false 时按「数据可能被系统清理 + 卸载必丢」记录口径（spec §9） |
| （spec §5.8 遗留：物理返回键丢训练） | **M4 关闭**：Task 6 用 `@capacitor/app` 的 `backButton` 监听 + 与 play 页同一句确认文案；Task 8 Step 3 第 4 项是真机证据 |

## 需要执行时才能发现的事（本文档不下结论）

1. **生成工程里的真实版本四元组**：`android/variables.gradle` 与 `gradle/wrapper/gradle-wrapper.properties` 的实际数字（Task 3 Step 2/3 采集）。文档与 spec 的数字是预期值，不是事实。
2. **中文路径是否真的会炸、在哪一步炸**：`android.overridePathCheck=true` 能挡 AGP 的静态检查，但 `aapt2` / 子进程路径解析的行为只有实际构建才知道（Task 5 Step 3 的表就是为此而写）。未命中触发行就绝不用 `subst`。
3. **`navigator.storage.persist()` 在真机 WebView 上的返回值**：必须实测（Task 8 Step 5）。M1 的实现只捕获 reject，未记录 `false`，所以「控制台没警告」不构成证据。
4. **WebView 的实际 origin**（`http://localhost` 还是 `https://localhost`）：Capacitor 文档一处写 `http://localhost`，而 `server.androidScheme` 未显式设置；对 IndexedDB 命名目录有影响，故 `run-as` 那条命令要看实际目录名（Task 8 Step 5 路径 B）。
5. **首次构建的真实下载量与耗时**：与网络与镜像状态有关（Task 5 Step 1 给的是量级，不是承诺）。
6. **AGP 的默认 `buildToolsVersion`**：本 Task 显式钉 `36.1.0` 以规避自动下载；若模板本来就允许 36.1.0，则这行只是把隐式变显式。
7. **`@capacitor/app` 的 `backButton` 监听在该机型上是否被系统手势返回替代**：Android 13+ 上部分厂商把返回手势直接喂给同一个 `KEYCODE_BACK`，多数情况行为一致；只有真机能确认（Task 8 Step 3 第 4/5 项）。
