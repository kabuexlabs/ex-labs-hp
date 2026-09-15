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
  // 他社（掲載候補。公式ページで主催者名を確認してから公開）
  {
    id: 'vivant-immersive-mission-organizer',
    name: '「VIVANT IMMERSIVE MISSION」主催者（公式ページで要確認）',
    relation: 'third-party',
    relationLabel: '他社主催（株式会社ex Labs は関与していません）',
    sourceIds: ['vivant-search-2026-09-15'],
  },
  {
    id: 'intersection-organizer',
    name: '「交差 Intersection in東京」主催者（公式ページで要確認）',
    relation: 'third-party',
    relationLabel: '他社主催（株式会社ex Labs は関与していません）',
    sourceIds: ['intersection-search-2026-09-15'],
  },
];
