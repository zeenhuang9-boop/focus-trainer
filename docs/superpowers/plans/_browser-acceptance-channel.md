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

## 2026-10-20 追加实测（这几条都会咬人，别当已知）

1. **顶层视口不是稳定值。** 上面记的 531×557，10-20 实测 `window.innerWidth/innerHeight = 0×0`。所以「一切尺寸判据只能走同源 iframe」是硬规矩，不是省事；`evaluate_script` 里读到的顶层视口要如实写进记录（写 0×0 也别编）。
2. **内置页面会在验收途中被重置成 `about:blank`**（实测 `list_pages` 只剩 `新标签页 (about:blank) [selected]`）。此时注入的 iframe 与所有挂在其 window 上的 harness 全丢，`take_screenshot` 报「The selected in-app browser page is blank」。恢复：`navigate_page` 回 `http://127.0.0.1:5173/#/`，重新挂 iframe；harness 脚本必须能整段重放（这就是把探针脚本存进仓库文档的原因）。
3. **iframe 的 `documentElement.clientWidth` 比 `innerWidth` 少 15px**（本通道是经典滚动条，占布局宽度）。任何「按视口算」的判据都要写清算的是哪一个：390 宽的 iframe 里网格可用宽是 375。真机 WebView 用覆盖式滚动条不占宽，所以本通道量出来永远偏小 —— 判据不达标时先看这 15px，再决定是改实现还是记残余。舒尔特 7×7 在 `gap: 1px` 时：390 排版实测 52.74、360 排版 48.40（无滚动条排版下算式给 48.86）。
4. **原生 `confirm()` 的分支验证：不要真点，改桩。** 上一版这里写的是「需要验『取消』分支时跟用户说好由他点」，实测有更省事的办法：在 iframe 里 `w.confirm = (m) => { 记录 m; return true/false; }` 之后，设置页「清空数据」和训练页「退出」的整条接线（文案、后续状态迁移）都能跑完且不堵通道。这一条**证明的是接线，不是原生对话框本身**，原生呈现仍必须真机验一次。
5. **秒级跑完整场训练的「注入帧时钟」配方**（成功标准 2 那种「N 秒内点完」的判分目标，靠 MCP 逐格点击必然超时）：

   ```js
   const S = { clock: w.performance.now(), cbs: new Map(), nextId: 1, errs: [] };
   w.requestAnimationFrame = (cb) => { const id = S.nextId++; S.cbs.set(id, cb); return id; };
   w.cancelAnimationFrame = (id) => { S.cbs.delete(id); };   // 必须真实现 cancel
   function pump(n) {
     for (let k = 0; k < n; k++) {
       S.clock += 16;
       const batch = [...S.cbs.entries()];
       S.cbs.clear();
       for (const [, cb] of batch) {
         try { cb(S.clock); } catch (e) { S.errs.push(String(e.message)); }
       }
     }
   }
   function tap(el) {
     const ev = new w.PointerEvent('pointerdown', { bubbles: true });
     Object.defineProperty(ev, 'timeStamp', { value: S.clock });
     el.dispatchEvent(ev);
   }
   ```

   要点：**每帧 +16ms**（≤50ms，spec §6:361 的帧间隔作废判定不会被误触发，所以 `timingValid` 仍为 `true` —— 这正好是「判定本身有效」的反向证据）；事件的 `timeStamp` 必须改写为逻辑时钟，否则引擎用逻辑帧戳、事件用真实时钟，`rt` 变负被丢弃；MOT 的点是 SVG 圆，`pointerdown` 必须带 `clientX/clientY`（取 bbox 中心）才命中，其余四款按元素身份即可；推进按钮（开始/继续/重试）用 `el.click()` 且**每个节点只点一次**（挂 `el.__acc` 防重）。`cancelAnimationFrame` 写成 no-op + 重复点同一节点这两件事同时踩，才会造出 `cannot begin a round while playing` —— 那是 harness 的假象，不是产品缺陷（已用测试钉死：`3da7649`）。驱动 8 轮 MOT 实测约 2160 次派发、0 异常；单次 `evaluate_script` 调用有 **15 秒上限**，所以要分次调用、把状态机留在 iframe window 上。
   如实声明：**这条证明的是「流程闭环 + 引擎在逻辑时间轴上自洽」，不是真实手感与真帧率**；后者只能由 M4 Task 8 真机补。
6. **`src/` 被写时 vite HMR 会整页 reload，注入的 iframe 与 harness 全清空。** 所以浏览器验收与「写 `src/` 的子 agent」**不能并行**：要么先跑完验收再派实现，要么接受重建 harness。评审类（只读）agent 可以并行。

## 2026-10-20 再追加：15 秒是「往返上限」，不是「页面执行上限」
`evaluate_script` 报 `Browser operation timed out after 15000ms` **不代表脚本失败**：脚本可以在页面里继续跑完并落库，只是返回值赶不上 CDP 的 15 秒窗口。判别法：紧接着发一个不含任何等待、只读 `location.href` / `#view` 文本 / `String(window.requestAnimationFrame)` 的最小调用 —— 能立刻返回就说明通道一直是活的，页面状态就是证据（本轮就看到过页面停在「第 1 / 3 轮　第 4 档　用时 9.6 秒　误点 24」的中间态，而前一个调用"超时"了）。
所以判据必须拆成**一次调用只做一件事**：① 跑完整场并落库 → ② 只读库 → ③ `navigate_page(type=reload)` → ④ 只读库并看续上什么档。把「跑场 + 读库 + 再驱动」塞进一个脚本，必然赶不上。
两个配套纪律：进门**第一行**就 `window.confirm = () => true`（原生对话框会堵死整条通道，且这一句成本为零）；`indexedDB.open()` 与每个 `getAll()` 都用 `Promise.race` 配一个 3–5 秒的 `TIMEOUT` 兜底，别让一个不返回的请求吃掉整个窗口。
