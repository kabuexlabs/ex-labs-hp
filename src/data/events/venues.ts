// 会場。住所は公式サイトで公開されているものだけ。集合場所を当日案内する公演は書かない。
import type { Venue } from './types';

export const venues: Venue[] = [
  {
    id: 'bar-neon-roppongi',
    name: 'Bar ねおん（会員制バー）',
    listName: '会員制バー',
    regionId: 'tokyo',
    areaId: 'roppongi',
    address: '東京都港区六本木5-9-14 2階',
    setting: 'mixed',
    access: '受付後、会場まで徒歩で移動する案内あり（屋外の移動を含む）。最寄り駅は公式ページに記載なし',
    sourceIds: ['kaitou-official'],
  },
  {
    id: 'shibuya-sakura-stage',
    name: '渋谷サクラステージ',
    regionId: 'tokyo',
    areaId: 'shibuya',
    setting: 'indoor',
    station: 'JR「渋谷駅」新南改札より直結（自社公式ページの案内）',
    access: '商業施設内の複数スポットを歩いて巡る。集合場所は SHIBUYA SIDE 3階（公式ページに記載）',
    sourceIds: ['uwasabanashi-official'],
  },
];
