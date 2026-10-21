import type { ThemeMode } from '../core/types';

export type ResolvedTheme = 'light' | 'dark';

/** 与 index.html 的冷启动内联脚本共用的 localStorage 键。 */
export const THEME_KEY = 'focus-trainer/theme';

const PAPER_COLOR: Record<ResolvedTheme, string> = {
  light: '#eef0ea',
  dark: '#15181c',
};

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'auto') return systemDark ? 'dark' : 'light';
  return mode;
}

export function systemPrefersDark(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? false;
  } catch {
    return false;
  }
}

/** 读同步主题提示：只有 auto/light/dark 才算数；缺失、非法或存储不可用一律 null。 */
export function readThemeHint(): ThemeMode | null {
  try {
    const value = globalThis.localStorage?.getItem(THEME_KEY);
    return value === 'auto' || value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function writeThemeHint(mode: ThemeMode): void {
  try {
    globalThis.localStorage?.setItem(THEME_KEY, mode);
  } catch {
    // 隐私模式/存储配额：提示只是首屏优化，写不进去就等 settings 回来。
  }
}

function updateThemeColor(resolved: ResolvedTheme): void {
  try {
    const meta = globalThis.document?.querySelector?.('meta[name="theme-color"]');
    meta?.setAttribute('content', PAPER_COLOR[resolved]);
  } catch {
    // 没有 meta 或老 WebView 不支持：不阻断主题应用。
  }
}

/**
 * 启动时同步落主题（早于第一次 await）：提示优先，缺失/非法时跟随系统。
 * 全程吞错 —— 首屏优化不能反过来把 boot() 带崩。
 */
export function applyThemeHint(root: HTMLElement | null | undefined): void {
  try {
    if (!root) return;
    const mode = readThemeHint() ?? 'auto';
    const resolved = resolveTheme(mode, systemPrefersDark());
    root.dataset.theme = resolved;
    updateThemeColor(resolved);
  } catch {
    // 手写 DOM 桩或异常环境：保持无主题，等 settings 回来再应用。
  }
}

// 只写 dataset，不碰 class：训练态用 body.training，两者互不覆盖。
// 同时镜像一份同步提示，并让浏览器地址栏/状态栏的颜色跟着纸底走。
export function applyTheme(root: HTMLElement | null | undefined, mode: ThemeMode): void {
  if (!root) return;
  const resolved = resolveTheme(mode, systemPrefersDark());
  root.dataset.theme = resolved;
  updateThemeColor(resolved);
  writeThemeHint(mode);
}
