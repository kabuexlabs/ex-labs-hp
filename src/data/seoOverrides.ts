// seo-improve（2026-10-18）のページ設定。解説記事は front matter を持たないため、
// 「パス → 設定」のマップでページ単位の指定を持つ。描画は components/guide/GuideCallout.astro・GuideMeta.astro、
// AuthorBox.astro、ServicePage.astro（関連ガイドの逆引き）。
//
// callout: リード文直後に出す囲み（C-1）。配列なら順に出す
// toc: 目次を出す（ページが toc の項目を GuideMeta に渡す）
// author: 'iida-yuki' なら記事末尾を「監修・執筆: 飯田雄貴」にする
// updated: 「最終更新」として H1 直下に表示する日付（YYYY-MM-DD）

export interface CalloutDef {
  title: string;
  text: string;
  links: { href: string; label: string }[];
}

// 文言は各リンク先ページの記載と矛盾しないものだけ（shisetsu-event はレベニューシェアの実際の条件に合わせた）
export const CALLOUTS: Record<string, CalloutDef> = {
  'immersive-tokyo': {
    title: '東京で今すぐ体験できる公演を探す',
    text: '開催中のイマーシブ公演を開催日・料金・人数で比較できます。',
    links: [{ href: '/guide/immersive-tokyo/', label: '東京のイマーシブ公演一覧を見る' }],
  },
  madamis: {
    title: 'マダミスが初めての方へ',
    text: 'ルール・所要時間・費用の基本をまとめています。',
    links: [
      { href: '/guide/madamis/', label: 'マダミスとは？遊び方・費用の基本を見る' },
      { href: '/guide/madamis-tokyo/', label: '東京の公演を探す' },
    ],
  },
  'nazotoki-kenshu': {
    title: '謎解き研修・チームビルディングのご相談',
    text: '既存プログラムの実施からオリジナル制作まで対応します。',
    links: [
      { href: '/services/nazotoki-kenshu/', label: '相談する（無料）' },
      { href: '/works/', label: '事例を見る' },
    ],
  },
  'event-seisaku': {
    title: '体験型イベントの企画・制作のご相談',
    text: '企画から集客・当日運営まで一貫して対応します。',
    links: [
      { href: '/services/', label: '相談する（無料）' },
      { href: '/works/', label: '事例を見る' },
    ],
  },
  'shisetsu-event': {
    title: '商業施設・文化施設の集客イベントのご相談',
    text: '有料チケット型なら、レベニューシェア（施設側の初期費用0円）でも実施できます。',
    links: [
      { href: '/services/shisetsu-event/', label: '相談する（無料）' },
      { href: '/works/', label: '事例を見る' },
    ],
  },
  'murder-mystery': {
    title: 'マダミス制作・導入のご相談',
    text: '店舗集客・動画企画・社内イベント向けに制作します。',
    links: [
      { href: '/services/murder-mystery/', label: '相談する（無料）' },
      { href: '/works/', label: '事例を見る' },
    ],
  },
  immersive: {
    title: 'イマーシブ体験の制作のご相談',
    text: '実在の街・空間・ブランドを舞台にした没入型体験を制作します。',
    links: [
      { href: '/services/immersive/', label: '相談する（無料）' },
      { href: '/works/', label: '事例を見る' },
    ],
  },
  hacktale: {
    title: '頭脳戦・心理戦を体験できる作品',
    text: '自社レーベル HACKTALE の作品・イベントを紹介しています。',
    links: [{ href: '/hacktale/', label: 'HACKTALE の作品を見る' }],
  },
  // P2-1: /guide/madamis/ から制作の節を移した位置に残す案内
  'madamis-b2b': {
    title: '企業・施設でマダミスを作りたい方へ',
    text: '依頼の流れ・費用の目安・制作事例と、ご依頼いただける内容をまとめています。',
    links: [
      { href: '/guide/madamis-seisaku/', label: 'マダミス制作とは？依頼の流れ・費用・事例' },
      { href: '/services/murder-mystery/', label: 'マダミス制作サービス（相談無料）' },
    ],
  },
};

