import { shuffle } from '../../core/rng';
import type { Rng } from '../../core/rng';
import { FIGURES } from './figures';
import type { Family, FigureId, FigureSpec } from './figures';

export type RotationMode = 'none' | 'jitter30' | 'full360';
export type DistractorRule = 'cross' | 'same';

export interface GestaltLevel {
  readonly exposureMs: number;
  readonly retention: number;
  readonly noise: number;
  readonly rotation: RotationMode;
  readonly distractor: DistractorRule;
  /** 「相似」的字面量化：本档允许的同族干扰项数量上限。cross → 0，same → 3。 */
  readonly sameFamily: 0 | 3;
}

export const GESTALT_CHOICE_COUNT = 4;

/** spec §3.5 档位表（12 档），逐字面抄，不做公式化插值。 */
export const GESTALT_LEVELS: readonly GestaltLevel[] = [
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
];

export const GESTALT_MAX_LEVEL = GESTALT_LEVELS.length;

export function gestaltLevel(level: number): GestaltLevel {
  if (!Number.isInteger(level) || level < 1 || level > GESTALT_MAX_LEVEL) {
    throw new RangeError(`gestalt level out of range: ${level}`);
  }
  return GESTALT_LEVELS[level - 1];
}

export function rotationDeg(rng: Rng, mode: RotationMode): number {
  if (mode === 'none') return 0;
  if (mode === 'jitter30') return -30 + rng() * 60;
  return rng() * 360;
}

export interface GestaltTrialSpec {
  readonly target: FigureId;
  readonly targetFamily: Family;
  readonly choices: readonly FigureId[];
  readonly correctIndex: number;
  readonly sameFamilyDistractors: number;
  readonly crossFamilyDistractors: number;
}

export function pickTarget(rng: Rng, pool: readonly FigureSpec[] = FIGURES): FigureSpec {
  if (pool.length === 0) throw new RangeError('完型图形池为空');
  return shuffle(rng, pool)[0];
}

/**
 * 产出最终 4 个选项（顺序已洗牌，含目标本身）。
 * spec:157 ——「异族」抽 3 个别的族；「同族」从本族抽，不够 3 个时从其他族补足。
 * pool 参数是为了让「族太小」这条边界可用假池子测，不改动 FIGURES。
 */
export function buildChoiceSpecs(
  rng: Rng,
  target: FigureSpec,
  lv: GestaltLevel,
  pool: readonly FigureSpec[] = FIGURES,
): FigureSpec[] {
  const want = GESTALT_CHOICE_COUNT - 1;
  const samePool = pool.filter((f) => f.family === target.family && f.id !== target.id);
  const crossPool = pool.filter((f) => f.family !== target.family);
  if (1 + samePool.length + crossPool.length < GESTALT_CHOICE_COUNT) {
    throw new RangeError(`图形池只有 ${1 + samePool.length + crossPool.length} 个可用图形，凑不出 ${GESTALT_CHOICE_COUNT} 个互不相同的选项`);
  }
  const sameTake = shuffle(rng, samePool).slice(0, Math.min(lv.sameFamily, samePool.length, want));
  const crossTake = shuffle(rng, crossPool).slice(0, want - sameTake.length);
  return shuffle(rng, [target, ...sameTake, ...crossTake]);
}

export function buildChoices(
  rng: Rng,
  target: FigureSpec,
  lv: GestaltLevel,
  pool: readonly FigureSpec[] = FIGURES,
): FigureId[] {
  return buildChoiceSpecs(rng, target, lv, pool).map((f) => f.id);
}

export function buildTrialSpec(
  rng: Rng,
  lv: GestaltLevel,
  pool: readonly FigureSpec[] = FIGURES,
): GestaltTrialSpec {
  const target = pickTarget(rng, pool);
  const specs = buildChoiceSpecs(rng, target, lv, pool);
  const same = specs.filter((f) => f.family === target.family && f.id !== target.id).length;
  return {
    target: target.id,
    targetFamily: target.family,
    choices: specs.map((f) => f.id),
    correctIndex: specs.findIndex((f) => f.id === target.id),
    sameFamilyDistractors: same,
    crossFamilyDistractors: specs.length - 1 - same,
  };
}
