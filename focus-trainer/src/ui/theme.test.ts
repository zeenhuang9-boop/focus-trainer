import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, resolveTheme, systemPrefersDark } from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('主题解析与应用', () => {
  it('auto 跟随系统，light/dark 直接采用', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('没有 matchMedia 的环境按浅色处理', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(systemPrefersDark()).toBe(false);
  });

  it('applyTheme 把解析结果写进 dataset.theme', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark') }));
    const root = { dataset: {} } as unknown as HTMLElement;
    applyTheme(root, 'auto');
    expect(root.dataset.theme).toBe('dark');
    applyTheme(root, 'light');
    expect(root.dataset.theme).toBe('light');
  });

  it('root 为空时静默返回', () => {
    expect(() => applyTheme(null, 'dark')).not.toThrow();
  });
});