export interface GuideSeo {
  callout?: string | string[];
  toc?: boolean;
  author?: 'iida-yuki';
  updated?: string;
}

const many = (keys: string[], v: GuideSeo): Record<string, GuideSeo> => Object.fromEntries(keys.map((k) => [`/guide/${k}/`, v]));

export const GUIDE_SEO: Record<string, GuideSeo> = {
  // P1-1 / P1-3 / P2-1
  '/guide/immersive-tokyo/': { toc: true, updated: '2026-10-18' },
  '/guide/madamis-tokyo/': { toc: true, updated: '2026-10-18', callout: 'madamis' },
  '/guide/madamis/': { toc: true, author: 'iida-yuki', updated: '2026-10-18' },
  // P1-2: 「とは」ページから一覧へ
  ...many(['immersive', 'immersive-theater', 'immersive-taiken', 'immersive-event', 'botsunyukan', 'immersive-vr'], { callout: 'immersive-tokyo' }),
  // P2-2: マダミス系（madamis 自身を除く）からピラーへ。B2B 向けの5本は P3-2 の murder-mystery も出す
  ...many(['madamis-asobikata', 'madamis-shoshinsha', 'madamis-nazotoki-chigai', 'madamis-rekishi', 'madamis-tenpo', 'madamis-haishin'], { callout: 'madamis' }),
  ...many(['madamis-seisaku', 'madamis-company', 'madamis-business', 'madamis-making', 'madamis-cost'], { callout: ['murder-mystery', 'madamis'] }),
  '/guide/madamis-kenshu/': { callout: ['nazotoki-kenshu', 'madamis'] },
  // P3-2: B2B ガイドからサービスへ
  ...many(['nazotoki-kenshu', 'shanai-event', 'shanai-quiz', 'bonenkai-nazotoki'], { callout: 'nazotoki-kenshu' }),
  ...many(['nazotoki-idea', 'nazotoki-company', 'nazotoki-event', 'event-hiyou', 'event-kikakusho', 'event-kpi', 'taikengata-idea', 'taikengata-company', 'taikengata-event', 'sankagata-event', 'taiken-marketing', 'event-original-or-existing'], { callout: 'event-seisaku' }),
  ...many(['shisetsu-katsuyo', 'shogyoshisetsu-event', 'shotengai-event', 'hotel-event', 'museum-event', 'yukyu-kukaku', 'eigyo-jikangai', 'saiji', 'saiji-kikaku', 'shuyu-event', 'shuyu-event-seisaku', 'shuyu-event-uketsuke', 'popup-event', 'event-revenue-share', 'shopping-mall-couple-event', 'ip-event', 'ip-multi-site'], { callout: 'shisetsu-event' }),
  ...many(['immersive-seisaku', 'immersive-making', 'immersive-company', 'immersive-cost'], { callout: 'immersive' }),
  ...many(['shinrisen', 'zunousen', 'shinrisen-game', 'zunousen-game', 'zunousen-sakuhin', 'zunousen-tournament', 'zunousen-douga'], { callout: 'hacktale' }),
};

/** サービスページ → 関連ガイドの逆引きに使う callout キー（P3-3） */
export const SERVICE_CALLOUT: Record<string, string> = {
  nazotoki: 'nazotoki-kenshu',
  murder: 'murder-mystery',
  shisetsu: 'shisetsu-event',
  immersive: 'immersive',
  zunousen: 'hacktale',
  index: 'event-seisaku',
};

/** callout キーを持つガイドのパス一覧（P3-3 の逆引き） */
export const guidesWithCallout = (key: string): string[] =>
  Object.entries(GUIDE_SEO)
    .filter(([, v]) => ([] as string[]).concat(v.callout ?? []).includes(key))
    .map(([path]) => path);

export const normalizePath = (p: string): string => p.replace(/([^/])$/, '$1/');
