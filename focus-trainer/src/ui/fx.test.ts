import { describe, expect, it, vi } from 'vitest';
import { createFx } from './fx';

function env() {
  return { vibrate: vi.fn(), tone: vi.fn() };
}

describe('createFx', () => {
  it('两个通道都开时，点按/命中/未命中各触发一次且参数不同', () => {
    const e = env();
    const fx = createFx({ hapticsEnabled: true, soundEnabled: true }, e);
    fx.tap();
    fx.hit();
    fx.miss();
    expect(e.vibrate.mock.calls).toEqual([[8], [12], [[18, 40, 18]]]);
    expect(e.tone.mock.calls).toEqual([[880, 60], [220, 120]]);
  });

  it('开关关闭时对应通道一次都不调用', () => {
    const e = env();
    const fx = createFx({ hapticsEnabled: false, soundEnabled: false }, e);
    fx.tap();
    fx.hit();
    fx.miss();
    expect(e.vibrate).not.toHaveBeenCalled();
    expect(e.tone).not.toHaveBeenCalled();
  });

  it('默认环境在没有 vibrate / AudioContext 时不抛错', () => {
    const fx = createFx({ hapticsEnabled: true, soundEnabled: true });
    expect(() => {
      fx.tap();
      fx.hit();
      fx.miss();
    }).not.toThrow();
  });
});
