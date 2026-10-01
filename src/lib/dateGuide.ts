// デート・お出かけ記事（/guide/tokyo-experience-date/ ほか）で共通に使う比較表の行。
// 列は「体験｜エリア｜2人分の料金｜所要時間｜貸切・相席｜屋内・屋外｜会話量｜初心者向け｜予約」で全記事そろえる。
// 自社公演は src/data/events/ から作り、料金・人数・条件を手書きしない。確認できない値は「公式で確認」のまま出す。
import type { GuideRow } from './tokyoGuide';
import { fmtYen } from './tokyoGuide';
import { bookingUrl } from './priceLabel';

export interface DateRow {
  id: string;
  name: string;
  /** 名前の下に出す補足（例：当社制作） */
  sub?: string;
  /** 記事内の詳細カードへのリンク */
  href: string;
  area: string;
  pair: string;
  time: string;
  privacy: string;
  setting: string;
  talk: string;
  beginner: string;
  /** 予約先（公式予約ページ・公式ページ） */
  reserveHref?: string;
  reserveLabel?: string;
  own: boolean;
  siteId: string;
  /** 料金・条件を確認した日（YYYY-MM-DD） */
  checked: string;
}

export const UNKNOWN = '公式で確認';

/** 自社公演の行（src/data/events/ の公演データから） */
export function ownDateRow(r: GuideRow, area: string): DateRow {
  const t = r.totalFor(2);
  const canPair = r.w.party.min <= 2 && (r.w.party.max === undefined || r.w.party.max >= 2);
  const unit = r.w.price.unit === 'per-group' ? '1組料金' : r.w.price.unit === 'per-person' ? `1人${fmtYen(r.perPersonFor(2)!)}×2` : '';
  const setting = r.venue?.setting === 'indoor' ? (r.w.info.walking ? '屋内（館内を歩いて巡る）' : '屋内で完結') : r.venue?.setting === 'mixed' ? '受付後に屋外の徒歩移動あり' : r.venue?.setting === 'outdoor' ? '屋外' : UNKNOWN;
  return {
    id: r.w.id,
    name: r.w.title,
    sub: '株式会社ex Labs制作',
    href: `#item-${r.w.id}`,
    area: `${area}${r.venue?.station ? `（${r.venue.station.replace(/（[^）]*）/g, '')}）` : ''}`,
    pair: !canPair ? '2名では申込不可' : t === undefined ? UNKNOWN : `${fmtYen(t)}${unit ? `（${unit}）` : ''}・税込、手数料別`,
    time: r.w.duration.minutes ? `約${r.w.duration.minutes}分（集合・受付は別）` : UNKNOWN,
    privacy: r.w.party.format === 'private' ? '二人だけ（申込単位で貸切）' : r.w.party.format === 'shared' ? '相席（同じ回に他の参加者も一緒）' : UNKNOWN,
    setting,
    talk: r.w.info.participation ?? UNKNOWN,
    beginner: r.w.info.beginner ?? UNKNOWN,
    reserveHref: bookingUrl(r.w, r.ticketUrl),
    reserveLabel: '予約サイトで空席を見る',
    own: true,
    siteId: r.w.id,
    checked: r.w.verified.at.slice(0, 10),
  };
}

const ymd = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return `${y}年${m}月${dd}日`; };

/** 料金を確認した日の表示（行ごとの確認日の範囲） */
export function checkedRange(rows: Pick<DateRow, 'checked'>[]): string {
  const ds = rows.map((r) => r.checked).filter(Boolean).sort();
  if (!ds.length) return '';
  return ds[0] === ds[ds.length - 1] ? ymd(ds[0]) : `${ymd(ds[0])}〜${ymd(ds[ds.length - 1])}（体験ごとに確認）`;
}

export { ymd };
