import type { AdaptiveState, Outcome, StaircaseRule } from './types';

export const INITIAL_ADAPTIVE: AdaptiveState = { level: 1, passStreak: 0, failStreak: 0 };

export function step(state: AdaptiveState, outcome: Outcome, rule: StaircaseRule, maxLevel: number): AdaptiveState {
  let { level, passStreak, failStreak } = state;
  if (outcome === 'pass') {
    passStreak += 1;
    failStreak = 0;
    if (passStreak >= rule.upAfter) {
      level += 1;
      passStreak = 0;
    }
  } else if (outcome === 'fail') {
    failStreak += 1;
    passStreak = 0;
    if (failStreak >= rule.downAfter) {
      level -= 1;
      failStreak = 0;
    }
  } else {
    passStreak = 0;
    failStreak = 0;
  }
  return { level: Math.min(maxLevel, Math.max(1, level)), passStreak, failStreak };
}
