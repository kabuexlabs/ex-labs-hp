// 公演検索サービス（/events/）のデータ型。
// 「主催者」「作品」「会場」「公演回」「公式販売先」「情報源」「素材の利用条件」「確認日時・担当」「公開状態」を
// 別々に持つ。推測で埋めず、不明は undefined／'unknown' のまま入れる（表示側が「未確認」と出す）。
// 判定ロジックは src/lib/events.ts、登録時の検証は scripts/events-validate.mjs。

/** 対象ジャンル（初期4種。追加は src/data/events/areas.ts の GENRES にラベルを足す） */
export type Genre = 'immersive-theater' | 'story-experience' | 'walk-story' | 'murder-mystery';

/** 開催状態（開催そのものの確認） */
export type EventStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'ended' | 'unknown';
/** 販売状態（申込受付の確認） */
export type SalesStatus = 'not-yet' | 'open' | 'closed' | 'unknown';
/** 空席状態（確認時点の空席） */
export type SeatStatus = 'available' | 'soldout' | 'unknown';

/** 情報源。取得日時と利用条件を必ず残す */
export interface Source {
  /** 例: 'kaitou-official' */
  id: string;
  label: string;
  url?: string;
  kind: 'own-official' | 'organizer-official' | 'ticket-site' | 'press' | 'direct-contact';
  /** 確認日時（ISO 8601、+09:00） */
  checkedAt: string;
  /** 確認担当 */
  checkedBy: string;
  /** 取得・利用条件（何を、どの条件で掲載してよいか） */
  terms: string;
}

export interface Organizer {
  id: string;
  name: string;
  url?: string;
  /** ex-labs＝株式会社ex Labs が企画・制作・主催に関与、third-party＝他社 */
  relation: 'ex-labs' | 'third-party';
  /** 一覧・詳細に表示する関係性の文言（例: 'ex Labs 企画・制作'）。他社は主催者名を出す */
  relationLabel: string;
  sourceIds: string[];
}

export interface Venue {
  id: string;
  name: string;
  /** 一覧・要約向けの短い呼び名（例: '会員制バー'）。省略時は name */
  listName?: string;
  /** 地域 ID（areas.ts の REGIONS） */
  regionId: string;
  /** エリア ID（areas.ts の AREAS） */
  areaId: string;
  /** 住所（公開してよいと確認できたものだけ。集合場所非公開の公演は書かない） */
  address?: string;
  access?: string;
  /** 屋内・屋外（未確認なら省略） */
  setting?: 'indoor' | 'outdoor' | 'mixed';
  sourceIds: string[];
}

/** 公式販売先（チケットサイト等） */
export interface SalesChannel {
  id: string;
  name: string;
  /** 手数料の扱い（不明なら「購入画面で確認」と書く） */
  feeNote: string;
}

/** 素材（画像・紹介文）の利用条件。確認できたものだけ入れる。無ければ文字中心で掲載する */
export interface AssetLicense {
  /** public/ 配下のパス */
  path: string;
  holder: string;
  terms: string;
  confirmedAt: string;
  confirmedBy: string;
}

/** 料金。1人分・1組分・貸切総額を混同しない */
export interface Price {
  unit: 'per-person' | 'per-group' | 'charter';
  /** 1人あたり（per-person）または貸切総額（charter）の金額（円、税込） */
  amount?: number;
  /** 1組あたりの人数別料金（per-group）。人数に応じて1人あたりを算出する */
  tiers?: { party: number; amount: number }[];
  /** 表示用の原文（例: '2人 ¥13,000／3人 ¥16,500／4人 ¥19,600'） */
  text: string;
  taxIncluded: boolean;
  /** 手数料の扱い。不明なら「別途手数料がかかる場合があります」等。総額が確定して見える文言にしない */
  feeNote: string;
}

/** 申込人数の条件。「作品の定員」と「申込できる人数」は別 */
export interface PartyRule {
  /** 1申込あたりの最小人数 */
  min: number;
  /** 1申込あたりの最大人数。未確認なら省略（表示は「上限は公式で確認」、人数条件の判定は「要確認」扱い） */
  max?: number;
  /** 1人で申し込めるか */
  soloAllowed: boolean;
  /** 1人だけでも回が成立するか（相席不要）。未確認なら省略 */
  soloRuns?: boolean;
  /** 参加形式：shared＝他の参加者と相席、private＝申込単位で貸切、either＝両方、unknown */
  format: 'shared' | 'private' | 'either' | 'unknown';
  /** 表示用の原文（例: '各回2〜4名（1名での申込不可）'） */
  text: string;
}

