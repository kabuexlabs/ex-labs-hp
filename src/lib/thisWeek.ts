// 「今週遊べる公演」の判定ロジック（Asia/Tokyo 固定）。
// 今週＝月曜0:00〜翌月曜0:00未満。今週末＝同じ週の土・日。
// SSR（各ページは prerender=false）で毎リクエスト評価するため、日付が変わればHTMLも変わる。
// クライアント側でも同じ判定を軽く再実行し、開いたまま日付が変わった場合に
// 終了回を「今週遊べる」と出し続けない（immersive-tokyo の inline script）。
import type { Show, ShowOccurrence } from '../data/shows';

const JST_OFFSET_MIN = 9 * 60;

/** Date → 日本時間の 'YYYY-MM-DD' */
export function jstDateString(d: Date): string {
  const t = new Date(d.getTime() + JST_OFFSET_MIN * 60000);
  return t.toISOString().slice(0, 10);
}
/** 'YYYY-MM-DD'（＋'HH:MM'）の日本時間を Date に */
export function jstDate(date: string, time = '00:00'): Date {
  return new Date(`${date}T${time}:00+09:00`);
}
/** 'YYYY-MM-DD' の曜日（0=日…6=土）。日付だけで決まるので UTC 正午で計算する */
export function jstWeekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
}

export interface WeekRange { start: string; end: string; weekend: [string, string] }

/** now を含む「今週」（月曜〜日曜）の日付範囲。end は翌月曜（含まない） */
export function weekRange(now: Date): WeekRange {
  const today = jstDateString(now);
  const wd = jstWeekday(today); // 0=日
  const back = (wd + 6) % 7; // 月曜まで戻る日数
  const start = addDays(today, -back);
  const end = addDays(start, 7);
  return { start, end, weekend: [addDays(start, 5), addDays(start, 6)] };
}

export type OccurrenceState = 'upcoming' | 'today-time-unknown' | 'started' | 'ended' | 'cancelled' | 'soldout';

/** 回の状態。時刻不明の回は「当日＝today-time-unknown」「前日以前＝ended」。所要時間は目安として90分で終了判定 */
export function occurrenceState(o: ShowOccurrence, now: Date, durationMin = 90): OccurrenceState {
  if (o.status === 'cancelled') return 'cancelled';
  const today = jstDateString(now);
  if (o.date < today) return 'ended';
  if (o.status === 'soldout') return 'soldout';
  if (!o.time) return o.date === today ? 'today-time-unknown' : 'upcoming';
  const start = jstDate(o.date, o.time).getTime();
  if (now.getTime() >= start + durationMin * 60000) return 'ended';
  if (now.getTime() >= start) return 'started';
  return 'upcoming';
}

export interface WeekOccurrence extends ShowOccurrence { state: OccurrenceState; isWeekend: boolean }
export interface WeekShow {
  show: Show;
  /** 今週の対象回（終了・中止を除く。完売は含めるが予約対象としない） */
  occurrences: WeekOccurrence[];
  /** 予約案内できる回があるか（開催予定で未終了。完売・中止・開始済みは除く） */
  bookable: boolean;
  /** 確認期限切れ（verifyTtlDays 超過） */
  stale: boolean;
}

export function isStale(show: Show, now: Date): boolean {
  const v = new Date(show.verifiedAt).getTime();
  return now.getTime() - v > show.verifyTtlDays * 86400000;
}

/** 今週表示する公演。今週に開催予定（未終了・中止以外）の回がある公開公演のみ */
export function thisWeekShows(shows: Show[], now: Date): WeekShow[] {
  const w = weekRange(now);
  const out: WeekShow[] = [];
  for (const show of shows) {
    if (!show.published) continue;
    const occ = show.occurrences
      .filter((o) => o.date >= w.start && o.date < w.end)
      .map((o) => ({ ...o, state: occurrenceState(o, now), isWeekend: o.date === w.weekend[0] || o.date === w.weekend[1] }))
      .filter((o) => o.state !== 'ended' && o.state !== 'cancelled')
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
    if (occ.length === 0) continue;
    const bookable = occ.some((o) => o.state === 'upcoming' || o.state === 'today-time-unknown');
    out.push({ show, occurrences: occ, bookable, stale: isStale(show, now) });
  }
  return out;
}

/** 今週以降で次に開催予定の回（0件フォールバックや「次回」案内用） */
export function nextOccurrence(show: Show, now: Date): ShowOccurrence | null {
  const today = jstDateString(now);
  const w = weekRange(now);
  const list = show.occurrences
    .filter((o) => o.status !== 'cancelled' && o.date >= today && o.date >= w.end)
    .sort((a, b) => a.date.localeCompare(b.date));
  return list[0] ?? null;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export function fmtDateJa(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y}年${m}月${d}日（${WD[jstWeekday(date)]}）`;
}
export function fmtDateShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}（${WD[jstWeekday(date)]}）`;
}
export function fmtVerified(iso: string): string {
  const d = new Date(iso);
  const t = new Date(d.getTime() + JST_OFFSET_MIN * 60000);
  return `${t.getUTCFullYear()}年${t.getUTCMonth() + 1}月${t.getUTCDate()}日 ${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
}
