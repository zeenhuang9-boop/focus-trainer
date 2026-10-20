// focus-trainer/src/games/mot/index.ts
import type { GameModule } from '../../core/types';
import { MotEngine } from './engine';
import { MOT_MAX_LEVEL, formatMotSummary, judgeMot, summarizeMot } from './rules';
import { createMotView } from './view';

export const mot: GameModule = {
  id: 'mot',
  name: '视觉动态感知',
  ability: '动态感知',
  maxLevel: MOT_MAX_LEVEL,
  roundsPerSession: 8,
  roundBreak: 'auto',
  staircase: { upAfter: 2, downAfter: 1 },
  instructions:
    '橙色闪烁的点是目标，它们变白并开始移动后请用眼睛追住，全程不要用手、不要盯别处。移动停止后点出你追踪的那几个点（再点同一个点可取消），点满自动提交并显示反馈。每轮一个试次，共 8 轮，轮间自动衔接；一轮全中升一档，差两个及以上降一档。',
  createEngine: () => new MotEngine(),
  createView: createMotView,
  judge: judgeMot,
  summarize: summarizeMot,
  formatSummary: formatMotSummary,
};
