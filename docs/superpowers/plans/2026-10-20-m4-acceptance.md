# M4 验收记录

- 日期：2026-10-20　里程碑：M4（Android debug APK）
- 计划：`docs/superpowers/plans/2026-10-20-m4-android-apk.md`
- 构建机：Windows 10.0.26200 / Node v24.18.0 / JDK 21（`D:\APPS\Java`，只在每条命令内 inline `JAVA_HOME`，未写进 `gradle.properties`）/ SDK `E:\APPS\Android\Sdk`（platforms/android-36、build-tools 35.0.0 + 36.1.0）
- 兜底启用：**否**（从未使用 `subst`；中文根路径 + AGP 8.13.0 全程未触发 `aapt2` 失败，见计划 Task 4 的三条实测）
- 分支：`m1-core-and-schulte`（尚未合并到 `main`）

## 1. 工具链事实（生成文件原文，非文档预期值）

```
android/variables.gradle:  minSdkVersion = 24   compileSdkVersion = 36   targetSdkVersion = 36
android/build.gradle:10:   classpath 'com.android.tools.build:gradle:8.13.0'
gradle-wrapper.properties: distributionUrl=https\://services.gradle.org/distributions/gradle-8.14.3-all.zip
package.json:              @capacitor/core 8.5.3 / @capacitor/android 8.5.3 / @capacitor/app 8.1.2（dev: @capacitor/cli 8.5.3）
```

与 spec §2 的差值：spec 写 AGP `8.13.x`（实测 8.13.0，一致）、Gradle 期望值与实际 8.14.3 一致；`buildToolsVersion` 未在该文件显式声明，由 AGP 默认选取本机 36.1.0。

## 2. 机器断言（`npm run verify:apk`，13 项，exit 0）

```
PASS  APK 存在（3.98 MB）   [android/app/build/outputs/apk/debug/app-debug.apk]
PASS  包名 name='com.focustrainer.app'   [package: name='com.focustrainer.app' versionCode='1' versionName='1.0' ... compileSdkVersion='36']
PASS  应用名 application-label:'专注力训练'
PASS  minSdk '24'   [sdkVersion:'24']
PASS  targetSdk '36'   [targetSdkVersion:'36']
PASS  启动活动 com.focustrainer.app.MainActivity
PASS  保留 INTERNET 权限（WebView 从 localhost 读本地文件所需）
PASS  竖屏锁定 screenOrientation = 1 (PORTRAIT)
PASS  apksigner verify 通过（debug 签名有效、未损坏）   [退出码 0]
PASS  签名者是调试证书 CN=Android Debug
PASS  web 资源无外部 origin（只允许 w3.org/localhost 之类的命名空间）
PASS  无网络字体与远程 @import
PASS  index.html 用相对路径引用资源（防白屏）   [src="./assets/index-txlbMeE-.js" | href="./assets/index-CeJy5hqz.css"]

共 13 项，失败 0 项。
```

**审计工具自身的牙也被证明过两次**（这两条是「断言不是纸的」的唯一证据）：
1. 外链夹具：`FAIL web 资源无外部 origin … [https://cdn.example.com <- offlink-fixture.html]`，失败 1 项 / exit 1（Task 7）。
2. 前缀伪装：终审 SF-10 发现旧白名单缺尾锚，`https://w3.org.evil.example` 会被放行；`c4f74cf` 改为解析 origin 后比对 host 白名单，同一夹具现报 FAIL / exit 1，删掉夹具后真 APK 仍 13 项 PASS。

`screenOrientation` 的解析口径记一笔：本机 aapt 36.1.0 打印的是 `A: android:screenOrientation(0x0101001e)=(type 0x10)0x1`，值在括号外且未补零，故脚本取该行**最后一个** `0x…`（等于计划里「parse the LAST (0x…)」的意图），断言仍是 `=== 1`，未放宽。

## 3. Gradle 构建

