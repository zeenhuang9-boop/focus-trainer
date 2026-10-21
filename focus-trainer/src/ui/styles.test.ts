import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest 的 css:false 会把 .css（含 ?raw）桩成空串，所以按 stats.test.ts 的同款做法直接读源文本。
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 规则解析层共用这一份「已剥注释」的文本：CSS 注释里会逐字写出规则形状，
// 现成的例子是 styles.css:906 的「钉死的 #view { padding: 12px }」。
// blocksFor() 从第一版起就在剥（见它自己的注释），decl() 此前没剥，这个不对称
// 由变异实验证实能造出本仓明令禁止的那类缺陷：把 styles.css:99-105 整条 #view
// 规则删掉，43 文件 / 520 用例照样全绿 —— decl('#view','padding') 从注释里读回了 12px。
// 改法保持保守：只喂给两个解析器，不动模块级的 css —— 另有条文断的就是含注释的原文
// （css.includes('.trend-radar')、@media 切片、button,select 那两条正则），
// 它们的语义是「整份文件」，跟着剥等于悄悄换掉判据。
const cssStripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

// 取某条规则里某个属性的值（去尾空格）。选择器与属性都要转义，否则会匹到别的规则。
function decl(selector: string, prop: string): string | null {
  const body = cssStripped.match(new RegExp(`${esc(selector)}\\s*\\{([^}]*)\\}`))?.[1];
  if (body === undefined) return null;
  return body.match(new RegExp(`(?:^|;)\\s*${esc(prop)}\\s*:([^;]*)`))?.[1]?.trim() ?? null;
}

const chan = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const lum = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * chan(((n >> 16) & 255) / 255) + 0.7152 * chan(((n >> 8) & 255) / 255) + 0.0722 * chan((n & 255) / 255);
};

