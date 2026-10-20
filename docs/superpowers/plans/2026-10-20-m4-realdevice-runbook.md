# M4 真机验收手册（专注力训练 · debug APK 侧载）

**谁执行**：所有写设备的 `adb` 命令由你本人跑；我到现在为止只执行过只读的 `adb version` / `adb devices -l`（以及它们顺带启动的本地 adb server），从未对任何设备做过 install / clear / push。
**为什么需要它**：spec 成功标准 1 的「可安装」目前只有包侧断言（`npm run verify:apk` 13 项 + zip 内部与 `dist` 逐文件对上）。手指按下去那一次还没跑过，本手册跑完才算关闭。
**产物写到哪**：每项结果回报给我，我填进 `docs/superpowers/plans/2026-10-20-m4-acceptance.md` 第 4/5 章。

被验的包（不要重新构建，验的就是这一份）：
```
E:\WORK\脑力训练\focus-trainer\android\app\build\outputs\apk\debug\app-debug.apk
4,155,203 字节 · 2026-10-20 19:39:25 · 包名 com.focustrainer.app · 应用名「专注力训练」
```

## 0. 一次性准备（手机侧）

1. 设置 → 关于本机 → 连点「版本号」7 次开开发者模式。
2. 设置 → 系统 → 开发者选项 → 打开 **USB 调试**；同时把 **自动旋转** 打开（第 7 项要用）。
3. USB 线连电脑，手机弹窗选「允许 USB 调试」（勾选「总是允许」）。

自证成功的命令（PowerShell）：
```powershell
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" devices -l
```
期望：一行 `<序列号> device product:... model:... device:... transport_id:...`。
如果显示 `unauthorized`，回去重允一次弹窗；如果是 `offline`，`adb kill-server` 后重跑。

## 1. 安装

```powershell
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" install -r "E:\WORK\脑力训练\focus-trainer\android\app\build\outputs\apk\debug\app-debug.apk"
```
期望最后一行 `Success`。

自证：
```powershell
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" shell pm list packages | Select-String focustrainer
```
期望 `package:com.focustrainer.app`。

**没有 USB 线也能装**：把 `app-debug.apk` 传到手机（微信文件传输助手以外的任意方式都行，例如数据线拷贝或网盘），用文件管理器点开它 → 允许「安装未知来源应用」。这条路径同样算数，只是第 3~6 项的观测要靠你自己看。

## 2. 桌面图标与应用名

期望：桌面出现图标，名字是 **专注力训练**（不是 `app-debug`、不是 `Capacitor`）。图标应是项目自带 logo，不是安卓默认绿色机器人。
回报：截图或一句「名字/图标对不对」。

## 3. 五款游戏各走通一遍（成功标准 2 的真机版）

对 `schulte`（舒尔特方格）、`stroop`（颜色认知）、`seqmem`（序列记忆）、`mot`（视觉动态感知）、`gestalt`（视觉完型整合）各做一遍：
首页点进游戏 → 说明页点「开始训练」→ 倒计时 → 至少打完一轮 → 结算页出现「正确率 / 平均反应时 / 能力指数」这类行。

**舒尔特档位规则（照 App 自己的说明与 `src/games/schulte/rules.ts` 的档位表）**：一次训练是 **3 张方格**，每张结束后按用时和误点调整难度。1–3 档是 3×3 / 4×4 / 5×5 的数字**升序**；再往上的档位会出现**倒序和字母**。所以：
- 手动验收时**以顶部「下一个」提示为准**，别按数字升序一路点到底 —— 在高档位那样点会一路闪红、每次都是误点（我用合成点击跑探针时就见过「第 4 档　误点 24」的场面），那是玩法不是 bug。
- 判「走通」看的是能不能打完 3 张并进结算页，不是分数好不好看。

回报：五款各自的「能不能走到结算页」，以及任何一款卡住的现象（卡在第几轮、有没有倒计时不动）。

## 4. 成绩真的落库了（成功标准 6 的存储面）

