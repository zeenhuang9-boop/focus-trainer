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

  it('方格改成 gap 2px + 满宽，负外边距恰好等于 #view 的内边距', () => {
    expect(decl('.schulte-grid', 'gap')).toBe('2px');
    expect(decl('.schulte-grid', 'width')).toBe('calc(100% + 24px)');
    expect(decl('.schulte-grid', 'margin')).toBe('0 -12px');
    expect(decl('#view', 'padding')).toBe('12px');
    expect(decl('.schulte-cell', 'min-height')).toBe('0');
  });

  it('按 CSS 里的数字重算：360px 屏上 7×7 每格 ≥ 48px（M1 实测 44.6px）', () => {
    const gap = px(decl('.schulte-grid', 'gap'));
    const pad = px(decl('#view', 'padding'));
    const bleed = Math.abs(px(decl('.schulte-grid', 'margin')?.split(' ')[1]));
    expect(gap).toBe(2);
    expect(bleed).toBe(pad);
    const cellAt = (viewport: number, cols: number): number => (viewport - 2 * (pad - bleed) - (cols - 1) * gap) / cols;
    expect(cellAt(360, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(390, 7)).toBeGreaterThanOrEqual(48);
    expect(cellAt(360, 3)).toBeGreaterThanOrEqual(48);
    expect(Math.floor(cellAt(360, 7))).toBe(49);
    expect(Math.floor(cellAt(390, 7))).toBe(54);
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