| 次序 | 结果 | 耗时（日志 `BUILD SUCCESSFUL` 原文） | 日志 |
|---|---|---|---|
| 首次（含依赖下载） | 成功 | 我用正则 `[0-9]+s?` 抄耗时时把这一行截断成 `in 1`，**原文未复核**，以 `.superpowers/m4-gradle-build.log` 为准 | `m4-gradle-build.log` |
| 增量 1 | 成功 | `BUILD SUCCESSFUL in 14s` | `m4-gradle-build-2.log` |
| 增量 2（返回键改动后） | 成功 | `BUILD SUCCESSFUL in 32s` | `m4-gradle-build-3.log` |
| 最终复跑（Task 9） | 成功 | `BUILD SUCCESSFUL in 13s` | `m4-gradle-final2.log` |

`gradlew --stop` 收尾：`No Gradle daemons are running.`，`tasklist | grep -iE "java|GradleDaemon"` 无输出（`grep_exit=1`）。

APK：`android/app/build/outputs/apk/debug/app-debug.apk`　大小 **4,177,248 B（3.98 MB）**　构建时间 **19:07:02**。

## 4. 真机（用户操作，**全部待补**）

零 `adb` 写操作已执行；本节任何一行都没有被 agent 判定过「通过」。可粘贴的命令：

```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' && "$ANDROID_HOME/platform-tools/adb.exe" devices
```
```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' && "$ANDROID_HOME/platform-tools/adb.exe" install -r "E:/WORK/脑力训练/focus-trainer/android/app/build/outputs/apk/debug/app-debug.apk"
```
自证安装成功：
```bash
cd "E:/WORK/脑力训练/focus-trainer" && export ANDROID_HOME='E:\APPS\Android\Sdk' && "$ANDROID_HOME/platform-tools/adb.exe" shell pm list packages | grep focustrainer
```

设备型号 / 安卓版本：＿＿

| 项 | 结果 | 现象 |
|---|---|---|
| 桌面图标名「专注力训练」 | 待用户 | |
| 竖屏锁定（旋屏不跟随） | 待用户（机器侧已由 `screenOrientation = 1` 断言） | |
| 安全区无遮挡 | 待用户 | |
| 训练中物理返回键弹确认（取消留页 / 确定回首页且不写库） | 待用户 | **本轮最高风险项**：`window.confirm` 由 Capacitor WebView 的默认 `WebChromeClient` 承载，代码侧只证明了接线（`EXIT_CONFIRM` 全仓唯一、`handleBackButton` 5 条单测），原生对话框是否真的弹出、以及「取消」分支能否留在训练页，都必须在真机看一次 |
| 首页返回键最小化、可从最近任务恢复 | 待用户（`minimizeApp()` 而非 `exitApp()`，理由见 Task 6 决策） | |
| 飞行模式冷启动并完整练一轮 | 待用户 | |
| 今日计划卡片数 = `min(3, 注册数)` = 3 | 待用户（浏览器侧已实测首页三项 `○`、完成后结算显示「今日计划已完成 ✓」） | |
| 真实帧率下的「用时」与倒计时 | 待用户 | 浏览器侧全部用注入帧时钟（每帧 +16ms），证明的是流程闭环，不是手感 |

## 5. 存储持久化（spec §5.7）—— 待真机

取证路径：A（DevTools 远程调试，需 `webContentsDebuggingEnabled`）/ B（`adb shell run-as com.focustrainer.app` 看 IndexedDB 目录），**两条都未执行**。
`navigator.storage.persisted()` = ＿＿　`location.origin` 实测 = ＿＿（计划「需要执行时才能发现的事」第 4 条：Capacitor 文档写 `http://localhost`，而 `server.androidScheme` 未显式设置，真机看一眼即可定论）
若为 `false` 的处置口径：不加插件、不重试 `persist()`，改为记录「数据可能因系统空间清理而丢失；卸载必丢（spec §9）」，并说明用户可在手机「设置 → 存储 → 应用」里打开固定存储（属用户侧系统开关）。

