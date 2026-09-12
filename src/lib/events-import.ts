// 外部サイトの公演ページから「公演回の候補」を取り出す（/contact/admin/events/ と /api/events/refresh 用）。
// 方針（CLAUDE.md・docs/events-setup.md）：
//  - 管理者が URL を指定した時に、その1ページだけをその場で取得する（人がサイトを開いて確認する行為の代替）。
//    サイト全体の巡回や、利用条件未確認のサイトの無人の定期取得はしない。
//  - まず schema.org の Event（JSON-LD）を読む。機械向けに公開された構造化データなので最も確実。
//  - 無ければ本文テキストから日付・時刻・料金・残席の並びを拾う（精度は低いので必ず人が確認して公開する）。
//  - 取れなかった項目は埋めない（未確認のまま）。
import type { Genre, Listing } from '../data/events/types.ts';
import { hhmmToMin, minToHhmm } from './events.ts';
import { jstDateString, addDays } from './thisWeek.ts';

export const FETCH_UA = 'ex-labs-events/1.0 (+https://kabuexlabs.com/events/about/; info@kabuexlabs.com)';
const MAX_BYTES = 2 * 1024 * 1024;

export interface FetchResult { ok: boolean; status: number; body: string; contentType: string; error?: string }

/** 1ページを取得する（https のみ、10秒、2MB まで）。robots や利用条件の判断は呼び出し側（管理者）が行う */
export async function fetchPage(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchResult> {
  if (!/^https:\/\/[^\s"'<>]+$/.test(url)) return { ok: false, status: 0, body: '', contentType: '', error: 'https の URL だけ取得できます' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': FETCH_UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.5', 'Accept-Language': 'ja,en;q=0.5' }, redirect: 'follow', signal: ctrl.signal });
    const contentType = res.headers.get('content-type') ?? '';
    const buf = await res.arrayBuffer();
    const body = new TextDecoder('utf-8').decode(buf.slice(0, MAX_BYTES));
    return { ok: res.ok, status: res.status, body, contentType, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: 0, body: '', contentType: '', error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export interface Candidate {
  title: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  venueName?: string;
  organizerName?: string;
  url?: string;
  priceText?: string;
  priceUnit?: Listing['priceUnit'];
  amount?: number;
  status: Listing['status'];
  remainingText?: string;
  /** jsonld＝構造化データ、text＝本文の推定（要確認） */
  via: 'jsonld' | 'text';
  /** 根拠となった文字列（管理画面で見せる） */
  evidence: string;
  genres?: Genre[];
}

// ---------- JSON-LD ----------
function collectEvents(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) collectEvents(n, out); return; }
  const o = node as Record<string, unknown>;
  const type = o['@type'];
  const types = Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
  if (types.some((t) => /Event$/.test(t)) && (o.name || o.startDate)) out.push(o);
  for (const k of ['@graph', 'itemListElement', 'item', 'subEvent', 'mainEntity', 'hasPart']) if (o[k]) collectEvents(o[k], out);
}

function toJstParts(iso: string): { date?: string; time?: string } {
  const s = String(iso).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return {};
  if (!m[2]) return { date: m[1] };
  // タイムゾーン付きなら日本時間に直す。無ければ日本時間として扱う
  if (m[4]) {
    const d = new Date(s.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (Number.isNaN(d.getTime())) return { date: m[1], time: `${m[2]}:${m[3]}` };
    const j = new Date(d.getTime() + 9 * 3600000);
    return { date: j.toISOString().slice(0, 10), time: j.toISOString().slice(11, 16) };
  }
  return { date: m[1], time: `${m[2]}:${m[3]}` };
}

function text(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object' && !Array.isArray(v)) return text((v as Record<string, unknown>).name);
  if (Array.isArray(v)) return text(v[0]);
  return undefined;
}

export function extractJsonLd(html: string, pageUrl: string): Candidate[] {
  const out: Candidate[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let parsed: unknown;
    try { parsed = JSON.parse(m[1].trim()); } catch { continue; }
    const events: Record<string, unknown>[] = [];
    collectEvents(parsed, events);
    for (const e of events) {
      const name = text(e.name);
      const start = e.startDate ? toJstParts(String(e.startDate)) : {};
      if (!name || !start.date) continue;
      const end = e.endDate ? toJstParts(String(e.endDate)) : {};
      const loc = e.location as Record<string, unknown> | undefined;
      const offersRaw = Array.isArray(e.offers) ? e.offers[0] : e.offers;
      const offers = (offersRaw && typeof offersRaw === 'object' ? offersRaw : undefined) as Record<string, unknown> | undefined;
      const price = offers?.price !== undefined ? Number(String(offers.price).replace(/[^\d.]/g, '')) : NaN;
      const avail = String(offers?.availability ?? '');
      const st = String(e.eventStatus ?? '');
      const status: Listing['status'] = /Cancelled/i.test(st) ? 'cancelled' : /SoldOut/i.test(avail) ? 'soldout' : /InStock|PreOrder|LimitedAvailability/i.test(avail) ? 'open' : 'unknown';
      const c: Candidate = {
        title: name,
        date: start.date,
        startTime: start.time,
        endTime: end.date === start.date ? end.time : undefined,
        venueName: text(loc?.name),
        organizerName: text(e.organizer),
        url: text(offers?.url) ?? text(e.url) ?? pageUrl,
        status,
        via: 'jsonld',
        evidence: `JSON-LD ${String(e['@type'])}: ${name} ${String(e.startDate)}`,
      };
      if (Number.isFinite(price) && price > 0 && (offers?.priceCurrency === undefined || /JPY/i.test(String(offers.priceCurrency)))) {
        c.priceText = `¥${price.toLocaleString('ja-JP')}`;
        // 構造化データの price は通常1人分だが、断定できないので単位は per-person を仮置きし管理画面で確認する
        c.priceUnit = 'per-person';
        c.amount = price;
      }
      if (c.startTime && c.endTime && hhmmToMin(c.endTime) > hhmmToMin(c.startTime)) c.durationMinutes = hhmmToMin(c.endTime) - hhmmToMin(c.startTime);
      out.push(c);
    }
  }
  return dedupe(out);
}

// ---------- 本文テキストの推定 ----------
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h[1-6]|section|article|dd|dt|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t　]+/g, ' ').replace(/\n\s*\n+/g, '\n');
}

const Z = (s: string) => s.replace(/[０-９：／]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 「9/20」「9月20日」「2026-09-20」「2026/9/20」を YYYY-MM-DD に。年が無ければ now を基準に、30日以上過去なら翌年 */
export function parseDateJa(s: string, now: Date): string | undefined {
  const t = Z(s);
  let y: number | undefined, mo: number | undefined, d: number | undefined;
  let m = t.match(/(\d{4})[-\/.年]\s*(\d{1,2})[-\/.月]\s*(\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = t.match(/(?<!\d)(\d{1,2})[\/月]\s*(\d{1,2})(?:日)?(?!\d|:)/))) { mo = +m[1]; d = +m[2]; }
  if (!mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return undefined;
  const today = jstDateString(now);
  if (y === undefined) {
    y = +today.slice(0, 4);
    const cand = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (cand < addDays(today, -30)) y += 1;
  }
  const out = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return jstDateString(new Date(`${out}T12:00:00Z`)) === out ? out : undefined;
}

export function parseTimeJa(s: string): string | undefined {
  const t = Z(s);
  const m = t.match(/(?<!\d)([01]?\d|2[0-3])[:時]\s*([0-5]\d)?(?:分)?(?!\d)/);
  if (!m) return undefined;
  if (!/[:時]/.test(m[0])) return undefined;
  return minToHhmm(+m[1] * 60 + (m[2] ? +m[2] : 0));
}

export function parsePriceJa(s: string): { text: string; amount: number } | undefined {
  const t = Z(s).replace(/,/g, '');
  const m = t.match(/(?:¥|￥)\s*(\d{3,6})|(\d{3,6})\s*円/);
  if (!m) return undefined;
  const amount = +(m[1] ?? m[2]);
  return { text: `¥${amount.toLocaleString('ja-JP')}`, amount };
}

export function parseRemainingJa(s: string): { text: string; status: Listing['status'] } | undefined {
  const t = Z(s);
  if (/満席|完売|SOLD\s*OUT|受付終了/i.test(t)) return { text: (t.match(/満席|完売|SOLD\s*OUT|受付終了/i) || [''])[0], status: 'soldout' };
  if (/中止/.test(t)) return { text: '中止', status: 'cancelled' };
  const m = t.match(/(?:残り?|あと|🈳|空席)\s*(\d{1,2})\s*(?:席|名|人|枠)?/);
  if (m) return { text: `残り${m[1]}席`, status: 'open' };
  if (/募集中|受付中|予約可/.test(t)) return { text: (t.match(/募集中|受付中|予約可/) || [''])[0], status: 'open' };
  return undefined;
}

/** 本文テキストから「日付＋時刻を含む行」を回の候補にする。作品名は直前の見出しっぽい行（短い・記号少なめ）を採用 */
export function extractFromText(raw: string, now: Date, pageUrl?: string): Candidate[] {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const out: Candidate[] = [];
  let lastTitle = '';
  const looksTitle = (l: string) => l.length >= 2 && l.length <= 60 && !/https?:|¥|円|残り|\d{1,2}[:時]\d{2}/.test(l) && !/^\d/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const date = parseDateJa(l, now);
    const time = parseTimeJa(l);
    if (!date || !time) { if (looksTitle(l)) lastTitle = l; continue; }
    // 料金・残席は同じ行を優先。次の行は「別の回（日付入り）」でない時だけ補助的に見る
    const nxt = lines[i + 1] && !parseDateJa(lines[i + 1], now) ? lines[i + 1] : '';
    const price = parsePriceJa(l) ?? parsePriceJa(nxt);
    const rem = parseRemainingJa(l) ?? parseRemainingJa(nxt);
    const c: Candidate = { title: lastTitle || '（作品名を入力）', date, startTime: time, url: pageUrl, status: rem?.status ?? 'unknown', via: 'text', evidence: l.slice(0, 120) };
    if (price) { c.priceText = price.text; c.amount = undefined; c.priceUnit = undefined; }
    if (rem && rem.status !== 'cancelled') c.remainingText = rem.text;
    out.push(c);
  }
  return dedupe(out);
}

function dedupe(cs: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cs.filter((c) => { const k = `${c.title}|${c.date}|${c.startTime ?? ''}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** ページから候補を取り出す。JSON-LD があればそれを優先し、無ければ本文推定 */
export function extractCandidates(html: string, pageUrl: string, now: Date): { via: 'jsonld' | 'text' | 'none'; candidates: Candidate[] } {
  const ld = extractJsonLd(html, pageUrl);
  if (ld.length) return { via: 'jsonld', candidates: ld };
  const t = extractFromText(stripHtml(html), now, pageUrl);
  return { via: t.length ? 'text' : 'none', candidates: t };
}

/** 候補を Listing にする（公開は管理者が確認してから） */
export function candidateToListing(c: Candidate, o: { id: string; siteId: string; regionId: string; areaId: string; genres: Genre[]; organizerName: string; url: string; checkedBy: string; now: Date }): Listing {
  return {
    id: o.id, title: c.title, siteId: o.siteId, organizerName: o.organizerName, url: o.url, genres: o.genres,
    regionId: o.regionId, areaId: o.areaId, venueName: c.venueName,
    date: c.date ?? jstDateString(o.now), startTime: c.startTime, endTime: c.endTime, durationMinutes: c.durationMinutes,
    priceText: c.priceText, priceUnit: c.priceUnit, amount: c.amount,
    status: c.status, remainingText: c.remainingText,
    checkedAt: new Date(o.now.getTime() + 9 * 3600000).toISOString().replace(/\.\d{3}Z$/, '+09:00'), checkedBy: o.checkedBy, published: true,
    sourceUrl: o.url, fetchedVia: c.via,
  };
}
