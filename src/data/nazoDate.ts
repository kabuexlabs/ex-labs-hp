// 「東京で二人で参加できる謎解き・脱出ゲーム」（/guide/tokyo-nazo-date/）の掲載データ。
// 他社の施設・作品は、公式ページで確認できた項目だけを載せ、分からない項目は「公式ページで確認」のまま表示する。
// 自社公演（ウワサバナシ調査委員会：謎解き要素のある周遊型）は src/data/events/ から生成するため、ここには入れない。
// 2026-09-22：SEO担当の調査報告（公式ページの記載・公式URL）を根拠に掲載。実装環境から公式サイトへ到達できないため、
// 報告に無い項目（料金の金額など）は unconfirmed に残す。
export interface NazoItem {
  id: string;
  name: string;
  /** エリア（最寄り駅は分かる場合だけ） */
  area: string;
  /** 店舗型（部屋に入る）／街歩き型／周遊型 */
  format: '店舗型' | '街歩き型' | '周遊型';
  /** 人数の条件 */
  players: string;
  /** 二人だけで1チームになれるか（true＝貸切・二人だけ、false＝他の参加者と一緒、undefined＝公式で確認） */
  privateForTwo?: boolean;
  together: string;
  /** 二人分の料金の表示 */
  pairPrice: string;
  pairPriceMin?: number;
  /** 制限時間（ゲーム本編） */
  timeLimit: string;
  gameMinutes?: number;
  /** 説明・受付込みの合計体験時間 */
  totalTime: string;
  /** 合計体験時間（分）。公式で合計が確認できた場合だけ入れる（短時間の分類に使う） */
  totalMinutes?: number;
  /** 税込区分・手数料 */
  tax: string;
  indoor: string;
  beginner: string;
  officialUrl: string;
  /** 計測（ev-ext）の識別子 */
  siteId: string;
  checkedAt: string;
  checkedBy: string;
  unconfirmed: string[];
  published: boolean;
}