## 6. 已知限制（按现状接受）

- 数据随卸载丢失；v1 无导出（spec §9）。
- 调试签名包仅自用，不可发布（`CN=Android Debug`）。
- 趋势页三张图的**配色观感**与雷达轴标签的真实可读性只能真人判：修复后 390 排版下标签实渲染约 11.2px（`svg` 宽 351.2 / viewBox 440 ⇒ 缩放 0.798，字号 14 用户单位）。不再被裁，但仍偏小。

**已关闭、不再是限制的一条（更正骨架里原来的写法）**：「360px 屏上舒尔特 7×7 每格 < 48px（M1 遗留）」。M3 的负外边距方案 + 本轮 `gap: 2px → 1px`（`92007d7`）实测：390 排版 **52.74**、360 排版 **48.40**（本通道 `clientWidth` 345 = 360 − 15px 经典滚动条），无滚动条的排版下算式给 48.86，两档都 ≥ 48。残余：48.40 只有 **0.40px 余量**，任何人再给 `#view` 或网格加水平内边距，这一档会先掉下去 —— 所以 M3 记录里把它写成了护栏而不是「已解决，不用再想」。

## 7. 完整 APK 复跑（Task 9，最后一次内容合并之后）

判据口径：**APK 构建时间必须晚于 `src/` 里最后一次合并**。

```
git log -1 --format='%h %ci %s' -- focus-trainer/src
490ad93 2026-10-20 19:03:04 +0800 docs(mot): 标明帧间隔判定有意收紧到提示期，并钉住提示期迟滞的 timingValid 用例
APK mtime                                              2026-10-20 19:07:02 +0800   → 判据成立
```

- Step 1 全量回归（工作树干净时由控制器亲自跑，非转述子 agent）：`npx tsc --noEmit` exit **0**；`npx vitest run` → `Test Files 39 passed (39)` / `Tests 468 passed (468)`，exit **0**；`npm run build` exit **0**。用例数演进：M1/M2 期间 433 → 本轮基线 461 → 修复波 2 后 466 → 终审修复波后 **468**。显著多于 M4 之前，与 spec §7 的成功标准 6 对齐。
- Step 2 出包链复跑：`cap sync` exit 0（`✔ update android in 25.07ms`）→ `assembleDebug` `BUILD SUCCESSFUL in 13s`。
- Step 3 审计复跑：`npm run verify:apk` → `共 13 项，失败 0 项。` exit **0**（日志 `.superpowers/m4-verify-final.log`）。`dist/assets` 外链扫描原文只有 `2 http://www.w3.org`，滤掉 w3.org 后**零行**；打包产物里 `http://localhost` 命中数 **0**（所以白名单是否放行 localhost 不影响本次结论，见计划 Task 7 那条「localhost 也算 FAIL」的口径之争：本轮裁定保留 `localhost`，因为 Capacitor 本就从 `http://localhost` 承载页面，它不是远程源；但 host 必须精确相等，前缀伪装一律拒）。
- Step 4 真机清单复跑：**未执行**（需用户在场），本节第 4 章的每一行都是待补状态。
- Step 5 清理与收摊：`gradlew --stop` → `No Gradle daemons are running.`；无 java/GradleDaemon 残留；5173 的 vite dev server 已由 `Stop-Process` 停掉（判据「无 LISTENING 行」成立，残留一条是我自己浏览器标签的 `SYN_SENT`）。`.superpowers/` 日志与 brief/report 按需保留。

### 对照 spec 第 1 节六条的关闭结论

