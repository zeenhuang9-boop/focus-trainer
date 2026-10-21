import type { Fx, Settings } from '../core/types';

export type FxSettings = Pick<Settings, 'hapticsEnabled' | 'soundEnabled'>;

export interface FxEnv {
  vibrate(ms: number | number[]): void;
  tone(freq: number, ms: number): void;
}

function defaultEnv(): FxEnv {
  let ctx: AudioContext | null = null;

  const audio = (): AudioContext | null => {
    if (ctx) return ctx;
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    return ctx;
  };

  return {
    vibrate(ms) {
      const nav = (globalThis as { navigator?: { vibrate?: (n: number | number[]) => boolean } }).navigator;
      nav?.vibrate?.(ms);
    },
    tone(freq, ms) {
      const ac = audio();
      if (!ac) return;
      // 首次发声一定发生在一次真实点按之后的 rAF 里；若上下文仍是 suspended，
      // 这里 resume 一次，失败也只是这一声不响，不影响游戏。
      if (ac.state === 'suspended') void ac.resume();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ac.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + ms / 1000);
    },
  };
}

export function createFx(settings: FxSettings, env: FxEnv = defaultEnv()): Fx {
  return {
    tap() {
      if (settings.hapticsEnabled) env.vibrate(8);
    },
    hit() {
      if (settings.hapticsEnabled) env.vibrate(12);
      if (settings.soundEnabled) env.tone(880, 60);
    },
    miss() {
      if (settings.hapticsEnabled) env.vibrate([18, 40, 18]);
      if (settings.soundEnabled) env.tone(220, 120);
    },
  };
}
