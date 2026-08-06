import { timingSafeEqual, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// 日程調整（/yoyaku）のデータ層とメール送信。
//
// 「イベント」単位で複数の予約ページを同時運用できる。イベントごとに
//   ・タイトル
//   ・共有URLトークン（イベント作成時に自動発行。1つ漏れても他に影響なし）
//   ・候補日（枠）と予約
// を持ち、1つの管理ページ（/yoyaku/admin/）からまとめて管理する。
//
// ストレージ: Upstash Redis の REST API（Vercel Marketplace の無料プラン）。
//   SDK を入れず fetch だけで叩くので依存が増えない。
// メール:     Resend の REST API（無料枠 月3,000通）。未設定でも予約自体は
//   成立し、メールだけスキップされる（運用開始前でも壊れない）。
// ---------------------------------------------------------------------------

export interface EventInfo {
  id: string;
  token: string; // 共有URLの秘密トークン（/yoyaku/<token>/）
  title: string;
  createdAt: string;
  // ご案内文（集合場所・注意事項など）。予約ページ（予約前）・予約完了
  // 画面・確認メール・前日リマインドメールに表示する。
  notes?: string;
}

export interface Slot {
  id: string;
  date: string; // 'YYYY-MM-DD'
  time: string; // 自由記述（例: '14:00〜16:00'）
  createdAt: string;
  // 管理者が手動で受付を止めた枠。予約済みとは別概念で、削除せずに
  // 一時的に締め切りたい／再開したいときに使う。
  closed?: boolean;
}

export interface Booking {
  slotId: string;
  name: string;
  phone: string;
  email: string;
  date: string;
  time: string;
  createdAt: string;
  remindedAt?: string;
}

export const DEFAULT_TITLE = '日程調整のご案内';

// Vercel injects dashboard variables into process.env at runtime;
// import.meta.env covers .env files and build-time injection.
function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
  return v?.trim() || undefined;
}

// --- Redis (Upstash REST) ---------------------------------------------------

// Vercel Marketplace 経由だと KV_REST_API_*、Upstash 直結だと
// UPSTASH_REDIS_REST_* が注入される。どちらでも動くよう両対応。
function kvConfig(): { url: string; token: string } | null {
  const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
  const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function isKvConfigured(): boolean {
  return kvConfig() !== null;
}

async function redis(...command: string[]): Promise<unknown> {
  const cfg = kvConfig();
  if (!cfg) throw new Error('KV is not configured');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`[yoyaku] KV request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[yoyaku] KV command failed: ${data.error}`);
  return data.result;
}

const EVENTS_KEY = 'yoyaku:events';
const evSlotsKey = (eventId: string) => `yoyaku:ev:${eventId}:slots`;
const evBookingsKey = (eventId: string) => `yoyaku:ev:${eventId}:bookings`;

// HGETALL は [field, value, field, value, ...] のフラット配列で返る。
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

const randHex = (bytes: number) => randomBytes(bytes).toString('hex');

// --- イベント -----------------------------------------------------------------