```powershell
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" shell run-as com.focustrainer.app ls -l databases
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" shell run-as com.focustrainer.app ls -R app_webkit/ 2>$null | Select-String -Pattern "IndexedDB|\.sqlite" | Select-Object -First 10
```
期望：能看到 webkit 的 IndexedDB 目录（`.../databases` 或 `app_webkit/` 下有 sqlite 文件）。debug 包才可 `run-as`。
回报：两条命令的原样输出。

## 5. 杀掉进程再开，档位/计划还在（成功标准 3 的真机版）

浏览器里已经证明过「整页 reload → 档位续上」，手机要证明更强的一档：**进程被杀**。

```powershell
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" shell am force-stop com.focustrainer.app
```
然后从桌面重开 App，看首页今日计划的 3 张卡片里，刚才练过的那款**档位是不是比第一次高**、连续天数是否还在。
回报：重开后看到的档位数字，与你练之前对比。

## 6. 物理/手势返回键（这条浏览器验不了，只能真机）

| 场景 | 期望 |
| --- | --- |
| 训练进行中按返回 | 弹确认框「退出后本次训练不保存，确定退出吗？」；点**取消** → 仍在训练页且这一场进度继续（不丢）；点**确定** → 回首页，这场**不入库** |
| 首页按返回 | 直接最小化到桌面，App 不销毁（回前台还在原页面） |
| 结算页按返回 | 正常回上一页，不弹确认 |

第 4 项之后重跑一次「取消」分支再回首页，然后再看第 4 项的库——确认取消没有写出半条记录。
回报：三个场景的实际表现，特别是「取消」之后有没有白屏或倒计时停格。

## 7. 竖屏锁定与旋转（成功标准 1 的「竖屏」）

手机上打开自动旋转 → 把 App 转到横屏。期望：**界面仍然保持竖屏**（不会变横）。
回报：横过来之后的实际方向；如果出现横屏且布局散架，截图。

## 8. 刘海/手势条安全区

五款游戏各开一局，看顶部状态栏/刘海有没有压住倒计时或分数，底部手势条有没有压住作答按钮。
回报：哪一款、哪个元素被压（没有就答「无」）。

## 9. 飞行模式下冷启动练一轮（离线）

下拉关掉 WiFi 与移动数据 → 杀进程重开 App → 进任一游戏练完一轮。
期望：正常进入、正常结算，**没有任何网络请求失败造成的白屏**；若出现「本次成绩无法保存」的顶部提示，那属于存储打开失败的降级分支，要单独记下（正常情况不该出现）。
回报：飞行模式下能否完整走完；结算页数字是否正常。

## 10. 可选进阶：在手机上跑 JS 取持久化状态

成功标准 5 之外还想看 `navigator.storage.persisted()` / `estimate()` / 真库里的 `gameState`，可以用 WebView 远程调试：

```powershell
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" shell "cat /proc/net/unix | grep webview_devtools_remote"
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" forward tcp:9222 localabstract:webview_devtools_remote_<上一步得到的 pid>
```
然后电脑 Chrome 打开 `chrome://inspect` → 对应页面点 inspect → Console 里：
```js
navigator.storage.persisted().then(p => console.log('persisted=', p));
navigator.storage.estimate().then(e => console.log(e.usage, e.quota));
```
回报 `persisted` 的 true/false。做完记得 `adb forward --remove tcp:9222`。

## 11. 收尾（不可逆，想清楚再跑）

```powershell
& "E:\APPS\Android\Sdk\platform-tools\adb.exe" shell pm clear com.focustrainer.app
```
清数据后冷启动 → 首页应是空态（连续天数 0、今日计划未开始）→ 这一条顺便补上「空库分支」的观测。
卸载：`adb uninstall com.focustrainer.app`。

---

### 我需要你回报的最小集合
1 = 安装是否 `Success`；2 = 名字/图标；3 = 五款是否都能走到结算页；4 = `run-as` 两条命令原样输出；5 = 杀进程重开后的档位；6 = 三个返回键场景；7 = 横屏是否仍竖；8 = 被压的元素；9 = 飞行模式走完一轮；10 = `persisted` 的值。
拿到这些我就能把第 4/5 章的「待用户」改成实测原文，并据实判定成功标准 1 是否关闭——**在那之前我不会宣告六条全绿**。
