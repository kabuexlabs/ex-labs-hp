import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sendMail, adminEmail } from './yoyaku';
import { HT_CONTACT_EMAIL } from '../data/hacktale';
import {
  type HtFormat,
  type GoKind,
  defaultAcceptTemplate,
  defaultGoTemplate,
  FLOP_TEMPLATE,
  SUBJECTS,
  renderTemplate,
  missingPlaceholders,
} from './hacktaleTemplates';

// ---------------------------------------------------------------------------
// HACKTALE 公演予約（/hacktale/reservation/ と /hacktale/admin/）のデータ層。
//
// 「作品」と「公演回」を分けて管理する：
//   ・作品   … 作品名・紹介文・画像・所要時間・標準の定員（公演回の初期値）
//   ・公演回 … 作品ID・形式（対面/オンライン）・開催日時・会場・料金・定員・
//              開催最少人数・受付期限・状態・メール文面
// 残席は「公演回の定員 − 確定済み予約の合計人数」。確定人数は Redis の
// カウンタ（ht:seats:<id>）で持ち、予約の作成・変更・キャンセルは EVAL
// （Luaスクリプト）で人数チェックと書き込みを1コマンドにまとめる。
// Redis のコマンドは直列に実行されるため、残り1席への同時申し込みでも
// 定員を超えない（確定するのは先に処理された1件だけ）。
//
// 開催の流れ（HACKTALE の実運用）:
//   申し込み → 受付メール「開催人数に達したら改めてご案内」
//   → 最少人数に達したら「開催決定（立卓）」→ 開催案内メール（会場・支払い等）
//   → 達しなければ「開催見送り（流卓）」→ 見送りメール
// 対面は最少人数に達した時点で自動で開催決定・案内送信できる（autoGo）。
// オンラインは Discord リンクを公演回ごとに入れてから手動で一斉送信する。
//
// ストレージ: Upstash Redis（/yoyaku・/api/contact と同じ無料インフラ）。
// メール:     lib/yoyaku.ts の sendMail を共用（自社SMTP優先・Resend予備）。
// 日時:       'YYYY-MM-DDTHH:mm' の日本時間文字列で統一して保存・比較する。
// ---------------------------------------------------------------------------

export interface HtWorkRec {
  id: string; // URLスラッグ兼ID（例: present-poker）
  title: string;
  desc?: string;
  image?: string; // 例: /assets/hacktale/kv-poker.webp
  durationMin?: number;
  /** 標準の定員。公演回を新規作成するときの初期値（既存の公演回には影響しない） */
  defaultCapacity: number;
  /** 料金の初期値（公演回作成時にコピーされる） */
  defaultPrice?: string;
  /** 形式の初期値 */
  defaultFormat?: HtFormat;
  active: boolean; // false: 新しい公演回の作成対象から外す（既存回はそのまま）
  createdAt: string;
}

export type HtSessionStatus = 'draft' | 'open' | 'closed' | 'cancelled';
export const SESSION_STATUS_LABEL: Record<HtSessionStatus, string> = {
  draft: '非公開',
  open: '公開（受付中）',
  closed: '受付停止',
  cancelled: '中止',
};

