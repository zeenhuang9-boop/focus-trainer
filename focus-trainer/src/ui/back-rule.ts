import type { Route } from './router';

// 与 play 页「退出」按钮复用同一句文案，避免同一操作出现两套问法
export const EXIT_CONFIRM = '退出后本次训练不保存，确定退出吗？';

export interface BackDeps {
  confirm(message: string): boolean;
  back(): void;
  minimize(): void;
  historyDepth: number;
}

export function handleBackButton(route: Route, deps: BackDeps): void {
  if (route.name === 'play') {
    if (deps.confirm(EXIT_CONFIRM)) deps.back();
    return;
  }
  if (deps.historyDepth > 1) {
    deps.back();
    return;
  }
  deps.minimize();
}
