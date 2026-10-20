// ---------------------------------------------------------------------------
// 漢方体質チェック（/kampo/）の認証。2段構え：
//   1) 共通パスワード（KAMPO_PASSWORD。未設定なら YOYAKU_ADMIN_KEY を流用）で
//      /kampo/ 全体を守る。成功で署名付き Cookie（30日）。
//   2) スタッフ画面 /kampo/staff/ は 4桁 PIN（KAMPO_STAFF_PIN）で再認証。
//      成功で署名付き Cookie（12時間）。「来店客モードへ戻る」で消す（iPad を渡す前に押す）。
// Cookie にはパスワードそのものを入れず、HMAC 署名つきの期限トークンを入れる。
// 署名鍵は KAMPO_SESSION_SECRET（未設定ならパスワードから派生）。
// ルート保護は src/middleware.ts から kampoGuard() を呼んで行う。
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { APIContext, AstroCookies } from 'astro';
import { readEnv } from './store.ts';

export const SITE_COOKIE = 'kampo_s';
export const STAFF_COOKIE = 'kampo_staff';
const SITE_TTL_SEC = 30 * 86400;
const STAFF_TTL_SEC = 12 * 3600;
export const KAMPO_BASE = '/kampo/';
export const LOGIN_PATH = '/kampo/login/';
export const PIN_PATH = '/kampo/staff/pin/';

export const sitePassword = () => readEnv('KAMPO_PASSWORD') ?? readEnv('YOYAKU_ADMIN_KEY');
/** PIN。未設定ならログインの合言葉で代用（仮運用）。設定済みかは pinConfigured() で判定 */
export const staffPin = () => readEnv('KAMPO_STAFF_PIN') ?? sitePassword();
export const pinConfigured = () => !!readEnv('KAMPO_STAFF_PIN');
export const isAuthConfigured = () => !!sitePassword();
const secret = () => readEnv('KAMPO_SESSION_SECRET') ?? `kampo:${sitePassword() ?? ''}`;

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
export const checkPassword = (entered: string | null | undefined) => {
  const expected = sitePassword();
  return !!expected && !!entered && safeEqual(entered, expected);
};
export const checkPin = (entered: string | null | undefined) => {
  const expected = staffPin();
  return !!expected && !!entered && safeEqual(entered, expected);
};

function sign(kind: string, exp: number): string {
  return createHmac('sha256', secret()).update(`${kind}:${exp}`).digest('hex');
}
export function makeToken(kind: 'site' | 'staff', ttlSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${exp}.${sign(kind, exp)}`;
}
export function verifyToken(kind: 'site' | 'staff', token: string | undefined): boolean {
  if (!token || !isAuthConfigured()) return false;
  const m = /^(\d{1,12})\.([a-f0-9]{64})$/.exec(token);
  if (!m) return false;
  const exp = Number(m[1]);
  if (exp <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(m[2], sign(kind, exp));
}

const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax' as const, path: '/kampo', maxAge });
export const isSiteAuthed = (cookies: AstroCookies) => verifyToken('site', cookies.get(SITE_COOKIE)?.value);
export const isStaffAuthed = (cookies: AstroCookies) => isSiteAuthed(cookies) && verifyToken('staff', cookies.get(STAFF_COOKIE)?.value);
export const setSiteCookie = (cookies: AstroCookies) => cookies.set(SITE_COOKIE, makeToken('site', SITE_TTL_SEC), cookieOpts(SITE_TTL_SEC));
export const setStaffCookie = (cookies: AstroCookies) => cookies.set(STAFF_COOKIE, makeToken('staff', STAFF_TTL_SEC), cookieOpts(STAFF_TTL_SEC));
export const clearStaffCookie = (cookies: AstroCookies) => cookies.delete(STAFF_COOKIE, { path: '/kampo' });
export const clearSiteCookie = (cookies: AstroCookies) => { cookies.delete(SITE_COOKIE, { path: '/kampo' }); cookies.delete(STAFF_COOKIE, { path: '/kampo' }); };

/** 戻り先 URL の安全化（/kampo/ 配下の相対パスだけ許可） */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/kampo/') || raw.includes('//') || /[\r\n]/.test(raw)) return fallback;
  return raw;
}

/**
 * middleware から呼ぶルート保護。保護対象なら Response（リダイレクト）、通してよければ undefined。
 *  - /kampo/login/ 以外の /kampo/* は共通パスワードのログイン必須
 *  - /kampo/staff/pin/ 以外の /kampo/staff/* はさらに PIN 必須
 */
export function kampoGuard(context: APIContext): Response | undefined {
  const { pathname, search } = context.url;
  if (!pathname.startsWith(KAMPO_BASE)) return undefined;
  const next = encodeURIComponent(pathname + search);
  if (pathname === LOGIN_PATH) return undefined;
  if (!isSiteAuthed(context.cookies)) {
    if (pathname.endsWith('.csv') || pathname.endsWith('.json')) return new Response('unauthorized', { status: 401 });
    return context.redirect(`${LOGIN_PATH}?next=${next}`, 303);
  }
  if (pathname.startsWith('/kampo/staff/') && pathname !== PIN_PATH && !isStaffAuthed(context.cookies)) {
    if (pathname.endsWith('.csv') || pathname.endsWith('.json')) return new Response('unauthorized', { status: 401 });
    return context.redirect(`${PIN_PATH}?next=${next}`, 303);
  }
  return undefined;
}

/** 送信元 IP（ログイン総当たり対策のキー） */
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

/** 全ページ共通：検索エンジン非掲載・キャッシュ禁止 */
export function privateHeaders(res: { headers: Headers }) {
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
}
