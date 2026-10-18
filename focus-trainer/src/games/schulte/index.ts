import type { GameModule } from '../../core/types';
import { SchulteEngine } from './engine';
import { SCHULTE_MAX_LEVEL, formatSchulteSummary, judgeSchulte, summarizeSchulte } from './rules';
import { createSchulteView } from './view';

export const schulte: GameModule = {
  id: 'schulte',
  name: '舒尔特方格',
  ability: '持续注意',
  maxLevel: SCHULTE_MAX_LEVEL,
  roundsPerSession: 3,
  roundBreak: 'tap',
  staircase: { upAfter: 1, downAfter: 1 },
  instructions:
    '按顺序尽快点完所有格子。顶部「下一个」提示要找的格子：低档位从 1 往大数点，高档位会出现倒序和字母。点错会闪红并记一次误点。每次训练 3 张方格，每张结束后按用时和误点调整难度。',
  createEngine: () => new SchulteEngine(),
  createView: createSchulteView,
  judge: judgeSchulte,
  summarize: summarizeSchulte,
  formatSummary: formatSchulteSummary,
};
