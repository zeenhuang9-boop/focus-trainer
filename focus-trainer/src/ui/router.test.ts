import { describe, expect, it } from 'vitest';
import { href, parseRoute, type Route } from './router';

describe('parseRoute', () => {
  it('识别五种路由', () => {
    expect(parseRoute('')).toEqual({ name: 'home' });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(parseRoute('#/play/schulte/plan')).toEqual({ name: 'play', gameId: 'schulte', mode: 'plan' });
    expect(parseRoute('#/play/schulte/free')).toEqual({ name: 'play', gameId: 'schulte', mode: 'free' });
    expect(parseRoute('#/result/12')).toEqual({ name: 'result', sessionId: 12 });
    expect(parseRoute('#/games')).toEqual({ name: 'games' });
    expect(parseRoute('#games')).toEqual({ name: 'games' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  it('无法识别的地址回首页', () => {
    for (const bad of ['#/play/xxx/plan', '#/play/schulte/zzz', '#/play/schulte', '#/result/abc', '#/result/-1', '#/games/x', '#/games/1', '#/settings/x', '#/nope']) {
      expect(parseRoute(bad)).toEqual({ name: 'home' });
    }
  });

  it('href 与 parseRoute 互为逆运算', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'games' },
      { name: 'play', gameId: 'schulte', mode: 'plan' },
      { name: 'play', gameId: 'gestalt', mode: 'free' },
      { name: 'result', sessionId: 3 },
      { name: 'settings' },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});

describe('trend 路由', () => {
  it('#/trend 解析成 trend，多余段落回落 home', () => {
    expect(parseRoute('#/trend')).toEqual({ name: 'trend' });
    expect(parseRoute('#trend')).toEqual({ name: 'trend' });
    expect(parseRoute('#/trend/schulte')).toEqual({ name: 'home' });
  });

  it('href 与 parseRoute 双向一致', () => {
    expect(href({ name: 'trend' })).toBe('#/trend');
    expect(parseRoute(href({ name: 'trend' }))).toEqual({ name: 'trend' });
  });
});
