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
