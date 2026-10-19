import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { FIGURES, type FigureSpec } from './figures';
import {
  GESTALT_CHOICE_COUNT, GESTALT_LEVELS, GESTALT_MAX_LEVEL,
  buildChoiceSpecs, buildChoices, buildTrialSpec, gestaltLevel, pickTarget, rotationDeg,
  type GestaltLevel,
} from './rules';

const SAME: GestaltLevel = GESTALT_LEVELS[6];   // 档 7：同族
const CROSS: GestaltLevel = GESTALT_LEVELS[0];  // 档 1：异族

describe('档位表', () => {
  it('12 档，逐字段等于 spec §3.5 的字面值', () => {
    expect(GESTALT_MAX_LEVEL).toBe(12);
    expect(GESTALT_LEVELS).toEqual([
      { exposureMs: 600, retention: 0.75, noise: 0, rotation: 'none', distractor: 'cross', sameFamily: 0 },
      { exposureMs: 500, retention: 0.7, noise: 0, rotation: 'none', distractor: 'cross', sameFamily: 0 },
      { exposureMs: 420, retention: 0.66, noise: 5, rotation: 'none', distractor: 'cross', sameFamily: 0 },
      { exposureMs: 350, retention: 0.62, noise: 10, rotation: 'none', distractor: 'cross', sameFamily: 0 },
      { exposureMs: 300, retention: 0.58, noise: 15, rotation: 'jitter30', distractor: 'cross', sameFamily: 0 },
      { exposureMs: 250, retention: 0.54, noise: 20, rotation: 'jitter30', distractor: 'cross', sameFamily: 0 },
      { exposureMs: 210, retention: 0.5, noise: 25, rotation: 'jitter30', distractor: 'same', sameFamily: 3 },
      { exposureMs: 180, retention: 0.47, noise: 30, rotation: 'jitter30', distractor: 'same', sameFamily: 3 },
      { exposureMs: 150, retention: 0.44, noise: 35, rotation: 'full360', distractor: 'same', sameFamily: 3 },
      { exposureMs: 125, retention: 0.41, noise: 40, rotation: 'full360', distractor: 'same', sameFamily: 3 },
      { exposureMs: 100, retention: 0.38, noise: 50, rotation: 'full360', distractor: 'same', sameFamily: 3 },
      { exposureMs: 80, retention: 0.35, noise: 60, rotation: 'full360', distractor: 'same', sameFamily: 3 },
    ]);
  });

  it('gestaltLevel 夹边界：0 / 13 / 非整数都抛 RangeError', () => {
    expect(gestaltLevel(1).exposureMs).toBe(600);
    expect(() => gestaltLevel(0)).toThrow(RangeError);
    expect(() => gestaltLevel(13)).toThrow(RangeError);
    expect(() => gestaltLevel(2.5)).toThrow(RangeError);
  });

  it('rotationDeg 三种模式的区间', () => {
    expect(rotationDeg(createRng(1), 'none')).toBe(0);
    for (let s = 0; s < 50; s++) {
      const j = rotationDeg(createRng(s), 'jitter30');
      expect(j).toBeGreaterThanOrEqual(-30);
      expect(j).toBeLessThanOrEqual(30);
      const f = rotationDeg(createRng(1000 + s), 'full360');
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(360);
    }
  });
});

