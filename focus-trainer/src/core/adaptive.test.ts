import { describe, expect, it } from 'vitest';
import { INITIAL_ADAPTIVE, step } from './adaptive';
import type { AdaptiveState } from './types';

const fast = { upAfter: 1, downAfter: 1 };
const slow = { upAfter: 2, downAfter: 1 };
const s = (level: number, passStreak = 0, failStreak = 0): AdaptiveState => ({ level, passStreak, failStreak });

describe('step', () => {
  it('初始状态是 1 档、连胜连败都为 0', () => {
    expect(INITIAL_ADAPTIVE).toEqual(s(1));
  });

  it('1 升 1 降：pass 升一档，fail 降一档', () => {
    expect(step(s(3), 'pass', fast, 10)).toEqual(s(4));
    expect(step(s(3), 'fail', fast, 10)).toEqual(s(2));
  });

  it('hold 不改档位并清空两个计数', () => {
    expect(step(s(3, 1, 0), 'hold', slow, 10)).toEqual(s(3));
  });

  it('2 升 1 降：第一次 pass 只累计，第二次升档', () => {
    const once = step(s(3), 'pass', slow, 10);
    expect(once).toEqual(s(3, 1, 0));
    expect(step(once, 'pass', slow, 10)).toEqual(s(4));
  });

  it('pass 之后 fail 会清空连胜', () => {
    expect(step(s(3, 1, 0), 'fail', slow, 10)).toEqual(s(2));
  });

  it('顶档 pass 与 1 档 fail 不越界', () => {
    expect(step(s(10), 'pass', fast, 10)).toEqual(s(10));
    expect(step(s(1), 'fail', fast, 10)).toEqual(s(1));
  });

  it('不修改传入的状态', () => {
    const before = s(5, 1, 0);
    step(before, 'pass', slow, 10);
    expect(before).toEqual(s(5, 1, 0));
  });
});
