import { describe, expect, it } from 'vitest';
import { createRng, pick, randInt, shuffle } from './rng';

describe('createRng', () => {
  it('同一种子给出同一序列', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('不同种子给出不同序列', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });

  it('输出落在 [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('randInt', () => {
  it('取值含两端且不越界', () => {
    const r = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = randInt(r, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

describe('shuffle', () => {
  it('返回原数组的一个排列且不改动原数组', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = shuffle(createRng(5), items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...out].sort((x, y) => x - y)).toEqual(items);
  });

  it('同一种子打乱结果相同', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffle(createRng(9), items)).toEqual(shuffle(createRng(9), items));
  });
});

describe('pick', () => {
  it('只取数组里的元素', () => {
    const r = createRng(11);
    for (let i = 0; i < 100; i++) expect(['x', 'y', 'z']).toContain(pick(r, ['x', 'y', 'z']));
  });
});