| # | 标准 | 结论 | 由谁关闭 |
|---|---|---|---|
| 1 | 可安装 debug APK（名/包/竖屏/离线） | **机器侧关闭，安装动作待用户真机确认** | M4：本文件第 2、3、7 章 |
| 2 | 五款都从说明页 → 倒计时 → 多轮 → 结算并写库 | **关闭（浏览器实测）**；APK 内复现属回归，待真机 | M1+M2 实现，本轮验收实测 `#/result/4`~`7` 与 stroop 四轮入库 |
| 3 | 难度自动升降档且下次续上 | **关闭** | M1 `adaptive` + M2 五款覆盖；实测「第 8 档 ↓ 第 5 档」、清空后全回第 1 档 |
| 4 | 首页每日 3 项计划、3 项完成即打卡并显示连续天数 | **关闭** | M1 `scheduler`（`PLAN_SIZE=3`）+ M2 注册满 5 款；实测首页三项 `○`、「今日计划已完成 ✓」、`0天连续打卡` |
| 5 | 趋势页五维雷达 + 近 30 天曲线 + 近 5 周日历 | **关闭** | M3（`c3511ca` 的 17 条判据），本轮补了空库分支与雷达裁切缺陷 |
| 6 | `core/` 与五个 engine 纯逻辑单测全通过 + 关键时序按帧时间戳实测写入试次记录 | **关闭** | 468 用例 0 失败；`timingValid` 的 >50ms 判定在五处契约上都有守卫（含 mot 提示期的有意收紧，已标明偏离 spec §6:361 的范围） |

**这一包是「交付意义上的最终包」的条件**：此后 `src/` 若再有任何合并（含终审判定后置的 SF-3/4/5/6/7/8/9/11 与 14 条 nit），必须重跑第 7 章的 Step 1–3 并重新出包，否则本结论作废。

## 8. 交付终局（2026-10-20 19:39 最终包）

第 7 章那一包（4,177,248 B @ 19:07）随后被 **`37a594e` 的 `src/` 合并作废** —— 按第 7 章末尾自定的口径，任何后续 `src/` 合并都要重跑 Step 1–3 并重出。第二次内容合并补的是 spec §6 第一条的执行空白：

> spec `docs/superpowers/specs/2026-10-18-focus-trainer-design.md:359`：IndexedDB 打开失败 → 顶部提示「本次成绩无法保存」+ 改用内存仓库 + **游戏照常可玩**。

`src/main.ts:35-40` 一直在做前两件事，但 `boot()` 从未被任何测试 import 过，所以**这条分支一次都没执行过**（终审 SF-5 只把它看成「`storageOk` 写了没人读」的死字段并判后置 —— 那条表述要更正：提示功能存在，缺的是执行证据）。`src/main.test.ts` 的 4 条用例补上后，第 4 条的覆盖层次是**引擎级**：真 reject → 真 `MemoryRepository` → 真首页渲染并写今日计划 → 真点「开始训练」走 `navigate`/`hashchange`/`startRouter` → 真倒计时 + 三轮舒尔特 → `saveSession` 返回 `id=1`、`listSessions` 0→1、`plan.completed=['schulte']`、id 流进 `#/result/1` 且结算页真渲染。变异检验：删掉 `banner.hidden = false` ⇒ 用例 1 与 4 双红。

**最终数字（控制器在树干净、无并发写手的窗口里亲自复跑）**

```
npx vitest run       -> Test Files 40 passed (40) / Tests 472 passed (472) / 0 failed   exit 0
npx tsc --noEmit     -> 零输出                                                          exit 0
npm run build        -> 产出 dist/                                                     exit 0
npx cap sync android -> ✔ update android                                               exit 0
gradlew assembleDebug（先删旧 APK 强制重打包）-> BUILD SUCCESSFUL in 13s                 exit 0
npm run verify:apk   -> 共 13 项，失败 0 项。                                            exit 0
```

最终交付物：**`focus-trainer/android/app/build/outputs/apk/debug/app-debug.apk`，4,155,203 B（3.96 MB），构建 19:39:25**。判据成立：`37a594e` 合并于 19:36:38 < 19:39:25。

