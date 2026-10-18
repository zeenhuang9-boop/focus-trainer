import type { GameModule } from '../core/types';
import { schulte } from './schulte';

// M1 只注册舒尔特（spec:380）；M2 在此按 GAME_IDS 的声明顺序追加注册其余 4 个游戏
// —— registry.test.ts 的保序子序列断言会强制「注册顺序 === 声明顺序」。
export const GAMES: readonly GameModule[] = [schulte];

export function getGame(id: string): GameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
