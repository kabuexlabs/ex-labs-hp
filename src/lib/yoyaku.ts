import { timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// 日程調整（/yoyaku）のデータ層とメール送信。
//
// ストレージ: Upstash Redis の REST API（Vercel Marketplace の無料プラン）。
//   SDK を入れず fetch だけで叩くので依存が増えない。
// メール:     Resend の REST API（無料枠 月3,000通）。未設定でも予約自体は
//   成立し、メールだけスキップされる（運用開始前でも壊れない）。
// ---------------------------------------------------------------------------

export interface Slot {
  id: string;
  date: string; // 'YYYY-MM-DD'
  time: string; // 自由記述（例: '14:00〜16:00'）
  createdAt: string;
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

const SLOTS_KEY = 'yoyaku:slots';
const BOOKINGS_KEY = 'yoyaku:bookings';

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

export async function getSlots(): Promise<Slot[]> {
  const map = parseHash<Slot>(await redis('HGETALL', SLOTS_KEY));
  return [...map.values()].sort((a, b) =>
    (a.date + a.time).localeCompare(b.date + b.time),
  );
}

export async function getBookings(): Promise<Map<string, Booking>> {
  return parseHash<Booking>(await redis('HGETALL', BOOKINGS_KEY));
}

export async function addSlot(date: string, time: string): Promise<Slot> {
  // 同一日に複数枠（時間帯違い）を作れるよう、ID には乱数を混ぜる。
  const id = `${date}_${Math.random().toString(36).slice(2, 8)}`;
  const slot: Slot = { id, date, time, createdAt: new Date().toISOString() };
  await redis('HSET', SLOTS_KEY, id, JSON.stringify(slot));
  return slot;
}

export async function deleteSlot(id: string): Promise<void> {
  await redis('HDEL', SLOTS_KEY, id);
}

export async function getSlot(id: string): Promise<Slot | null> {
  const raw = await redis('HGET', SLOTS_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Slot;
  } catch {
    return null;
  }
}

/**
 * 予約の本体。HSETNX が原子的なので、同じ枠に二人が同時に申し込んでも
 * 先に書けた一人だけが成功する（ダブルブッキング防止）。
 */
export async function reserve(slot: Slot, data: { name: string; phone: string; email: string }): Promise<boolean> {
  const booking: Booking = {
    slotId: slot.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    date: slot.date,
    time: slot.time,
    createdAt: new Date().toISOString(),
  };
  const result = await redis('HSETNX', BOOKINGS_KEY, slot.id, JSON.stringify(booking));
  return result === 1;
}

export async function cancelBooking(slotId: string): Promise<void> {
  await redis('HDEL', BOOKINGS_KEY, slotId);
}

export async function saveBooking(booking: Booking): Promise<void> {
  await redis('HSET', BOOKINGS_KEY, booking.slotId, JSON.stringify(booking));
}

// --- 認証 -------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual は長さ違いで例外になるため先に弾く（長さは秘密ではない）。
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 予約ページの URL トークン（= リンクを知っている人だけ見られる）。 */
export function checkPageToken(token: string | undefined): boolean {
  const expected = readEnv('BOOKING_PAGE_TOKEN');
  return !!expected && !!token && safeEqual(token, expected);
}

/** 管理ページに「お客様に共有するURL」を表示するために使う。 */
export function bookingPageToken(): string | undefined {
  return readEnv('BOOKING_PAGE_TOKEN');
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

/**
 * Resend でプレーンテキストメールを送る。API キー未設定・送信失敗は
 * false を返すだけで例外にしない — メールが落ちても予約は成立させる。
 */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const apiKey = readEnv('RESEND_API_KEY');
  if (!apiKey) {
    console.warn('[yoyaku] RESEND_API_KEY not set; skipping mail:', subject);
    return false;
  }
  const from = readEnv('MAIL_FROM') ?? 'ex Labs 予約窓口 <no-reply@kabuexlabs.com>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, reply_to: adminEmail() }),
    });
    if (!res.ok) {
      console.error('[yoyaku] mail send failed:', res.status, await res.text());
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
