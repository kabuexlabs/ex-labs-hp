// 11月公演への期限付き告知（seo-event-boost E3）。
// 夜の夢の島熱帯植物館「午前零時の幻想集」（11/5〜22）と、京都市京セラ美術館「7枚目のコンポジション」（11/21〜23）への導線を、
// トラフィックの多い既存ページのリード文直後に出す。描画は src/components/EventNotice.astro（パスで引く）。
// until（JST, YYYY-MM-DD）を過ぎると出さない。文言はランブックの指定どおりで、日付・会場名は公演ページの記載と同じ。
export interface NoticePart {
  text?: string;
  href?: string;
  label?: string;
  /** 計測用（data-show） */
  show?: string;
}
export interface EventNotice {
  parts: NoticePart[];
  until: string;
}

const GENSOU = '/gensou/';
const SEVENTH = '/taikenbizyutu/7th-composition/';

export const NOTICES = {
  home: {
    until: '2026-11-23',
    parts: [
      { text: '11月開催: 夜の夢の島熱帯植物館を巡る物語体験' },
      { href: GENSOU, label: '「午前零時の幻想集」', show: 'gensou' },
      { text: '（11/5〜22）／京都市京セラ美術館で絵画の物語体験' },
      { href: SEVENTH, label: '「7枚目のコンポジション」', show: '7th-composition' },
      { text: '（11/21〜23）' },
    ],
  },
  'gensou-next': {
    until: '2026-11-22',
    parts: [{ text: '次の公演: 夜の夢の島熱帯植物館' }, { href: GENSOU, label: '「午前零時の幻想集」', show: 'gensou' }, { text: '11/5〜22' }],
  },
  '7th-next': {
    until: '2026-11-23',
    parts: [{ text: '次回公演: 京都市京セラ美術館' }, { href: SEVENTH, label: '「7枚目のコンポジション」', show: '7th-composition' }, { text: '11/21〜23' }],
  },
  'gensou-nov': {
    until: '2026-11-22',
    parts: [{ text: '11月限定: 夜の植物館に入れる物語体験' }, { href: GENSOU, label: '「午前零時の幻想集」', show: 'gensou' }, { text: '（新木場・11/5〜22）' }],
  },
} satisfies Record<string, EventNotice>;

/** 告知を出すページ（パス → 告知キー）。最初の画面に公演へのリンクが既にあるページ（/events/ /works/ /taikenbizyutu/ とデート系7本）は入れない */
export const NOTICE_PAGES: Record<string, keyof typeof NOTICES> = {
  '/': 'home',
  '/events/factroom/': 'gensou-next',
  '/uwasabanashi/': 'gensou-next',
  '/uwasabanashi/kotohogi/': 'gensou-next',
  '/kaitou/': 'gensou-next',
  '/karma/': 'gensou-next',
  '/anator/': 'gensou-next',
  '/taikenbizyutu/lostframe/': '7th-next',
  '/guide/case-lostframe/': '7th-next',
  '/guide/tokyo-nazo-date/': 'gensou-nov',
  '/guide/shibuya-rainy-date/': 'gensou-nov',
  '/guide/kisetsu-event/': 'gensou-nov',
};
