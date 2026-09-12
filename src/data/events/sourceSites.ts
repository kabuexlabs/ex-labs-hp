// 公演情報の「取り込み候補サイト」と、利用者向け「ほかのサイトで探す」外部リンクの登録簿。
// ここに載せる＝リンクして案内するだけ。データの自動取得や転載は、各サイトの利用条件を確認し
// terms を 'confirmed' にしてからでないと実装しない（CLAUDE.md／docs/events-sources.md）。
// URL は Web 検索結果で確認したもの。実装環境から各サイトへ到達できないため、内容・条件は未確認（urlCheck: 'search'）。
export type SiteKind = 'ticket' | 'store' | 'portal' | 'community';
export type SiteGenre = 'murder' | 'immersive' | 'both';

export interface SourceSite {
  id: string;
  name: string;
  url: string;
  kind: SiteKind;
  genre: SiteGenre;
  /** 主な地域（tokyo／osaka／nagoya／kyoto／hiroshima／national／online） */
  regions: string[];
  /** 当日募集・残席・直前の空席案内が出るか（確認できた範囲） */
  sameDay: boolean;
  /** 利用者向けの一言（何が探せるか） */
  what: string;
  /** 運営メモ（取り込み候補としての見立て） */
  note?: string;
  /** 参考リンク（予約ページ・X など） */
  links?: { label: string; url: string }[];
  /** URL の確認方法：search＝検索結果で確認、visited＝実際に開いて確認 */
  urlCheck: 'search' | 'visited';
  /** データ利用条件の確認状況 */
  terms: 'unverified' | 'confirmed' | 'denied';
  checkedAt: string;
}

const T = '2026-09-13T01:58:00+09:00';
const base = { urlCheck: 'search' as const, terms: 'unverified' as const, checkedAt: T };

