import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest 的 css:false 会把 .css（含 ?raw）桩成空串，所以按 stats.test.ts 的同款做法直接读源文本。
const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 取某条规则里某个属性的值（去尾空格）。选择器与属性都要转义，否则会匹到别的规则。
function decl(selector: string, prop: string): string | null {
  const body = css.match(new RegExp(`${esc(selector)}\\s*\\{([^}]*)\\}`))?.[1];
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
// 先把注释剥掉：本文件的注释紧贴在选择器前面，不剥的话 m[1] 会把注释一起吞进来，
// 选择器列表就匹配不到精确的 '.radar-none' 这种写法。
function blocksFor(selector: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...noComments.matchAll(/([^{}]+)\{([^}]*)\}/g)]
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
