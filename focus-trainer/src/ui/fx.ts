import type { Fx, Settings } from '../core/types';

export type FxSettings = Pick<Settings, 'hapticsEnabled' | 'soundEnabled'>;

export interface FxEnv {
  vibrate(ms: number | number[]): void;
  tone(freq: number, ms: number): void;
}

// 浏览器/WebView 同时存活的 AudioContext 数量有限，而 play.ts 每进一局就 createFx 一次。
// 上下文必须跨 createFx 共享，否则多次进出训练后 new AudioContext() 会抛错。
let sharedCtx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (sharedCtx && sharedCtx.state !== 'closed') return sharedCtx;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  if (!Ctor) return null;
  try {
    sharedCtx = new Ctor();
  } catch {
    // 数量上限、权限或平台限制：这一声不响，调用方不受影响。
    return null;
  }
  return sharedCtx;
}

function defaultEnv(): FxEnv {
  return {
    vibrate(ms) {
      const nav = (globalThis as { navigator?: { vibrate?: (n: number | number[]) => boolean } }).navigator;
      nav?.vibrate?.(ms);
    },
    tone(freq, ms) {
      // 反馈是锦上添花：构造、resume、发声任何一步失败都只让这一声不响。
      // tone 在 rAF 帧里调用，异常冒泡会中断整帧，所以整段吞掉。
      try {
        const ac = audioContext();
        if (!ac) return;
        // 首次发声一定发生在一次真实点按之后的 rAF 里；若上下文仍是 suspended，
        // 这里 resume 一次，失败也只是这一声不响，不影响游戏。
        if (ac.state === 'suspended') void ac.resume().catch(() => {});
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
      } catch {
        // 吞掉：反馈失败不能打断游戏帧。
      }
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
