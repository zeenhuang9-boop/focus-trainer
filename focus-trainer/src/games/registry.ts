import type { GameModule } from '../core/types';
import { schulte } from './schulte';

export const GAMES: readonly GameModule[] = [schulte];

export function getGame(id: string): GameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
