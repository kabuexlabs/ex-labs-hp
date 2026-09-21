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
  /** 横断比較用の短い値（未確認は「公式で確認」のまま。数値は公式料金からの計算で、特定日時の予約可能価格ではない） */
  compare?: {
    /** 二人分の総額の短い表示 */
    pairTotal: string;
    /** 二人分の最低額（円）。予算で選ぶ案内に使う。不明なら省略 */
    pairTotalMin?: number;
    /** 所要時間の短い表示 */
    time: string;
    /** 所要時間の目安（分）。時間で選ぶ案内に使う。不明なら省略 */
    minutes?: number;
    /** 場所・最寄り */
    place: string;
    /** 二人だけか相席か */
    together: string;
    /** 二人だけで体験できることが公式で確認できた場合 true、他の参加者と一緒なら false、未確認なら省略 */
    privateForTwo?: boolean;
    /** 屋外移動の有無 */
    outdoor: string;
  };
  /** officialUrl を実際に開いて確認できたか。false の間は記事でURLを直接リンクせず、公式サイト名での検索リンクにする */
  urlChecked?: boolean;
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

  // ---- 2026-09-20 公開分：SEO担当の調査報告（公式ページの記載を転記、確認日 2026-09-20）を根拠に掲載 ----
  // 実装環境から各公式サイトへ到達できないため、URL の生存と税込表示など報告に「未確認」とある項目は unconfirmed に残す。
  {
    id: 'icci-daikanyama-pair-ring',
    name: 'icci 代官山 シルバーペアリング制作',
    genre: 'craft',
    area: '東京・代官山（最寄り駅は公式で確認）',
    what: '二人がそれぞれ1本ずつ、シルバーの指輪を自分の手で作る。オプション加工は預かりになる。',
    forTwo: '二人向けのペアリング制作プラン。同じ席で作れるかは公式ページでご確認ください',
    price: '1本 12,000円〜（税込）。二人が各1本作ると 24,000円〜（オプション加工は別料金）',
    time: '約1時間。通常は当日持ち帰り（オプション加工を付けた場合は預かり）',
    status: '常設。空き状況は公式予約ページで確認',
    fit: '形に残るものを二人で作り、当日持ち帰りたい場合',
    notes: 'オプション加工は別料金で、加工を付けると受け取りが後日になります。詳しくは予約時にご確認ください',
    officialUrl: 'https://icci.jp/',
    urlChecked: false,
    compare: { pairTotal: '24,000円〜（1本12,000円〜×2、税込。加工は別）', pairTotalMin: 24000, time: '約1時間', minutes: 60, place: '代官山（最寄り駅は公式で確認）', together: '同席・貸切は公式で確認', outdoor: '公式で確認' },
    siteId: 'icci',
    checkedAt: '2026-09-20',
    checkedBy: 'SEO担当の調査報告（公式ページの記載を転記）',
    confirmation: { confirmed: ['料金（1本 12,000円〜税込）', '所要時間（約1時間）', '当日持ち帰り（通常）'], unconfirmed: ['公式URLの生存', '最寄り駅', '同席・貸切', '受付状況'] },
    published: true,
  },
  {
    id: 'artbar-tokyo',
    name: 'Artbar Tokyo（絵を描く体験）',
    genre: 'craft',
    area: '東京・代官山／原宿／銀座 など（セッションごとに会場が異なる）',
    what: '講師の進行で、二人がそれぞれキャンバスに絵を描く。画材・ドリンクなどが料金に含まれる。',
    forTwo: '友人同士の参加が可能と案内。二人で同じ会場・同じセッションを予約する',
    price: '1人 4,620円〜（画材・ドリンク等込み）。二人で 9,240円〜。セッションごとに料金が異なるので予約ページでご確認ください',
    time: '約2時間',
    status: '常設（会場・日時はセッションごと）。空き状況は公式予約ページで確認',
    fit: '完成した絵をその場で見比べたい、飲み物を片手に過ごしたい二人',
    notes: '年齢条件、二人で同じ席になれるか、作品の持ち帰りは公式ページでご確認ください',
    officialUrl: 'https://artbar.co.jp/',
    urlChecked: false,
    compare: { pairTotal: '9,240円〜（1人4,620円〜×2。セッションで異なる）', pairTotalMin: 9240, time: '約2時間', minutes: 120, place: '代官山／原宿／銀座 など（セッションごと）', together: '二人で同じセッションを予約（貸切かは公式で確認）', outdoor: '公式で確認' },
    siteId: 'artbar',
    checkedAt: '2026-09-20',
    checkedBy: 'SEO担当の調査報告（公式ページの記載を転記）',
    confirmation: { confirmed: ['料金（1人 4,620円〜）', '所要時間（約2時間）', '画材・ドリンク込み', '友人同士の参加可'], unconfirmed: ['公式URLの生存', 'セッションごとの料金', '年齢条件', '同席', '持ち帰りの例外', '受付状況'] },
    published: true,
  },
  {
    id: 'zettai-kukan-ikebukuro',
    name: '絶対空間 池袋店（リアル脱出ゲーム）',
    genre: 'puzzle',
    area: '東京・池袋（最寄り駅は公式で確認）',
    what: '二人だけのチームで部屋に入り、制限時間内に謎を解いて脱出を目指す。',
    forTwo: '2名から申し込める。各部屋は1組ごとの貸切で、他のチームと一緒にならない',
    price: '1人 平日昼 2,000円／夜・土日祝 2,500円。二人で 4,000円／5,000円（税込かどうかは公式ページでご確認ください）',
    time: '本編40分、説明込みで約1時間。部屋によって異なる場合があります',
    status: '常設。空き状況は公式予約ページで確認',
    fit: '二人だけで相談しながら、初対面の人と組まずに解きたい場合',
    notes: '部屋（作品）ごとの難易度と時間は各ページでご確認ください',
    officialUrl: 'https://zettaikukan.com/',
    urlChecked: false,
    compare: { pairTotal: '4,000円／5,000円（1人2,000円／2,500円×2）', pairTotalMin: 4000, time: '約1時間（本編40分＋説明）', minutes: 60, place: '池袋（最寄り駅は公式で確認）', together: '二人だけで貸切（各部屋1組）', privateForTwo: true, outdoor: '公式で確認' },
    siteId: 'zettai-kukan',
    checkedAt: '2026-09-20',
    checkedBy: 'SEO担当の調査報告（公式ページの記載を転記）',
    confirmation: { confirmed: ['2名から', '各部屋貸切', '料金表（平日昼 2,000円／夜・土日祝 2,500円）', '本編40分・説明込み約1時間'], unconfirmed: ['公式URLの生存', '税込表示', '最寄り駅', '各部屋の時間表記', '受付状況'] },
    published: true,
  },
];

/** 公開済みの他社項目 */
export const publishedItems = experienceItems.filter((i) => i.published);
/** 記事を公開扱いにする条件：自社以外のジャンルで公式確認済みの項目が2ジャンル以上ある（自社公演だけの一覧にしない） */
export const EXPERIENCE_DATE_PUBLISHED = new Set(publishedItems.map((i) => i.genre)).size >= 2;
