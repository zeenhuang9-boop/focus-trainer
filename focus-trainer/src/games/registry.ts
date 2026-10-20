import type { GameModule } from '../core/types';
import { schulte } from './schulte';
import { stroop } from './stroop';
import { seqmem } from './seqmem';
import { mot } from './mot';
import { gestalt } from './gestalt';

// 注册顺序必须等于 GAME_IDS 的声明顺序：scheduler.ts 的 tie-break 用 GAME_IDS.indexOf，
// 首页与 M3 的雷达图按 GAMES 迭代，registry.test.ts 的保序子序列断言强制这一点。
export const GAMES: readonly GameModule[] = [schulte, stroop, seqmem, mot, gestalt];

export function getGame(id: string): GameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
