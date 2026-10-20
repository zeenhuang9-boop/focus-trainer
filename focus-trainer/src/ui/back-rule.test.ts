import { describe, expect, it, vi } from 'vitest';
import { EXIT_CONFIRM, handleBackButton, type BackDeps } from './back-rule';

function deps(overrides: Partial<BackDeps> = {}): BackDeps {
  return {
    confirm: vi.fn(() => true),
    back: vi.fn(),
    minimize: vi.fn(),
    historyDepth: 1,
    ...overrides,
  };
}

describe('handleBackButton', () => {
  it('训练中确认退出才回退，且用与退出按钮同一句文案', () => {
    const d = deps();
    handleBackButton({ name: 'play', gameId: 'schulte', mode: 'free' }, d);
    expect(d.confirm).toHaveBeenCalledWith(EXIT_CONFIRM);
    expect(d.back).toHaveBeenCalledTimes(1);
    expect(d.minimize).not.toHaveBeenCalled();
  });

  it('训练中取消确认则留在原页，不回退也不最小化', () => {
    const d = deps({ confirm: vi.fn(() => false) });
    handleBackButton({ name: 'play', gameId: 'mot', mode: 'plan' }, d);
    expect(d.back).not.toHaveBeenCalled();
    expect(d.minimize).not.toHaveBeenCalled();
  });

  it('非训练页且有历史时走回退', () => {
    const d = deps({ historyDepth: 3 });
    handleBackButton({ name: 'result', sessionId: 7 }, d);
    expect(d.back).toHaveBeenCalledTimes(1);
    expect(d.minimize).not.toHaveBeenCalled();
  });

  it('非训练页且已在根历史时最小化应用', () => {
    const d = deps({ historyDepth: 1 });
    handleBackButton({ name: 'home' }, d);
    expect(d.back).not.toHaveBeenCalled();
    expect(d.minimize).toHaveBeenCalledTimes(1);
  });

  it('historyDepth 为 0 也算没有可回退的历史', () => {
    const d = deps({ historyDepth: 0 });
    handleBackButton({ name: 'settings' }, d);
    expect(d.minimize).toHaveBeenCalledTimes(1);
  });
});
