# 浏览器验收通道须知（2026-10-19 实测，所有含 browser-use 验收任务的项目都读这一份）

通道：`browser-use:browser-use` 技能。外部 Chrome/Edge 未连接（实测 `BROWSER_CONNECTOR_WAITING`），所以驱动的是 **Qoder 内置 webview**。

## 视口
- 顶层视口实测 **531×557**，`take_screenshot` 的参数只有 `format|quality|uid|fullPage|filePath`，**没有** viewport/设备参数；`window.open(...,'width=390,height=844')` 被拦。
- 可行做法：在顶层页面挂同源 iframe 量排版 ——
  `const f=document.createElement('iframe'); f.style.cssText='width:390px;height:844px;border:0;position:fixed;left:0;top:0'; f.src='/#/';`
  实测 `contentWindow.innerWidth===390 && innerHeight===844`，`contentDocument` 可直接读。iframe 里的 `main.ts` 比 `onload` 慢，取 `#view` 内容要轮询到非空。
- 分工：**尺寸、`getComputedStyle`、配色、滚动**在 iframe 里量；**点击、导航、`take_snapshot` 的 uid**在顶层文档做（快照覆盖不到 iframe 内部）。iframe 会遮住顶层页面，量完记得 `f.remove()` 再点。
- 结论里必须同时写顶层实测 `window.innerWidth` 与 390 排版下的实测 px，两者共同判触控目标是否达标。

## 逐格/逐试次点击用合成事件
MCP 逐格点击一次往返约 1 秒，任何「N 秒内点完」的判分目标必然超时（那是通道限制，不是产品缺陷）。用：
`el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`
合成事件的 `timeStamp` 与 rAF 帧戳同属 `performance.now()` 原点，所以引擎记到的 `rt` 仍在时钟契约的论域内。真实点击留给「开始训练 / 开始 / 继续 / 退出」这类导航按钮，用来证明 `mcp click` 驱动的路由确实通。

## 两条会让通道卡死/失真的现象
1. **`window.confirm()` 会阻塞整条 CDP 通道。** 真实点「退出」弹出确认框后，`handle_dialog(accept|dismiss)`、`evaluate_script`、`press_key`、`navigate_page` 全部超时，只能由真人点掉。→ 需要验「取消」分支时，先跟用户说好由他点，或者只在合成点击路径上验「确定」分支，并把这一条如实记成残余项。Android 侧（M4 APK）`confirm` 由 Capacitor WebView 承载，必须真机再验一次。
2. **webview 切到后台时 rAF 被节流。** 帧驱动状态机的「用时」会冻在一个非零值上、倒计时停格，期间输入被忽略（这是正确行为）。→ 验收过程中不要把窗口切后台；看到「用时」不动先怀疑节流，别去改引擎。

## 其他
- 后台进程：`npx vite --host 127.0.0.1 --port 5173 --strictPort`，端口 5173，验收结束要停进程。停法：`netstat -ano | grep ":5173 "` 找 LISTENING 行的 PID → `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'` 看清命令行（别误杀 Qoder 自己）→ `Stop-Process -Id <pid> -Force`。**判据是「没有 LISTENING 行」**，不是「netstat 无输出」—— Windows 会保留 `TIME_WAIT` 行若干分钟。
- IndexedDB：库名 `focus-trainer`，store 实际叫 `gameState / plans / sessions / settings`（单数 `gameState`）。
