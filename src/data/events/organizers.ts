// 主催者。自社関与は relation: 'ex-labs' とし、一覧・詳細に relationLabel を必ず表示する。
import type { Organizer } from './types';

export const organizers: Organizer[] = [
  {
    id: 'ex-labs',
    name: '株式会社ex Labs',
    url: 'https://kabuexlabs.com/',
    relation: 'ex-labs',
    relationLabel: 'ex Labs 企画・制作',
    sourceIds: ['uwasabanashi-official'],
  },
  {
    id: 'immersive-illusion',
    name: 'IMMERSIVE ILLUSION',
    url: 'https://kabuexlabs.com/kaitou/',
    relation: 'ex-labs',
    relationLabel: 'ex Labs 企画・制作（公演ブランド：IMMERSIVE ILLUSION）',
    sourceIds: ['kaitou-official'],
  },
];
