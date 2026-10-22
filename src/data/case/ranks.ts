// 探偵ランクの定義。条件 (minScore)・名称・説明文はここを編集するだけで
// 変更できる。minScore の降順で評価されるため、追加時も順序を気にせず
// 書いてよい（lib/case/ranking.ts 側でソートして解決する）。
import type { DetectiveRank } from '../../types/case';

export const detectiveRanks: DetectiveRank[] = [
  {
    minScore: 90,
    rank: 'S',
    title: '名探偵',
    description:
      'わずかな違和感も見逃さない、卓越した観察力と推理力を持つ探偵です。',
  },
  {
    minScore: 75,
    rank: 'A',
    title: '優秀な探偵',
    description:
      '冷静な観察力と推理力を持つ、非常に優秀な調査員です。',
  },
  {
    minScore: 50,
    rank: 'B',
    title: '調査員',
    description:
      '着実に手がかりを積み重ねる、信頼のおける調査員です。',
  },
  {
    minScore: 0,
    rank: 'C',
    title: '見習い探偵',
    description:
      '調査はまだ始まったばかり。次の事件で真価を発揮しましょう。',
  },
];
