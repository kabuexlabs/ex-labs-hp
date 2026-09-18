// 「東京の非日常・体験デート」記事（/guide/tokyo-experience-date/）の掲載データ。
// 他社の施設・体験は、公式サイトまたは公式予約ページで重要項目（所在地・料金・所要時間・二人での参加条件・受付状況）を
// 確認できたものだけ published: true にする。検索結果の抜粋だけで確定しない（confirmation に確認済み／未確認を残す）。
// 自社公演（怪盗と秘密の試験／ウワサバナシ調査委員会）は src/data/events/ から生成するため、ここには入れない。
export type Genre = 'craft' | 'art' | 'puzzle' | 'story';

export const GENRE_LABEL: Record<Genre, string> = {
  craft: 'ものづくり',
  art: '没入型アート・展示',
  puzzle: '謎解き・脱出ゲーム',
  story: 'キャストと交流する物語参加型',
};

export interface ExperienceItem {
  id: string;
  name: string;
  genre: Genre;
  /** エリア・最寄り駅（公式の記載） */
  area: string;
  /** 来場者が具体的にすること（自社で書いた説明） */
  what: string;
  /** 二人での参加条件（予約単位・同じ組か・貸切か） */
  forTwo: string;
  /** 費用（二人分の総額と単位、税込・追加料金の条件） */
  price: string;
  /** 時間（公式所要時間。制作と受け取り時期、集合などを区別） */
  time: string;
  /** 開催状況（常設／期間限定、受付状況の確認先） */
  status: string;
  /** どんな二人に合うか（事実に基づく理由） */
  fit: string;
  /** 注意点 */
  notes: string;
  /** 公式ページ */
  officialUrl: string;
  /** 公式予約ページ（公式ページと同じなら省略） */
  bookingUrl?: string;
  /** 掲載元の識別子（計測 ev-ext の data-show に使う） */
  siteId: string;
  /** 実際に確認した日（YYYY-MM-DD）と確認方法 */
  checkedAt: string;
  checkedBy: string;
  confirmation: { confirmed: string[]; unconfirmed: string[] };
  published: boolean;
}

