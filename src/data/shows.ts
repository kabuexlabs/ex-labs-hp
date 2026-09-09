// 自社公演の開催データ（「今週遊べる東京のイマーシブイベント」欄の唯一の正本）。
// ルール：
//  - occurrences には「開催を確認できた回」だけを入れる。開催期間（9〜10月）だけから
//    日付を推定して入れない。時刻が未確認なら time を省く（当日の予約可否は断定しない）。
//  - status は 'scheduled'（開催予定）／'soldout'（完売を確認）／'cancelled'（中止）。
//  - verifiedAt / verifiedFrom は実際に確認した日時と情報源。日付だけ差し替えて
//    「最新」に見せない。verifyTtlDays を過ぎると表示側は確認日を明示し、今週の
//    開催を断定しない文言に切り替わる。
//  - 開催の確認と空席の確認は別。在庫が不明なら「空席はチケットサイトで確認」。
export type OccurrenceStatus = 'scheduled' | 'soldout' | 'cancelled';

export interface ShowOccurrence {
  /** 開催日（YYYY-MM-DD、日本時間） */
  date: string;
  /** 開演時刻（HH:MM、日本時間）。未確認なら省略 */
  time?: string;
  status: OccurrenceStatus;
}

export interface Show {
  id: string;
  name: string;
  area: string;
  /** 体験の特徴（1〜2文） */
  feature: string;
  /** 自社の公演詳細ページ */
  url: string;
  /** 正規チケットページ */
  ticketUrl: string;
  ticketSite: string;
  /** 所要時間の表示文（未確定なら「詳細はチケットページで確認」） */
  duration: string;
  /** 参加可能人数 */
  capacity: string;
  /** 年齢条件 */
  age: string;
  /** 料金：1人あたり／1組あたりを明記し、税込・手数料の扱いを含める */
  price: { text: string; unit: '1人あたり' | '1組あたり'; note: string };
  /** 参加判断に必要な条件（確認できたもののみ） */
  conditions: string[];
  occurrences: ShowOccurrence[];
  /** 開催情報の最終確認日時（ISO 8601、+09:00） */
  verifiedAt: string;
  /** 確認元（URL または説明） */
  verifiedFrom: string[];
  /** 確認の有効期間（日）。超えたら表示側が「要再確認」扱いにする */
  verifyTtlDays: number;
  /** 公開可否 */
  published: boolean;
}

export const shows: Show[] = [
  {
    id: 'kaitou',
    name: '怪盗と秘密の試験',
    area: '東京・六本木／会員制バー',
    feature: '義賊組織「レイヴン怪盗団」の団員候補として、会員制バーで試験に挑むマジック×イマーシブ公演。物語の中で本格イリュージョンが目の前で行われます。',
    url: '/kaitou/',
    ticketUrl: 'https://escape.id/ImmersiveIllusion-org/e-kaitou/',
    ticketSite: 'escape.id',
    duration: '詳細はチケットページで確認',
    capacity: '各回2〜4名（1名での申込不可）',
    age: '18歳以上',
    price: { text: '2人 ¥13,000／3人 ¥16,500／4人 ¥19,600', unit: '1組あたり', note: '税込。表示価格のほか、別途手数料がかかる場合があります' },
    conditions: [
      '受付後、会場へ徒歩での移動があります（水分必須と案内）',
      'スマートフォンとイヤホンを必ず持参（体験の進行に使用）',
      '会場にクロークなし。大きな荷物は駅周辺のロッカーへ',
      '受付時間に遅れると参加不可。日本語で進行',
      '服装の指定なし',
    ],
    occurrences: [
      { date: '2026-09-06', status: 'scheduled' },
      { date: '2026-09-13', status: 'scheduled' },
      { date: '2026-09-26', status: 'scheduled' },
      { date: '2026-09-27', status: 'scheduled' },
      { date: '2026-10-03', status: 'scheduled' },
      { date: '2026-10-04', status: 'scheduled' },
      { date: '2026-10-11', status: 'scheduled' },
    ],
    verifiedAt: '2026-09-09T10:30:00+09:00',
    verifiedFrom: ['自社公式 https://kabuexlabs.com/kaitou/（開催日・料金・人数・年齢・注意事項）', 'チケットサイト escape.id は実装環境から取得できず、開演時刻・在庫・所要時間（60分／70分の不一致）は未確認'],
    verifyTtlDays: 14,
    published: true,
  },
  {
    id: 'uwasabanashi',
    name: 'ウワサバナシ調査委員会',
    area: '東京・渋谷／渋谷サクラステージ',
    feature: '渋谷サクラステージ全体を周遊する、都市伝説×イマーシブ×謎解き。集めた証言と手がかりを整理して真相にたどり着く、選択で展開が変わる体験です。',
    url: '/uwasabanashi/',
    ticketUrl: 'https://escape.id/uwasabanashi-org/e-case1/',
    ticketSite: 'escape.id',
    duration: '約70分（自社公式の案内）',
    capacity: 'チケット1枚につき1名。複数人参加可（途中で一時的に離れる場合あり）',
    age: '15歳以上',
    price: { text: '¥4,000', unit: '1人あたり', note: '税込。表示価格のほか別途手数料がかかります' },
    conditions: [
      '商業施設内の複数スポットを歩いて巡ります',
      '体験中、一時的に靴を脱ぐ可能性があります',
      'スマートフォン・イヤホン・水分を必ず持参',
      '開演時刻を過ぎると入場不可（5分前集合）',
      '心臓疾患・血圧異常・妊娠中などの方は参加不可（詳細は公演ページ）',
    ],
    occurrences: [
      { date: '2026-09-19', status: 'scheduled' },
      { date: '2026-09-20', status: 'scheduled' },
      { date: '2026-09-26', status: 'scheduled' },
      { date: '2026-09-27', status: 'scheduled' },
      { date: '2026-10-03', status: 'scheduled' },
      { date: '2026-10-04', status: 'scheduled' },
    ],
    verifiedAt: '2026-09-09T10:30:00+09:00',
    verifiedFrom: ['自社公式 https://kabuexlabs.com/uwasabanashi/（開催日・料金・年齢・注意事項）', 'チケットサイト escape.id は実装環境から取得できず、開演時刻・在庫は未確認'],
    verifyTtlDays: 14,
    published: true,
  },
];