**为什么还要从 APK 的 zip 里再核一遍**：第 2、7 章的离线审计与一致性检查读的是磁盘上的 `android/app/src/main/assets/public/`（gradle 的输入），不是 APK 内部。下面这组直接从 APK 里取出：

```
unzip -p app-debug.apk assets/public/index.html  ->  src="./assets/index-txlbMeE-.js"
APK 内 assets/public 文件数                      ->  6
APK 内该 chunk 的 MD5                            ->  1ce7532d99ed48211fdceba3772d3997  == dist/assets/index-txlbMeE-.js
APK 内 fixture / offlink 残留                    ->  无
APK 内含「舒尔特方格」「视觉完型整合」           ->  各 1 次命中
```

两处如实记录的偏差：

1. **体积从 4,177,248 变为 4,155,203（−22 KB）**，输入（同一份 `assets/public`）与命令（同一条 `assembleDebug`）都没变。能确证的不是代码差异（chunk MD5 相同、13 项断言相同），所以记成未解释的构建产物差异；将来若要发布而非侧载，这条必须先查清（怀疑方向：`--no-daemon` 冷启动的 zip 对齐/压缩差异，或上一轮增量里带着前几版的中间产物）。
2. `main.test.ts` 的桩里 `location.hash` 赋值**同步**派发 `hashchange`（真机是下一个任务），是该桩唯一的时序简化。所以第 4 条用例证明「装配链路在内存仓库下跑得通」，不证明真机的异步时序 —— 后者由浏览器/真机验收承担。

**spec §6 三条现在都有执行证据**：① 打开失败提示 + 内存仓库可玩（`src/main.test.ts`，本轮）；② 帧间隔 >50ms 判 `timingValid = false`（五处契约守卫，含 MOT 提示期的有意收紧，`490ad93` 已标明它超出 §6:361 点名的范围）；③ 页面出错兜底渲染（`main.ts:52-54`，由页面级用例间接覆盖）。

**第 4 章与第 5 章（真机清单、`persisted()`）仍是待补状态**，本文件不据此宣告成功标准 1 的「可安装」已被真机证明 —— 机器侧断言与包内一致性已闭环，手指按下去那一次还欠着。

## 9. 终审（whole-branch review）遗留项的处置裁定

终审结论是 **0 blocker / 11 should-fix / 14 nit**，评审原文在 `.superpowers/sdd/branch-final-review.md`（git-ignored，做后置项时必须先读它，本文件只记裁定不记证据全文）。

### 9.1 本轮已修（逐条对应 commit）
- **SF-1** 假断言（测试标题承诺「选对的一轮」，实现却把定义重述一遍）→ `72716be`，改为按规则层回放出的正确下标精确断言。
- **SF-2** MOT 把提示期也算进帧间隔作废，是 spec §6 的超集 → `490ad93`，裁定「有意收紧」保留实现，在文档里标明偏离并钉住提示期迟滞的 `timingValid` 用例。
- **SF-10** APK 离线审计的 origin 白名单缺结尾锚，`https://w3.org.evil.example` 能通过 → `c4f74cf`，改为解析 origin 后比 host 白名单。
- 其余三条不是评审项而是 M3 验收实测出来的：雷达标签被 viewBox 裁切 → `aa156a2`；轴标签 11.2px 不可读 → `08848a1`；7×7 在 360 排版下触控 47.2px 不达标 → `92007d7`。连点『继续』的幂等守卫 → `3da7649`。
- **spec §6 存储失败分支缺执行证据**（不是缺陷：实现早在 `main.ts` 里）→ `37a594e` 用真 reject + 真内存仓库跑通「照常可玩 + 成绩落内存仓库 + 结算页渲染」。