// 候補（2026-09-18 調査）。実装環境から各公式サイトへ到達できず（egress でブロック）、検索結果の抜粋しか得られていない。
// すべて published: false。公式ページで confirmation.unconfirmed を確認して値を直し、published: true にすると記事に載る。
export const experienceItems: ExperienceItem[] = [
  {
    id: 'futaba-pottery-date',
    name: '陶芸教室Futaba カップル陶芸デートプラン',
    genre: 'craft',
    area: '東京（教室の所在地・最寄り駅は公式で要確認）',
    what: '二人で電動ろくろや手びねりで器を作る体験（検索結果の抜粋）。',
    forTwo: '二人向けのプランとして案内（同時に同じ席で作れるかは要確認）',
    price: '公式で要確認（カップル割引の案内あり。焼成費・送料の扱いも要確認）',
    time: '約1時間30分（検索結果の抜粋）。完成品の受け取り時期は要確認',
    status: '常設（火・水・金・土・日開催と案内）。受付状況は公式予約ページで確認',
    fit: '形に残るものを二人で作りたい場合',
    notes: '完成品は焼成後の受け取りになる可能性（要確認）',
    officialUrl: 'https://www.fu-ta-ba.jp/trial/date-2/',
    siteId: 'futaba',
    checkedAt: '2026-09-18',
    checkedBy: 'Claude（Web 検索結果の抜粋のみ。公式ページ未確認）',
    confirmation: { confirmed: [], unconfirmed: ['所在地・最寄り駅', '料金（1人・2人・税込・焼成費・送料）', '体験時間', '受け取り時期', '同時に作れるか', '年齢条件', '受付状況'] },
    published: false,
  },
  {
    id: 'uzumako-pottery',
    name: 'うづまこ陶芸教室（カップルプラン）',
    genre: 'craft',
    area: '東京・赤羽橋駅近く（検索結果の抜粋）',
    what: '陶芸の体験（検索結果の抜粋）。',
    forTwo: 'カップルプランの案内あり（同じ席・同時制作かは要確認）',
    price: '公式で要確認',
    time: '公式で要確認',
    status: '常設と推定。受付状況は公式予約ページで確認',
    fit: '形に残るものを二人で作りたい場合',
    notes: '要確認',
    officialUrl: 'https://www.uzumako.com/',
    siteId: 'uzumako',
    checkedAt: '2026-09-18',
    checkedBy: 'Claude（Web 検索結果の抜粋のみ。公式サイトは実装環境から名前解決できず未確認）',
    confirmation: { confirmed: [], unconfirmed: ['所在地・最寄り駅', '料金', '所要時間', '受け取り時期', '同時に作れるか', '年齢条件', '受付状況', '公式URLの生存'] },
    published: false,
  },
  {
    id: 'ganso-shokuhin-sample',
    name: '元祖食品サンプル屋 合羽橋店（食品サンプル製作体験）',
    genre: 'craft',
    area: '東京・合羽橋（最寄り駅は公式で要確認）',
    what: '「天ぷら＆レタス」の食品サンプルを作る体験（検索結果の抜粋）。',
    forTwo: '二人で予約できるか・同じ回かは要確認',
    price: '1人2,500円（検索結果の抜粋。税込か要確認）',
    time: '1回40分（検索結果の抜粋）',
    status: '常設と推定。受付状況は公式予約ページで確認',
    fit: '短時間で形に残るものを作りたい場合',
    notes: '要確認',
    officialUrl: 'https://www.ganso-sample.com/',
    siteId: 'ganso-sample',
    checkedAt: '2026-09-18',
    checkedBy: 'Claude（Web 検索結果の抜粋のみ。公式ページ未確認）',
    confirmation: { confirmed: [], unconfirmed: ['公式URL', '所在地・最寄り駅', '料金（税込）', '二人での予約条件', '受付状況', '年齢条件'] },
    published: false,
  },
  {
    id: 'teamlab-planets',
    name: 'チームラボプラネッツ TOKYO',
    genre: 'art',
    area: '東京・豊洲（豊洲駅徒歩1分と検索結果に記載）',
    what: '水に足をつけ、光に包まれる作品空間を歩いて鑑賞する（検索結果の抜粋）。',
    forTwo: '日時指定チケットを2枚購入（他の来場者と一緒。貸切なし）',
    price: '公式で要確認（大人1人料金×2）',
    time: '公式で要確認（自由鑑賞）',
    status: '常設と推定。受付状況は公式チケットページで確認',
    fit: '会話の負担なく、自分たちのペースで鑑賞したい二人',
    notes: '裸足になる作品・水に入る作品の案内（要確認）',
    officialUrl: 'https://planets.teamlab.art/tokyo/jp/',
    siteId: 'teamlab-planets',
    checkedAt: '2026-09-18',
    checkedBy: 'Claude（Web 検索結果の抜粋のみ。公式ページ未確認）',
    confirmation: { confirmed: [], unconfirmed: ['営業状況（常設か）', '料金', '所要時間の目安', '服装・裸足の条件', '受付状況'] },
    published: false,
  },
  {
    id: 'tokyo-mystery-circus',
    name: '東京ミステリーサーカス（新宿）',
    genre: 'puzzle',
    area: '東京・新宿（最寄り駅は公式で要確認）',
    what: 'リアル脱出ゲームなど複数の謎解き公演から選んで参加する（検索結果の抜粋）。',
    forTwo: '公演ごとに人数条件・他チームとの合流の有無が異なる（要確認）',
    price: '公演ごとに異なる（公式で要確認）',
    time: '公演ごとに異なる（公式で要確認）',
    status: '常設施設。各公演の受付状況は公式チケットページで確認',
    fit: '二人で相談しながら制限時間内に解きたい場合',
    notes: '要確認',
    officialUrl: 'https://mysterycircus.jp/tokyo/',
    siteId: 'tokyo-mystery-circus',
    checkedAt: '2026-09-18',
    checkedBy: 'Claude（Web 検索結果の抜粋のみ。公式ページ未確認）',
    confirmation: { confirmed: [], unconfirmed: ['掲載する公演の選定', '料金', '所要時間', '二人での参加条件（相席）', '受付状況'] },
    published: false,
  },
];

/** 公開済みの他社項目 */
export const publishedItems = experienceItems.filter((i) => i.published);
/** 記事を公開扱いにする条件：自社以外のジャンルで公式確認済みの項目が2ジャンル以上ある（自社公演だけの一覧にしない） */
export const EXPERIENCE_DATE_PUBLISHED = new Set(publishedItems.map((i) => i.genre)).size >= 2;