describe('选项阵列', () => {
  it('异族档：3 个干扰项全部与目标不同族', () => {
    for (let s = 0; s < 40; s++) {
      const t = pickTarget(createRng(s));
      const specs = buildChoiceSpecs(createRng(s + 7), t, CROSS);
      const others = specs.filter((f) => f.id !== t.id);
      expect(others).toHaveLength(3);
      expect(others.every((f) => f.family !== t.family)).toBe(true);
    }
  });

  it('同族档：3 个干扰项全部与目标同族（六个族都够 4 个成员）', () => {
    for (const fam of new Set(FIGURES.map((f) => f.family))) {
      const t = FIGURES.find((f) => f.family === fam)!;
      const specs = buildChoiceSpecs(createRng(3), t, SAME);
      expect(specs.filter((f) => f.id !== t.id)).toHaveLength(3);
      expect(specs.filter((f) => f.family === fam)).toHaveLength(4);
    }
  });

  it('族太小（2 成员）时按 spec:157 用异族补足到 4 个', () => {
    const pool: FigureSpec[] = [
      { id: 'triangle', family: 'polygon', name: '三角形', shape: { kind: 'regular', n: 3, rotDeg: 0 } },
      { id: 'square', family: 'polygon', name: '正方形', shape: { kind: 'regular', n: 4, rotDeg: 0 } },
      { id: 'circle', family: 'curve', name: '圆', shape: { kind: 'ellipse', rx: 1, ry: 1 } },
      { id: 'cross', family: 'symbol', name: '十字', shape: { kind: 'strokes', strokes: [] } },
      { id: 'cup', family: 'object', name: '杯子', shape: { kind: 'strokes', strokes: [] } },
    ];
    const t = pool[0];
    const specs = buildChoiceSpecs(createRng(11), t, SAME, pool);
    expect(specs).toHaveLength(4);
    expect(specs.filter((f) => f.family === 'polygon')).toHaveLength(2); // 目标 + 1 个同族
    expect(specs.filter((f) => f.family !== 'polygon')).toHaveLength(2); // 补 2 个异族
    expect(new Set(specs.map((f) => f.id)).size).toBe(4);
  });

  it('池子总共凑不出 4 个不同图形时抛 RangeError，不静默出重复项', () => {
    const pool: FigureSpec[] = [
      { id: 'triangle', family: 'polygon', name: '三角形', shape: { kind: 'regular', n: 3, rotDeg: 0 } },
      { id: 'square', family: 'polygon', name: '正方形', shape: { kind: 'regular', n: 4, rotDeg: 0 } },
    ];
    expect(() => buildChoiceSpecs(createRng(1), pool[0], SAME, pool)).toThrow(RangeError);
  });

  it('200 个种子：阵列长度 4、无重复、目标在阵列内且 correctIndex 指对', () => {
    for (let s = 0; s < 200; s++) {
      const lv = GESTALT_LEVELS[s % 12];
      const spec = buildTrialSpec(createRng(s), lv);
      expect(spec.choices).toHaveLength(GESTALT_CHOICE_COUNT);
      expect(new Set(spec.choices).size).toBe(GESTALT_CHOICE_COUNT);
      expect(spec.choices.filter((id) => id === spec.target)).toHaveLength(1);
      expect(spec.choices[spec.correctIndex]).toBe(spec.target);
      expect(spec.sameFamilyDistractors + spec.crossFamilyDistractors).toBe(GESTALT_CHOICE_COUNT - 1);
      expect(spec.sameFamilyDistractors).toBe(lv.distractor === 'same' ? 3 : 0);
    }
  });

  it('目标下标被打散：200 个种子里 4 个位置都出现过', () => {
    const seen = new Set<number>();
    for (let s = 0; s < 200; s++) seen.add(buildTrialSpec(createRng(s + 31), CROSS).correctIndex);
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('同 (level, seed) 两次构造逐字段相等；不同 seed 构造不同', () => {
    const lv = GESTALT_LEVELS[8];
    expect(buildTrialSpec(createRng(77), lv)).toEqual(buildTrialSpec(createRng(77), lv));
    expect(buildTrialSpec(createRng(77), lv)).not.toEqual(buildTrialSpec(createRng(78), lv));
  });

  it('buildChoices 与 buildChoiceSpecs 是同一条洗牌链的 id 视图', () => {
    const lv = GESTALT_LEVELS[3];
    const t = FIGURES.find((f) => f.id === 'hexagon')!;
    const ids = buildChoices(createRng(5), t, lv);
    expect(ids).toHaveLength(GESTALT_CHOICE_COUNT);
    expect(new Set(ids).size).toBe(GESTALT_CHOICE_COUNT);
    expect(ids).toContain(t.id);
    // 同 seed + 同 target 必须逐字相等；换成另一套独立洗牌就会飘（buildChoices 只准 map id）
    expect(buildChoices(createRng(5), t, lv)).toEqual(ids);
  });
});
