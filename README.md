# 专注力训练（focus-trainer）

自用的安卓专注力训练 App：五款小游戏、每日计划与打卡、难度自动升降、趋势复盘，完全离线运行，以侧载 debug APK 的方式安装。

## 训练项目

| 项目 | ID | 训练面 |
| --- | --- | --- |
| 舒尔特方格 | `schulte` | 视觉搜索与注意广度（低档按序点数字，高档出现倒序与字母） |
| 颜色认知 | `stroop` | 抑制控制（字义与字色冲突时按规则作答） |
| 序列记忆 | `seqmem` | 工作记忆（记住并复现序列） |
| 视觉动态感知 | `mot` | 多目标追踪（盯住运动中的目标） |
| 视觉完型整合 | `gestalt` | 图形完型（从残缺图里辨出整体） |

## 功能

- **今日**：每天 3 项计划，做完即打卡，显示连续天数
- **难度自适应**：每轮判定达标 / 未达标，连续达标升档、连续未达标降档，下次进入从当前档位续上
- **趋势**：五维能力雷达、单款近 30 天曲线、近 5 周日历
- **四页常驻页签**：今日 / 训练库 / 趋势 / 设置；训练与结算态自动隐藏页签
- **完全离线**：成绩写入本地 IndexedDB，不访问任何外部网络

## 技术栈

- TypeScript 5.9（`strict`、`verbatimModuleSyntax`）
- Vite 8 构建，Vitest 5 测试（node 环境、不用 jsdom，DOM 用手写桩）
- Capacitor 8 + Android（minSdk 24 / targetSdk 36 / compileSdk 36，竖屏锁定）
- IndexedDB 持久化，无后端

## 目录

```
docs/                       设计文档、实现计划、验收记录、真机验收手册
focus-trainer/
├─ src/
│  ├─ core/                 纯逻辑：类型、路由、每日计划、难度、评分、存储、回合运行器
│  ├─ games/                五款游戏，各含 engine（纯逻辑）+ view + 单测
│  ├─ ui/                   页面（今日 / 训练库 / 趋势 / 设置 / 训练 / 结算）、导航、样式
│  └─ main.ts               入口与路由分发
├─ scripts/verify-apk.mjs   出包后的 13 项自动审计
└─ android/                 Capacitor 生成的 Android 工程
```

## 开发

```bash
cd focus-trainer
npm install
npm run dev        # 开发服务器，默认 http://127.0.0.1:5173
npm test           # 43 个测试文件 / 522 个用例
npm run typecheck  # tsc --noEmit
npm run build      # tsc --noEmit && vite build
```

## 打 APK

需要 JDK 21 与 Android SDK（platform 36、build-tools 36.1.0）。`ANDROID_HOME` / `JAVA_HOME` 按你的安装位置传：

```bash
cd focus-trainer
npm run build
export ANDROID_HOME="/path/to/android-sdk" JAVA_HOME="/path/to/jdk-21"
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon
```

Windows（Git Bash）把最后一行换成 `cmd //c "gradlew.bat assembleDebug --no-daemon"`，路径用 `E:\...` 这种 Windows 写法。

产物：`focus-trainer/android/app/build/outputs/apk/debug/app-debug.apk`。出包后跑 `npm run verify:apk` 自动核对包名、应用名、竖屏、签名、离线资源等 13 项。

## 状态

六条验收标准里 5 条已由可重跑的实测关闭，**仅剩「装进真机」一次**。当前门槛：`tsc --noEmit` 通过 + 43 文件 / 522 用例全绿。

- 验收记录（六条标准逐条证据）：[`docs/superpowers/plans/2026-10-20-m4-acceptance.md`](docs/superpowers/plans/2026-10-20-m4-acceptance.md)
- 真机验收手册（可粘贴命令 + 期望结果）：[`docs/superpowers/plans/2026-10-20-m4-realdevice-runbook.md`](docs/superpowers/plans/2026-10-20-m4-realdevice-runbook.md)

## 说明

- **只用于自用与侧载**：使用 debug 签名（Android Debug 公共证书），不能上架应用商店；覆盖安装其他签名的版本会失败，需先卸载。
- 训练中按物理返回键会弹确认框，选「取消」本场进度保留，选「确定」本场不入库。

## License

[Unlicense](LICENSE)（公有领域）。
