// 「今週遊べる東京のイマーシブイベント」欄（/guide/immersive-tokyo/#this-week）向けの互換データ。
// 2026-09-13 から正本は src/data/events/（公演検索サービス /events/ と共通）に移り、
// このファイルは events データから同じ形（Show）に変換するだけ。手で編集しない。
// 変換ルール：
//  - status：中止→'cancelled'、確認時点で満席（確認日時あり）→'soldout'、それ以外→'scheduled'
//  - verifiedAt は作品の開催情報の最終確認日時。空席の確認とは別（events 側で管理）
export type OccurrenceStatus = 'scheduled' | 'soldout' | 'cancelled';

export interface ShowOccurrence {
  /** 開催日（YYYY-MM-DD、日本時間） */
  date: string;
  /** 開演時刻（HH:MM、日本時間）。未確認なら省略 */
  time?: string;
  status: OccurrenceStatus;
}

export interface Show {
  id: string;
  name: string;
  area: string;
  /** 体験の特徴（1〜2文） */
  feature: string;
  /** 自社の公演詳細ページ */
  url: string;
  /** 正規チケットページ */
  ticketUrl: string;
  ticketSite: string;
  /** 所要時間の表示文（未確定なら「詳細はチケットページで確認」） */
  duration: string;
  /** 参加可能人数 */
  capacity: string;
  /** 年齢条件 */
  age: string;
  /** 料金：1人あたり／1組あたりを明記し、税込・手数料の扱いを含める */
  price: { text: string; unit: '1人あたり' | '1組あたり' | '料金単位は未確認'; note: string };
  /** 参加判断に必要な条件（確認できたもののみ） */
  conditions: string[];
  occurrences: ShowOccurrence[];
  /** 開催情報の最終確認日時（ISO 8601、+09:00） */
  verifiedAt: string;
  /** 確認元（URL または説明） */
  verifiedFrom: string[];
  /** 確認の有効期間（日）。超えたら表示側が「要再確認」扱いにする */
  verifyTtlDays: number;
  /** 公開可否 */
  published: boolean;
  /** カード用の料金表示：大きく出す金額と補足（1組料金は最少人数の金額を「〜」付きで） */
  priceCard: { main: string; sub: string };
  /** 許諾済みの画像（カード表示用）。無ければ文字だけのカードにする */
  image?: { path: string; alt: string };
}

import { eventsData } from './events/index.ts';
import { regionName, areaName } from './events/areas.ts';

export const shows: Show[] = eventsData.works.filter((w) => !w.guideOnly).map((w) => {
  const occ = eventsData.occurrences.filter((o) => o.workId === w.id && o.published && !o.test).sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  const venue = eventsData.venues.find((v) => v.id === (occ[0]?.venueId ?? w.venueId)) ?? eventsData.venues[0];
  const ch = occ[0]?.sales.channels[0];
  const channel = eventsData.channels.find((c) => c.id === ch?.channelId);
  const srcs = w.sourceIds.map((id) => eventsData.sources.find((s) => s.id === id)).filter(Boolean);
  return {
    id: w.id,
    name: w.title,
    area: `${regionName(venue.regionId)}・${areaName(venue.areaId)}／${venue.listName ?? venue.name}`,
    feature: w.summary,
    url: w.officialUrl,
    ticketUrl: ch?.url ?? w.ticketUrl ?? w.officialUrl,
    ticketSite: channel?.name ?? (w.ticketUrl ? new URL(w.ticketUrl).hostname : '公式ページ'),
    duration: w.duration.text,
    capacity: w.party.text,
    age: w.info.ageRule ?? '年齢条件は公式ページで確認',
    price: { text: w.price.text, unit: w.price.unit === 'per-person' ? '1人あたり' : w.price.unit === 'unknown' ? '料金単位は未確認' : '1組あたり', note: w.price.feeNote },
    conditions: [...(w.info.walking ? [w.info.walking] : []), ...(w.info.requirements ?? [])],
    occurrences: occ.map((o) => ({
      date: o.date,
      ...(o.startTime ? { time: o.startTime } : {}),
      status: o.eventStatus === 'cancelled' ? 'cancelled' : o.seats.status === 'soldout' && o.seats.checkedAt ? 'soldout' : 'scheduled',
    })),
    verifiedAt: w.verified.at,
    verifiedFrom: srcs.map((s) => `${s!.label}${s!.url ? ' ' + s!.url : ''}（${s!.terms}）`),
    verifyTtlDays: w.verifyTtlDays,
    published: w.published,
    priceCard: (() => {
      if (w.price.unit === 'per-person' && w.price.amount !== undefined) return { main: `¥${w.price.amount.toLocaleString('ja-JP')}`, sub: '1人・税込' };
      if (w.price.unit === 'per-group' && w.price.tiers?.length) { const t = [...w.price.tiers].sort((a, b) => a.party - b.party)[0]; return { main: `¥${t.amount.toLocaleString('ja-JP')}〜`, sub: `1組（${t.party}人）・1人 ¥${Math.round(t.amount / t.party).toLocaleString('ja-JP')}〜` }; }
      if (w.price.unit === 'charter' && w.price.amount !== undefined) return { main: `¥${w.price.amount.toLocaleString('ja-JP')}`, sub: '貸切・税込' };
      return { main: '料金は公式で確認', sub: '' };
    })(),
    ...(w.image ? { image: { path: w.image.path, alt: `${w.title} キービジュアル` } } : {}),
  };
});