export const sourceSites: SourceSite[] = [
  // ---------- チケット販売・予約プラットフォーム ----------
  { id: 'escape-id', name: 'ESCAPE.ID', url: 'https://escape.id/', kind: 'ticket', genre: 'both', regions: ['national'], sameDay: false,
    what: '謎解き・脱出ゲーム・イマーシブ公演のポータル兼チケットサイト。ex Labs の公演もここで販売', note: '会員登録制。2026-09 に公式リセール開始。API・データ利用条件は未確認（hub.escape.id も到達不可）', ...base },
  { id: 'mdms-booking', name: 'マダミス.jp 募集中の公演一覧', url: 'https://mdms.jp/bookingSlots', kind: 'ticket', genre: 'murder', regions: ['national', 'online'], sameDay: true,
    what: '店舗の公演募集を横断表示。残席と予約ページへのリンクあり', note: '店舗の多くが予約をここに集約（ANAAKEY・マダミスハウス・Light and Geek 等）。取り込み条件は要確認', ...base },
  { id: 'mmq', name: 'MMQ（クインズワルツ予約サイト）', url: 'https://mmq.game/', kind: 'ticket', genre: 'murder', regions: ['tokyo', 'saitama'], sameDay: true,
    what: 'クインズワルツ各店の公演予約。2026-04 から旧予約サイトより移行', ...base },
  { id: 'passmarket', name: 'PassMarket（Yahoo!）', url: 'https://passmarket.yahoo.co.jp/', kind: 'ticket', genre: 'both', regions: ['national'], sameDay: false,
    what: 'イマーシブ・マダミス公演の主催者が使う電子チケット。主催者ページ単位で予定公演を一覧できる', links: [{ label: 'ロストプロダクトの開催予定', url: 'https://passmarket.yahoo.co.jp/seller/%E3%83%AD%E3%82%B9%E3%83%88%E3%83%97%E3%83%AD%E3%83%80%E3%82%AF%E3%83%88/-gr8NCLgJSCPiFAAXbhFPo5eEijBvtB2_h4lxAVNmVL6etAk00/' }], ...base },
  { id: 'peatix', name: 'Peatix', url: 'https://peatix.com/', kind: 'ticket', genre: 'both', regions: ['national'], sameDay: false, what: 'イベント検索で「マーダーミステリー」「イマーシブ」を探せる', ...base },
  { id: 'teket', name: 'teket', url: 'https://teket.jp/', kind: 'ticket', genre: 'immersive', regions: ['national'], sameDay: false, what: '小劇場・体験型公演の電子チケット', ...base },
  { id: 'zaiko', name: 'ZAIKO', url: 'https://zaiko.io/', kind: 'ticket', genre: 'immersive', regions: ['national'], sameDay: false, what: '公演・イベントの電子チケット', ...base },
  { id: 'confetti', name: 'カンフェティ', url: 'https://www.confetti-web.com/', kind: 'ticket', genre: 'immersive', regions: ['national'], sameDay: false, what: '演劇・体験型公演のチケット', ...base },
  { id: 'eplus', name: 'イープラス', url: 'https://eplus.jp/sf/play/theater/tokyo', kind: 'ticket', genre: 'immersive', regions: ['tokyo'], sameDay: true, what: '東京の演劇・芝居チケット一覧（IMM THEATER など会場別ページあり）', links: [{ label: 'IMM THEATER の公演', url: 'https://eplus.jp/sf/venue/1120400/events' }], ...base },
  { id: 'l-tike', name: 'ローソンチケット', url: 'https://l-tike.com/', kind: 'ticket', genre: 'immersive', regions: ['national'], sameDay: true, what: '舞台・体験型公演のチケット検索', ...base },
  { id: 'pia', name: 'チケットぴあ', url: 'https://t.pia.jp/', kind: 'ticket', genre: 'immersive', regions: ['national'], sameDay: true, what: '舞台・体験型公演のチケット検索', ...base },
  { id: 'asoview', name: 'アソビュー！', url: 'https://www.asoview.com/', kind: 'ticket', genre: 'immersive', regions: ['national'], sameDay: true, what: '体験型施設・イマーシブ展示の当日券・前売券', ...base },
  { id: 'rakuten-ticket', name: '楽天チケット', url: 'https://ticket.rakuten.co.jp/', kind: 'ticket', genre: 'immersive', regions: ['national'], sameDay: false, what: 'イマーシブミュージアム等の日時指定券', ...base },

  // ---------- マダミス専門店・劇場（公演スケジュールと予約） ----------
  { id: 'queens-waltz', name: 'クインズワルツ（Queen\'s Waltz）', url: 'https://queenswaltz.jp/', kind: 'store', genre: 'murder', regions: ['tokyo', 'saitama'], sameDay: true,
    what: '大久保・高田馬場・大塚・大宮。都内最多級のシナリオ数、9:00〜23:00 年中無休', links: [{ label: '予約（MMQ）', url: 'https://mmq.game/' }, { label: '公演カタログ', url: 'https://queenswaltz.jp/catalog' }, { label: 'X（直近公演の空席を投稿）', url: 'https://x.com/queens_waltz' }], ...base },
  { id: 'rabbithole', name: 'Rabbithole（ラビットホール）', url: 'https://rabbithole.jp/', kind: 'store', genre: 'murder', regions: ['tokyo', 'osaka'], sameDay: true,
    what: '新宿・御苑・渋谷・新橋・池袋・水道橋・大阪十三。公式サイトでオンライン予約', links: [{ label: 'オンライン公演予約', url: 'https://rabbithole.jp/online_reservation' }, { label: 'X 渋谷店', url: 'https://x.com/rabbithole_sby' }], ...base },
  { id: 'anaakey', name: 'ANAAKEY（アナアキー）', url: 'https://anaakey.com/', kind: 'store', genre: 'murder', regions: ['tokyo'], sameDay: true,
    what: '水道橋。2025-10 開店。オープン公演の予約はマダミス.jp', links: [{ label: '公演予約（マダミス.jp）', url: 'https://mdms.jp/shops/ANAAKEY' }, { label: 'X', url: 'https://x.com/ANAAKEYinfo' }], ...base },
  { id: 'joldeeno', name: 'ジョルディーノ', url: 'https://mdms.jp/joldeeno', kind: 'store', genre: 'murder', regions: ['tokyo'], sameDay: true,
    what: '吉祥寺店（専門店）・立川店（ボードゲーム喫茶）。出張公演も', links: [{ label: 'ナゾ広場 吉祥寺店', url: 'https://nazohiroba.com/mysteries/2o1OaZQ1dnI7TeolwuahqG/' }], ...base },
  { id: 'lostproduct', name: 'ロストプロダクト', url: 'https://www.lostproduct.jp/schedule/', kind: 'store', genre: 'murder', regions: ['tokyo', 'osaka'], sameDay: true,
    what: '新宿御苑の直営劇場ほか。公演スケジュールと貸切・出張公演。ex Labs の提携先', links: [{ label: '店舗一覧', url: 'https://www.lostproduct.jp/shop/' }, { label: 'X', url: 'https://x.com/lost_product' }], ...base },
  { id: 'madamis-house', name: 'マダミスハウス（渋谷駅前）', url: 'https://werewolf-house.com/murder-mystery/', kind: 'store', genre: 'murder', regions: ['tokyo'], sameDay: true,
    what: '人狼ハウス運営。毎週日曜の無料「はじめてのマダミス」、当日参加型の会も', links: [{ label: '予約（マダミス.jp）', url: 'https://mdms.jp/shops/MudermysHouse' }, { label: '予約（Coubic）', url: 'https://coubic.com/mmh' }, { label: 'TwiPla 予定公演一覧', url: 'https://www.twipla.jp/events/465585' }], ...base },
  { id: 'tantei-camp', name: '探偵キャンプ 東京新宿店', url: 'https://mdms.jp/shops/tanteicamp_shinjyuku', kind: 'store', genre: 'murder', regions: ['tokyo'], sameDay: true, what: '代々木駅徒歩3分。予約はマダミス.jp', ...base },
  { id: 'joymada', name: 'ジョイマダ', url: 'https://joymada.com/', kind: 'store', genre: 'murder', regions: ['tokyo'], sameDay: true, what: '新宿区舟町。シナリオ検索「マダナビ」も運営', links: [{ label: 'マダナビ（遊べる店舗一覧）', url: 'https://www.joymada.com/madanabi/' }], ...base },
  { id: 'imm-theater', name: 'IMM THEATER', url: 'https://imm.theater/archive', kind: 'store', genre: 'both', regions: ['tokyo'], sameDay: false, what: 'マーダーミステリーシアター等の劇場型公演。チケットはイープラス', ...base },
  { id: 'tokyo-mystery-circus', name: '東京ミステリーサーカス（SCRAP）', url: 'https://mysterycircus.jp/tokyo/', kind: 'store', genre: 'immersive', regions: ['tokyo'], sameDay: true, what: '新宿。イマーシブシアター型の常設・期間限定公演', ...base },
  { id: 'nagakutsu', name: 'NAGAKUTSU（ナガクツ）', url: 'https://www.nagakutsu.com/', kind: 'store', genre: 'murder', regions: ['osaka', 'nagoya'], sameDay: true, what: '梅田ほか大阪・名古屋。特設店舗型マダミス', links: [{ label: '予約（マダミス.jp）', url: 'https://mdms.jp/shops/nagakutsu' }, { label: 'X', url: 'https://x.com/NAGAKUTSU3' }], ...base },
  { id: 'light-and-geek', name: 'Light and Geek', url: 'https://lightandgeek.yorozuyagakudan.com/', kind: 'store', genre: 'murder', regions: ['kyoto'], sameDay: true, what: '京都・伏見。ex Labs の提携先', links: [{ label: '予約（マダミス.jp）', url: 'https://mdms.jp/shops/lightandgeek' }], ...base },
  { id: 'apri-la-porta', name: 'apri la porta', url: 'https://apri-la-porta.com/', kind: 'store', genre: 'murder', regions: ['hiroshima'], sameDay: false, what: '広島・八丁堀。ex Labs の提携先', ...base },

  // ---------- 情報ポータル・検索サイト ----------
  { id: 'mdms', name: 'マダミス.jp', url: 'https://mdms.jp/', kind: 'portal', genre: 'murder', regions: ['national', 'online'], sameDay: true, what: 'シナリオ5,000件超の検索、店舗ページ、公演予約', links: [{ label: 'X', url: 'https://x.com/mdmsjp' }, { label: '東京の専門店ガイド', url: 'https://mdms.jp/articles/mdms-tokyo' }], ...base },
  { id: 'mmch', name: 'マダミスch（これからミステリー）', url: 'https://mmch.jp/', kind: 'portal', genre: 'murder', regions: ['national'], sameDay: false, what: '作品検索・レビュー・ランキング', ...base },
  { id: 'imamis', name: 'いまミス', url: 'https://imamis.jp/', kind: 'portal', genre: 'murder', regions: ['national'], sameDay: false, what: 'マダミス総合情報サイト', ...base },
  { id: 'murder-jp', name: 'Murder.JP', url: 'https://www.murder.jp/', kind: 'portal', genre: 'murder', regions: ['national'], sameDay: false, what: 'マダミス総合情報サイト', ...base },
  { id: 'mdms-mania', name: 'マダミスマニア', url: 'https://mdms-mania.com/store/tokyo/', kind: 'portal', genre: 'murder', regions: ['tokyo'], sameDay: false, what: '東京の専門店まとめ記事', ...base },
  { id: 'nazohiroba', name: 'ナゾ広場', url: 'https://nazohiroba.com/', kind: 'portal', genre: 'both', regions: ['national'], sameDay: false, what: '謎解き・イマーシブ・マダミスの公演データベース', links: [{ label: 'イマーシブ完全ガイド', url: 'https://nazohiroba.com/articles/immersive-nazotoki' }], ...base },
  { id: 'tokyo-immersive', name: '東京イマーシブシアター', url: 'https://tokyo-immersive.com/', kind: 'portal', genre: 'immersive', regions: ['tokyo'], sameDay: false, what: '東京発のイマーシブシアター情報サイト。イマシブフェスも主催', links: [{ label: 'X', url: 'https://x.com/nyanyumeka' }], ...base },
  { id: 'immersive-info', name: 'Immersive Info', url: 'https://immersive-info.com/events', kind: 'portal', genre: 'immersive', regions: ['national'], sameDay: false, what: '全国のイマーシブ公演一覧', ...base },
  { id: 'natalie-immersive', name: 'ステージナタリー（イマーシブ・体験型演劇）', url: 'https://natalie.mu/stage/content_tag/388/play', kind: 'portal', genre: 'immersive', regions: ['national'], sameDay: false, what: 'イマーシブシアター・体験型演劇のニュースと公演情報', ...base },
  { id: 'enjoytokyo', name: 'レッツエンジョイ東京（没入体験・イマーシブ）', url: 'https://www.enjoytokyo.jp/event/list/cat0311/', kind: 'portal', genre: 'immersive', regions: ['tokyo'], sameDay: false, what: '東京のイマーシブ系イベント一覧', ...base },

  // ---------- 当日募集・参加者募集（コミュニティ） ----------
  { id: 'twipla', name: 'TwiPla（ツイプラ）', url: 'https://twipla.jp/', kind: 'community', genre: 'both', regions: ['national', 'online'], sameDay: true, what: 'X 連携のイベント告知・出欠管理。当日参加型のマダミス会や店舗の予定公演一覧が投稿される', note: '「マダミス」で検索。店舗（マダミスハウス等）や個人GMの募集が多い。取得条件は未確認', ...base },
  { id: 'x-madamis-boshu', name: 'X ハッシュタグ #マダミス募集', url: 'https://x.com/hashtag/%E3%83%9E%E3%83%80%E3%83%9F%E3%82%B9%E5%8B%9F%E9%9B%86', kind: 'community', genre: 'murder', regions: ['national', 'online'], sameDay: true, what: '店舗・GM が空席（🈳）や当日募集を投稿する定番タグ', note: 'API 取得はしない。目視確認して occurrences に入れる運用のみ', ...base },
  { id: 'x-immersive', name: 'X ハッシュタグ #イマーシブシアター', url: 'https://x.com/hashtag/%E3%82%A4%E3%83%9E%E3%83%BC%E3%82%B7%E3%83%96%E3%82%B7%E3%82%A2%E3%82%BF%E3%83%BC', kind: 'community', genre: 'immersive', regions: ['national'], sameDay: true, what: 'イマーシブ公演の告知・当日券情報', ...base },
  { id: 'kokuchpro', name: 'こくちーずプロ（マダミス特集）', url: 'https://www.kokuchpro.com/feature/%E3%83%9E%E3%83%80%E3%83%9F%E3%82%B9/', kind: 'community', genre: 'murder', regions: ['national'], sameDay: false, what: 'マダミス関連イベントの告知・申込', ...base },
  { id: 'jmty', name: 'ジモティー（マダミス メンバー募集）', url: 'https://jmty.jp/all/com-kw-%E3%83%9E%E3%83%80%E3%83%9F%E3%82%B9', kind: 'community', genre: 'murder', regions: ['national'], sameDay: false, what: '地域のマダミス会・参加者募集', ...base },
  { id: 'discord-madamis', name: 'Discord「マーダーミステリー オンラインセッション募集用」', url: 'https://disboard.org/server/681502124475023371', kind: 'community', genre: 'murder', regions: ['online'], sameDay: true, what: 'オンライン公演の募集サーバー（DISBOARD 掲載）', links: [{ label: 'Discoparty のマダミス鯖一覧', url: 'https://discoparty.jp/discord-server/PC/%E3%83%9E%E3%83%80%E3%83%9F%E3%82%B9' }, { label: 'ディス速 タグ', url: 'https://dissoku.net/ja/search/tag/%E3%83%9E%E3%83%80%E3%83%9F%E3%82%B9?page=1' }], ...base },
];

export const SITE_KIND_LABEL: Record<SiteKind, string> = {
  ticket: 'チケット販売・予約プラットフォーム',
  store: 'マダミス専門店・劇場（公演スケジュール）',
  portal: '情報ポータル・検索サイト',
  community: '当日募集・参加者募集',
};
export const SITE_GENRE_LABEL: Record<SiteGenre, string> = { murder: 'マダミス', immersive: 'イマーシブ', both: 'マダミス・イマーシブ' };
