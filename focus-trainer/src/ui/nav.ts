import { h } from './dom';
import { href, type Route } from './router';

interface Tab {
  readonly route: Route;
  readonly label: string;
}

// 顺序就是使用频率：先看今天要练什么，再挑一款加练，然后回看趋势，设置是最少进的一格。
export const TABS: readonly Tab[] = [
  { route: { name: 'home' }, label: '今日' },
  { route: { name: 'games' }, label: '库' },
  { route: { name: 'trend' }, label: '趋势' },
  { route: { name: 'settings' }, label: '设置' },
];

// 训练进行中与结算页不给导航：手里有一条随时能点走的页签，就等于给「离开这一轮」开了后门。
const NAV_HIDDEN: readonly Route['name'][] = ['play', 'result'];

function isNavHidden(route: Route): boolean {
  return NAV_HIDDEN.includes(route.name);
}

export function renderNav(root: HTMLElement, route: Route): void {
  if (isNavHidden(route)) {
    root.hidden = true;
    root.replaceChildren();
    return;
  }
  root.hidden = false;
  root.replaceChildren(
    ...TABS.map((tab) => {
      const active = tab.route.name === route.name;
      return h('a', {
        class: active ? 'tab active' : 'tab',
        href: href(tab.route),
        'aria-current': active ? 'page' : undefined,
      }, tab.label);
    }),
  );
}