export interface Work {
  id: string;
  /** URL スラッグ（/events/<slug>/） */
  slug: string;
  title: string;
  organizerId: string;
  genres: Genre[];
  /** 1〜2文の紹介（自社作成の文章、または利用条件を確認した文章） */
  summary: string;
  /** 詳細ページの本文（段落の配列） */
  description: string[];
  /** 作品の公式ページ（自社サイト内なら相対パス） */
  officialUrl: string;
  duration: { minutes?: number; text: string };
  price: Price;
  party: PartyRule;
  /** 追加情報（確認できたものだけ。未確認は省略） */
  info: {
    beginner?: string;
    participation?: string;
    actorInteraction?: boolean;
    scary?: string;
    ageRule?: string;
    language?: string;
    walking?: string;
    requirements?: string[];
  };
  /** 許諾済みの画像。無ければ文字中心で表示 */
  image?: AssetLicense;
  sourceIds: string[];
  /** 開催情報（日程・料金・条件）の最終確認 */
  verified: { at: string; by: string };
  /** 確認の有効期間（日）。超えたら「確認から時間が経過」と表示し、今週の開催を断定しない */
  verifyTtlDays: number;
  published: boolean;
  /** dateModified / sitemap lastmod 用 */
  updatedAt: string;
}

export interface Occurrence {
  id: string;
  workId: string;
  venueId: string;
  /** 開催日（YYYY-MM-DD、日本時間） */
  date: string;
  /** 開演時刻（HH:MM）。未確認なら省略 */
  startTime?: string;
  /** 終了予定時刻（HH:MM）。未確認なら省略（所要時間があれば算出する） */
  endTime?: string;
  eventStatus: EventStatus;
  /** 開催情報の確認日時・担当（空席の確認とは別に持つ） */
  eventCheckedAt: string;
  eventCheckedBy: string;
  sales: {
    status: SalesStatus;
    /** 販売締切（ISO 8601、+09:00）。過ぎたら受付中と表示しない */
    closesAt?: string;
    channels: { channelId: string; url: string }[];
    checkedAt?: string;
  };
  seats: {
    status: SeatStatus;
    /** 空席情報の確認日時（開催情報とは別） */
    checkedAt?: string;
    /** 空席情報の有効期限。過ぎたら 'unknown' に戻す */
    expiresAt?: string;
    /** 残席数。取得・再掲載の条件を確認できた場合だけ入れる */
    remaining?: number;
    remainingTerms?: string;
  };
  sourceIds: string[];
  published: boolean;
  /** 動作確認用データの印。true のものは公開ページ・サイトマップに出さない */
  test?: boolean;
}

/** 外部サイトに掲載中の公演回（他社公演を最小限の項目で載せる簡易掲載）。
 *  各サイトを見て確認した事実だけを入れ、遷移先 url は掲載元の該当ページにする。自動取得はしない。 */
export interface Listing {
  id: string;
  /** 作品名（掲載元の表記） */
  title: string;
  /** 掲載元サイト（sourceSites.ts の id） */
  siteId: string;
  /** 主催者・店舗名 */
  organizerName: string;
  /** 遷移先（掲載元の該当ページ。https） */
  url: string;
  genres: Genre[];
  regionId: string;
  areaId: string;
  venueName?: string;
  /** 開催日（YYYY-MM-DD、日本時間） */
  date: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  /** 料金の表示文（例: '¥4,500（1人）'）と単位。1人あたりの金額が確定なら amount（予算絞り込みに使う） */
  priceText?: string;
  priceUnit?: 'per-person' | 'per-group' | 'charter';
  amount?: number;
  /** 申込人数の条件。未確認なら省略（人数条件では「判定できない」扱い） */
  party?: { min: number; max?: number; text?: string };
  /** 募集状態（掲載元の表示を確認した時点）。unknown＝掲載元で確認 */
  status: 'open' | 'soldout' | 'cancelled' | 'unknown';
  /** 残席など掲載元の表示文（例: '残り2席'）。確認時点の値として checkedAt と一緒に出す */
  remainingText?: string;
  checkedAt: string;
  checkedBy: string;
  published: boolean;
  test?: boolean;
}

export interface EventsDataset {
  listings: Listing[];
  /** 掲載元サイトの登録簿（sourceSites.ts）。listings.siteId の参照先 */
  sites: { id: string; name: string; url: string }[];
  sources: Source[];
  organizers: Organizer[];
  venues: Venue[];
  channels: SalesChannel[];
  works: Work[];
  occurrences: Occurrence[];
}