export const nazoItems: NazoItem[] = [
  {
    id: 'scrap-shibuya-10min',
    name: '鍵だらけの爆弾からの脱出（リアル脱出ゲーム 渋谷店）',
    area: '東京・渋谷',
    format: '店舗型',
    players: '1〜2人（チームチケット1枚）',
    privateForTwo: true,
    together: '1〜2人のチームチケットで、知らない人とチームを組まない（公式FAQ）。施設全体の貸切ではない',
    pairPrice: '平日2,000円／土日祝・ハイシーズン2,200円（1〜2人のチームチケット1枚の通常料金）',
    pairPriceMin: 2000,
    timeLimit: '10分',
    gameMinutes: 10,
    totalTime: '合計約20分（開演10分前に受付）',
    totalMinutes: 20,
    tax: '税込かどうか・手数料は公式ページで確認',
    indoor: '屋内',
    beginner: '公式ページで確認',
    officialUrl: 'https://realdgame.jp/shop/shibuya/events/10min/',
    siteId: 'scrap-shibuya-10min',
    checkedAt: '2026-09-23',
    checkedBy: 'SEO担当の調査報告（公式作品ページの記載）',
    unconfirmed: ['税込区分', '手数料', '初心者向け表記', 'ハイシーズンの対象日'],
    published: true,
  },
  {
    id: 'scrap-shibuya-desolateearth',
    name: '荒れ果てた地球からの脱出（リアル脱出ゲーム 渋谷店）',
    area: '東京・渋谷',
    format: '店舗型',
    players: '1〜2人',
    together: 'チーム人数は1〜2人。他のチームと一緒になるかなどの詳細条件は作品ページのFAQで確認',
    pairPrice: '平日4,000円／土日祝・ハイシーズン4,200円（ペア合計の通常料金）',
    pairPriceMin: 4000,
    timeLimit: '20分',
    gameMinutes: 20,
    totalTime: '合計30分',
    totalMinutes: 30,
    tax: '税込かどうか・手数料は公式ページで確認',
    indoor: '屋内',
    beginner: '公式ページで確認',
    officialUrl: 'https://realdgame.jp/shop/shibuya/events/desolateearth/',
    siteId: 'scrap-shibuya-desolateearth',
    checkedAt: '2026-09-23',
    checkedBy: 'SEO担当の調査報告（公式作品ページの記載）',
    unconfirmed: ['税込区分', '手数料', '初心者向け表記', '他のチームと一緒になるか', 'ハイシーズンの対象日'],
    published: true,
  },
  {
    id: 'noescape-shinjuku',
    name: 'NoEscape 新宿店（50分ゲーム）',
    area: '東京・新宿',
    format: '店舗型',
    players: '2〜8人',
    privateForTwo: true,
    together: 'テーマごとに完全貸切。2人で申し込めば二人だけで遊べる',
    pairPrice: '8,800円（平日）／9,600円（土日祝）。50分ゲームに2名で参加した場合の1人4,400円／4,800円×2（税込）',
    pairPriceMin: 8800,
    timeLimit: '50分（ゲーム時間）',
    gameMinutes: 50,
    totalTime: '説明・受付を含む合計は公式ページで確認',
    tax: '税込（公式料金表）。手数料は公式ページで確認',
    indoor: '屋内',
    beginner: '難易度モードの案内は公式ページで確認',
    officialUrl: 'https://noescape.co.jp/shinjuku/sp/price/',
    siteId: 'noescape-shinjuku',
    checkedAt: '2026-09-23',
    checkedBy: 'SEO担当の調査報告（新宿店の公式料金ページがリンクする料金表の記載。20分ゲームは別料金のため含めない）',
    unconfirmed: ['説明・受付込みの合計時間', '手数料', '初心者向け表記', '最寄り駅・受付時間'],
    published: true,
  },
  {
    id: 'zettai-kukan-ikebukuro',
    name: '絶対空間 池袋店',
    area: '東京・池袋',
    format: '店舗型',
    players: '2人から',
    privateForTwo: true,
    together: '各部屋が1組ごとの貸切。2人なら二人だけで遊べる',
    pairPrice: '4,000円（平日昼）／5,000円（夜・土日祝）。1人2,000円／2,500円×2',
    pairPriceMin: 4000,
    timeLimit: '本編40分',
    gameMinutes: 40,
    totalTime: '説明込みで約1時間',
    totalMinutes: 60,
    tax: '税込かどうかは公式ページで確認',
    indoor: '屋内',
    beginner: '作品ごとの難易度は公式ページで確認',
    officialUrl: 'https://www.absolute-space.com/',
    siteId: 'zettai-kukan',
    checkedAt: '2026-09-22',
    checkedBy: 'SEO担当の調査報告（公式ページの記載）',
    unconfirmed: ['税込表示', '作品ごとの時間表記', '最寄り駅・受付時間'],
    published: true,
  },
  {
    id: 'shibuya-nazo-machiaruki',
    name: '渋谷の謎解き街歩き',
    area: '東京・渋谷',
    format: '街歩き型',
    players: '公式ページで確認',
    together: '公式ページで確認',
    pairPrice: '1人2,700円の記載（二人で5,400円）',
    pairPriceMin: 5400,
    timeLimit: '制限時間なし（目安 約4〜5時間）',
    totalTime: '約4〜5時間',
    totalMinutes: 270,
    tax: '公式ページで確認',
    indoor: '屋外（街を歩く）',
    beginner: '公式ページで確認',
    officialUrl: '',
    siteId: 'shibuya-nazo-machiaruki',
    checkedAt: '2026-09-22',
    checkedBy: 'SEO担当の調査報告（開催継続と公式URLは未確認）',
    unconfirmed: ['公式URL', '開催の継続', '販売元', '人数条件', '税込表示'],
    // 開催が続いているか・公式URLを確認できるまで掲載しない
    published: false,
  },
];

export const publishedNazoItems = nazoItems.filter((i) => i.published);
