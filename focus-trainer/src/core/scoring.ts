import type { RoundRecord } from './types';

export function abilityIndex(rounds: readonly RoundRecord[], maxLevel: number): number {
  const counted = rounds.filter((r) => r.counted);
  if (counted.length === 0) return 0;
  const tail = counted.slice(counted.length - Math.ceil(counted.length / 2));
  const mean = tail.reduce((sum, r) => sum + (r.level - 1 + r.score01), 0) / tail.length;
  return Math.min(100, Math.max(0, Math.round((100 * mean) / maxLevel)));
}