### 9.2 明确后置（本轮不修，理由随条目）
| 项 | 内容 | 后置理由 | 何时必须做 |
| --- | --- | --- | --- |
| SF-3 | `elapsedMs` 在三个引擎里是死字段，且三处钳位写法不同 | 删除面触及 3 个 engine + 其测试，与「APK 要在最后一次内容合并后重出」的时序冲突：改完必须再走一遍全链条 | 下一次功能迭代第一个 commit |
| SF-4 | `TrialRecord.correct` 跨引擎语义漂移（舒尔特只记命中） | 会改变入库字段的语义，影响趋势页已有历史数据的解释，需先定口径 | 动 `core/types.ts` 之前 |
| SF-5 | `AppContext.storageOk` 被写但没有任何页面渲染它 | 已确认全仓只有 `main.ts` 与测试读它；§6 的提示走的是 `banner` 而不是这个字段，属于死面而非错误 | 与 SF-3 同一批清理 |
| SF-6 | 同一个 spec 常量有三套命名，SVG namespace 有两处定义 | 纯一致性，无行为风险 | 顺手 |
| SF-7 | `this.now` 在 mot 里的维护方式与另外四个引擎不同 | 同上，且 mot 刚在 SF-2 上动过，避免一次 commit 混两个主题 | 顺手 |
| SF-8 | 两条最要紧的跨引擎约定靠 4/5 份手抄维护 | 正确解是表驱动的契约测试，属于新增测试基建，不是修 bug | 加第 6 个游戏之前**必须**先做 |
| SF-9 | 死导出与「只有测试在用」的导出看起来像公共 API | 需要先开 `noUnusedLocals`/`noUnusedParameters` 跑一遍取清单，改动面不可预估 | 下一次功能迭代 |
| 14 条 nit | 含 N-3/N-4（取整、`roundNo` 用法、游标钳位）、N-6（`normalize` 早退让非单位各向异性图形欠缩放）等 | 逐条不改变用户可见行为；评审原文里每条自带定位 | 按上表批次顺带处理 |

**发布前必须查清、不属于评审项的一条**：19:39 的最终包比 18:24 那次小 21,978 B。包内完整性已正面证明（`assets/public` 六文件与 `dist` 一一对应、主 chunk MD5 一致、五款游戏名各 1 次、零 fixture），所以差异只能来自 bundle 内容；归因过程见 `.superpowers/sdd/apk-size-delta.md`。

## 10. 本轮尝试并放弃的一条：成功标准 3 的「真库端到端」浏览器证明

想补的证据是标准 3 里最弱的一环——**难度升档后写进真 IndexedDB、刷新后下一次确实续上新档位**。这条目前只有单测（`core/adaptive` + `storage` 的用例）与 M2 验收的组合证据，没有一次「真库 → 重载 → 续档」的正面观测。

两次尝试都撞在通道的 15 秒上限上，**未取到判据**：
1. 第一次用真实时钟：`开始训练 → 等 4.1s 倒计时 → 24 轮 ×（150ms 等待 + 按格内数字排序逐格派发 pointerdown）`，排期本身就已超过 `evaluate_script` 的单次上限（≈12.4s 纯 sleep + IDB 读），超时。
2. 第二次改用第 9 章/通道文档里的注入帧时钟（`requestAnimationFrame` 换成 Map 队列、每帧 +16ms、事件 `timeStamp` 对齐逻辑时钟），仍在 15s 超时。**原因未查明**——可能是上一次超时的那个循环仍在页面里跑、两套驱动互相抢「继续」按钮，把引擎的时钟契约搅乱；也可能是这条路径本身在真库 + 真实路由下走不通。二者都需要第三次观测才能分辨，而第三次没有跑。

所以这条**记为残余项，不许含糊**：标准 3 的持久化链在浏览器里没有正面证据。它属于 M4 Task 8 真机清单的一条（装机后「练一轮 → 杀掉 App 进程 → 重开 → 看首页档位」），而且拆分手法现成：把「跑完整场」和「读库+重载后读库」拆成两次 `evaluate_script`，各自控制在 15s 内。