export interface HtSession {
  id: string;
  workId: string;
  format?: HtFormat; // 未設定の旧データは作品の既定値
  start: string; // 'YYYY-MM-DDTHH:mm'（日本時間）
  venue: string;
  meeting?: string; // 集合場所
  price: string; // 料金（例: 4,500円）
  capacity: number;
  /** 開催に必要な最少人数（未設定なら定員と同じ） */
  minPlayers?: number;
  /** 最少人数に達したら自動で開催決定し、開催案内を送る */
  autoGo?: boolean;
  /** 開催決定（立卓）済み */
  go?: boolean;
  goAt?: string;
  /** 人数未達による開催見送り（流卓）。status は cancelled になる */
  flop?: boolean;
  discordUrl?: string;
  acceptTemplate?: string;
  goTemplate?: string;
  flopTemplate?: string;
  deadline?: string; // 受付期限（省略時は開始時刻まで）
  notes?: string; // 当日の注意事項（予約ページに掲載）
  status: HtSessionStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface HtReservation {
  id: string; // 予約番号（例: HT-260927-K3F8）
  sessionId: string;
  name: string;
  email: string;
  phone: string;
  xId?: string;
  count: number;
  note?: string;
  status: 'confirmed' | 'cancelled';
  source: 'web' | 'manual';
  createdAt: string;
  cancelledAt?: string;
  /** リマインド送信済み時刻（二重送信防止） */
  remindedAt?: string;
  /** リマインド対象外の理由（例: 送信タイミングを過ぎてからの予約） */
  reminderSkipped?: string;
  /** 受付メールの送信成功時刻。未送信・失敗なら undefined */
  confirmMailAt?: string;
  confirmMailError?: string;
  /** 開催案内メールの送信成功時刻 */
  goMailAt?: string;
  goMailError?: string;
  /** 見送りメールの送信成功時刻 */
  flopMailAt?: string;
}

export interface HtSettings {
  reminderEnabled: boolean;
  /**
   * 開始まで何時間以内の公演にリマインドを送るか。
   * 送信は毎朝9時（JST）の定期実行時なので、時刻ではなく時間幅で制御する。
   * 既定36時間 ＝ 実質「前日の朝9時」（例: 翌日19時開演 → 前日9時に送信）。
   */
  reminderHours: number;
  /** 振込先（オンライン公演の開催案内に {振込先} として差し込む）。公開リポジトリに置かないため KV に保存 */
  bankInfo?: string;
}

export const DEFAULT_SETTINGS: HtSettings = { reminderEnabled: true, reminderHours: 36 };

export type HtMailKind = 'confirm' | 'go' | 'flop' | 'remind' | 'notice' | 'admin';
export const MAIL_KIND_LABEL: Record<HtMailKind, string> = {
  confirm: '受付', go: '開催案内', flop: '見送り', remind: 'リマインド', notice: '案内', admin: '管理者',
};

export interface HtMailLog {
  at: string;
  kind: HtMailKind;
  sessionId: string;
  reservationId?: string;
  to: string;
  subject: string;
  ok: boolean;
  error?: string;
}

// --- Redis (Upstash REST) ----------------------------------------------------
// contact.ts と違い、予約の書き込みは失敗を握りつぶさない（例外にする）。
// 「予約できたように見えて保存されていない」事故を防ぐため。

function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
  return v?.trim() || undefined;
}

function kvConfig(): { url: string; token: string } | null {
  const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
  const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function isKvConfigured(): boolean {
  return kvConfig() !== null;
}

async function redis(...command: (string | number)[]): Promise<unknown> {
  const cfg = kvConfig();
  if (!cfg) throw new Error('KV is not configured');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command.map(String)),
  });
  if (!res.ok) throw new Error(`[hacktale] KV request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[hacktale] KV command failed: ${data.error}`);
  return data.result;
}

const WORKS_KEY = 'ht:works';
const SESSIONS_KEY = 'ht:sessions';
const SETTINGS_KEY = 'ht:settings';
const MAILLOG_KEY = 'ht:maillog';
const seatsKey = (sessionId: string) => `ht:seats:${sessionId}`;
const resKey = (sessionId: string) => `ht:res:${sessionId}`;

function parseHash<T>(flat: unknown): Map<string, T> {
  const map = new Map<string, T>();
  if (!Array.isArray(flat)) return map;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      map.set(String(flat[i]), JSON.parse(String(flat[i + 1])) as T);
    } catch {
      // 壊れたレコードは無視して他を生かす
    }
  }
  return map;
}

// --- 日時ヘルパー（JST文字列 'YYYY-MM-DDTHH:mm'） -----------------------------

/** 現在時刻を JST の 'YYYY-MM-DDTHH:mm' で返す。保存形式と同じなので文字列比較できる。 */
export function jstNow(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16);
}

/** 'YYYY-MM-DDTHH:mm'（JST）→ 開始までの残り時間（時間、負なら過去） */
export function hoursUntil(start: string, now = jstNow()): number {
  const toMs = (s: string) => Date.parse(`${s}:00Z`); // 両方JST扱いなので差分は正しい
  return (toMs(start) - toMs(now)) / 3600000;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** '2026-10-12T14:00' → '2026年10月12日(月) 14:00' */
export function formatStartJa(start: string): string {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/);
  if (!m) return start;
  const wd = WEEKDAYS[new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getUTCDay()];
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日(${wd}) ${m[4]}`;
}

export function validStart(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}:00Z`));
}

// --- 作品 ---------------------------------------------------------------------

