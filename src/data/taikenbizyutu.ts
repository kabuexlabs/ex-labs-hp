// 体験する美術館 (/taikenbizyutu/) の共有データ。
// トップページ・『ロスト・フレーム』LP・本体サイトのイベントカードが
// 同じ値を参照するようにし、公演情報の更新漏れ（旧 Studio サイトへの
// リンクが残る等）を防ぐ。公演情報を更新するときはここだけ直せばよい。

export const TB_BASE = '/taikenbizyutu';
export const TB_X_URL = 'https://x.com/taikenbizyutu';

/** 『ロスト・フレーム』の参加申し込みページ (escape.id) */
export const TICKET_URL = 'https://escape.id/kyoukaiart-org/e-lost/';

/** 『ロスト・フレーム』の公演情報。LP 画像 (lp-3) に焼き込まれた内容と揃える。 */
export const LOST_FRAME = {
  name: 'ロスト・フレーム',
  /** 販売状況。'soldout' にすると各ページの申込導線が「完売」表示に切り替わる */
  status: 'soldout' as 'onsale' | 'soldout',
  /** 完売のお知らせ記事 */
  soldoutNewsPath: `${TB_BASE}/news/lostframe-soldout/`,
  nameEn: 'Lost Frame',
  path: `${TB_BASE}/lostframe/`,
  ticketUrl: TICKET_URL,
  /** ネタバレを含む公演記録 (note)。本サイト内の記録ページ (/game/lost-frame/) からも案内する */
  noteUrl: 'https://note.com/kabuexlabs/n/ndab98d511651',
  /** 本サイト内のネタバレ記録ページ */
  spoilerPath: '/game/lost-frame/',
  /** PR TIMES のリリース記事 (2026-07-07 公開) */
  pressUrl: 'https://prtimes.jp/main/html/rd/p/000000001.000185770.html',
  /** 公開日。PR TIMES のリリース日 (リリース＝公演開始) を採用している */
  startDate: '2026-07-07',
  area: '東京・下北沢エリア各所（小田急線／京王井の頭線「下北沢駅」周辺）',
  format: '街を巡る参加型の絵画鑑賞（絵画 × 物語 × 図像の読解）',
  duration: '75分',
  /** ISO 8601 duration (構造化データ用) */
  durationIso: 'PT75M',
  capacity: '1〜4名',
  /** 1人あたりの参加費 (円)。参加人数が少ないほど高くなる */
  prices: [
    { people: 4, price: 4000 },
    { people: 3, price: 4500 },
    { people: 2, price: 5000 },
    { people: 1, price: 8000 },
  ],
  image: '/assets/taikenbizyutu/lost-frame.webp',
  description:
    '下北沢の街に散らばった絵画を探し、隠された物語を辿る——絵画と街が交差する、街を巡る参加型の絵画鑑賞。観客の選択によって物語は異なる結末へと分岐する。',
} as const;

/** ART セクション・ネタバレ記録ページに載せる絵画 */
export interface TbArt {
  src: string;
  /** 画像の説明 (alt)。作品名が判明したら caption を作品名に置き換える */
  alt: string;
  /** 表示キャプション。例: '《星の作者》 ─ ヌル・アーデン' */
  caption: string;
  /** 画像の実寸 (レイアウトシフト防止用) */
  width: number;
  height: number;
}

// 『ロスト・フレーム』で用いられた絵画。配列順 = 表示順（先頭が ART 列・記録ページの最初）。
// TODO: 作品名・作者名が確定したら caption を「《作品名》 ─ ロスト・フレーム」に更新する。
export const LOST_FRAME_ARTS: TbArt[] = [
  { src: '/assets/taikenbizyutu/lf-art-3.webp', alt: '金箔の背景に線描の風景が浮かぶ、深紅の服を着た短髪の人物の肖像', caption: 'ロスト・フレーム', width: 1089, height: 1400 },
  { src: '/assets/taikenbizyutu/lf-art-1.webp', alt: 'ランタンが灯る青い石畳の回廊に立つ、帽子をかぶった人物の白いシルエット', caption: 'ロスト・フレーム', width: 949, height: 1140 },
  { src: '/assets/taikenbizyutu/lf-art-2.webp', alt: '白いヴェールをまとい、蝶に囲まれて祈るように手を組む少女。頭上には光を放つ小さな人影', caption: 'ロスト・フレーム', width: 1074, height: 1332 },
  { src: '/assets/taikenbizyutu/lf-art-4.webp', alt: '青い背景に置かれた白い花瓶、赤いりんご、ぶどう、白い円盤の静物画', caption: 'ロスト・フレーム', width: 1400, height: 969 },
  { src: '/assets/taikenbizyutu/lf-art-5.webp', alt: '青と金の風船が並ぶ縁日の屋台に、白いシルエットの人物が駆け込むペン画', caption: 'ロスト・フレーム', width: 1400, height: 1091 },
];