现场处置：探针替换过该页面的 `window.requestAnimationFrame`，停 dev server 后该页面无意义，下次验收重新导航即可拿到未打补丁的上下文；5173 端口已停。

## 11. §10 的缺口已关闭：真库 → 整页重载 → 下一场续档（2026-10-20 19:55）

拆分手法生效：**一次调用只做一件事**（跑场 / 读库 / 重载后读库），并把 `window.confirm` 在进门第一行打桩。以下全部是浏览器里真 IndexedDB 的实测原文，不是测试承接。

- **重载前的 `gameState`**：`[{schulte, level:4, passStreak:0, failStreak:0, lastPlayedDayKey:"2026-10-20"}, {seqmem, level:1, …}, {stroop, level:3, …}]` —— 三款都不是初始第 1 档。
- **`sessions` 三行的 `(gameId, mode, startLevel, endLevel, ability, rounds.length)`**：`[schulte, plan, 1, 4, 25, 3]`、`[stroop, plan, 1, 3, 15, 4]`、`[seqmem, plan, 1, 1, 7, 3]`。**升档是在一场训练内由成绩触发并落库的**（`startLevel 1 → endLevel 4`），这条以前只有单测证据。
- **`navigate_page(type=reload)` 之后**：`gameState` 三行一字不变 → 持久化成立。
- **重载后再进 `#/play/schulte/free`**：视图标题实测为「舒尔特方格　第 1 / 3 轮　**第 4 档**」→ **下一场从新档位续上**，这是标准 3 后半句的正面观测。（此刻 `cellCount=0`，因为页面停在说明页，符合 spec 的「说明页 → 倒计时 → 训练」顺序，不是空网格。）
- **`plans` 行**：`{dayKey:"2026-10-20", games:[schulte, stroop, seqmem], completed:[schulte, stroop, seqmem]}` → 顺带补上标准 4「3 项完成即打卡」的数据面（今天计划 3 项全完成）。
- 每行 `rounds[].trials[]` 带 `onset / rt / correct / span / dir / taps`，`rt` 是帧时间戳口径 → 标准 6 的「关键时序写入试次记录」在真库数据里看得见。

### 11.1 对 §10 那两次超时的更正
先前写的「可能是原生 `confirm` 把通道堵死」**不成立**：打桩之后第三次仍超时，而随后一个不含任何等待、只读 `location.href`/视图文本/rAF 的最小 `evaluate_script` **立刻返回**，且返回的页面状态停在「第 1 / 3 轮　第 4 档　用时 9.6 秒　误点 24」——说明通道一直是活的，探针也一直在页面里正常执行。**真正的原因是 15 秒是 CDP 往返的上限，不是页面执行的上限**：把「跑完整场 + 读库」塞进一个脚本，训练本身跨过了上限，于是拿得到结果却拿不到返回值。这条已同步进 `_browser-acceptance-channel.md`。

### 11.2 如实限定
这几场由合成 `pointerdown` + 注入帧时钟驱动，`rt`／用时数值不代表真实手感（但档位判定、入库结构、重载续档走的是真实代码路径与真实 IndexedDB）。真机 M4 Task 8 仍要把同一组观测在手机上重跑一次，尤其是「杀进程重开」比浏览器 reload 更强的那一档。

> 真机执行改由独立手册承担：`2026-10-20-m4-realdevice-runbook.md`（同目录）。第 4/5 章的每一项都在那份里有可直接粘贴的命令与自证命令。

## 12. 体积差 −21,978 B 的归因（按证据等级写死，不做无证据的收尾）

背景：19:39 重出的最终包 4,155,203 B，比 18:24 那次（4,177,181 B）小 21,978 B，旧包字节已被覆盖、不可得。这条原先记成「发布前必须查清」。

