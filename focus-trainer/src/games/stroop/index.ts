import type { GameModule } from '../../core/types';
import { StroopEngine } from './engine';
import { STROOP_MAX_LEVEL, formatStroopSummary, judgeStroop, summarizeStroop } from './rules';
import { createStroopView } from './view';

export const stroop: GameModule = {
  id: 'stroop',
  name: '颜色认知',
  ability: '抑制控制',
  maxLevel: STROOP_MAX_LEVEL,
  roundsPerSession: 4,
  roundBreak: 'tap',
  staircase: { upAfter: 1, downAfter: 1 },
  instructions:
    '屏幕顶部会常驻一条规则：「按颜色」时选这个词的墨色对应的颜色名，「按字义」时选与这个词本身相同的颜色名，按钮上写的都是颜色名。词出现后要尽快点一个，超时也算答完。低档位规则固定按颜色，中档位整轮交替或每试次切换，高档位还会打乱按钮位置、把按钮文字染成干扰色。一轮 12 个试次，每次训练 4 轮。结算看正确率、平均反应时和干扰效应（冲突试次比一致试次慢多少毫秒）。',
  createEngine: () => new StroopEngine(),
  createView: createStroopView,
  judge: judgeStroop,
  summarize: summarizeStroop,
  formatSummary: formatStroopSummary,
};
