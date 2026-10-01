// 公演の料金表示（解説記事・カレンダー・比較表で共通）。正本は src/data/events/works.ts の price。
// 同じ公演の料金を、ページ内のどこでも同じ言い方で出すために、表示文はここでだけ組み立てる。
import type { Work } from '../data/events/types';

const n = (v: number) => v.toLocaleString('ja-JP');

export interface PriceLabels {
  /** 1行の要約（例：1人4,900〜6,500円／1人4,000円／1枚4,500円） */
  main: string;
  /** 要約の補足（例：参加人数によって異なります） */
  sub: string;
  /** 1組料金の内訳（例：1組料金：2名13,000円／3名16,500円／4名19,600円）。1組料金でなければ空 */
  group: string;
  /** 税・手数料の扱い（全公演で同じ言い方） */
  tax: string;
  /** 料金がまだ確定・確認できていないとき true */
  unknown: boolean;
}

export function priceLabels(price: Work['price']): PriceLabels {
  const tax = `${price.taxIncluded ? '税込' : '税区分は予約サイトで確認'}・別途手数料がかかる場合があります`;
  if (price.unit === 'per-group' && price.tiers?.length) {
    const tiers = [...price.tiers].sort((a, b) => a.party - b.party);
    const per = tiers.map((t) => Math.round(t.amount / t.party));
    const lo = Math.min(...per);
    const hi = Math.max(...per);
    return {
      main: lo === hi ? `1人${n(lo)}円` : `1人${n(lo)}〜${n(hi)}円`,
      sub: lo === hi ? '' : '参加人数によって異なります',
      group: `1組料金：${tiers.map((t) => `${t.party}名${n(t.amount)}円`).join('／')}`,
      tax,
      unknown: false,
    };
  }
  if (price.unit === 'per-person' && price.amount !== undefined) return { main: `1人${n(price.amount)}円`, sub: '', group: '', tax, unknown: false };
  if (price.unit === 'charter' && price.amount !== undefined) return { main: `貸切${n(price.amount)}円`, sub: '', group: '', tax, unknown: false };
  // 料金単位が未確認でも、公式に「1枚◯円」とあればその金額は出す（1枚で何名参加できるかは補わない）
  const perTicket = /1枚\s*¥\s*([\d,]+)/.exec(price.text);
  if (perTicket) return { main: `1枚${perTicket[1]}円`, sub: '1枚で参加できる人数は公式チケットページで確認', group: '', tax, unknown: false };
  return { main: '料金は公式チケットページで確認', sub: '', group: '', tax, unknown: true };
}

/** 予約先：開催回に販売ページがあればそれ、なければ作品の販売ページ・公式ページ（外部URLのみ） */
export function bookingUrl(w: Pick<Work, 'ticketUrl' | 'officialUrl'>, occurrenceUrl?: string): string | undefined {
  return occurrenceUrl ?? w.ticketUrl ?? (/^https?:\/\//.test(w.officialUrl) ? w.officialUrl : undefined);
}
