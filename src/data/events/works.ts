// 作品。summary / description は自社で書いた文章。画像は利用条件を確認できたものだけ image に入れる（無ければ文字中心）。
import type { Work } from './types';

export const works: Work[] = [
  {
    id: 'kaitou',
    slug: 'kaitou',
    title: '怪盗と秘密の試験',
    organizerId: 'immersive-illusion',
    genres: ['story-experience'],
    summary: '義賊組織「レイヴン怪盗団」の団員候補として、会員制バーで試験に挑むマジック×イマーシブ公演。物語の中で本格イリュージョンが目の前で行われます。',
    description: [
      '招待状を手に会員制バーへ向かい、団員候補として「秘密の試験」に挑む体験型公演です。キャストとの会話や参加者同士で協力する場面があり、物語の進行の中で本格的なマジックが目の前で行われます。',
      '各回2〜4名での参加（1名での申込不可）。受付後に会場まで徒歩で移動する案内があり、スマートフォンとイヤホンを持参します。18歳以上、日本語で進行します。',
    ],
    officialUrl: '/kaitou/',
    // 所要時間は公式チケットページのみに記載。案内に60分／70分の不一致があり未確定
    duration: { text: '詳細はチケットページで確認' },
    price: {
      unit: 'per-group',
      tiers: [
        { party: 2, amount: 13000 },
        { party: 3, amount: 16500 },
        { party: 4, amount: 19600 },
      ],
      text: '2人 ¥13,000／3人 ¥16,500／4人 ¥19,600',
      taxIncluded: true,
      feeNote: '税込。表示価格のほか、別途手数料がかかる場合があります',
    },
    party: {
      min: 2,
      max: 4,
      soloAllowed: false,
      format: 'private',
      text: '各回2〜4名（1名での申込不可）',
    },
    info: {
      participation: 'キャストとの会話や、参加者同士で協力する場面があります',
      actorInteraction: true,
      ageRule: '18歳以上',
      language: '日本語で進行',
      walking: '受付後、会場へ徒歩での移動があります（水分必須と案内）',
      requirements: [
        'スマートフォンとイヤホンを必ず持参（体験の進行に使用）',
        '会場にクロークなし。大きな荷物は駅周辺のロッカーへ',
        '受付時間に遅れると参加不可。日本語で進行',
        '服装の指定なし',
      ],
    },
    sourceIds: ['kaitou-official', 'escape-id-kaitou'],
    verified: { at: '2026-09-13T01:23:00+09:00', by: 'Claude（自社公式ページの記載を確認）' },
    verifyTtlDays: 14,
    published: true,
    updatedAt: '2026-09-13',
  },
  {
    id: 'uwasabanashi',
    slug: 'uwasabanashi',
    title: 'ウワサバナシ調査委員会',
    organizerId: 'ex-labs',
    genres: ['walk-story'],
    summary: '渋谷サクラステージ全体を周遊する、都市伝説×イマーシブ×謎解き。集めた証言と手がかりを整理して真相にたどり着く、選択で展開が変わる体験です。',
    description: [
      '渋谷サクラステージで起きた不審な出来事を調査する、周遊型のイマーシブ体験です。商業施設内の複数のスポットを歩いて巡り、集めた証言と手がかりを整理して真相に近づきます。選択によって展開が変わります。',
      'チケット1枚につき1名。複数人で参加する場合は代表者がまとめて購入します（同行者と一時的に離れる場面があります）。15歳以上。所要時間は約70分です。',
    ],
    officialUrl: '/uwasabanashi/',
    duration: { minutes: 70, text: '約70分（自社公式の案内）' },
    price: {
      unit: 'per-person',
      amount: 4000,
      text: '¥4,000',
      taxIncluded: true,
      feeNote: '税込。表示価格のほか別途手数料がかかります',
    },
    party: {
      min: 1,
      soloAllowed: true,
      format: 'shared',
      text: 'チケット1枚につき1名。複数人参加可（途中で一時的に離れる場合あり）',
    },
    info: {
      participation: '証言や手がかりを集めて整理し、選択で展開が変わります',
      ageRule: '15歳以上',
      walking: '商業施設内の複数スポットを歩いて巡ります',
      requirements: [
        '体験中、一時的に靴を脱ぐ可能性があります',
        'スマートフォン・イヤホン・水分を必ず持参',
        '開演時刻を過ぎると入場不可（5分前集合）',
        '心臓疾患・血圧異常・妊娠中などの方は参加不可（詳細は公演ページ）',
      ],
    },
    sourceIds: ['uwasabanashi-official', 'escape-id-uwasabanashi'],
    verified: { at: '2026-09-13T01:23:00+09:00', by: 'Claude（自社公式ページの記載を確認）' },
    verifyTtlDays: 14,
    published: true,
    updatedAt: '2026-09-13',
  },
];
