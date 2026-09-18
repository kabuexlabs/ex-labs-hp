// 東京ガイドの補助ページ（一人で参加／二人で参加）が共通で使う「公演の判断材料」。
// 正本は src/data/events/（/events/ と同じ）。料金・人数・開催日を各ページに手書きしない。
import { eventsData } from '../data/events/index';
import { perPerson, fmtYen, FORMAT_LABEL } from './events';
import { jstDateString, fmtDateShort, fmtVerified } from './thisWeek';
import type { Work, Venue, Occurrence, Organizer } from '../data/events/types';

export interface GuideRow {
  w: Work;
  venue?: Venue;
  organizer: Organizer;
  own: boolean;
  occ: Occurrence[];
  /** 今日以降の確認済み開催日 */
  futureDates: string[];
  /** 開催中／開催予定／終了 */
  status: 'ongoing' | 'upcoming' | 'ended' | 'unknown';
  ticketUrl?: string;
  ticketSite: string;
  /** 1人あたり料金の表示文（1組料金は人数別換算） */
  perPersonText: string;
  /** 指定人数で参加した場合の総額（税込、手数料別）。算出できなければ undefined */
  totalFor: (party: number) => number | undefined;
  perPersonFor: (party: number) => number | undefined;
  /** 開催日の表示文 */
  datesText: string;
  verifiedText: string;
  stale: boolean;
  formatLabel: string;
}

export function buildGuideRows(now: Date): GuideRow[] {
  const today = jstDateString(now);
  return eventsData.works.filter((w) => w.published).map((w) => {
    const organizer = eventsData.organizers.find((o) => o.id === w.organizerId)!;
    const occ = eventsData.occurrences.filter((o) => o.workId === w.id && o.published && !o.test && o.eventStatus !== 'cancelled').sort((a, b) => a.date.localeCompare(b.date));
    const venue = eventsData.venues.find((v) => v.id === (occ[0]?.venueId ?? w.venueId));
    const dates = occ.map((o) => o.date);
    const futureDates = dates.filter((d) => d >= today);
    const from = dates[0] ?? w.period?.from;
    const to = dates[dates.length - 1] ?? w.period?.to;
    const status: GuideRow['status'] = !to ? 'unknown' : to < today ? 'ended' : from && from > today ? 'upcoming' : 'ongoing';
    const ch = occ.find((o) => o.date >= today)?.sales.channels[0] ?? occ[0]?.sales.channels[0];
    const channel = eventsData.channels.find((c) => c.id === ch?.channelId);
    const perPersonFor = (party: number) => {
      if (party < w.party.min || (w.party.max !== undefined && party > w.party.max)) return undefined;
      return perPerson(w.price, party);
    };
    const totalFor = (party: number) => {
      const pp = perPersonFor(party);
      if (pp === undefined) return undefined;
      if (w.price.unit === 'per-group') return w.price.tiers?.find((t) => t.party === party)?.amount;
      if (w.price.unit === 'charter') return w.price.amount;
      return pp * party;
    };
    const perPersonText = w.price.unit === 'per-person' && w.price.amount !== undefined ? fmtYen(w.price.amount) : w.price.unit === 'per-group' ? (w.price.tiers ?? []).map((t) => `${t.party}人 ${fmtYen(perPerson(w.price, t.party)!)}`).join('／') : w.price.unit === 'charter' && w.price.amount !== undefined ? `貸切 ${fmtYen(w.price.amount)}` : '公式ページで確認';
    const datesText = dates.length ? (futureDates.length ? `${fmtDateShort(futureDates[0])}〜${fmtDateShort(futureDates[futureDates.length - 1])}（${futureDates.length}日）` : `${fmtDateShort(dates[0])}〜${fmtDateShort(dates[dates.length - 1])}（終了）`) : (w.period?.text ?? '公式ページで確認');
    const stale = now.getTime() - Date.parse(w.verified.at) > w.verifyTtlDays * 86400000;
    return {
      w, venue, organizer, own: organizer.relation === 'ex-labs', occ, futureDates, status,
      ticketUrl: ch?.url, ticketSite: channel?.name ?? '公式ページ', perPersonText, totalFor, perPersonFor, datesText,
      verifiedText: fmtVerified(w.verified.at), stale, formatLabel: FORMAT_LABEL[w.party.format],
    };
  });
}

export { fmtYen };