/** 『ヌル・アーデン展』で用いられた絵画 */
export const NULL_ARDEN_ARTS: TbArt[] = [
  { src: '/assets/taikenbizyutu/art-hoshi-no-sakusha.webp', alt: '星の作者', caption: '《星の作者》 ─ ヌル・アーデン', width: 0, height: 0 },
  { src: '/assets/taikenbizyutu/art-ao-no-uragawa.webp', alt: '青の裏側', caption: '《青の裏側》 ─ ヌル・アーデン', width: 0, height: 0 },
  { src: '/assets/taikenbizyutu/art-shita-kara-ai.webp', alt: '下から藍', caption: '《下から藍》 ─ ヌル・アーデン', width: 0, height: 0 },
  { src: '/assets/taikenbizyutu/art-sayuu.webp', alt: '左右', caption: '《左右》 ─ ヌル・アーデン', width: 0, height: 0 },
];

/** 絵画クリエイター (敬称略・順不同) */
export const CREATORS = [
  { name: '荒巻まりの', role: '絵画' },
  { name: '小島有貴', role: '絵画' },
  { name: '中堀慎治', role: '絵画' },
  { name: '山科ティナ', role: '絵画' },
] as const;

export interface TbNews {
  /** 表示用日付 (例: '2026.07.07') */
  date: string;
  /** ISO 日付 (構造化データ・sitemap 用)。例: '2026-07-07' */
  iso: string;
  /** 本文 (テキスト)。リンクは `link` で別途指定する */
  text: string;
  link?: { href: string; label: string; external?: boolean };
}

/** トップページ NEWS 欄。新しいものを上に追加する。 */
export const TB_NEWS: TbNews[] = [
  {
    date: '2026.09.03',
    iso: '2026-09-03',
    text: '『ロスト・フレーム』全公演が完売しました',
    link: { href: `${TB_BASE}/news/lostframe-soldout/`, label: 'お知らせを読む' },
  },
  {
    // 日付は本サイトに導線を載せた日 (note 記事の公開日ではない)
    date: '2026.09.03',
    iso: '2026-09-03',
    text: '『ロスト・フレーム』の公演記録（ネタバレを含みます）を note で公開しています',
    link: { href: LOST_FRAME.noteUrl, label: 'note の記事を読む', external: true },
  },
  {
    date: '2026.07.07',
    iso: '2026-07-07',
    text: '『ロスト・フレーム』のプレスリリースを PR TIMES で配信しました',
    link: { href: LOST_FRAME.pressUrl, label: 'リリースを読む', external: true },
  },
  {
    date: '2026.07',
    iso: '2026-07-01',
    text: '『ロスト・フレーム』の参加受付を開始しました',
  },
  {
    date: '2026.07',
    iso: '2026-07-01',
    text: '体験する美術館 第二弾『ロスト・フレーム』の開催が決定しました（東京・下北沢エリア）',
  },
  {
    date: '2026.07',
    iso: '2026-07-01',
    text: '『ロスト・フレーム』ティザービジュアルを公開しました',
  },
];

export interface TbFaq {
  q: string;
  a: string;
  /** 回答の末尾に添えるリンク (任意) */
  link?: { href: string; label: string; external?: boolean };
}

/** トップページ FAQ。FAQPage 構造化データもここから生成する。 */
export const TB_FAQS: TbFaq[] = [
  {
    q: '参加型の公演は初めてですが、楽しめますか？',
    a: 'はい。特別な知識や準備は必要ありません。会場や街を巡りながら、絵画と物語、そして絵画に埋め込まれた図像や作中言語の読解を、ご自身のペースでお楽しみいただけます。',
  },
  {
    q: 'どのような公演ですか？',
    a: '公演ごとに会場は変わります。閉館後の美術館、使用されていない展示会場、そして街そのもの——。手描きの絵画と物語を軸に、観客が絵画の図像を読み解き、登場人物と実際に言葉を交わしながら、絵画の側から立ち上がる時間に立ち会っていただく参加型の公演です。',
  },
  {
    q: '物語の結末は変わりますか？',
    a: 'はい。観客の選択によって、物語は異なる結末へと分岐します。同じ絵画群が、観客の関わり方によって異なる意味を帯びていきます。',
  },
  {
    q: '所要時間と参加人数を教えてください。',
    a: `『ロスト・フレーム』の所要時間は${LOST_FRAME.duration}、1組${LOST_FRAME.capacity}でご参加いただけます。参加費は1人あたり${LOST_FRAME.prices[0].price.toLocaleString('ja-JP')}円（4名参加）〜${LOST_FRAME.prices[3].price.toLocaleString('ja-JP')}円（1名参加）です。`,
    link: { href: LOST_FRAME.path, label: '公演詳細を見る' },
  },
  {
    q: '作品の売却の機会はありますか？',
    a: '過去公演では、公演内で用いられた作品のオークションを終了後に開催しています。『ロスト・フレーム』における実施は未定です。',
  },
  {
    q: 'いつから参加できますか？',
    a: '『ロスト・フレーム』は全公演が完売しました。次回公演の情報は、本サイトのNEWSおよび公式X（@taikenbizyutu）でお知らせします。',
    link: { href: `${TB_BASE}/news/lostframe-soldout/`, label: '完売のお知らせを読む' },
  },
];
