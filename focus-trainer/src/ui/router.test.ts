import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './router';

describe('parseRoute', () => {
  it('识别四种路由', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/play/schulte/plan')).toEqual({ name: 'play', gameId: 'schulte', mode: 'plan' });
    expect(parseRoute('#/play/schulte/free')).toEqual({ name: 'play', gameId: 'schulte', mode: 'free' });
    expect(parseRoute('#/result/12')).toEqual({ name: 'result', sessionId: 12 });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  it('无法识别的地址回首页', () => {
    for (const bad of ['#/play/xxx/plan', '#/play/schulte/zzz', '#/play/schulte', '#/result/abc', '#/result/-1', '#/settings/x', '#/nope']) {
      expect(parseRoute(bad)).toEqual({ name: 'home' });
    }
  });

  it('href 与 parseRoute 互为逆运算', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'play', gameId: 'schulte', mode: 'plan' },
      { name: 'play', gameId: 'gestalt', mode: 'free' },
      { name: 'result', sessionId: 3 },
      { name: 'settings' },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});
