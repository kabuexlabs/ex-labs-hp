// HACKTALE（ハックテイル）ブランドサイト (/hacktale/) の共通データ。
// デザイン基準は design_handoff_hacktale_site（ノワール調×アシッドイエロー）。

export const HT_CONTACT_EMAIL = 'info@kabuexlabs.com';

export const HT_LINE_URL = 'https://lin.ee/xGsmpKA';
export const HT_X_URL = 'https://x.com/hacktalegame';
export const HT_X_HANDLE = '@hacktalegame';
export const HT_COMPANY_URL = 'https://kabuexlabs.com/';
export const HT_ZUNOUSEN_URL = 'https://zunousen.tokyo/';

export const htBase = '/hacktale';

/** WORKS 作品データ（トップのカードと /hacktale/works/ 一覧で共用） */
export interface HtWork {
  slug: string;
  /** badge 番号（欠番あり） */
  num: string;
  title: string;
  en: string;
  /** カードのチップ表記 '6人／180分' */
  chip: string;
  /** カードのメタ表記 '店舗公演｜4,500円' */
  meta: string;
  desc: string;
  image: string;
  /** 並び替え用（最小人数） */
  players: number;
  minutes: number;
}

export const htWorks: HtWork[] = [
  {
    slug: 'present-poker',
    num: '01',
    title: 'プレゼント・ポーカー',
    en: 'PRESENT POKER',
    chip: '6人／180分',
    meta: '店舗公演｜4,500円',
    desc: '裏技と交渉を駆使し、勝利を目指せ。公演終了時、明確に1名の勝利者が出る。',
    image: '/assets/hacktale/kv-poker.webp',
    players: 6,
    minutes: 180,
  },
  {
    slug: 'werewolf-theorem',
    num: '02',
    title: '人狼定理',
    en: 'WEREWOLF THEOREM',
    chip: '8人／240分',
    meta: '店舗公演・オンライン｜4,500円（オンライン3,500円）',
    desc: '論理と交渉の頭脳戦。勝利者は2名、途中脱落なし。人狼のルールを知らなくても遊べる。',
    image: '/assets/hacktale/kv-werewolf.webp',
    players: 8,
    minutes: 240,
  },
  {
    slug: 'dice-box',
    num: '04',
    title: 'ダイスボックス',
    en: 'THE DICE BOX',
    chip: '9 or 12人／240分',
    meta: '詳細は近日公開',
    desc: '閃きが試される、ダイスの箱。続報はNEWS・Xにて。',
    image: '/assets/hacktale/kv-dicebox.webp',
    players: 9,
    minutes: 240,
  },
];

/** お問い合わせフォームの「ご希望の作品」選択肢 */
export const htFormWorks = [
  ...htWorks.map((w) => w.title),
  '東京都頭脳王決定戦',
  'JANKEN24',
];

/** JSON-LD で publisher / organizer に使う HACKTALE の Organization 参照 */
export function htOrgRef(site: URL) {
  return {
    '@type': 'Organization',
    name: 'HACKTALE（ハックテイル）',
    url: new URL('/hacktale/', site).toString(),
  };
}

/** パンくず JSON-LD。url 省略時は現在ページ（末尾要素）扱い */
export function htBreadcrumbLd(items: { name: string; url?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: it.url } : {}),
    })),
  };
}

/** sitemap.xml に載せる公開ページのパス */
export const htPaths = [
  '/hacktale/',
  '/hacktale/works/',
  '/hacktale/works/present-poker/',
  '/hacktale/works/werewolf-theorem/',
  '/hacktale/works/dice-box/',
  '/hacktale/event/zunouou/',
  '/hacktale/event/janken24/',
];
