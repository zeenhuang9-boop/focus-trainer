import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 首屏主题必须由 <head> 里的内联脚本同步落定，不能等模块脚本启动。
// 这里直接读源文件（不经过构建），钉三件事：脚本存在、读的是同一个提示键、排在模块脚本之前。
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));

describe('index.html 的冷启动主题提示', () => {
  it('head 里的内联脚本在模块脚本之前', () => {
    const inlineStart = head.indexOf('<script>');
    const moduleStart = html.indexOf('<script type="module"');
    expect(inlineStart).toBeGreaterThanOrEqual(0);
    expect(moduleStart).toBeGreaterThan(inlineStart);
  });

  it('脚本读同一个 localStorage 键并写 dataset.theme，含 matchMedia 兜底与 try/catch', () => {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1];
    expect(inline).toBeTruthy();
    expect(inline).toContain('focus-trainer/theme');
    expect(inline).toContain('dataset.theme');
    expect(inline).toContain('matchMedia');
    expect(inline).toContain('prefers-color-scheme: dark');
    expect(inline).toContain('try');
    expect(inline).toContain('catch');
  });

  it('脚本同时同步 theme-color 的深浅纸底', () => {
    const inline = /<script>([\s\S]*?)<\/script>/.exec(head)?.[1] ?? '';
    expect(inline).toContain('theme-color');
    expect(inline).toContain('#15181c');
    expect(inline).toContain('#eef0ea');
  });
});
