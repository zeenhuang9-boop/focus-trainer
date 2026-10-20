import './ui/styles.css';
import { MemoryRepository, openIdbRepository, type Repository } from './core/storage';
import { registerBackButton } from './ui/android-back';
import type { AppContext } from './ui/context';
import { h } from './ui/dom';
import { renderHome } from './ui/pages/home';
import { renderLibrary } from './ui/pages/library';
import { renderPlay } from './ui/pages/play';
import { renderResult } from './ui/pages/result';
import { renderTrends } from './ui/pages/trends';
import { renderSettings } from './ui/pages/settings';
import { startRouter, type Route } from './ui/router';

function show(route: Route, view: HTMLElement, ctx: AppContext, signal: AbortSignal): Promise<void> {
  switch (route.name) {
    case 'home':
      return renderHome(view, ctx, signal);
    case 'games':
      return renderLibrary(view, ctx, signal);
    case 'play':
      return renderPlay(view, ctx, route.gameId, route.mode, signal);
    case 'result':
      return renderResult(view, ctx, route.sessionId, signal);
    case 'trend':
      return renderTrends(view, ctx, signal);
    case 'settings':
      return renderSettings(view, ctx, signal);
  }
}

// export 只为可测性：spec §6 第一条（IndexedDB 打开失败）必须由 main.test.ts 真的跑一遍。
// 末尾的 boot().catch(...) 自调保持原样 —— 不改启动行为，测试靠导入即执行那一次装配。
export async function boot(): Promise<void> {
  const banner = document.getElementById('banner') as HTMLElement;
  const view = document.getElementById('view') as HTMLElement;
  let repo: Repository;
  let storageOk = true;
  try {
    repo = await openIdbRepository();
  } catch (err) {
    console.error('IndexedDB 打开失败，改用内存仓库', err);
    repo = new MemoryRepository();
    storageOk = false;
    banner.textContent = '本次成绩无法保存';
    banner.hidden = false;
  }
  navigator.storage?.persist?.().catch((err: unknown) => console.warn('storage.persist 失败', err));
  const ctx: AppContext = { repo, storageOk, settings: await repo.getSettings() };
  let current: AbortController | null = null;
  let currentRoute: Route = { name: 'home' };
  startRouter((route) => {
    currentRoute = route;
    current?.abort();
    const ac = new AbortController();
    current = ac;
    view.replaceChildren();
    show(route, view, ctx, ac.signal).catch((err: unknown) => {
      console.error(err);
      if (!ac.signal.aborted) view.replaceChildren(h('p', null, `页面出错：${String(err)}`));
    });
  });
  void registerBackButton(() => currentRoute);
}

boot().catch((err: unknown) => {
  console.error(err);
  document.getElementById('view')?.replaceChildren(`启动失败：${String(err)}`);
});
