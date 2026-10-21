import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('只开震动、声音关闭：三处震动照常，一次都不出声（tap 也不出声）', () => {
    const e = env();
    const fx = createFx({ hapticsEnabled: true, soundEnabled: false }, e);
    fx.tap();
    fx.hit();
    fx.miss();
    expect(e.vibrate.mock.calls).toEqual([[8], [12], [[18, 40, 18]]]);
    expect(e.tone).not.toHaveBeenCalled();
  });

  it('只开声音、震动关闭：命中/未命中发声，震动一次都不调用（tap 也不出声）', () => {
    const e = env();
    const fx = createFx({ hapticsEnabled: false, soundEnabled: true }, e);
    fx.tap();
    fx.hit();
    fx.miss();
    expect(e.tone.mock.calls).toEqual([[880, 60], [220, 120]]);
    expect(e.vibrate).not.toHaveBeenCalled();
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

// 默认 env 的 AudioContext 是模块级共享的；每条用重置模块 + 动态 import 拿一份干净实例，
// 避免上一条测试缓存的上下文污染「构造即抛错」这条。
describe('默认环境的 AudioContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function installAudioContext(
    state: 'running' | 'suspended' = 'running',
    resume: () => Promise<void> = () => Promise.resolve(),
  ) {
    const counters = { constructed: 0 };
    class FakeAudioContext {
      state = state;
      currentTime = 0;
      destination = {};
      constructor() {
        counters.constructed++;
      }
      resume() {
        return resume();
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { value: 0 },
          connect: (node: unknown) => node,
          start: () => undefined,
          stop: () => undefined,
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
          connect: (node: unknown) => node,
        };
      }
    }
    vi.stubGlobal('AudioContext', FakeAudioContext);
    return counters;
  }

  it('两次 createFx 共用同一个 AudioContext', async () => {
    vi.resetModules();
    const counters = installAudioContext();
    const { createFx: freshCreateFx } = await import('./fx');
    freshCreateFx({ hapticsEnabled: false, soundEnabled: true }).hit();
    freshCreateFx({ hapticsEnabled: false, soundEnabled: true }).hit();
    expect(counters.constructed).toBe(1);
  });

  it('AudioContext 构造抛错时 hit 不抛，调用方继续执行', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('Too many AudioContexts');
        }
      },
    );
    const { createFx: freshCreateFx } = await import('./fx');
    const fx = freshCreateFx({ hapticsEnabled: false, soundEnabled: true });
    let after = false;
    expect(() => {
      fx.hit();
      after = true;
    }).not.toThrow();
    expect(after).toBe(true);
  });

  it('resume 被拒绝时这一声静默失败，不产生未处理 rejection', async () => {
    vi.resetModules();
    installAudioContext('suspended', () => Promise.reject(new Error('blocked')));
    const { createFx: freshCreateFx } = await import('./fx');
    const fx = freshCreateFx({ hapticsEnabled: false, soundEnabled: true });
    expect(() => fx.hit()).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