export async function getWorks(): Promise<HtWorkRec[]> {
  const map = parseHash<HtWorkRec>(await redis('HGETALL', WORKS_KEY));
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getWork(id: string): Promise<HtWorkRec | null> {
  const raw = await redis('HGET', WORKS_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as HtWorkRec;
  } catch {
    return null;
  }
}

export async function saveWork(w: HtWorkRec): Promise<void> {
  await redis('HSET', WORKS_KEY, w.id, JSON.stringify(w));
}

// 初版の既定料金は長い説明文で、メールの {料金} 差し込みに向かないため置き換える。
const LEGACY_PRICE: Record<string, string> = {
  '4,500円（1名様あたり）／お支払い方法は当日ご案内します': '4,500円',
  '4,500円（オフライン）／3,500円（オンライン）／お支払い方法は当日ご案内します': '3,500円',
};

/** サイト掲載中の3作品を初期データとして投入（既存があれば初版の既定値だけ補正）。 */
export async function seedWorks(): Promise<void> {
  const existing = await getWorks();
  if (existing.length > 0) {
    for (const w of existing) {
      const fixed = w.defaultPrice && LEGACY_PRICE[w.defaultPrice];
      if (fixed || !w.defaultFormat) {
        await saveWork({
          ...w,
          defaultPrice: fixed || w.defaultPrice,
          defaultFormat: w.defaultFormat ?? (w.id === 'werewolf-theorem' ? 'online' : 'offline'),
        });
      }
    }
    return;
  }
  const now = new Date().toISOString();
  const seeds: HtWorkRec[] = [
    { id: 'present-poker', title: 'プレゼント・ポーカー', desc: '交渉/閃き/論理を駆使し、勝利を目指せ。公演終了時、明確に1名の勝利者が出る。', image: '/assets/hacktale/kv-poker.webp', durationMin: 180, defaultCapacity: 6, defaultPrice: '4,500円', defaultFormat: 'offline', active: true, createdAt: now },
    { id: 'werewolf-theorem', title: '人狼定理', desc: '論理と交渉の頭脳戦。勝利者は2名、途中脱落なし。人狼のルールを知らなくても遊べる。', image: '/assets/hacktale/kv-werewolf.webp', durationMin: 240, defaultCapacity: 8, defaultPrice: '3,500円', defaultFormat: 'online', active: true, createdAt: now },
    { id: 'dice-box', title: 'ダイスボックス', desc: '閃きが試される、ダイスの箱。', image: '/assets/hacktale/kv-dicebox.webp', durationMin: 240, defaultCapacity: 9, defaultPrice: '未定', defaultFormat: 'offline', active: true, createdAt: now },
  ];
  for (const w of seeds) await saveWork(w);
}

// --- 公演回 --------------------------------------------------------------------

export async function getSessions(): Promise<HtSession[]> {
  const map = parseHash<HtSession>(await redis('HGETALL', SESSIONS_KEY));
  return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export async function getSession(id: string): Promise<HtSession | null> {
  const raw = await redis('HGET', SESSIONS_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as HtSession;
  } catch {
    return null;
  }
}

export async function saveSession(s: HtSession): Promise<void> {
  await redis('HSET', SESSIONS_KEY, s.id, JSON.stringify({ ...s, updatedAt: new Date().toISOString() }));
}

/** 予約レコードが1件もない公演回だけ削除できる（履歴保全）。 */
export async function deleteSessionIfEmpty(id: string): Promise<boolean> {
  const n = Number(await redis('HLEN', resKey(id))) || 0;
  if (n > 0) return false;
  await redis('HDEL', SESSIONS_KEY, id);
  await redis('DEL', seatsKey(id), `ht:golock:${id}`);
  return true;
}

/** 形式（旧データは作品の既定値、なければ人狼定理=オンライン・他=対面） */
export function sessionFormat(s: HtSession, work: HtWorkRec | null): HtFormat {
  return s.format ?? work?.defaultFormat ?? (s.workId === 'werewolf-theorem' ? 'online' : 'offline');
}

/** 開催に必要な最少人数（未設定なら定員） */
export function minPlayersOf(s: HtSession): number {
  return Math.min(s.minPlayers ?? s.capacity, s.capacity);
}

/** 公演回に保存された文面。未設定の旧データは既定文面を使う。 */
export function sessionTemplates(s: HtSession, work: HtWorkRec | null): { accept: string; go: string; flop: string } {
  const format = sessionFormat(s, work);
  return {
    accept: s.acceptTemplate ?? defaultAcceptTemplate(s.workId),
    go: s.goTemplate ?? defaultGoTemplate(format === 'online' ? 'online' : 'offline'),
    flop: s.flopTemplate ?? FLOP_TEMPLATE,
  };
}

/** 新しい公演回に入れる文面一式 */
export function initialTemplates(workId: string, goKind: GoKind): Pick<HtSession, 'acceptTemplate' | 'goTemplate' | 'flopTemplate'> {
  return {
    acceptTemplate: defaultAcceptTemplate(workId),
    goTemplate: defaultGoTemplate(goKind),
    flopTemplate: FLOP_TEMPLATE,
  };
}

const SESSION_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function randId(len: number, alphabet: string): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function newSessionId(): string {
  return `s${randId(8, SESSION_ALPHABET)}`;
}

/** 予約番号。日付入りで照会しやすく、推測は困難（この番号から個人情報は引けない）。 */
export function newReservationId(): string {
  const d = jstNow(); // YYYY-MM-DDTHH:mm
  const ymd = d.slice(2, 4) + d.slice(5, 7) + d.slice(8, 10);
  return `HT-${ymd}-${randId(4, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789')}`;
}

// --- 残席と受付状態 -------------------------------------------------------------

export async function bookedSeats(sessionId: string): Promise<number> {
  return Number(await redis('GET', seatsKey(sessionId))) || 0;
}

/** 複数公演の確定人数をまとめて取得（一覧ページ用）。 */
export async function bookedSeatsMap(sessionIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (sessionIds.length === 0) return out;
  const raw = await redis('MGET', ...sessionIds.map(seatsKey));
  if (Array.isArray(raw)) sessionIds.forEach((id, i) => out.set(id, Number(raw[i]) || 0));
  return out;
}

export type HtAvailability =
  | { state: 'open'; remaining: number }
  | { state: 'full' }
  | { state: 'closed' }
  | { state: 'cancelled'; flop?: boolean };

export const AVAILABILITY_LABEL = (a: HtAvailability): string =>
  a.state === 'open'
    ? `受付中：残り${a.remaining}席`
    : a.state === 'full'
      ? '満席'
      : a.state === 'closed'
        ? '受付終了'
        : a.flop
          ? '開催見送り'
          : '公演中止';

/** 公演回の受付状態。受付中(残り○席)/満席/受付終了/公演中止（開催見送り） */
export function availability(s: HtSession, booked: number, now = jstNow()): HtAvailability {
  if (s.status === 'cancelled') return { state: 'cancelled', flop: !!s.flop };
  if (s.status === 'closed' || s.status === 'draft') return { state: 'closed' };
  const deadline = s.deadline || s.start;
  if (now >= deadline || now >= s.start) return { state: 'closed' };
  const remaining = s.capacity - booked;
  if (remaining <= 0) return { state: 'full' };
  return { state: 'open', remaining };
}

// --- 予約（原子的な残席確保） ----------------------------------------------------

export async function getReservations(sessionId: string): Promise<HtReservation[]> {
  const map = parseHash<HtReservation>(await redis('HGETALL', resKey(sessionId)));
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getReservation(sessionId: string, id: string): Promise<HtReservation | null> {
  const raw = await redis('HGET', resKey(sessionId), id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as HtReservation;
  } catch {
    return null;
  }
}

/**
 * 予約レコードの一部だけを更新する（メール送信状況の記録用）。
 * 最新のレコードを読み直してから書くので、並行する人数変更・キャンセルを
 * 古い内容で上書きしない。人数・状態の変更は必ず EVAL 経由の関数を使うこと。
 */
async function patchReservation(sessionId: string, id: string, patch: Partial<HtReservation>): Promise<void> {
  const cur = await getReservation(sessionId, id);
  if (!cur) return;
  await redis('HSET', resKey(sessionId), id, JSON.stringify({ ...cur, ...patch }));
}

// 予約確定：人数チェック → カウンタ加算 → 予約保存 を1つの Lua で原子的に行う。
// 定員はその時点の公演回設定を引数で渡す（変更直後の申し込みにも最新値が効く）。
const RESERVE_LUA = `
local booked = tonumber(redis.call('GET', KEYS[1]) or '0')
local cnt = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
if booked + cnt > cap then return -1 end
redis.call('INCRBY', KEYS[1], cnt)
redis.call('HSET', KEYS[2], ARGV[3], ARGV[4])
return booked + cnt
`;

/** 成功なら確定後の合計人数、満席で入らなければ -1 を返す。 */
export async function reserveSeats(session: HtSession, r: HtReservation): Promise<number> {
  const result = await redis(
    'EVAL', RESERVE_LUA, 2, seatsKey(session.id), resKey(session.id),
    r.count, session.capacity, r.id, JSON.stringify(r),
  );
  return Number(result);
}

// 予約人数の増減・キャンセルを原子的に行う。
// delta が正のときだけ定員チェックする（減らす・キャンセルは常に成功）。
const ADJUST_LUA = `
local booked = tonumber(redis.call('GET', KEYS[1]) or '0')
local delta = tonumber(ARGV[1])
local cap = tonumber(ARGV[2])
if delta > 0 and booked + delta > cap then return -1 end
local after = booked + delta
if after < 0 then after = 0 end
redis.call('SET', KEYS[1], after)
redis.call('HSET', KEYS[2], ARGV[3], ARGV[4])
return after
`;

async function adjustReservation(session: HtSession, r: HtReservation, delta: number): Promise<number> {
  const result = await redis(
    'EVAL', ADJUST_LUA, 2, seatsKey(session.id), resKey(session.id),
    delta, session.capacity, r.id, JSON.stringify(r),
  );
  return Number(result);
}

/** キャンセル：人数分の枠を戻し、レコードは履歴として残す。 */
export async function cancelReservation(session: HtSession, r: HtReservation): Promise<void> {
  if (r.status === 'cancelled') return;
  const updated: HtReservation = { ...r, status: 'cancelled', cancelledAt: new Date().toISOString() };
  await adjustReservation(session, updated, -r.count);
}

/** 人数変更：増やすときは残席を確認し、足りなければ false。 */
export async function changeReservationCount(session: HtSession, r: HtReservation, newCount: number): Promise<boolean> {
  if (r.status !== 'confirmed' || newCount === r.count) return true;
  const updated: HtReservation = { ...r, count: newCount };
  const result = await adjustReservation(session, updated, newCount - r.count);
  return result >= 0;
}

/**
 * 確定人数カウンタを予約レコードから再集計する（整合性の保険）。
 * 管理画面の「再集計」からのみ使う。
 */
export async function recountSeats(sessionId: string): Promise<number> {
  const list = await getReservations(sessionId);
  const total = list.filter((r) => r.status === 'confirmed').reduce((n, r) => n + r.count, 0);
  await redis('SET', seatsKey(sessionId), total);
  return total;
}

// --- 二重送信防止（冪等トークン） ------------------------------------------------
// 確認画面を表示するときにトークンを発行し、確定時に SET NX で1回だけ通す。
// 通信の再試行・ボタン連打では同じトークンが届くので、2回目以降は
// 最初に確定した予約番号を返して同じ完了画面を出す（新しい予約は作らない）。

export async function claimIdempotency(token: string, reservationId: string): Promise<{ fresh: boolean; reservationId: string }> {
  const set = await redis('SET', `ht:idem:${token}`, reservationId, 'NX', 'EX', 86400);
  if (set === 'OK') return { fresh: true, reservationId };
  const existing = await redis('GET', `ht:idem:${token}`);
  return { fresh: false, reservationId: typeof existing === 'string' ? existing : reservationId };
}

/** 確定に失敗した（満席等）ときにトークンを返上し、修正後の再申し込みを通す。 */
export async function releaseIdempotency(token: string): Promise<void> {
  await redis('DEL', `ht:idem:${token}`);
}

// --- 不正な大量申し込み対策（IPごとのレート制限） -------------------------------

export async function reserveRateLimited(ip: string): Promise<boolean> {
  const key = `ht:rl:${ip}`;
  const n = Number(await redis('INCR', key));
  if (n === 1) await redis('EXPIRE', key, 3600);
  return n > 20; // 1時間に20件を超える申し込みは拒否
}

// --- 設定 -----------------------------------------------------------------------

export async function getSettings(): Promise<HtSettings> {
  const raw = await redis('GET', SETTINGS_KEY);
  if (typeof raw !== 'string') return { ...DEFAULT_SETTINGS };
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<HtSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(s: HtSettings): Promise<void> {
  await redis('SET', SETTINGS_KEY, JSON.stringify(s));
}

// --- メール ----------------------------------------------------------------------

export async function logMail(entry: HtMailLog): Promise<void> {
  await redis('LPUSH', MAILLOG_KEY, JSON.stringify(entry));
  await redis('LTRIM', MAILLOG_KEY, 0, 499);
}

export async function getMailLog(limit = 100): Promise<HtMailLog[]> {
  const raw = await redis('LRANGE', MAILLOG_KEY, 0, limit - 1);
  if (!Array.isArray(raw)) return [];
  const out: HtMailLog[] = [];
  for (const item of raw) {
    try {
      out.push(JSON.parse(String(item)) as HtMailLog);
    } catch {
      // ignore
    }
  }
  return out;
}

function renderVars(work: HtWorkRec | null, s: HtSession, r: HtReservation | null, settings: HtSettings) {
  return {
    workTitle: work?.title ?? s.workId,
    start: s.start,
    price: s.price,
    discordUrl: s.discordUrl,
    bankInfo: settings.bankInfo,
    name: r?.name,
    count: r?.count,
    reservationId: r?.id,
  };
}

/** 文面テンプレートを予約者ごとに差し込んで送る。宛名と署名は自動で付く。 */
async function sendTemplated(
  kind: HtMailKind,
  work: HtWorkRec | null,
  s: HtSession,
  r: HtReservation,
  subjectTpl: string,
  bodyTpl: string,
  settings: HtSettings,
): Promise<boolean> {
  const vars = renderVars(work, s, r, settings);
  const subject = renderTemplate(subjectTpl, vars);
  const text =
    `${r.name} 様\n\n${renderTemplate(bodyTpl, vars)}\n\n` +
    `――――――――――\n予約番号: ${r.id}\nHACKTALE（株式会社ex Labs）\nお問い合わせ: ${HT_CONTACT_EMAIL}`;
  const ok = await sendMail(r.email, subject, text);
  await logMail({ at: new Date().toISOString(), kind, sessionId: s.id, reservationId: r.id, to: r.email, subject, ok });
  return ok;
}

/** 管理者宛の通知（件名・本文そのまま） */
export async function notifyAdmin(sessionId: string, subject: string, text: string): Promise<void> {
  const ok = await sendMail(adminEmail(), subject, text);
  await logMail({ at: new Date().toISOString(), kind: 'admin', sessionId, to: adminEmail(), subject, ok });
}

/** 受付メール（申し込み直後。「開催人数に達したら改めてご案内」） */
export async function sendAcceptMail(work: HtWorkRec | null, s: HtSession, r: HtReservation, settings: HtSettings): Promise<boolean> {
  const tpl = sessionTemplates(s, work);
  const ok = await sendTemplated('confirm', work, s, r, SUBJECTS.accept, tpl.accept, settings);
  await patchReservation(s.id, r.id, ok
    ? { confirmMailAt: new Date().toISOString(), confirmMailError: undefined }
    : { confirmMailError: `送信失敗（${new Date().toISOString()}）` });
  return ok;
}

/**
 * 開催案内メールを1件送る。予約ごとに SET NX で「送信権」を取るので、
 * 自動開催決定と手動一斉送信が重なっても同じ人に二重送信しない。
 * 失敗したら送信権を返し、再送できるようにする。
 * 戻り値: 'sent' | 'failed' | 'skipped'（送信済み・送信中）
 */
export async function sendGoMailTo(
  work: HtWorkRec | null,
  s: HtSession,
  r: HtReservation,
  settings: HtSettings,
  bodyTpl?: string,
): Promise<'sent' | 'failed' | 'skipped'> {
  if (!r.email || r.status !== 'confirmed' || r.goMailAt) return 'skipped';
  const lockKey = `ht:gomail:${r.id}`;
  const claimed = await redis('SET', lockKey, '1', 'NX', 'EX', 90 * 86400);
  if (claimed !== 'OK') return 'skipped';
  const tpl = bodyTpl ?? sessionTemplates(s, work).go;
  const ok = await sendTemplated('go', work, s, r, SUBJECTS.go, tpl, settings);
  if (ok) {
    await patchReservation(s.id, r.id, { goMailAt: new Date().toISOString(), goMailError: undefined });
    return 'sent';
  }
  await redis('DEL', lockKey);
  await patchReservation(s.id, r.id, { goMailError: `送信失敗（${new Date().toISOString()}）` });
  return 'failed';
}

/** 管理画面の「開催案内を再送」用：送信済み記録を消して送り直す。 */
export async function resendGoMail(work: HtWorkRec | null, s: HtSession, r: HtReservation, settings: HtSettings): Promise<boolean> {
  await redis('DEL', `ht:gomail:${r.id}`);
  const fresh = { ...r, goMailAt: undefined };
  return (await sendGoMailTo(work, s, fresh, settings)) === 'sent';
}

/** 開催案内を、まだ受け取っていない確定予約の全員に送る。 */
export async function sendGoMailAll(
  work: HtWorkRec | null,
  s: HtSession,
  settings: HtSettings,
  bodyTpl?: string,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const r of await getReservations(s.id)) {
    if (r.status !== 'confirmed') continue;
    if (!r.email) {
      out.skipped++;
      continue;
    }
    out[await sendGoMailTo(work, s, r, settings, bodyTpl)]++;
  }
  return out;
}

/** 見送りメールを確定予約の全員に送る。 */
export async function sendFlopMailAll(
  work: HtWorkRec | null,
  s: HtSession,
  settings: HtSettings,
  subjectTpl: string,
  bodyTpl: string,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  for (const r of await getReservations(s.id)) {
    if (r.status !== 'confirmed') continue;
    if (!r.email || r.flopMailAt) {
      out.skipped++;
      continue;
    }
    const ok = await sendTemplated('flop', work, s, r, subjectTpl, bodyTpl, settings);
    if (ok) {
      await patchReservation(s.id, r.id, { flopMailAt: new Date().toISOString() });
      out.sent++;
    } else out.failed++;
  }
  return out;
}

/** 日時変更・中止などの案内メール（管理画面で本文を確認してから送る）。差し込み可。 */
export async function sendNoticeMail(
  work: HtWorkRec | null,
  s: HtSession,
  r: HtReservation,
  subject: string,
  body: string,
  settings: HtSettings,
): Promise<boolean> {
  return sendTemplated('notice', work, s, r, subject, body, settings);
}

/**
 * 開催決定（立卓）の状態遷移。SET NX で「最初の1回」だけが true を返すので、
 * 同時に最少人数を満たす申し込みが来ても開催案内の一斉送信は1回だけ走る。
 */
export async function markGo(sessionId: string): Promise<boolean> {
  const claimed = await redis('SET', `ht:golock:${sessionId}`, '1', 'NX');
  if (claimed !== 'OK') return false;
  const s = await getSession(sessionId);
  if (!s) return false;
  await saveSession({ ...s, go: true, goAt: new Date().toISOString() });
  return true;
}

/** 開催決定の取り消し（誤操作用）。送信済みの開催案内は取り消せない。 */
export async function unmarkGo(sessionId: string): Promise<void> {
  await redis('DEL', `ht:golock:${sessionId}`);
  const s = await getSession(sessionId);
  if (s) await saveSession({ ...s, go: false, goAt: undefined });
}

/** 新しい予約の管理者通知 */
async function notifyAdminNewReservation(work: HtWorkRec | null, s: HtSession, r: HtReservation, mailNote: string): Promise<void> {
  const booked = await bookedSeats(s.id);
  const min = minPlayersOf(s);
  await notifyAdmin(
    s.id,
    `【HACKTALE予約】${work?.title ?? s.workId} ${formatStartJa(s.start)}｜${r.name}様 ${r.count}名`,
    `新しい予約が入りました。\n\n■ 予約番号\n${r.id}\n\n■ 公演\n${work?.title ?? s.workId}\n${formatStartJa(s.start)}｜${s.venue}\n\n` +
      `■ お客様\nお名前: ${r.name}\nメール: ${r.email || '（なし）'}\n電話: ${r.phone || '（なし）'}\nX: ${r.xId ? `@${r.xId}` : '（未記入）'}\n人数: ${r.count}名\n備考: ${r.note || '（なし）'}\n受付経路: ${r.source === 'web' ? 'Webフォーム' : '手動登録'}\n\n` +
      `■ この公演の状況\n確定 ${booked}名／開催最少 ${min}名／定員 ${s.capacity}名\n\n${mailNote}`,
  );
}

/**
 * 予約確定直後のメール処理（Web申し込み・手動登録の共通）。
 *   ・開催決定済みの公演 → 開催案内を直接送る（受付メールは送らない）
 *   ・自動開催決定ONで最少人数に達した → 開催決定にし、全員に開催案内
 *   ・それ以外 → 受付メール。最少人数に達していれば管理者に開催判断を促す
 * 戻り値はお客様へのメール送信が成功したか。
 */
export async function afterReservation(sessionId: string, r: HtReservation, sendCustomerMail = true): Promise<{ ok: boolean; kind: 'accept' | 'go' | 'none' }> {
  const s = await getSession(sessionId);
  if (!s) return { ok: false, kind: 'none' };
  const work = await getWork(s.workId);
  const settings = await getSettings();
  const tpl = sessionTemplates(s, work);
  const missing = missingPlaceholders(tpl.go, { discordUrl: s.discordUrl, bankInfo: settings.bankInfo });
  const booked = await bookedSeats(s.id);
  const reached = booked >= minPlayersOf(s);

  let kind: 'accept' | 'go' | 'none' = 'none';
  let ok = false;
  let note = '';

  const autoCase = !s.go && !!s.autoGo && reached && missing.length === 0;

  if (!sendCustomerMail || !r.email) {
    note = 'お客様へのメールは送っていません（手動登録・メールなし）。';
  } else if ((s.go || autoCase) && missing.length === 0) {
    kind = 'go';
    if (autoCase && (await markGo(s.id))) {
      const fresh = (await getSession(s.id)) ?? s;
      const res = await sendGoMailAll(work, fresh, settings);
      ok = !!(await getReservation(s.id, r.id))?.goMailAt;
      note = `開催最少人数に達したため、自動で開催決定にしました。開催案内を送信: 成功${res.sent}件${res.failed ? `／失敗${res.failed}件（管理画面から再送してください）` : ''}。`;
    } else {
      // 開催決定済み、または同時の申し込みが先に開催決定を取った。どちらも
      // 受付メール（開催人数に達したら改めて…）は送らず開催案内だけにする。
      // 一斉送信側と重なっても予約ごとの送信権で1通に収まる（skipped＝相手が送信中）。
      const res = await sendGoMailTo(work, s, r, settings);
      ok = res !== 'failed';
      note = ok
        ? s.go ? '開催決定済みの公演のため、開催案内を送信しました。' : '同時の申し込みで開催決定となったため、開催案内を送信しました。'
        : '※開催案内の送信に失敗しました。管理画面から再送してください。';
    }
  } else {
    kind = 'accept';
    ok = await sendAcceptMail(work, s, r, settings);
    note = ok ? 'お客様には受付メールを送信済みです。' : '※お客様への受付メール送信に失敗しました。管理画面から再送してください。';
    if (s.go && missing.length > 0) {
      note += `\n※開催決定済みですが、開催案内の差し込み（${missing.join('、')}）が未入力のため、開催案内は送れていません。入力して一斉送信してください。`;
    } else if (!s.go && reached) {
      note += s.autoGo && missing.length > 0
        ? `\n★開催最少人数に達しました。自動開催決定がONですが、${missing.join('、')}が未入力のため止めています。入力後、管理画面で「開催決定」を押してください。`
        : '\n★開催最少人数に達しました。管理画面で「開催決定」を押すと開催案内を一斉送信できます。';
    }
  }

  await notifyAdminNewReservation(work, s, r, note);
  return { ok, kind };
}

// --- リマインド（cron と管理画面の両方から使う） ---------------------------------

export interface RemindResult {
  due: number;
  sent: number;
  failed: number;
  lines: string[];
}

/** リマインドメール（お客様1件分）。成功時に remindedAt を記録する。 */
async function sendRemindMail(work: HtWorkRec | null, s: HtSession, r: HtReservation, settings: HtSettings): Promise<boolean> {
  const body =
    `ご予約いただいた公演のリマインドです。\n\n■ 作品\n{作品名}\n\n■ 開催日時\n{日時}\n\n■ 会場\n${s.venue}${s.meeting ? `\n（集合場所）${s.meeting}` : ''}\n\n` +
    `■ ご参加人数\n{人数}\n\n■ 料金\n{料金}` +
    (s.discordUrl ? `\n\n■ Discord\n{Discordリンク}` : '') +
    `\n\n詳細は先日お送りした開催のご案内メールをご確認ください。当日はどうぞよろしくお願いいたします。`;
  const ok = await sendTemplated('remind', work, s, r, '【HACKTALE】まもなく公演です — {日時}', body, settings);
  if (ok) await patchReservation(s.id, r.id, { remindedAt: new Date().toISOString() });
  return ok;
}

/**
 * 1公演分のリマインド送信。開催決定（立卓）済みの公演だけが対象。
 * force=false（cron）: 設定が有効で、開始まで settings.reminderHours 以内のときだけ送る。
 * force=true（管理画面の「今すぐ送信」）: 時間条件を無視して未送信の確定予約に送る。
 * どちらも remindedAt / reminderSkipped 済みには送らない（二重送信防止）。
 * 送信直前に予約・公演の最新状態を読み直す。
 */
export async function remindSession(
  works: Map<string, HtWorkRec>,
  sessionId: string,
  settings: HtSettings,
  force = false,
): Promise<RemindResult> {
  const result: RemindResult = { due: 0, sent: 0, failed: 0, lines: [] };
  const s = await getSession(sessionId);
  if (!s || s.status === 'cancelled' || !s.go) return result;
  const now = jstNow();
  if (now >= s.start) return result;
  if (!force) {
    if (!settings.reminderEnabled) return result;
    if (hoursUntil(s.start, now) > settings.reminderHours) return result;
  }
  const work = works.get(s.workId) ?? null;
  for (const r of await getReservations(sessionId)) {
    if (r.status !== 'confirmed' || !r.email || r.remindedAt || r.reminderSkipped) continue;
    result.due++;
    const ok = await sendRemindMail(work, s, r, settings);
    if (ok) result.sent++;
    else result.failed++;
    result.lines.push(`・${work?.title ?? s.workId}｜${formatStartJa(s.start)}｜${r.name}様 ${r.count}名｜${r.email}${ok ? '' : '｜※送信失敗'}`);
  }
  return result;
}

// --- 認証 -----------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 管理ページの合言葉。HACKTALE_ADMIN_KEY、なければ YOYAKU_ADMIN_KEY を流用。 */
export function checkHtAdminKey(key: string | undefined | null): boolean {
  const expected = readEnv('HACKTALE_ADMIN_KEY') ?? readEnv('YOYAKU_ADMIN_KEY');
  return !!expected && !!key && safeEqual(key, expected);
}
