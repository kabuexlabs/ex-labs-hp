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
    station: 'JR「渋谷駅」新南改札より直結',
    access: '商業施設内の複数スポットを歩いて巡る。集合場所は SHIBUYA SIDE 3階（公式ページに記載）',
    sourceIds: ['uwasabanashi-official'],
  },
  {
    id: 'anator-kanda',
    name: 'ANATOR（HARVEY神田司町 4F）',
    listName: 'ANATOR',
    regionId: 'tokyo',
    areaId: 'kanda',
    address: '東京都千代田区神田司町2-15-11 HARVEY神田司町 4F',
    access: '小川町駅徒歩2分、淡路町駅徒歩2分',
    setting: 'indoor',
    sourceIds: ['escape-id-factroom'],
  },
  {
    // 住所は購入者にだけ案内する公演のため載せない（公式ページの記載どおり）
    id: 'kotohogi-house',
    name: 'さいたま市内の一軒家（詳しい集合場所は購入者に案内）',
    listName: 'さいたま市内の一軒家',
    regionId: 'saitama',
    areaId: 'saitama-city',
    access: '当日は会場最寄りのバス停に集合。集合場所は駅から離れているため、移動時間に余裕を（公式ページに記載）',
    sourceIds: ['kotohogi-official'],
  },
];