export async function getEvents(): Promise<EventInfo[]> {
  const map = parseHash<EventInfo>(await redis('HGETALL', EVENTS_KEY));
  return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getEvent(id: string): Promise<EventInfo | null> {
  const raw = await redis('HGET', EVENTS_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as EventInfo;
  } catch {
    return null;
  }
}

export async function saveEvent(ev: EventInfo): Promise<void> {
  await redis('HSET', EVENTS_KEY, ev.id, JSON.stringify(ev));
}

export async function createEvent(title: string): Promise<EventInfo> {
  const ev: EventInfo = {
    id: randHex(4),
    token: randHex(12), // 24文字の推測不可能なトークン
    title: title.trim().slice(0, 80) || DEFAULT_TITLE,
    createdAt: new Date().toISOString(),
  };
  await saveEvent(ev);
  return ev;
}

/** イベント削除。枠・予約データも一緒に消す。 */
export async function deleteEvent(id: string): Promise<void> {
  await redis('HDEL', EVENTS_KEY, id);
  await redis('DEL', evSlotsKey(id), evBookingsKey(id));
}

/** 共有URLのトークンから該当イベントを引く（予約ページの認証）。 */
export async function findEventByToken(token: string): Promise<EventInfo | null> {
  if (!token) return null;
  const events = await getEvents();
  // 一致判定はタイミングセーフ比較。イベント数は高々数十なので全走査で十分。
  return events.find((ev) => safeEqual(ev.token, token)) ?? null;
}

/** イベント一覧に出す枠数・予約数（HLEN なので軽い）。 */
export async function getEventStats(id: string): Promise<{ slots: number; bookings: number }> {
  const [slots, bookings] = await Promise.all([
    redis('HLEN', evSlotsKey(id)),
    redis('HLEN', evBookingsKey(id)),
  ]);
  return { slots: Number(slots) || 0, bookings: Number(bookings) || 0 };
}

/**
 * 旧・単一イベント構成（yoyaku:slots / yoyaku:bookings / yoyaku:title）からの
 * 自動引き継ぎ。イベントが1つもなく旧データがあるときだけ、旧データを
 * 「イベント1」として取り込む。共有URLは旧 BOOKING_PAGE_TOKEN を引き継ぐので
 * すでに配ったリンクもそのまま使える。
 */
export async function migrateLegacy(): Promise<void> {
  const count = Number(await redis('HLEN', EVENTS_KEY)) || 0;
  if (count > 0) return;
  const legacySlots = Number(await redis('HLEN', 'yoyaku:slots')) || 0;
  const legacyTitle = await redis('GET', 'yoyaku:title');
  if (legacySlots === 0 && typeof legacyTitle !== 'string') return;

  const ev: EventInfo = {
    id: randHex(4),
    token: readEnv('BOOKING_PAGE_TOKEN') ?? randHex(12),
    title: typeof legacyTitle === 'string' && legacyTitle.trim() ? legacyTitle : DEFAULT_TITLE,
    createdAt: new Date().toISOString(),
  };
  await saveEvent(ev);
  if (legacySlots > 0) await redis('RENAME', 'yoyaku:slots', evSlotsKey(ev.id));
  const legacyBookings = Number(await redis('HLEN', 'yoyaku:bookings')) || 0;
  if (legacyBookings > 0) await redis('RENAME', 'yoyaku:bookings', evBookingsKey(ev.id));
  await redis('DEL', 'yoyaku:title');
}

// --- 枠と予約 -----------------------------------------------------------------

export async function getSlots(eventId: string): Promise<Slot[]> {
  const map = parseHash<Slot>(await redis('HGETALL', evSlotsKey(eventId)));
  return [...map.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export async function getBookings(eventId: string): Promise<Map<string, Booking>> {
  return parseHash<Booking>(await redis('HGETALL', evBookingsKey(eventId)));
}

export async function addSlot(eventId: string, date: string, time: string): Promise<Slot> {
  // 同一日に複数枠（時間帯違い）を作れるよう、ID には乱数を混ぜる。
  const id = `${date}_${Math.random().toString(36).slice(2, 8)}`;
  const slot: Slot = { id, date, time, createdAt: new Date().toISOString() };
  await redis('HSET', evSlotsKey(eventId), id, JSON.stringify(slot));
  return slot;
}

export async function saveSlot(eventId: string, slot: Slot): Promise<void> {
  await redis('HSET', evSlotsKey(eventId), slot.id, JSON.stringify(slot));
}

export async function deleteSlot(eventId: string, id: string): Promise<void> {
  await redis('HDEL', evSlotsKey(eventId), id);
}

export async function getSlot(eventId: string, id: string): Promise<Slot | null> {
  const raw = await redis('HGET', evSlotsKey(eventId), id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Slot;
  } catch {
    return null;
  }
}

export async function getBooking(eventId: string, slotId: string): Promise<Booking | null> {
  const raw = await redis('HGET', evBookingsKey(eventId), slotId);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Booking;
  } catch {
    return null;
  }
}

/**
 * 予約の本体。HSETNX が原子的なので、同じ枠に二人が同時に申し込んでも
 * 先に書けた一人だけが成功する（ダブルブッキング防止）。
 *
 * 戻り値：
 *   'ok'        … 新規に予約を確定した（確認メールを送るのは呼び出し側）
 *   'duplicate' … すでに同じメールアドレスで同じ枠が予約済み。ダブル
 *                 クリック・戻るボタンでの再送信・通信断後のリトライは
 *                 すべてここに落ちる。本人には成功として扱い、メールは
 *                 再送しない（初回リクエストが送っている）。
 *   'taken'     … 別の方が先に確保していた（本当の満席）
 * かつては boolean で、再送信が自分の予約に HSETNX で負けて「埋まって
 * しまいました」と誤表示 → 本人が別の枠を取り直してゴースト予約が残る、
 * という実害があった。
 */
export type ReserveResult = 'ok' | 'duplicate' | 'taken';

export async function reserve(
  eventId: string,
  slot: Slot,
  data: { name: string; phone: string; email: string },
): Promise<ReserveResult> {
  const booking: Booking = {
    slotId: slot.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    date: slot.date,
    time: slot.time,
    createdAt: new Date().toISOString(),
  };
  const result = await redis('HSETNX', evBookingsKey(eventId), slot.id, JSON.stringify(booking));
  if (result === 1) return 'ok';
  // 負けた相手が「同じメールアドレスの既存予約」なら同一人物の再送信と
  // みなす。一致判定に使うのはメールアドレスのみで、既存予約の氏名・
  // 電話番号などを応答に含めることはない（不一致なら汎用の満席エラーの
  // ままなので、他人の予約の存在から個人情報は推測できない）。
  const existing = await getBooking(eventId, slot.id);
  if (existing && existing.email.trim().toLowerCase() === data.email.trim().toLowerCase()) {
    return 'duplicate';
  }
  return 'taken';
}

export async function cancelBooking(eventId: string, slotId: string): Promise<void> {
  await redis('HDEL', evBookingsKey(eventId), slotId);
}

export async function saveBooking(eventId: string, booking: Booking): Promise<void> {
  await redis('HSET', evBookingsKey(eventId), booking.slotId, JSON.stringify(booking));
}

// --- 認証 -------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual は長さ違いで例外になるため先に弾く（長さは秘密ではない）。
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 管理ページの合言葉。 */
export function checkAdminKey(key: string | undefined | null): boolean {
  const expected = readEnv('YOYAKU_ADMIN_KEY');
  return !!expected && !!key && safeEqual(key, expected);
}

export function checkCronSecret(authorization: string | null): boolean {
  const secret = readEnv('CRON_SECRET');
  // 未設定なら開放（リマインドは remindedAt で冪等なので連打されても実害なし）
  if (!secret) return true;
  return !!authorization && safeEqual(authorization, `Bearer ${secret}`);
}

// --- 日付ヘルパー（JST基準） --------------------------------------------------

function jstDateString(offsetDays: number): string {
  const d = new Date(Date.now() + (9 * 3600 + offsetDays * 86400) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const jstToday = () => jstDateString(0);
export const jstTomorrow = () => jstDateString(1);

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** '2026-08-01' + '14:00〜16:00' → '2026年8月1日(土) 14:00〜16:00' */
export function formatSlotJa(date: string, time: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return `${date} ${time}`;
  const wd = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日(${wd}) ${time}`;
}

// --- メール（Resend） ---------------------------------------------------------

export function adminEmail(): string {
  return readEnv('YOYAKU_ADMIN_EMAIL') ?? 'info@kabuexlabs.com';
}

// --- 自社メールアカウント直送（SMTP） ------------------------------------------
// 外部の送信サービスを一切使わず、既存の info@kabuexlabs.com アカウント
// （Google Workspace）の SMTP でそのまま送る。必要な環境変数：
//   SMTP_USER = info@kabuexlabs.com
//   SMTP_PASS = Googleの「アプリパスワード」（16桁）
// 任意: SMTP_HOST（既定 smtp.gmail.com）/ SMTP_PORT（既定 465）
// 自分のアカウントから自分宛てに送るため、認証・到達性の問題が起きない。

export function smtpConfigured(): boolean {
  return !!readEnv('SMTP_USER') && !!readEnv('SMTP_PASS');
}

export function smtpFrom(): string {
  return `株式会社ex Labs <${readEnv('SMTP_USER') ?? ''}>`;
}

async function sendViaSmtp(
  to: string,
  subject: string,
  text: string,
  replyTo?: string,
): Promise<boolean> {
  const user = readEnv('SMTP_USER');
  const pass = readEnv('SMTP_PASS');
  if (!user || !pass) return false;
  try {
    const nodemailer = (await import('nodemailer')).default;
    const port = Number(readEnv('SMTP_PORT') ?? 465);
    const transporter = nodemailer.createTransport({
      host: readEnv('SMTP_HOST') ?? 'smtp.gmail.com',
      port,
      // ローカルテスト（平文モックSMTP）用に SMTP_SECURE=false で無効化できる
      secure: readEnv('SMTP_SECURE') === 'false' ? false : port === 465,
      auth: { user, pass: pass.replace(/\s+/g, '') },
      // SMTP が詰まったときに予約完了の応答まで道連れにしない。応答が
      // 遅いほどお客様が再送信し、無用な「埋まってしまいました」を生む。
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 15000,
    });
    await transporter.sendMail({
      from: smtpFrom(),
      to,
      subject,
      text,
      replyTo: replyTo ?? adminEmail(),
    });
    return true;
  } catch (e) {
    console.error('[mail] smtp send failed:', e);
    return false;
  }
}

/**
 * プレーンテキストメールを送る。優先順位：
 *   1) 自社SMTP（SMTP_USER/SMTP_PASS 設定時 — 外部サービス不要）
 *   2) Resend（RESEND_API_KEY 設定時のみのフォールバック）
 * どちらも未設定・失敗時は false を返すだけで例外にしない。
 */
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  replyTo?: string,
): Promise<boolean> {
  // 1) 自社SMTP（最優先）
  if (smtpConfigured()) {
    if (await sendViaSmtp(to, subject, text, replyTo)) return true;
    // SMTP失敗時は下のResendがあればそちらを試す
  }
  const apiKey = readEnv('RESEND_API_KEY');
  if (!apiKey) {
    if (!smtpConfigured()) console.warn('[mail] SMTP/RESEND とも未設定; skipping mail:', subject);
    return false;
  }
  const from = readEnv('MAIL_FROM') ?? 'ex Labs 予約窓口 <no-reply@kabuexlabs.com>';
  // RESEND_API_BASE はローカルテストでモックサーバーに向けるための逃げ道
  // （microcms.ts の MICROCMS_API_BASE と同じ流儀）。本番では未設定でよい。
  const base = readEnv('RESEND_API_BASE') ?? 'https://api.resend.com';
  const post = async (fromAddr: string) =>
    fetch(`${base}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromAddr, to: [to], subject, text, reply_to: replyTo ?? adminEmail() }),
    });
  try {
    let res = await post(from);
    if (!res.ok) {
      const detail = await res.text();
      // ドメイン未認証（403）の場合、Resend共有の onboarding@resend.dev から
      // 再送を試みる。この差出人は「アカウント所有者宛て」だけは認証なしで
      // 届くため、kabuexlabs.com のDNS認証が済むまでの間も info@ への通知が
      // 止まらない。認証完了後は自動的に本来の差出人が使われる。
      console.error('[yoyaku] mail send failed:', res.status, detail);
      if (res.status === 403 && !from.includes('resend.dev')) {
        res = await post('ex Labs <onboarding@resend.dev>');
        if (res.ok) return true;
        console.error('[yoyaku] fallback send failed:', res.status, await res.text());
      }
      return false;
    }
    return true;
  } catch (e) {
    console.error('[yoyaku] mail send failed:', e);
    return false;
  }
}

// --- 入力バリデーション --------------------------------------------------------

/** 全角英数字・全角ハイフン等を半角に寄せる（電話番号入力のゆらぎ対策）。 */
export function normalizePhone(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ー－―‐]/g, '-')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .replace(/\s+/g, '');
}

export function validPhone(phone: string): boolean {
  return /^\+?[0-9()-]{8,15}$/.test(phone);
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
