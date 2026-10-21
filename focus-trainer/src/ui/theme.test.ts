import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_KEY,
  applyTheme,
  applyThemeHint,
  readThemeHint,
  resolveTheme,
  systemPrefersDark,
} from './theme';

afterEach(() => {
  vi.unstubAllGlobals();
});

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: vi.fn((key: string) => map.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
  };
}

function themeMeta() {
  let content: string | null = null;
  return {
    el: {
      setAttribute: vi.fn((name: string, value: string) => {
        if (name === 'content') content = value;
      }),
      getAttribute: (name: string) => (name === 'content' ? content : null),
    },
    content: () => content,
  };
}

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
    vi.stubGlobal('localStorage', memoryStorage());
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

describe('同步主题提示（冷启动首屏）', () => {
  it('applyTheme 把模式写进 localStorage，readThemeHint 能读回来', () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('matchMedia', undefined);
    const root = { dataset: {} } as unknown as HTMLElement;

    applyTheme(root, 'dark');
    expect(storage.setItem).toHaveBeenCalledWith(THEME_KEY, 'dark');
    expect(readThemeHint()).toBe('dark');

    applyTheme(root, 'auto');
    expect(storage.setItem).toHaveBeenLastCalledWith(THEME_KEY, 'auto');
    expect(readThemeHint()).toBe('auto');
  });

  it('缺失或非法的提示一律读成 null', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(readThemeHint()).toBeNull();

    for (const bad of ['blue', 'DARK', '', '1', 'light ']) {
      vi.stubGlobal('localStorage', memoryStorage({ [THEME_KEY]: bad }));
      expect(readThemeHint()).toBeNull();
    }
  });

  it('localStorage 读取抛错时返回 null，写入抛错时 applyTheme 不抛', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
    });
    expect(readThemeHint()).toBeNull();
    expect(() => applyTheme({ dataset: {} } as unknown as HTMLElement, 'dark')).not.toThrow();
  });

  it('applyThemeHint 优先用提示：dark 提示在浅色系统下仍是 dark', () => {
    vi.stubGlobal('localStorage', memoryStorage({ [THEME_KEY]: 'dark' }));
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const root = { dataset: {} } as unknown as HTMLElement;
    applyThemeHint(root);
    expect(root.dataset.theme).toBe('dark');
  });

  it('无提示时跟随 matchMedia，无 matchMedia 时落浅色', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const dark = { dataset: {} } as unknown as HTMLElement;
    applyThemeHint(dark);
    expect(dark.dataset.theme).toBe('dark');

    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const light = { dataset: {} } as unknown as HTMLElement;
    applyThemeHint(light);
    expect(light.dataset.theme).toBe('light');

    vi.stubGlobal('matchMedia', undefined);
    const fallback = { dataset: {} } as unknown as HTMLElement;
    applyThemeHint(fallback);
    expect(fallback.dataset.theme).toBe('light');
  });

  it('无提示且 matchMedia 缺失、localStorage 抛错、root 为空时都不抛', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage blocked');
      },
    });
    vi.stubGlobal('matchMedia', undefined);
    expect(() => applyThemeHint({ dataset: {} } as unknown as HTMLElement)).not.toThrow();
    expect(() => applyThemeHint(null)).not.toThrow();
    expect(() => applyThemeHint(undefined)).not.toThrow();
  });

  it('applyTheme 同步更新 theme-color：深色纸底与浅色纸底', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const meta = themeMeta();
    vi.stubGlobal('document', { querySelector: () => meta.el });
    const root = { dataset: {} } as unknown as HTMLElement;

    applyTheme(root, 'dark');
    expect(meta.content()).toBe('#15181c');
    applyTheme(root, 'light');
    expect(meta.content()).toBe('#eef0ea');
    // auto 解析成浅色后同样要更新 meta
    applyTheme(root, 'auto');
    expect(meta.content()).toBe('#eef0ea');
  });

  it('applyThemeHint 也更新 theme-color；没有 meta 节点时不抛', () => {
    vi.stubGlobal('localStorage', memoryStorage({ [THEME_KEY]: 'dark' }));
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const meta = themeMeta();
    vi.stubGlobal('document', { querySelector: () => meta.el });
    applyThemeHint({ dataset: {} } as unknown as HTMLElement);
    expect(meta.content()).toBe('#15181c');

    vi.stubGlobal('document', { querySelector: () => null });
    expect(() => applyThemeHint({ dataset: {} } as unknown as HTMLElement)).not.toThrow();
  });
});
