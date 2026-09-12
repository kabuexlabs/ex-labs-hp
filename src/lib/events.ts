// 公演検索（/events/）の判定ロジック。Asia/Tokyo 固定。
// サーバー（SSR）とブラウザ（絞り込みの即時反映）の両方で同じ関数を使う。
// import は node --experimental-strip-types でも動くよう拡張子付きにしている（scripts/events-test.mjs）。
import type { EventsDataset, Listing, Occurrence, Organizer, Price, SalesStatus, SeatStatus, Venue, Work, Genre } from '../data/events/types.ts';
import { jstDateString, jstDate, addDays, weekRange } from './thisWeek.ts';

export type WhenKey = 'today' | 'tomorrow' | 'weekend' | 'date' | 'all';
export type StartBand = '' | 'morning' | 'afternoon' | 'evening';

export interface Criteria {
  when: WhenKey;
  /** when='date' のときの対象日（YYYY-MM-DD） */
  date?: string;
  /** 申込人数（1〜10）。未指定なら人数条件なし */
  party?: number;
  region?: string;
  area?: string;
  genre?: Genre | '';
  start?: StartBand;
  /** 終了時刻の上限（HH:MM） */
  endBy?: string;
  /** 1人あたり予算（円、手数料別） */
  budget?: number;
}

export const PARTY_MAX = 10;
export const BUDGET_OPTIONS = [3000, 5000, 8000, 10000, 15000];
export const END_BY_OPTIONS = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function hhmmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
export function minToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** クエリ文字列 → 検索条件（不正値は捨てる） */
export function parseCriteria(params: URLSearchParams): Criteria {
  const when = params.get('when') ?? '';
  const c: Criteria = { when: 'all' };
  if (when === 'today' || when === 'tomorrow' || when === 'weekend') c.when = when;
  const date = params.get('date') ?? '';
  if (DATE_RE.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && jstDateString(new Date(`${date}T12:00:00Z`)) === date) {
    if (when === 'date' || when === '') c.when = 'date';
    if (c.when === 'date') c.date = date;
  }
  const party = parseInt(params.get('party') ?? '', 10);
  if (party >= 1 && party <= PARTY_MAX) c.party = party;
  const region = params.get('region') ?? '';
  if (/^[a-z][a-z0-9-]{0,30}$/.test(region)) c.region = region;
  const area = params.get('area') ?? '';
  if (/^[a-z][a-z0-9-]{0,30}$/.test(area)) c.area = area;
  const genre = params.get('genre') ?? '';
  if (['immersive-theater', 'story-experience', 'walk-story', 'murder-mystery'].includes(genre)) c.genre = genre as Genre;
  const start = params.get('start') ?? '';
  if (start === 'morning' || start === 'afternoon' || start === 'evening') c.start = start;
  const endBy = params.get('end') ?? '';
  if (TIME_RE.test(endBy)) c.endBy = endBy;
  const budget = parseInt(params.get('budget') ?? '', 10);
  if (budget >= 1000 && budget <= 100000) c.budget = budget;
  return c;
}