const ratio = (fg: string, bg: string): number => {
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

const px = (v: string | null | undefined): number => Number(v?.replace('px', '') ?? Number.NaN);

// 某个选择器出现过的所有规则体（含分组选择器）。decl() 只认「选择器后紧跟 {」的单条规则，
// 分组规则要看「这条属性有没有出现在任一相关块里」时必须用它。
// 注释剥离与 decl() 共用上面那一份 cssStripped：本文件的注释紧贴在选择器前面，
// 不剥的话 m[1] 会把注释一起吞进来，选择器列表就匹配不到精确的 '.radar-none' 这种写法。
function blocksFor(selector: string): string[] {
  return [...cssStripped.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((m) => m[1].split(',').some((s) => s.trim() === selector))
    .map((m) => m[2]);
}

describe('完成态可读性（M1 遗留缺陷 1）', () => {
  it('done 格不再用 opacity 抹掉数字，改为一对专用颜色变量', () => {
    expect(decl('.schulte-cell.done', 'opacity')).toBeNull();
    expect(decl('.schulte-cell.done', 'color')).toBe('var(--done-fg)');
    expect(decl('.schulte-cell.done', 'background')).toBe('var(--done-bg)');
    expect(decl(':root', '--done-fg')).toBe('#9aa4b2');
    expect(decl(':root', '--done-bg')).toBe('#191c21');
  });

  it('done 数字对本格底色 ≥ 4.5:1（M1 实测只剩 1.59–1.69）', () => {
    const done = ratio('#9aa4b2', '#191c21');
    const undone = ratio('#e8eaed', '#22262d');
    expect(done).toBeGreaterThanOrEqual(4.5);
    // 「完成 = 更暗」这条视觉语义必须还在，只是不再暗到读不出
    expect(done).toBeLessThan(undone);
    expect(lum('#191c21')).toBeLessThan(lum('#22262d'));
  });
});

describe('48px 触控目标（M1 遗留缺陷 2）', () => {
  it('--tap 仍是 48px，按钮与 select 仍锚在它上面', () => {
    expect(decl(':root', '--tap')).toBe('48px');
    expect(css).toMatch(/button,\s*select\s*\{[^}]*min-height:\s*var\(--tap\)/);
    expect(css).toMatch(/button,\s*select\s*\{[^}]*min-width:\s*var\(--tap\)/);
  });

  it('方格改成 gap 1px + 满宽，负外边距恰好等于 #view 的内边距', () => {
    expect(decl('.schulte-grid', 'gap')).toBe('1px');
    expect(decl('.schulte-grid', 'width')).toBe('calc(100% + 24px)');
    expect(decl('.schulte-grid', 'margin')).toBe('0 -12px');
    expect(decl('#view', 'padding')).toBe('12px');
    expect(decl('.schulte-cell', 'min-height')).toBe('0');
    // 1fr 轨道不许被内容最小尺寸顶开：这条 HEAD 里就有了，所以本次只动 gap，
    // 不重复加（min-width 也帮不上 ≥48 的判据，它只会阻止轨道被撑宽，不会把格子变大）。
    expect(decl('.schulte-cell', 'min-width')).toBe('0');
  });

  it('按 CSS 里的数字重算：360/390 两档在有、无滚动条下 7×7 每格都 ≥ 48px（M1 实测 44.6px）', () => {
    const gap = px(decl('.schulte-grid', 'gap'));
    const pad = px(decl('#view', 'padding'));
    const bleed = Math.abs(px(decl('.schulte-grid', 'margin')?.split(' ')[1]));
    expect(gap).toBe(1);
    expect(bleed).toBe(pad);
    // 网格用 width: calc(100% + 24px) + margin: 0 -12px 出血掉 #view 的左右内边距，
    // 所以网格宽度就是 clientWidth 本身，格子只被 (cols-1)·gap 吃掉宽度：
    // 验收实测 7×51.84 + 6×2 = 374.88 ≈ 390 排版的 clientWidth 375，算式对得上。
    const cellAt = (clientWidth: number, cols: number): number =>
      (clientWidth - 2 * (pad - bleed) - (cols - 1) * gap) / cols;
    // 桌面/同源 iframe 的经典滚动条吃 15px；真机 WebView 是覆盖式滚动条不占宽。
    // 判据 13 的字面阈值在有滚动条的排版下也成立才算过，所以两档各算一遍。
    const SCROLLBAR = 15;
    expect(cellAt(360, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(390, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(360 - SCROLLBAR, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(390 - SCROLLBAR, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(360, 3)).toBeGreaterThanOrEqual(48);
    expect(Math.floor(cellAt(360, 7))).toBe(50);
    expect(Math.floor(cellAt(390, 7))).toBe(54);
    expect(Math.floor(cellAt(360 - SCROLLBAR, 7))).toBe(48);
    // 反证：gap 还是 2px 时同一算式给 47.57，正是验收实测的 47.56（差 0.01 是亚像素取整），
    // 收到 1px 后每格拿回 6/7 = 0.857px ⇒ 48.42。改前的 12px 内边距扣减是重复计算。
    expect((345 - 6 * 2) / 7).toBeCloseTo(47.56, 1);
    expect((375 - 6 * 2) / 7).toBeCloseTo(51.84, 1);
    expect(cellAt(360 - SCROLLBAR, 7)).toBeCloseTo(47.56 + 6 / 7, 1);
  });
});

describe('趋势页样式与离线红线', () => {
  it('Task 3 的每个 class 都有对应规则，SVG 走 viewBox 自适应', () => {
    for (const cls of ['trend-radar', 'trend-curve', 'trend-calendar', 'radar-legend', 'trend-empty']) {
      if (!css.includes(`.${cls}`)) throw new Error(`styles.css 里缺少 .${cls} 规则`);
    }
    expect(css).toMatch(/\.trend-radar svg,\s*\.trend-curve svg,\s*\.trend-calendar svg\s*\{[^}]*width:\s*100%[^}]*height:\s*auto/);
    expect(decl('.calendar-cell.done', 'fill')).toBe('var(--accent)');
    expect(decl('.calendar-cell.none', 'fill')).toBe('var(--panel)');
    expect(decl('.calendar-cell.partial', 'fill')).toBe('#3d4a63');
    // Task 2 报告标为「必需」的一条：末点标签 x=312 若按默认 start 锚定会溢出 320 的 viewBox，
    // 桩测只断 fullText，测不到，所以必须由 CSS 文本判据钉住。
    expect(decl('.curve-edge.edge-end', 'text-anchor')).toBe('end');
  });

  it('轴标签的 text-anchor 只由 charts.ts 写成呈现属性，CSS 不再声明（声明会盖掉属性）', () => {
    // 呈现属性 = 作者级、特异度 0，任何带选择器的 CSS 规则都能盖掉它。
    // M3 验收 F1 的第二个根因就在这里：原组规则把 .radar-label 的 text-anchor 钉死成 middle，
    // charts.ts 按象限发的 start/end 在浏览器里等于没发。
    expect(blocksFor('.radar-label').some((b) => /text-anchor/.test(b))).toBe(false);
    // 同组拆出去的 .radar-none / .curve-edge 仍要有 middle，否则降级文案与日期标签会左偏
    expect(blocksFor('.radar-none').some((b) => /text-anchor:\s*middle/.test(b))).toBe(true);
    expect(blocksFor('.curve-edge').some((b) => /text-anchor:\s*middle/.test(b))).toBe(true);
  });

  it('整份 CSS 里没有任何外部地址、@import、@font-face 或 url()', () => {
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/@import/);
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/url\(/);
  });
});

// 浅色纸质改造的判据。数值全部照纲要抄，所以这里逐个字面比：
// 谁把 --paper 调暖一档、或者把刺激区的 --panel 顺手变浅，这条就红。
describe('纸面 tokens 与深色刺激区分层', () => {
  it('9 个命名值与纲要逐字相同，且 color-scheme 已经转浅', () => {
    for (const [name, want] of [
      ['--paper', '#eef0ea'],
      ['--card', '#fbfbf8'],
      ['--ink', '#161a1e'],
      ['--ink-2', '#5a6472'],
      ['--rule', '#c9cec4'],
      ['--focus', '#1c4f7c'],
      ['--done', '#3f6b4a'],
      ['--bad', '#a83c2b'],
      ['--stage', '#10151a'],
    ] as const) {
      expect(decl(':root', name)).toBe(want);
    }
    expect(decl(':root', 'color-scheme')).toBe('light');
    // 字体族名一个都不许换（离线、中文栈），只允许这一条声明留在 :root
    expect(decl(':root', 'font-family')).toContain("'PingFang SC'");
    expect(decl(':root', 'font-family')).toContain("'Microsoft YaHei'");
  });

  it('旧变量名全部保留并指向新值；深色刺激区继续由 --bg 承担', () => {
    expect(decl(':root', '--bg')).toBe('var(--stage)');
    expect(decl(':root', '--panel')).toBe('var(--card)');
    expect(decl(':root', '--line')).toBe('var(--rule)');
    expect(decl(':root', '--text')).toBe('var(--ink)');
    expect(decl(':root', '--muted')).toBe('var(--ink-2)');
    expect(decl(':root', '--accent')).toBe('var(--focus)');
  });

  it('整份 CSS 没有悬空的 var() 引用（纲要 §3.4 的二选一里最容易漏的那一种）', () => {
    const refs = [...css.matchAll(/var\(\s*(--[a-z0-9-]+)\s*[),]/g)].map((m) => m[1]);
    const defs = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
    expect(refs.length).toBeGreaterThan(0);
    expect([...new Set(refs)].filter((r) => !defs.has(r))).toEqual([]);
  });

  it('训练路由的深色刺激层把 7 个旧名改回改造前的取值，一个都不许变浅', () => {
    // 这些字面值是五个游戏视图测试与 Stroop 对比度算式里的分母，动了就是改实验装置
    expect(decl('body.training', '--bg')).toBe('var(--stage)');
    expect(decl('body.training', '--panel')).toBe('#1d2026');
    expect(decl('body.training', '--line')).toBe('#2c313a');
    expect(decl('body.training', '--text')).toBe('#e8eaed');
    expect(decl('body.training', '--muted')).toBe('#9aa0a6');
    expect(decl('body.training', '--accent')).toBe('#8ab4f8');
    expect(decl('body.training', '--bad')).toBe('#f28b82');
    expect(decl('body.training', 'background-image')).toBe('none');
    expect(decl('.schulte-cell', '--tint')).toBe('#22262d');
  });

  it('纸面对比：正文 ≥4.5、焦点环 ≥3（纲要 §3.5）', () => {
    const paper = '#eef0ea';
    expect(ratio('#161a1e', paper)).toBeGreaterThanOrEqual(4.5); // 正文墨 15.23
    expect(ratio('#5a6472', paper)).toBeGreaterThanOrEqual(4.5); // 弱字/13px 读数 5.22
    expect(ratio('#1c4f7c', paper)).toBeGreaterThanOrEqual(3); // 焦点环 7.44
    expect(ratio('#3f6b4a', paper)).toBeGreaterThanOrEqual(3); // 苔绿 5.36
    expect(ratio('#a83c2b', paper)).toBeGreaterThanOrEqual(3); // 砖红 5.47
    expect(decl(':focus-visible', 'outline')).toBe('2px solid var(--focus)');
  });

  it('字阶只走纲要那六档，读数等宽数字', () => {
    expect(decl('.eyebrow', 'font-size')).toBe('11px');
    expect(decl('.eyebrow', 'text-transform')).toBe('uppercase');
    expect(decl('.eyebrow', 'letter-spacing')).toBe('0.08em');
    expect(decl('.home-date', 'font-size')).toBe('13px');
    expect(decl('.warmup-cell', 'font-size')).toBe('22px');
    expect(decl('h1', 'font-size')).toBe('22px');
    expect(decl('.big', 'font-size')).toBe('44px');
    expect(decl('.big', 'font-weight')).toBe('900');
    // 倒计时原来 72px 不在档内，收进最大档。
    // .countdown 也出现在「读数等宽数字」那组的末尾（组里就紧跟 {），decl() 会先读到那一条，
    // 所以这条判据同样走 blocksFor。
    expect(blocksFor('.countdown').some((b) => /font-size:\s*44px/.test(b))).toBe(true);
    expect(blocksFor('.warmup-cell').some((b) => /tabular-nums/.test(b))).toBe(true);
  });

  it('卡片 = 纸上放纸：6px 小圆角 + 一层极浅阴影，纹理只在页面级', () => {
    expect(decl('.card', 'background')).toBe('var(--card)');
    expect(decl('.card', 'border-radius')).toBe('6px');
    expect(decl('.card', 'box-shadow')).toBe('0 1px 2px rgba(22, 26, 30, 0.08)');
    expect(blocksFor('body').some((b) => /repeating-linear-gradient/.test(b))).toBe(true);
    expect(decl('.warmup', 'background')).toBe('var(--card)');
    expect(blocksFor('.warmup').some((b) => /gradient/.test(b))).toBe(false);
  });

  it('打卡态改颜色不 opacity（M1 遗留缺陷 1 的同一条纪律）', () => {
    expect(decl('.card.done', 'opacity')).toBeNull();
    expect(decl('.card.done', 'border-color')).toBe('var(--done)');
    expect(decl('.plan-row.done', 'opacity')).toBeNull();
    expect(decl('.plan-row.done', 'border-color')).toBe('var(--done)');
  });
});

describe('首页活体方格（招牌）', () => {
  it('它是独立控件：不吃 .schulte-grid 的 1px gap + 满宽出血', () => {
    expect(decl('.warmup-grid', 'gap')).toBe('4px');
    expect(decl('.warmup-grid', 'width')).toBeNull();
    expect(decl('.warmup-grid', 'margin')).toBeNull();
    expect(decl('.warmup-grid', 'grid-template-columns')).toBe('repeat(5, 1fr)');
    expect(decl('.schulte-grid', 'gap')).toBe('1px');
  });

  it('格子不许自己拆掉 48px 触控下限，同时留 min-width:0 护轨道', () => {
    // 全局 button 规则给 min-height:var(--tap)；.schulte-cell 那条是网格出血算式专用的，
    // 首页格子若照抄 min-height:0 就等于把纲要的触控判据悄悄关掉。
    expect(decl('.warmup-cell', 'min-height')).toBeNull();
    expect(decl('.warmup-cell', 'min-width')).toBe('0');
  });

  it('只有三处动效，reduced-motion 全降 0ms 且不隐藏信息', () => {
    // decl() 只认「选择器后紧跟 {」的第一块，而 body 在 html,\nbody 那组里先出现过一次，
    // 所以底色过渡这类判据走 blocksFor（剥注释 + 认分组）才不会读到空规则。
    expect(blocksFor('body').some((b) => /transition:\s*background-color 240ms/.test(b))).toBe(true);
    expect(decl('.warmup-cell', 'transition')).toContain('120ms');
    expect(decl('.warmup.filled .warmup-cell', 'transition')).toContain('200ms');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/transition-duration:\s*0ms/);
    expect(reduced).toMatch(/animation-duration:\s*0ms/);
    // 语义靠颜色不靠动效：done 态在 reduce 下依然是苔绿
    expect(decl('.warmup-cell.done', 'background')).toBe('var(--done)');
  });
});

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

  // SF-1：避让量（--nav-h）和避让对象（#tabbar 自己的竖向 padding + .tab 的 min-height）
  // 是两处独立书写、只靠人记住「它们相等」的数；上面那条钉的是 --nav-h 的字面量，钉不住这层算术关系。
  // 计划「后置」第 4 条已经预告了「页签改成带图标的 72px」这类改动 —— 那正是会把最后一行
  // 静默压进页签的改动，改完而全量门槛照样绿，就是本文件要拦的那类陷阱。
  // 这里刻意不把 border-top 的 1px 折进算式：60 vs 61 的余量是台账已裁的事项，不重开。
  it('--nav-h 不小于页签自己的实占（竖向 padding 两端 + .tab 的 min-height），否则正文避让静默失效', () => {
    // padding 是「上 左右 下」的三值简写，下端写成 calc(6px + env(safe-area-inset-bottom))，
    // 所以按出现顺序取 \d+ 得到 [上, 左右, 下]；四值简写同样是 [0]=上、[2]=下，
    // 一值/两值时 CSS 的简写语义就是下端等于上端。env() 恒 ≥0，只会把页签顶得更高，
    // 不在这条算式里扣减 —— 真机上它是 SF-1 之后剩下的唯一观感残余（终审 §4 R1）。
    const pads = [...decl('#tabbar', 'padding')!.matchAll(/\d+/g)].map((m) => Number(m[0]));
    const [topPad = Number.NaN, , bottomPad = topPad] = pads;
    // --tap 这一项由上面那条 it 钉在 #tabbar .tab 的 min-height 上，两端是同一个变量。
    expect(px(decl(':root', '--nav-h'))).toBeGreaterThanOrEqual(topPad + bottomPad + px(decl(':root', '--tap')));
  });

  it('当前页用颜色区分，不用 opacity', () => {
    // 基态与 .active 各钉一行（同族纪律在「打卡态改颜色不 opacity」那条 it 里也是成对的）：
    // 只断 .active 的话，把 opacity 加到基态 .tab 上会让所有页签（含当前页）一起变淡，
    // 等于用 opacity 抹信息，而当时全量门槛照样绿。
    expect(decl('#tabbar .tab', 'opacity')).toBeNull();
    expect(decl('#tabbar .tab.active', 'opacity')).toBeNull();
    expect(decl('#tabbar .tab.active', 'color')).toBe('var(--focus)');
  });

  it('避让写在另一条选择器上，被钉死的 #view padding:12px 一个字没动', () => {
    expect(decl('#view', 'padding')).toBe('12px');
    expect(blocksFor('body:not(.training) #view').some((b) => /padding-bottom:\s*calc\(12px \+ var\(--nav-h\)\)/.test(b))).toBe(true);
  });

  // #view 是四页正文唯一的外壳，规则体里五条声明（styles.css:99-105）此前只有 padding 被断过，
  // 另外四条（flex / display / flex-direction / gap）零断言。T8 实现者实测：把 display: flex
  // 整行删掉、padding 留着，本文件 26/26 仍然全绿 —— 那正是验收口径明令禁止的「真机布局已经塌了
  // 而门槛照样绿」（同族前例是方格跌破 48px 触控下限而测试全绿）。四条一律取精确值，
  // 不写 not.toBeNull() 那种「只要还在就算过」的形状：值被改成 grid 它也拦不住。
  it('正文外壳的堆叠与间距：#view 那四条布局属性各钉精确值（删掉 display:flex 曾经静默全绿）', () => {
    // flex:1 和 #app{min-height:100%}（styles.css:84-89）合起来把装不满的短页顶到视口高：
    // 验收记录 §14.1 表里「训练库/设置的 scrollHeight 844 是视口下限、真实内容高 576/307」
    // 这条口径就是由它撑起来的。改成 flex:0 1 auto（或整行删掉）后短页不再填满，§14.1 的反推算式全废。
    expect(decl('#view', 'flex')).toBe('1');
    // display:flex 与下一条合起来决定四页正文是竖着堆叠的；删掉它 #view 退回块流里的一堆默认盒，
    // gap 不再参与竖向记账，页签避让与区块间距的实际表现一起变，而 padding 那条照旧绿。
    expect(decl('#view', 'display')).toBe('flex');
    // 只把 column 换成 row 也一样塌：五条声明变成横着排的一行，四页正文直接溢出视口宽。
    expect(decl('#view', 'flex-direction')).toBe('column');
    // gap:16px 就是区块间距本身，§14.1 那两条反推里加的正是它（训练库 28+20+412 + 2×16 + 84 = 576，
    // 设置 28+73.6+25.6+48 + 3×16 + 84 = 307）；改成别的数或删掉，同表算式当场对不上。
    expect(decl('#view', 'gap')).toBe('16px');
  });

  // 上面那条 #view 判据的注释里已经点名 #app{min-height:100%}，但 flex:1 只有和外壳的
  // display:flex + flex-direction:column + min-height:100% 合起来才成立 —— 这一半此前同样零断言。
  // 控制器实测：删掉 styles.css:86 的 display: flex 整行，43 文件 / 521 用例全绿，
  // 塌的是真机布局（四页正文退回块流，短页不再被顶满视口），拦不住它就不是「门槛」了。
  // 三条各取精确值，形状与上一条 it 一致：不写 not.toBeNull()，值被改成 grid/row 也要红。
  it('正文外壳 #app 的三条承重：min-height:100% + display:flex + flex-direction:column（删掉 display:flex 曾经静默全绿），第四条安全区 padding 只钉书写层', () => {
    // 承重的是「三条一起」而不是任何单条：html,body{height:100%}（styles.css:62-66）给
    // min-height 的百分比供上可解析的基准，display:flex 让 #view 成为 flex item，
    // flex-direction:column 让 flex:1 沿竖向生效。三条任一被删，验收记录 §14.1 那句
    // 「训练库/设置的 scrollHeight 844 是视口下限、真实内容高 576/307」的口径就整段作废
    // —— 那张表的「一屏装得下」四条判据全部读的是这一列数，反推也一并失去依据。
    // 注意这条只断 min-height 写在规则里且取值是 100%：百分比相对 body 的内容高还是
    // 边框盒，是层叠与盒模型的事，node 环境（无 jsdom）看不见，本文件不主张已验证。
    expect(decl('#app', 'min-height')).toBe('100%');
    // 删掉这一行 = 当时静默的那一下。#app 退回普通块容器后 #view 的 flex:1 是死声明。
    expect(decl('#app', 'display')).toBe('flex');
    // 只把 column 换成 row：#app 还是 flex 容器，但 flex:1 的成长轴从竖向搬到了横向，
    // 「短页被顶满视口」不再由规则保证，§14.1 那一列 844 是下限的读法也就失去依据。
    // 换掉之后具体渲染成什么样本文件测不到（node 环境、无 jsdom），这条要拦的是
    // 「承重声明被换掉」这个动作本身 —— 所以取精确值，而不是 toBeNull() 那种「还在就算过」。
    expect(decl('#app', 'flex-direction')).toBe('column');
    // 第四条 padding 是刘海屏安全区记账，跟上面三条不同族：本仓既有裁定（验收记录 §14.5
    // 「env(safe-area-inset-bottom) → 残余 → 真机」）是它在浏览器验收通道里恒为 0，
    // 所以这条**只钉书写层** —— 断「四个 env() 还在、还是 top/right/bottom/left 这个顺序」，
    // 保证有人把它改成 padding: 0（或调换顺序、或只留一端）时门槛当场拦住。
    // 它不证明真机上安全区已经生效，那仍然只能上机看；把这条读成「已验证」就是误用。
    expect(decl('#app', 'padding')).toBe(
      'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
    );
  });

  it('训练路由里页签隐藏由 body.training 兜第二层，JS 的 hidden 是第一层', () => {
    expect(blocksFor('body.training #tabbar').some((b) => /display:\s*none/.test(b))).toBe(true);
  });

  // SF-3：结算页（#/result/N）的页签只剩这一条隐藏点，所以这条 !important 是承重的，不是风格。
  // 为什么只有 !important 才赢：#tabbar 自己写着作者声明 display: flex（下面 it 里第一条断言钉的就是它），
  // 而作者样式恒胜 UA 样式表里的 [hidden]{display:none}，无论特异度（[hidden] 只有 0,1,0，#tabbar 是 1,0,0，
  // 平时更是后来者胜）—— 只有带 !important 的作者声明才压得过它。
  // 少了它谁会露出来：结算页。play.ts:209 在 abort 回调里已经把 .training 摘掉，
  // 结算态 body.className 是空的 ⇒ 上面那条 body.training #tabbar 的第二层在结算页根本不参与，
  // nav.ts 的 root.hidden（第一层）就是唯一的隐藏动作，而它全靠这条 !important 才真的藏得住。
  // 表现不是崩溃，是「训练完的结算页底部多出一条空白、一个字都没有、点不动的页签条」——
  // 正是本轮分页要消灭的那类噪声，所以这条一个字都不许松。
  it('[hidden] 的 display:none 必须带 !important：它是结算页页签唯一的承重点', () => {
    // 对着干的那一端也必须钉住：#tabbar 一旦不再自带 display，本条 !important 的承重理由就变了，
    // 该由改这个测试的人重新判断，而不是静默留一条已经没有对手的规则。
    expect(decl('#tabbar', 'display')).toBe('flex');
    expect(decl('[hidden]', 'display')).toBe('none !important');
  });
});

describe('深色主题', () => {
  it('html[data-theme=dark] 覆盖九个 chrome token 并切换 color-scheme', () => {
    expect(decl("html[data-theme='dark']", '--paper')).toBe('#15181c');
    expect(decl("html[data-theme='dark']", '--card')).toBe('#1d2126');
    expect(decl("html[data-theme='dark']", '--ink')).toBe('#e6e8ea');
    expect(decl("html[data-theme='dark']", '--ink-2')).toBe('#9aa4b0');
    expect(decl("html[data-theme='dark']", '--rule')).toBe('#343a42');
    expect(decl("html[data-theme='dark']", '--focus')).toBe('#8ab4f8');
    expect(decl("html[data-theme='dark']", '--done')).toBe('#6fbf8a');
    expect(decl("html[data-theme='dark']", '--bad')).toBe('#f28b82');
    expect(decl("html[data-theme='dark']", '--on-accent')).toBe('#0b1a2e');
    expect(decl("html[data-theme='dark']", 'color-scheme')).toBe('dark');
    // 裁定：--done-fg/--done-bg 只被 .schulte-cell.done 消费，而它永远在 body.training 的
    // 深色刺激区里；深色块再加一份覆盖只会把训练区配色带偏，所以这里必须是 null。
    expect(decl("html[data-theme='dark']", '--done-fg')).toBeNull();
    expect(decl("html[data-theme='dark']", '--done-bg')).toBeNull();
  });

  it('深色正文/弱字/强调/完成/错误对各自底色 ≥ 4.5:1', () => {
    expect(ratio('#e6e8ea', '#15181c')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#9aa4b0', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#8ab4f8', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#6fbf8a', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#f28b82', '#1d2126')).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#0b1a2e', '#8ab4f8')).toBeGreaterThanOrEqual(4.5);
    // 深色块不覆盖 --done-fg/--done-bg，所以完成格的这对字色仍出自 :root；
    // 只要训练区永远是深底，这条比值就必须一直成立（控制器裁定 1 的护栏）。
    expect(ratio('#9aa4b2', '#191c21')).toBeGreaterThanOrEqual(4.5);
  });

  it('深色纸纹只落在非训练页（训练态必须保住 background-image: none）', () => {
    expect(decl("html[data-theme='dark'] body:not(.training)", 'background-image')).toContain('repeating-linear-gradient');
    // 负向护栏：写成 html[data-theme='dark'] body 时，body.training 自己的 background-image: none
    // 声明还在（styles.test.ts:198 照样绿），但训练页实际会被纸纹盖掉，而真机才会看见。
    expect(cssStripped).not.toMatch(/html\[data-theme='dark'\]\s+body\s*\{/);
  });

  it('深色横幅换深红底，白字仍 ≥4.5:1（--bad 调亮后不能直接当横幅底色）', () => {
    expect(decl("html[data-theme='dark'] #banner", 'background')).toBe('#7a2e26');
    expect(ratio('#fbfbf8', '#7a2e26')).toBeGreaterThanOrEqual(4.5);
  });
});
