import type { ThemeMode } from '../core/types';

export type ResolvedTheme = 'light' | 'dark';

export function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'auto') return systemDark ? 'dark' : 'light';
  return mode;
}

export function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

// 只写 dataset，不碰 class：训练态用 body.training，两者互不覆盖。
export function applyTheme(root: HTMLElement | null | undefined, mode: ThemeMode): void {
  if (!root) return;
  root.dataset.theme = resolveTheme(mode, systemPrefersDark());
}