/** 検索条件 → クエリ文字列（URL の共有・履歴用） */
export function criteriaToQuery(c: Criteria): string {
  const p = new URLSearchParams();
  if (c.when !== 'all') p.set('when', c.when);
  if (c.when === 'date' && c.date) p.set('date', c.date);
  if (c.party) p.set('party', String(c.party));
  if (c.region) p.set('region', c.region);
  if (c.area) p.set('area', c.area);
  if (c.genre) p.set('genre', c.genre);
  if (c.start) p.set('start', c.start);
  if (c.endBy) p.set('end', c.endBy);
  if (c.budget) p.set('budget', String(c.budget));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** 「今日」「明日」「今週末」を具体的な日付にする。今週末＝今週（月〜日）の土日のうち今日以降。日曜は当日のみ */
export function dateWindow(c: Criteria, now: Date): string[] | null {
  const today = jstDateString(now);
  if (c.when === 'today') return [today];
  if (c.when === 'tomorrow') return [addDays(today, 1)];
  if (c.when === 'weekend') return weekRange(now).weekend.filter((d) => d >= today);
  if (c.when === 'date' && c.date) return [c.date];
  return null;
}

export type EventState = 'upcoming' | 'today-time-unknown' | 'started' | 'ended' | 'cancelled' | 'unknown';

/** 一覧・ブラウザ側の絞り込みに必要な最小限の行データ（個人情報なし） */
export interface SearchRow {
  id: string;
  workId: string;
  slug: string;
  title: string;
  date: string;
  /** 開演（分、0:00 起点）。未確認なら省略 */
  start?: number;
  /** 終了予定（分）。endTime または 開演＋所要時間。未確認なら省略 */
  end?: number;
  eventStatus: Occurrence['eventStatus'];
  region: string;
  area: string;
  genres: Genre[];
  /** 申込人数の条件。未確認なら省略（人数で絞ると 'unknown'） */
  party?: { min: number; max?: number };
  price: Pick<Price, 'unit' | 'amount' | 'tiers'>;
  /** own＝自社データの公演回、listing＝外部サイト掲載 */
  kind: 'own' | 'listing';
  siteId?: string;
}

/** 開演・終了の分を求める（endTime → 開演＋所要時間 の順。どちらも無ければ undefined） */
export function occurrenceTimes(o: Occurrence, w: Work): { start?: number; end?: number } {
  const start = o.startTime ? hhmmToMin(o.startTime) : undefined;
  let end: number | undefined;
  if (o.endTime) end = hhmmToMin(o.endTime);
  else if (start !== undefined && w.duration.minutes) end = start + w.duration.minutes;
  return { start, end };
}

/** 回の実効的な開催状態（日付・時刻の経過を反映） */
export function eventState(row: { date: string; start?: number; end?: number; eventStatus: Occurrence['eventStatus'] }, now: Date): EventState {
  if (row.eventStatus === 'cancelled') return 'cancelled';
  if (row.eventStatus === 'ended') return 'ended';
  if (row.eventStatus === 'unknown') return 'unknown';
  const today = jstDateString(now);
  if (row.date < today) return 'ended';
  if (row.date > today) return 'upcoming';
  if (row.start === undefined) return 'today-time-unknown';
  const t = jstDate(row.date, minToHhmm(row.start)).getTime();
  if (row.end !== undefined && now.getTime() >= jstDate(row.date, minToHhmm(row.end)).getTime()) return 'ended';
  if (now.getTime() >= t) return 'started';
  return 'upcoming';
}

/** 販売状態の実効値：締切を過ぎたら 'closed'、開催終了・中止なら 'closed' */
export function salesState(o: Occurrence, es: EventState, now: Date): SalesStatus {
  if (es === 'ended' || es === 'cancelled') return 'closed';
  if (o.sales.closesAt && now.getTime() >= new Date(o.sales.closesAt).getTime()) return 'closed';
  return o.sales.status;
}

/** 空席状態の実効値：確認日時が無い・有効期限切れなら 'unknown' に戻す */
export function seatState(o: Occurrence, now: Date): SeatStatus {
  if (o.seats.status === 'unknown') return 'unknown';
  if (!o.seats.checkedAt) return 'unknown';
  if (o.seats.expiresAt && now.getTime() >= new Date(o.seats.expiresAt).getTime()) return 'unknown';
  return o.seats.status;
}

export type CtaKind = 'book' | 'check' | 'soldout' | 'not-yet' | 'closed' | 'started' | 'ended' | 'cancelled' | 'unknown';

/** 予約ボタンの種類。「開催予定がある」だけでは book にしない（受付中かつ確認時点で空席ありが必要） */
export function ctaKind(es: EventState, ss: SalesStatus, st: SeatStatus): CtaKind {
  if (es === 'cancelled') return 'cancelled';
  if (es === 'ended') return 'ended';
  if (es === 'started') return 'started';
  if (es === 'unknown') return 'unknown';
  if (ss === 'closed') return 'closed';
  if (ss === 'not-yet') return 'not-yet';
  if (st === 'soldout') return 'soldout';
  if (ss === 'open' && st === 'available') return 'book';
  return 'check';
}

/** 1人あたり料金（円、手数料別）。算出できない場合は undefined */
export function perPerson(price: Pick<Price, 'unit' | 'amount' | 'tiers'>, party?: number): number | undefined {
  if (price.unit === 'per-person') return price.amount;
  if (!party) return undefined;
  if (price.unit === 'per-group') {
    const t = price.tiers?.find((x) => x.party === party);
    return t ? Math.ceil(t.amount / party) : undefined;
  }
  if (price.unit === 'charter') return price.amount !== undefined ? Math.ceil(price.amount / party) : undefined;
  return undefined;
}

export type Match = 'match' | 'unknown' | 'no';

/** 条件との適合。'unknown'＝条件に必要なデータが未確認（適合として扱わず、別枠で示す） */
export function matchCriteria(row: SearchRow, c: Criteria, now: Date, window: string[] | null = dateWindow(c, now)): Match {
  let unknown = false;
  const es = eventState(row, now);
  if (es === 'ended' || es === 'cancelled') return 'no';
  if (window && !window.includes(row.date)) return 'no';
  if (c.region && row.region !== c.region) return 'no';
  if (c.area && row.area !== c.area) return 'no';
  if (c.genre && !row.genres.includes(c.genre)) return 'no';
  if (c.party) {
    if (!row.party) unknown = true;
    else if (c.party < row.party.min) return 'no';
    else if (row.party.max !== undefined) {
      if (c.party > row.party.max) return 'no';
    } else if (c.party > row.party.min) unknown = true;
  }
  if (c.start) {
    if (row.start === undefined) unknown = true;
    else {
      const s = row.start;
      const ok = c.start === 'morning' ? s < 12 * 60 : c.start === 'afternoon' ? s >= 12 * 60 && s < 17 * 60 : s >= 17 * 60;
      if (!ok) return 'no';
    }
  }
  if (c.endBy) {
    if (row.end === undefined) unknown = true;
    else if (row.end > hhmmToMin(c.endBy)) return 'no';
  }
  if (c.budget) {
    const pp = perPerson(row.price, c.party);
    if (pp === undefined) unknown = true;
    else if (pp > c.budget) return 'no';
  }
  if (es === 'unknown') unknown = true;
  return unknown ? 'unknown' : 'match';
}

/** 並び順：日付 → 開演（未確認は後） → 作品名。主催者による優先はしない */
export function compareRows(a: SearchRow, b: SearchRow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const sa = a.start ?? 1e9;
  const sb = b.start ?? 1e9;
  if (sa !== sb) return sa - sb;
  return a.title.localeCompare(b.title, 'ja');
}

export interface Resolved {
  occ: Occurrence;
  work: Work;
  venue: Venue;
  organizer: Organizer;
  row: SearchRow;
  eventState: EventState;
  salesState: SalesStatus;
  seatState: SeatStatus;
  cta: CtaKind;
  /** 開催情報の確認期限切れ（work.verifyTtlDays 超過） */
  stale: boolean;
}

/** 公開データだけを結合して行にする（非公開・テストデータは除外） */
export function resolveAll(ds: EventsDataset, now: Date): Resolved[] {
  const out: Resolved[] = [];
  for (const occ of ds.occurrences) {
    if (!occ.published || occ.test) continue;
    const work = ds.works.find((w) => w.id === occ.workId);
    const venue = ds.venues.find((v) => v.id === occ.venueId);
    if (!work || !venue || !work.published) continue;
    const organizer = ds.organizers.find((o) => o.id === work.organizerId);
    if (!organizer) continue;
    const { start, end } = occurrenceTimes(occ, work);
    const row: SearchRow = {
      id: occ.id, workId: work.id, slug: work.slug, title: work.title, date: occ.date, start, end,
      eventStatus: occ.eventStatus, region: venue.regionId, area: venue.areaId, genres: work.genres,
      party: { min: work.party.min, max: work.party.max },
      price: { unit: work.price.unit, amount: work.price.amount, tiers: work.price.tiers },
      kind: 'own',
    };
    const es = eventState(row, now);
    const ss = salesState(occ, es, now);
    const st = seatState(occ, now);
    out.push({ occ, work, venue, organizer, row, eventState: es, salesState: ss, seatState: st, cta: ctaKind(es, ss, st), stale: now.getTime() - new Date(work.verified.at).getTime() > work.verifyTtlDays * 86400000 });
  }
  return out.sort((a, b) => compareRows(a.row, b.row));
}

/** 外部サイト掲載の公演回（listings）を行にしたもの */
export interface ResolvedListing {
  listing: Listing;
  site: { id: string; name: string; url: string };
  row: SearchRow;
  eventState: EventState;
  cta: CtaKind;
  /** 確認から時間が経っている（7日超） */
  stale: boolean;
}
export const LISTING_TTL_DAYS = 7;

export function resolveListings(ds: EventsDataset, now: Date): ResolvedListing[] {
  const out: ResolvedListing[] = [];
  for (const l of ds.listings ?? []) {
    if (!l.published || l.test) continue;
    const site = (ds.sites ?? []).find((x) => x.id === l.siteId);
    if (!site) continue;
    const start = l.startTime ? hhmmToMin(l.startTime) : undefined;
    const end = l.endTime ? hhmmToMin(l.endTime) : start !== undefined && l.durationMinutes ? start + l.durationMinutes : undefined;
    const row: SearchRow = {
      id: `listing:${l.id}`, workId: l.id, slug: '', title: l.title, date: l.date, start, end,
      eventStatus: l.status === 'cancelled' ? 'cancelled' : 'scheduled', region: l.regionId, area: l.areaId, genres: l.genres,
      party: l.party ? { min: l.party.min, max: l.party.max } : undefined,
      price: { unit: l.priceUnit ?? 'per-person', amount: l.amount },
      kind: 'listing', siteId: l.siteId,
    };
    const es = eventState(row, now);
    const cta: CtaKind = es === 'cancelled' ? 'cancelled' : es === 'ended' ? 'ended' : es === 'started' ? 'started' : l.status === 'soldout' ? 'soldout' : 'check';
    out.push({ listing: l, site, row, eventState: es, cta, stale: now.getTime() - new Date(l.checkedAt).getTime() > LISTING_TTL_DAYS * 86400000 });
  }
  return out.sort((a, b) => compareRows(a.row, b.row));
}

export type AnyResolved = Resolved | ResolvedListing;
export const isListing = (r: AnyResolved): r is ResolvedListing => r.row.kind === 'listing';

export interface SearchResult<T extends { row: SearchRow } = AnyResolved> { matched: T[]; unknown: T[]; window: string[] | null }

/** 現在の検索結果：終了・中止は除外。条件に必要なデータが未確認の回は unknown に分ける */
export function search<T extends { row: SearchRow }>(all: T[], c: Criteria, now: Date): SearchResult<T> {
  const window = dateWindow(c, now);
  const matched: T[] = [];
  const unknown: T[] = [];
  for (const r of all) {
    const m = matchCriteria(r.row, c, now, window);
    if (m === 'match') matched.push(r);
    else if (m === 'unknown') unknown.push(r);
  }
  return { matched, unknown, window };
}

/** 次に候補がある日（0件のときの案内用）。today 以降で、現在の日付条件以外は同じ条件で最初に適合する日 */
export function nextAvailableDate(all: { row: SearchRow }[], c: Criteria, now: Date): string | null {
  const today = jstDateString(now);
  const rest: Criteria = { ...c, when: 'all', date: undefined };
  const dates = all.filter((r) => r.row.date >= today && matchCriteria(r.row, rest, now, null) === 'match').map((r) => r.row.date);
  const window = dateWindow(c, now);
  const after = window && window.length ? window[window.length - 1] : today;
  return dates.filter((d) => d > after).sort()[0] ?? null;
}

// ---------- 表示用 ----------
export function fmtYen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`;
}
export const EVENT_LABEL: Record<EventState, string> = {
  upcoming: '開催予定', 'today-time-unknown': '本日開催予定（開演時刻は公式で確認）', started: '開演済み', ended: '終了', cancelled: '中止', unknown: '開催未確認',
};
export const EVENT_STATUS_LABEL: Record<Occurrence['eventStatus'], string> = {
  scheduled: '開催予定', confirmed: '開催確定', cancelled: '中止', ended: '終了', unknown: '未確認',
};
export const SALES_LABEL: Record<SalesStatus, string> = { 'not-yet': '発売前', open: '受付中', closed: '受付終了', unknown: '受付状況は未確認' };
export const SEAT_LABEL: Record<SeatStatus, string> = { available: '確認時点で空席あり', soldout: '確認時点で満席', unknown: '空席は公式サイトで確認' };
export const FORMAT_LABEL: Record<Work['party']['format'], string> = { shared: '相席（他の参加者と一緒）', private: '申込単位で貸切', either: '相席・貸切の両方あり', unknown: '参加形式は未確認' };
export const CTA_LABEL: Record<CtaKind, string> = {
  book: '公式ページで予約する',
  check: '公式ページで空席・受付状況を確認する',
  soldout: '満席（確認時点）・公式ページで最新状況を確認',
  'not-yet': '発売前・公式ページで発売日を確認',
  closed: '受付終了',
  started: '開演済み',
  ended: '終了',
  cancelled: '中止',
  unknown: '開催未確認・公式ページで確認',
};

/** データ登録時の検証（scripts/events-validate.mjs と index.ts の両方で使う） */
export function validateDataset(ds: EventsDataset): string[] {
  const errs: string[] = [];
  const ids = (xs: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const x of xs) { if (seen.has(x.id)) errs.push(`${label} の id が重複: ${x.id}`); seen.add(x.id); }
    return seen;
  };
  const srcIds = ids(ds.sources, 'sources');
  const orgIds = ids(ds.organizers, 'organizers');
  const venueIds = ids(ds.venues, 'venues');
  const chIds = ids(ds.channels, 'channels');
  const workIds = ids(ds.works, 'works');
  ids(ds.occurrences, 'occurrences');
  const isUrl = (u: string) => /^https:\/\/[^\s"'<>]+$/.test(u) || /^\/[^\s"'<>]*$/.test(u);
  const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
  for (const s of ds.sources) {
    if (!s.label || !s.terms || !s.checkedAt || !s.checkedBy) errs.push(`source ${s.id}: label/terms/checkedAt/checkedBy が不足`);
    if (s.checkedAt && !isIso(s.checkedAt)) errs.push(`source ${s.id}: checkedAt が ISO 8601（+09:00）でない`);
    if (s.url && !/^https:\/\//.test(s.url)) errs.push(`source ${s.id}: url が https でない`);
  }
  const chkSrc = (label: string, list: string[]) => {
    if (!list.length) errs.push(`${label}: 情報源（sourceIds）が空`);
    for (const id of list) if (!srcIds.has(id)) errs.push(`${label}: 情報源 ${id} が sources に無い`);
  };
  for (const o of ds.organizers) { if (!o.name || !o.relationLabel) errs.push(`organizer ${o.id}: name/relationLabel が不足`); chkSrc(`organizer ${o.id}`, o.sourceIds); }
  for (const v of ds.venues) { if (!v.name || !v.regionId || !v.areaId) errs.push(`venue ${v.id}: name/regionId/areaId が不足`); chkSrc(`venue ${v.id}`, v.sourceIds); }
  for (const c of ds.channels) if (!c.name || !c.feeNote) errs.push(`channel ${c.id}: name/feeNote が不足`);
  const slugs = new Set<string>();
  for (const w of ds.works) {
    const L = `work ${w.id}`;
    if (!w.slug || !/^[a-z0-9-]+$/.test(w.slug)) errs.push(`${L}: slug が不正`);
    if (slugs.has(w.slug)) errs.push(`${L}: slug が重複 ${w.slug}`); slugs.add(w.slug);
    if (!w.title || !w.summary || !w.description?.length) errs.push(`${L}: title/summary/description が不足`);
    if (!orgIds.has(w.organizerId)) errs.push(`${L}: organizerId ${w.organizerId} が無い`);
    if (!w.genres?.length) errs.push(`${L}: genres が空`);
    if (!isUrl(w.officialUrl)) errs.push(`${L}: officialUrl が不正`);
    if (!w.duration?.text) errs.push(`${L}: duration.text が不足`);
    if (!w.price || !['per-person', 'per-group', 'charter'].includes(w.price.unit)) errs.push(`${L}: price.unit（1人／1組／貸切）が不足`);
    else {
      if (!w.price.text || !w.price.feeNote) errs.push(`${L}: price.text/feeNote が不足`);
      if (w.price.unit === 'per-person' && w.price.amount === undefined) errs.push(`${L}: per-person に amount が無い`);
      if (w.price.unit === 'per-group' && !w.price.tiers?.length) errs.push(`${L}: per-group に tiers が無い`);
      if (w.price.unit === 'charter' && w.price.amount === undefined) errs.push(`${L}: charter に amount（総額）が無い`);
    }
    if (!w.party || !(w.party.min >= 1) || !w.party.text) errs.push(`${L}: party.min/text が不足`);
    if (w.party?.max !== undefined && w.party.max < w.party.min) errs.push(`${L}: party.max < min`);
    if (w.party && w.party.min > 1 && w.party.soloAllowed) errs.push(`${L}: min>1 なのに soloAllowed`);
    if (w.image) { if (!w.image.holder || !w.image.terms || !w.image.confirmedAt || !w.image.confirmedBy) errs.push(`${L}: 画像の利用条件（holder/terms/confirmedAt/confirmedBy）が未確認`); }
    chkSrc(L, w.sourceIds);
    if (!w.verified?.at || !w.verified?.by || !isIso(w.verified.at)) errs.push(`${L}: verified.at/by が不足または形式不正`);
    if (!(w.verifyTtlDays > 0)) errs.push(`${L}: verifyTtlDays が不足`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.updatedAt)) errs.push(`${L}: updatedAt が不正`);
  }
  const dup = new Set<string>();
  for (const o of ds.occurrences) {
    const L = `occurrence ${o.id}`;
    if (!workIds.has(o.workId)) errs.push(`${L}: workId ${o.workId} が無い`);
    if (!venueIds.has(o.venueId)) errs.push(`${L}: venueId ${o.venueId} が無い`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || jstDateString(new Date(`${o.date}T12:00:00Z`)) !== o.date) errs.push(`${L}: date が不正`);
    if (o.startTime && !TIME_RE.test(o.startTime)) errs.push(`${L}: startTime が不正`);
    if (o.endTime && !TIME_RE.test(o.endTime)) errs.push(`${L}: endTime が不正`);
    if (o.startTime && o.endTime && hhmmToMin(o.endTime) <= hhmmToMin(o.startTime)) errs.push(`${L}: 終了時刻が開演時刻以前`);
    if (o.endTime && !o.startTime) errs.push(`${L}: 開演時刻なしで終了時刻だけある`);
    if (!['scheduled', 'confirmed', 'cancelled', 'ended', 'unknown'].includes(o.eventStatus)) errs.push(`${L}: eventStatus が不正`);
    if (!o.eventCheckedAt || !isIso(o.eventCheckedAt) || !o.eventCheckedBy) errs.push(`${L}: 開催情報の確認日時・担当が不足`);
    if (!o.sales || !['not-yet', 'open', 'closed', 'unknown'].includes(o.sales.status)) errs.push(`${L}: sales.status が不正`);
    if (o.sales?.status !== 'unknown' && !o.sales?.checkedAt) errs.push(`${L}: 販売状態 ${o.sales?.status} に確認日時（sales.checkedAt）が無い`);
    if (o.sales?.closesAt && !isIso(o.sales.closesAt)) errs.push(`${L}: sales.closesAt が不正`);
    if (o.sales?.closesAt && o.sales.closesAt.slice(0, 10) > o.date) errs.push(`${L}: 販売締切が開催日より後`);
    if (!o.sales?.channels?.length) errs.push(`${L}: 公式販売先（sales.channels）が空`);
    for (const ch of o.sales?.channels ?? []) {
      if (!chIds.has(ch.channelId)) errs.push(`${L}: channelId ${ch.channelId} が無い`);
      if (!/^https:\/\/[^\s"'<>]+$/.test(ch.url)) errs.push(`${L}: 販売先 URL が不正 ${ch.url}`);
    }
    if (!o.seats || !['available', 'soldout', 'unknown'].includes(o.seats.status)) errs.push(`${L}: seats.status が不正`);
    if (o.seats?.status !== 'unknown' && (!o.seats?.checkedAt || !o.seats?.expiresAt)) errs.push(`${L}: 空席状態 ${o.seats?.status} に確認日時と有効期限（seats.checkedAt/expiresAt）が必要`);
    if (o.seats?.checkedAt && !isIso(o.seats.checkedAt)) errs.push(`${L}: seats.checkedAt が不正`);
    if (o.seats?.expiresAt && !isIso(o.seats.expiresAt)) errs.push(`${L}: seats.expiresAt が不正`);
    if (o.seats?.remaining !== undefined && !o.seats.remainingTerms) errs.push(`${L}: 残席数を出すには取得・再掲載条件（remainingTerms）が必要`);
    if (o.seats?.remaining !== undefined && o.seats.status !== 'available') errs.push(`${L}: 残席数があるのに status が available でない`);
    chkSrc(L, o.sourceIds);
    if (o.published && !o.test) {
      const key = `${o.workId}|${o.venueId}|${o.date}|${o.startTime ?? ''}`;
      if (dup.has(key)) errs.push(`${L}: 同じ公演回の重複（${key}）`);
      dup.add(key);
    }
    if (o.test && o.published) errs.push(`${L}: テストデータ（test:true）が published`);
  }
  const siteIds = new Set((ds.sites ?? []).map((x) => x.id));
  const dupL = new Set<string>();
  for (const l of ds.listings ?? []) {
    const L = `listing ${l.id}`;
    if (!l.title || !l.organizerName) errs.push(`${L}: title/organizerName が不足`);
    if (!siteIds.has(l.siteId)) errs.push(`${L}: siteId ${l.siteId} が sourceSites に無い`);
    if (!/^https:\/\/[^\s"'<>]+$/.test(l.url)) errs.push(`${L}: url が不正`);
    if (!l.genres?.length) errs.push(`${L}: genres が空`);
    if (!l.regionId || !l.areaId) errs.push(`${L}: regionId/areaId が不足`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date) || jstDateString(new Date(`${l.date}T12:00:00Z`)) !== l.date) errs.push(`${L}: date が不正`);
    if (l.startTime && !TIME_RE.test(l.startTime)) errs.push(`${L}: startTime が不正`);
    if (l.endTime && !TIME_RE.test(l.endTime)) errs.push(`${L}: endTime が不正`);
    if (l.startTime && l.endTime && hhmmToMin(l.endTime) <= hhmmToMin(l.startTime)) errs.push(`${L}: 終了時刻が開演時刻以前`);
    if (l.priceText && !l.priceUnit) errs.push(`${L}: 料金があるのに priceUnit（1人／1組／貸切）が無い`);
    if (l.amount !== undefined && l.priceUnit !== 'per-person') errs.push(`${L}: amount は1人あたり（per-person）の時だけ`);
    if (l.party && !(l.party.min >= 1)) errs.push(`${L}: party.min が不正`);
    if (!['open', 'soldout', 'cancelled', 'unknown'].includes(l.status)) errs.push(`${L}: status が不正`);
    if (!l.checkedAt || !isIso(l.checkedAt) || !l.checkedBy) errs.push(`${L}: checkedAt/checkedBy が不足`);
    if (l.remainingText && l.status === 'unknown') errs.push(`${L}: 残席の文言があるのに status が unknown`);
    if (l.test && l.published) errs.push(`${L}: テストデータ（test:true）が published`);
    if (l.published && !l.test) {
      const key = `${l.siteId}|${l.title}|${l.date}|${l.startTime ?? ''}`;
      if (dupL.has(key)) errs.push(`${L}: 同じ掲載の重複（${key}）`);
      dupL.add(key);
    }
  }
  return errs;
}
