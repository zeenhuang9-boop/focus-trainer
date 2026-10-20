import type { GameModule } from '../../core/types';
import { GestaltEngine } from './engine';
import { GESTALT_MAX_LEVEL, formatGestaltSummary, judgeGestalt, summarizeGestalt } from './rules';
import { createGestaltView } from './view';

export const gestalt: GameModule = {
  id: 'gestalt',
  name: '视觉完型整合',
  ability: '完型整合',
  maxLevel: GESTALT_MAX_LEVEL,
  roundsPerSession: 16,
  roundBreak: 'auto',
  staircase: { upAfter: 2, downAfter: 1 },
  instructions:
    '屏幕中央先出现注视点，随后一个图形会被打碎成短线段、掺进噪声并短暂暴露——只看这一眼。掩蔽闪过后，从下面 4 个完整图形里点出刚才那个。低档位暴露 600 毫秒、干扰项都来自别的族；档位越高暴露越短、碎片越稀疏、噪声越多，到最后三个干扰项全跟目标同一个族。每次训练 16 试次，自动衔接，2 连对升档、1 次答错降档。',
  createEngine: () => new GestaltEngine(),
  createView: createGestaltView,
  judge: judgeGestalt,
  summarize: summarizeGestalt,
  formatSummary: formatGestaltSummary,
};
