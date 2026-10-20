import type { GameModule } from '../../core/types';
import { SeqmemEngine } from './engine';
import { SEQMEM_MAX_LEVEL, formatSeqmemSummary, judgeSeqmem, summarizeSeqmem } from './rules';
import { createSeqmemView } from './view';

export const seqmem: GameModule = {
  id: 'seqmem',
  name: '序列记忆',
  // 雷达维度名（spec:261）：与舒尔特的「持续注意」同一粒度，M3 的五维图直接用它
  ability: '工作记忆',
  maxLevel: SEQMEM_MAX_LEVEL,
  roundsPerSession: 3,
  roundBreak: 'tap',
  // spec §5.2 表：schulte / stroop / seqmem 都是 1 升 1 降
  staircase: { upAfter: 1, downAfter: 1 },
  instructions:
    '注意看格子依次亮起的顺序，全部亮完后按同样顺序点回去，高档位要倒着点。整串点对就加长一格并立刻出一条新序列；点错任意一格本轮结束，并回放一次正确顺序。每次训练 3 轮，每轮从当前档位的起始长度开始，最长加 6 格，轮间点「继续」。',
  createEngine: () => new SeqmemEngine(),
  createView: createSeqmemView,
  judge: judgeSeqmem,
  summarize: summarizeSeqmem,
  formatSummary: formatSeqmemSummary,
};
