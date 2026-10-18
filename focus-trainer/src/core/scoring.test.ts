import { describe, expect, it } from 'vitest';
import { abilityIndex } from './scoring';
import type { RoundRecord } from './types';

const round = (level: number, score01: number, counted = true, timingValid = true): RoundRecord => ({
  level,
  seed: 0,
  trials: [],
  metrics: {},
  timingValid,
  roundNo: 1,
  outcome: 'hold',
  score01,
  counted,
});

describe('abilityIndex', () => {
  it('没有计分轮时为 0', () => {
    expect(abilityIndex([], 10)).toBe(0);
    expect(abilityIndex([round(5, 1, false)], 10)).toBe(0);
  });

  it('3 个计分轮取最后 2 个求均值', () => {
    // (3-1+0.5 + 4-1+0.5) / 2 = 3，100*3/10 = 30
    expect(abilityIndex([round(1, 0), round(3, 0.5), round(4, 0.5)], 10)).toBe(30);
  });

  it('4 个计分轮取最后 2 个', () => {
    expect(abilityIndex([round(9, 1), round(9, 1), round(2, 0), round(2, 0)], 10)).toBe(10);
  });

  it('忽略未计分轮', () => {
    expect(abilityIndex([round(2, 0), round(10, 1, false), round(2, 0)], 10)).toBe(10);
  });

  it('过滤只看 counted，不看 timingValid', () => {
    // SessionRunner 会产出 counted:true + timingValid:false 的补满轮，必须计入
    expect(abilityIndex([round(4, 0.5, true, false)], 10)).toBe(35);
  });

  it('夹在 0 到 100', () => {
    expect(abilityIndex([round(10, 1)], 10)).toBe(100);
    expect(abilityIndex([round(1, 0)], 10)).toBe(0);
    expect(abilityIndex([round(1, 500)], 10)).toBe(100);
    expect(abilityIndex([round(1, -50)], 10)).toBe(0);
  });

  it('四舍五入到整数', () => {
    // (1-1+0.333) / 12 * 100 = 2.775
    expect(abilityIndex([round(1, 0.333)], 12)).toBe(3);
  });
});
