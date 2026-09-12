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
    access: '受付後、会場まで徒歩で移動する案内あり',
    sourceIds: ['kaitou-official'],
  },
  {
    id: 'shibuya-sakura-stage',
    name: '渋谷サクラステージ',
    regionId: 'tokyo',
    areaId: 'shibuya',
    setting: 'indoor',
    access: '商業施設内の複数スポットを歩いて巡る',
    sourceIds: ['uwasabanashi-official'],
  },
];