本轮新取到的两条正面证据（命令都可直接重跑）：
1. **打包输入恒定。** `git log --since="2026-10-20 18:20" --name-only -- focus-trainer/android focus-trainer/package.json focus-trainer/package-lock.json focus-trainer/capacitor.config.ts focus-trainer/vite.config.ts focus-trainer/index.html focus-trainer/tsconfig.json` 返回**空**。也就是说这两次出包之间，DEX/kotlin 资源/清单/签名/bootstrap 的输入一个字都没变，变的只有 `src/` 里的小幅改动与文档。
2. **包内负载与磁盘一致。** `unzip -l` 实测 APK 内 `assets/` 各项未压缩合计 **138,739 B**，其中 `dist/assets/index-txlbMeE-.js` 未压缩 76,795 B 与磁盘 `dist` 同尺寸；主 chunk MD5 先前已逐文件对上。包里没有多余文件、也没少文件。

由此可以排除的解释：**内容缺失**。若 22 KB 是被裁掉的代码，那它必须在 `src/` 里对应一次大体量删除，而第 1 条列出的是「打包输入零变化」、这一时段 `src/` 的实际改动只是雷达画布、网格间距、一条测试文件与若干文档 —— 量级和方向都对不上 21,978 B。

**归因（由一次只读调查子任务完成，报告全文在 `.superpowers/sdd/apk-size-delta.md`；我先前把这一段写成「推断」是低估了证据，现按实测更正）：**
- 体积差**与打包输入无关**：窗口内 13 个 commit 只动 `src/`（多数是测试与注释）、`scripts/`、`docs/`；`android/**`、`package*.json`、capacitor/vite/tsconfig/index.html 的最后改动都早于 17:56，`classes.dex` 未压缩 8,398,240 B 与 17:58 的中间产物相同 → DEX/资源/bootstrap 判为常量。
- **tree-shaking / 内容缺失假设被正面否定**：分支在该窗口零文件删除，两次 vite 构建都是 54 个模块，主 chunk 从 76.72 kB 变 76.79 kB（负载反而 **+103 B**），而包内 web 负载压缩后总共只有 32,396 B（占整包 0.78%）——**装不下 22 KB**。
- **算术闭合**：18:24 的 4,177,181 → 19:07 的 4,177,248 是 **+67 B（真实内容差）**；19:07 → 19:39 的 4,155,203 是 **−22,045 B**，而这一次输入完全相同（19:38:53 gradle 对 `mergeDebugAssets`/`compressDebugAssets`/`packageDebug` 全报 UP-TO-DATE，`37a594e` 只加了两行注释和一个 `export` 关键字、产出字节相同），19:39 实际只重跑了 `packageDebug`。`+67 + (−22,045) = −21,978`，与观测**精确吻合**。
- 结论：AGP 的「删掉旧包重新 `packageDebug`」与「增量热复用上一次 zip」在 zip 生成层（条目对齐/压缩决策）给出不同体积，**不是缺陷，也不是内容差异**。

**仍缺的那一条证据**：旧包字节已被覆盖，无法逐条目定位差异出在哪几个 entry（现存 zip 的 slack 仅 4,434 B）。要逐条目证实只能在独立工作副本上分别对 `490ad93` 与 `37a594e` 做 clean 重建后 `unzip -v` 比对。

**需要修的是「口径」而不是包**（这才是这条的真正产物）：
1. **APK 体积不能当完整性信号**——它 0.78% 才是 web 负载，其余是 DEX 与 kotlin 运行时；判完整性要用逐条目 + MD5 的正面对照（§8 已这么做）。
2. **历史体积数字不可互比**——同一条 `assembleDebug` 在增量与冷重打包两种模式下给出的数字不同。
3. 一旦这条 APK 离开侧载场景（上架 / AAB / 签名发布），**先把 `packageDebug` 的增量缓存清掉再出发布包**，或改走 AAB 的可复现口径；那时体积才成为交付指标。
