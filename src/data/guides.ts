// サイト内の解説記事（/guide/ 配下の静的記事）の一覧。
// ブログ一覧ページと「関連記事」枠（LatestPosts）がこの配列を参照する。
// 新しい記事を追加したら、ここに1件追加するだけで各一覧に反映される。
// thumb は scripts で自動生成したサムネイル（public/assets/guide/）。
import type { PostCategory } from '../lib/microcms';

export interface GuideArticle {
  /** URLパス（末尾スラッシュあり） */
  href: string;
  /** 一覧カードに表示する短いタイトル */
  title: string;
  /** 一覧カードに表示する説明 */
  desc: string;
  /** 公開日（YYYY-MM-DD）。一覧の並び順に使う */
  date: string;
  /** 関連記事枠の出し分けに使うカテゴリ */
  category: PostCategory;
  /** サムネイル画像パス */
  thumb: string;
}

export const guideArticles: GuideArticle[] = [
  {
    href: '/guide/madamis/',
    title: 'マダミスとは？意味・遊び方・種類・費用まで完全ガイド',
    desc: 'マダミス＝マーダーミステリーの略称。定義・遊び方・種類・謎解きとの違い・費用までを網羅した完全ガイド。',
    date: '2026-08-05',
    category: 'murder',
    thumb: '/assets/guide/madamis.webp',
  },
  {
    href: '/guide/madamis-cost/',
    title: 'マダミス制作の費用相場は？料金の内訳・安く抑える方法',
    desc: 'シナリオのみ数十万円台〜、フルパッケージ100万円前後〜。料金が決まる要素と費用を抑える方法を解説。',
    date: '2026-07-30',
    category: 'murder',
    thumb: '/assets/guide/madamis-cost.webp',
  },
  {
    href: '/guide/madamis-making/',
    title: 'マダミスの作り方｜シナリオ制作の手順7ステップとコツ',
    desc: '真相から逆算する7ステップ、全員に秘密を配るコツ、テストプレイの重要性。自作とプロ依頼の分かれ目も。',
    date: '2026-08-07',
    category: 'murder',
    thumb: '/assets/guide/madamis-making.webp',
  },
  {
    href: '/guide/madamis-company/',
    title: 'マダミス制作依頼はどこにする？制作会社の選び方5つの基準',
    desc: '実績・テストプレイ体制・運営経験・権利・目的設計。依頼先タイプ別の特徴と選び方を解説。',
    date: '2026-08-07',
    category: 'murder',
    thumb: '/assets/guide/madamis-company.webp',
  },
  {
    href: '/guide/madamis-business/',
    title: '企業・店舗のマダミス活用ガイド｜集客・研修・プロモーション',
    desc: '店舗集客・宿泊プラン・動画企画・研修など活用シーン6選。新規宿泊予約20件以上を獲得した事例も紹介。',
    date: '2026-08-07',
    category: 'murder',
    thumb: '/assets/guide/madamis-business.webp',
  },
  {
    href: '/guide/immersive/',
    title: 'イマーシブ（immersive）とは？意味・読み方・使い方を解説',
    desc: 'イマーシブ＝「没入型の」を意味する英語。読み方・語源・例文・種類・体験例・企業活用までの完全ガイド。',
    date: '2026-07-28',
    category: 'immersive',
    thumb: '/assets/guide/immersive.webp',
  },
  {
    href: '/guide/immersive-cost/',
    title: 'イマーシブ制作の費用相場は？料金の内訳・依頼の流れ',
    desc: '1空間型は数十万円台〜、施設・街周遊型は数百万円規模も。レベニューシェア型で初期費用を抑える方法も解説。',
    date: '2026-08-07',
    category: 'immersive',
    thumb: '/assets/guide/immersive-cost.webp',
  },
  {
    href: '/guide/immersive-event/',
    title: 'イマーシブイベントとは？企業の活用事例4選と費用・流れ',
    desc: '渋谷サクラステージ・下北沢などでの実例と、メリット・費用・開催までの流れを解説。',
    date: '2026-07-30',
    category: 'immersive',
    thumb: '/assets/guide/immersive-event.webp',
  },
  {
    href: '/guide/immersive-theater/',
    title: 'イマーシブシアターとは？演劇との違い・楽しみ方・東京の公演',
    desc: '没入型演劇の意味・普通の演劇との違い・初めての楽しみ方・東京で体験できる公演を解説。',
    date: '2026-08-01',
    category: 'immersive',
    thumb: '/assets/guide/immersive-theater.webp',
  },
  {
    href: '/guide/immersive-company/',
    title: 'イマーシブ制作依頼はどこにする？制作会社の選び方5つの基準',
    desc: '実空間での開催実績・体験設計力・運営力・集客力・施設調整。依頼で失敗しないための基準を解説。',
    date: '2026-08-07',
    category: 'immersive',
    thumb: '/assets/guide/immersive-company.webp',
  },
  {
    href: '/guide/immersive-tokyo/',
    title: '東京で体験できるイマーシブイベント｜種類・選び方・注目公演',
    desc: '渋谷・六本木・下北沢・神田の注目公演と、初めてのイマーシブ体験の選び方を紹介。',
    date: '2026-08-07',
    category: 'immersive',
    thumb: '/assets/guide/immersive-tokyo.webp',
  },
  {
    href: '/guide/shisetsu-katsuyo/',
    title: '施設活用イベントとは？商業施設の集客事例・効果・費用',
    desc: '空間・未活用時間を体験型イベントの舞台に変えて集客につなげる仕組み。渋谷サクラステージの事例（日経掲載）も。',
    date: '2026-08-07',
    category: 'shisetsu',
    thumb: '/assets/guide/shisetsu-katsuyo.webp',
  },
  {
    href: '/guide/shogyoshisetsu-event/',
    title: '商業施設の集客イベントアイデア｜体験型で回遊・滞在を伸ばす',
    desc: '体験型イベントが新規来館・館内回遊・滞在時間に効く理由とアイデア10選。渋谷サクラステージの事例つき。',
    date: '2026-08-07',
    category: 'shisetsu',
    thumb: '/assets/guide/shogyoshisetsu-event.webp',
  },
  {
    href: '/guide/yukyu-kukaku/',
    title: '遊休区画・空きスペースの活用アイデア｜体験型イベントで目的地に',
    desc: '空きテナント区画・未活用スペースの活用方法を比較。体験型イベントで「目的地」に変える方法を解説。',
    date: '2026-08-07',
    category: 'shisetsu',
    thumb: '/assets/guide/yukyu-kukaku.webp',
  },
  {
    href: '/guide/eigyo-jikangai/',
    title: '営業時間外・閉店後の施設活用｜夜の施設を体験イベント会場に',
    desc: '閉店後の紀伊國屋書店での物語体験などの事例と、未活用時間を収益化する始め方を解説。',
    date: '2026-08-07',
    category: 'shisetsu',
    thumb: '/assets/guide/eigyo-jikangai.webp',
  },
  {
    href: '/guide/museum-event/',
    title: '美術館・博物館・水族館の集客イベント｜展示×体験型',
    desc: '展示空間×謎解き・イマーシブで新規来館層を作る方法。広告費0円でチケット1,500枚のヌル・アーデン展の実績も。',
    date: '2026-08-07',
    category: 'shisetsu',
    thumb: '/assets/guide/museum-event.webp',
  },
  {
    href: '/guide/hotel-event/',
    title: 'ホテル・宿泊施設の集客イベント｜泊まる理由を作る体験型企画',
    desc: '宿泊×マダミス・謎解きで「泊まる理由」を作る方法。新規宿泊予約20件以上を獲得した事例を紹介。',
    date: '2026-08-07',
    category: 'shisetsu',
    thumb: '/assets/guide/hotel-event.webp',
  },
  {
    href: '/guide/taikengata-event/',
    title: '体験型イベントとは？種類・企業の活用事例・費用まで解説',
    desc: '謎解き・マダミス・イマーシブ・頭脳戦の4種類と選び方、集客に効く理由、事例と費用を網羅したハブ記事。',
    date: '2026-08-10',
    category: 'shisetsu',
    thumb: '/assets/guide/taikengata-event.webp',
  },
  {
    href: '/guide/nazotoki-event/',
    title: '謎解きイベントの企画・制作ガイド｜企業・施設の活用事例と費用',
    desc: '商業施設の集客・プロモーション・研修など活用シーン5選と、成功の条件・事例・費用相場を解説。',
    date: '2026-08-10',
    category: 'nazotoki',
    thumb: '/assets/guide/nazotoki-event.webp',
  },
  {
    href: '/guide/shuyu-event/',
    title: '周遊型イベント（回遊型）とは？仕組み・事例・作り方を解説',
    desc: '回遊が生まれる仕組み、形式4タイプ、渋谷サクラステージ・下北沢の事例、作り方のポイントを解説。',
    date: '2026-08-10',
    category: 'shisetsu',
    thumb: '/assets/guide/shuyu-event.webp',
  },
  {
    href: '/guide/madamis-kenshu/',
    title: 'マダミス研修とは？チームビルディング効果・進め方・費用',
    desc: '情報共有・交渉・合意形成が自然に表出する理由と、謎解き研修との使い分け・実施の流れを解説。',
    date: '2026-08-10',
    category: 'murder',
    thumb: '/assets/guide/madamis-kenshu.webp',
  },
];
