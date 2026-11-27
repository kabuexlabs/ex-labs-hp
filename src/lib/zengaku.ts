import { randomBytes, timingSafeEqual } from 'node:crypto';
import { sendMail, notifyEmail, validEmail } from './yoyaku';

// ---------------------------------------------------------------------------
// 「全国学生 未来視察連盟」LP（仮・限定公開）の設定とデータ層。
// 正本メモ：docs/zengaku-lp.md。原稿（2026-11-27 確定版）の文言をそのまま使う。
//
// ・ページは BASE（推測しにくい /preview/ の下）に置く。原稿のパス（/ /milano /privacy …）は BASE からの相対。
// ・未確定の値（原稿の {{変数}}）は下の VARS に1か所で入れる。null の間は原稿の「仮の表示」を出す。
// ・応募は Upstash Redis（zg: プレフィックス）に保存。受付番号は INCR の連番、同じメールの2回目は EVAL で弾く。
// ---------------------------------------------------------------------------

export const BASE = '/preview/zengaku-h4tq8wnm';
export const ORG = '全国学生 未来視察連盟';
export const EVENT = 'ミラノ建築短期留学ツアー';

// ---- 未確定の値（原稿 0.3）。値が入ったら null を文字列に置き換える ----
export const VARS = {
  TOUR_DATES: null as string | null,
  TOUR_PLACES: null as string | null,
  TOUR_COST: null as string | null,
  SEMINAR_DATES: null as string | null,
  DEADLINE_TIME: '23:59',
  SUPPORTERS: [] as string[], // 掲載の確認が取れた名前だけ。空の間はセクションごと出さない
  MEMBERS: [] as { role: string; name: string; aff: string }[], // 代表以外。本人の確認が取れたものだけ
  CONTACT_EMAIL: null as string | null, // 必須（公開前に必ず入れる）
  SNS_INSTAGRAM: null as string | null,
  SNS_X: null as string | null,
  CAMPUS_SEMINAR: null as string | null,
  OPERATOR: null as string | null, // 必須（プライバシーポリシーの事業者名・所在地）
};

// 原稿の「仮の表示」
export const SHOW = {
  TOUR_DATES: VARS.TOUR_DATES ?? '2027年3月（日程は決まり次第お知らせします）',
  TOUR_PLACES: VARS.TOUR_PLACES ?? 'ミラノ市内の建築・街づくりの現場（詳細は決まり次第お知らせします）',
  TOUR_COST: VARS.TOUR_COST ?? '決まり次第、このページでお知らせします',
  SEMINAR_DATES: VARS.SEMINAR_DATES ?? '2027年1月〜3月に全2回（日程と会場は、応募された方にメールでお知らせします）',
  CAMPUS_SEMINAR: VARS.CAMPUS_SEMINAR ?? '日程調整中',
};

// 応募締切（日本時間）。過ぎたら応募ボタン・フォームを自動で「受付終了」に切り替える
export const DEADLINE_ISO = `2027-01-15T${VARS.DEADLINE_TIME}:59+09:00`;
export function isClosed(now = new Date()): boolean {
  return now.getTime() > new Date(DEADLINE_ISO).getTime();
}
export const CLOSED_TEXT = 'ミラノ建築短期留学ツアーの応募受付は、2027年1月15日に終了しました。たくさんのご応募をありがとうございました。今後の企画は、このサイトとSNSでお知らせします。';

export const GRADES = ['学部1年', '学部2年', '学部3年', '学部4年', '学部5年以上', '修士1年', '修士2年', '博士課程', 'その他'];

// 項目9「このツアーをどこで知りましたか」。保存はキー。route は集計用（大学／学生団体／施策）
export const SOURCES = [
  { key: 'campus_friend', label: '大学の友人・先輩・学内代表から聞いた', route: '大学' },
  { key: 'campus_official', label: '大学の先生・授業・掲示・学内のお知らせで知った', route: '大学' },
  { key: 'student_group', label: '所属している学生団体・サークルで知った', route: '学生団体' },
  { key: 'sns', label: 'Instagram・X・TikTokなどのSNSで見た', route: '施策' },
  { key: 'news', label: 'ニュース・記事で見た', route: '施策' },
  { key: 'event', label: 'セミナーやイベントで知った', route: '施策' },
  { key: 'other', label: 'その他', route: '施策' },
] as const;

// 大学名の入力候補（入力は自由。候補にない大学もそのまま受け付ける）
export const UNIVERSITIES = [
  '東京大学', '京都大学', '大阪大学', '東北大学', '名古屋大学', '九州大学', '北海道大学', '東京科学大学', '一橋大学', '筑波大学',
  '千葉大学', '横浜国立大学', '神戸大学', '広島大学', '岡山大学', '金沢大学', '新潟大学', '信州大学', '熊本大学', '東京都立大学',
  '大阪公立大学', '横浜市立大学', '名古屋工業大学', '京都工芸繊維大学', '東京藝術大学', '早稲田大学', '慶應義塾大学', '上智大学', '東京理科大学', '明治大学',
  '青山学院大学', '立教大学', '中央大学', '法政大学', '日本大学', '東洋大学', '駒澤大学', '専修大学', '芝浦工業大学', '工学院大学',
  '東京電機大学', '東京都市大学', '武蔵野大学', '日本女子大学', '昭和女子大学', '国士舘大学', '神奈川大学', '関東学院大学', '千葉工業大学', '多摩美術大学',
  '武蔵野美術大学', '同志社大学', '立命館大学', '関西大学', '関西学院大学', '近畿大学', '京都橘大学', '京都精華大学', '大阪工業大学', '摂南大学',
  '名城大学', '愛知工業大学', '中部大学', '椙山女学園大学', '福岡大学', '九州産業大学', '北海学園大学', '東北工業大学', '国際基督教大学', '津田塾大学',
];

// ---- 限定公開（Basic 認証）。環境変数 ZENGAKU_PREVIEW_PASSWORD があるときだけ ----
const readEnv = (name: string) => ((import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name])?.trim() || undefined;
const safeEqual = (a: string, b: string) => { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export const NOINDEX_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'private, no-store' };

/** 認証が必要なら 401 の Response を返す。通ったら null（ページ側でヘッダーを付ける）。 */
export function previewGuard(request: Request): Response | null {
  const pw = readEnv('ZENGAKU_PREVIEW_PASSWORD');
  if (!pw) return null;
  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(request.headers.get('authorization') ?? '');
  let ok = false;
  if (m) {
    try { const d = Buffer.from(m[1], 'base64').toString('utf8'); ok = safeEqual(d.slice(d.indexOf(':') + 1), pw); } catch { ok = false; }
  }
  if (ok) return null;
  return new Response('認証が必要です（関係者確認用ページ）', {
    status: 401,
    headers: { ...NOINDEX_HEADERS, 'WWW-Authenticate': 'Basic realm="preview", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// ---- 入力チェック（原稿 2.7 のエラーメッセージ。画面側の JS も同じ文言） ----
export const MSG = {
  required: 'この項目は入力が必要です。',
  choose: '1つ選んでください。',
  kana: '全角カタカナで入力してください。',
  email: 'メールアドレスの形式を確認してください。',
  emailMatch: 'メールアドレスが一致していません。',
  tel: '数字のみで入力してください。',
  over200: '200字以内で入力してください。',
  over300: '300字以内で入力してください。',
  agree: '応募には、プライバシーポリシーへの同意が必要です。',
  dup: 'このメールアドレスは、すでに応募を受け付けています。',
  fail: '送信できませんでした。時間をおいて、もう一度お試しください。',
};
export const KANA_RE = /^[ァ-ヶー　 ]+$/;
const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');
const len = (t: string) => [...t].length;

export interface MilanoInput {
  name: string; kana: string; univ: string; faculty: string; grade: string; email: string; tel: string;
  source: string; referrer: string; reason: string; agree: boolean; optin: boolean; ref: string;
}
export interface MilanoRecord extends Omit<MilanoInput, 'agree'> {
  no: number; createdAt: string; token: string; myRef: string;
}
export interface RepInput { name: string; kana: string; univ: string; faculty: string; grade: string; email: string; group: string; wish: string; agree: boolean }
export interface RepRecord extends Omit<RepInput, 'agree'> { no: number; createdAt: string; token: string }

type Errors = Record<string, string>;

function common(body: Record<string, unknown>, e: Errors) {
  const name = s(body.name, 60); if (!name) e.name = MSG.required;
  const kana = s(body.kana, 60); if (!kana) e.kana = MSG.required; else if (!KANA_RE.test(kana)) e.kana = MSG.kana;
  const univ = s(body.univ, 80); if (!univ) e.univ = MSG.required;
  const faculty = s(body.faculty, 80); if (!faculty) e.faculty = MSG.required;
  const grade = s(body.grade, 20); if (!grade || !GRADES.includes(grade)) e.grade = MSG.choose;
  const email = s(body.email, 254).toLowerCase(); if (!email) e.email = MSG.required; else if (!validEmail(email)) e.email = MSG.email;
  const agree = body.agree === true || body.agree === 'on' || body.agree === '1';
  if (!agree) e.agree = MSG.agree;
  return { name, kana, univ, faculty, grade, email, agree };
}

export function validateMilano(body: Record<string, unknown>): { data: MilanoInput; errors: Errors } {
  const e: Errors = {};
  const c = common(body, e);
  const email2 = s(body.email2, 254).toLowerCase();
  if (!email2) e.email2 = MSG.required; else if (!e.email && email2 !== c.email) e.email2 = MSG.emailMatch;
  const tel = s(body.tel, 20); if (tel && !/^[0-9]{10,11}$/.test(tel)) e.tel = MSG.tel;
  const source = s(body.source, 30); if (!SOURCES.some((x) => x.key === source)) e.source = MSG.choose;
  const referrer = s(body.referrer, 100);
  const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (len(reasonRaw) > 200) e.reason = MSG.over200;
  const reason = s(reasonRaw, 400);
  const optin = body.optin === true || body.optin === 'on' || body.optin === '1';
  const refRaw = s(body.ref, 20).toLowerCase();
  const ref = /^[a-z0-9]{4,12}$/.test(refRaw) ? refRaw : '';
  return { data: { ...c, tel, source, referrer, reason, optin, ref }, errors: e };
}

export function validateRep(body: Record<string, unknown>): { data: RepInput; errors: Errors } {
  const e: Errors = {};
  const c = common(body, e);
  const group = s(body.group, 100);
  const wishRaw = typeof body.wish === 'string' ? body.wish.trim() : '';
  if (len(wishRaw) > 300) e.wish = MSG.over300;
  return { data: { ...c, group, wish: s(wishRaw, 600) }, errors: e };
}

// ---- Redis（Upstash REST）。書き込みの失敗は例外にする（受け付けたように見えて保存されていない事故を防ぐ） ----
function kvConfig(): { url: string; token: string } | null {
  const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
  const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}
export const isKvConfigured = () => kvConfig() !== null;
async function redis(...command: (string | number)[]): Promise<unknown> {
  const cfg = kvConfig();
  if (!cfg) throw new Error('KV is not configured');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command.map(String)),
  });
  if (!res.ok) throw new Error(`[zengaku] KV request failed: ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[zengaku] KV command failed: ${data.error}`);
  return data.result;
}
const K = {
  mSeq: 'zg:milano:seq', mApps: 'zg:milano:apps', mEmails: 'zg:milano:emails', mTokens: 'zg:milano:tokens', mRefs: 'zg:milano:refs',
  rSeq: 'zg:rep:seq', rApps: 'zg:rep:apps', rTokens: 'zg:rep:tokens',
};

// 同じメールが登録済みなら -1。なければ連番を振って保存し、その番号を返す（1コマンドで原子的に）
const APPLY_LUA = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return -1 end
local n = redis.call('INCR', KEYS[2])
redis.call('HSET', KEYS[1], ARGV[1], n)
redis.call('HSET', KEYS[3], n, ARGV[2])
redis.call('HSET', KEYS[4], ARGV[3], n)
redis.call('HSET', KEYS[5], ARGV[4], n)
return n`;
const REP_LUA = `
local n = redis.call('INCR', KEYS[1])
redis.call('HSET', KEYS[2], n, ARGV[1])
redis.call('HSET', KEYS[3], ARGV[2], n)
return n`;

const token = () => randomBytes(12).toString('base64url');
// 紹介コード：読み違えやすい文字（0 o 1 l i）を除いた6文字
const REF_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const newRef = () => Array.from(randomBytes(6), (b) => REF_CHARS[b % REF_CHARS.length]).join('');

export async function saveMilano(d: MilanoInput): Promise<{ dup: true } | { dup: false; rec: MilanoRecord }> {
  const { agree: _a, ...rest } = d;
  const createdAt = new Date().toISOString(); // 応募順の選考に使うのでサーバー側の時刻
  const t = token();
  const myRef = newRef();
  const body = { ...rest, createdAt, token: t, myRef };
  const n = Number(await redis('EVAL', APPLY_LUA, 5, K.mEmails, K.mSeq, K.mApps, K.mTokens, K.mRefs, d.email, JSON.stringify(body), t, myRef));
  if (n < 0) return { dup: true };
  return { dup: false, rec: { ...body, no: n } };
}

export async function saveRep(d: RepInput): Promise<RepRecord> {
  const { agree: _a, ...rest } = d;
  const createdAt = new Date().toISOString();
  const t = token();
  const body = { ...rest, createdAt, token: t };
  const n = Number(await redis('EVAL', REP_LUA, 3, K.rSeq, K.rApps, K.rTokens, JSON.stringify(body), t));
  return { ...body, no: n };
}

export async function findMilanoByToken(t: string): Promise<MilanoRecord | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(t)) return null;
  const n = await redis('HGET', K.mTokens, t);
  if (!n) return null;
  const raw = await redis('HGET', K.mApps, String(n));
  return raw ? { ...(JSON.parse(String(raw)) as MilanoRecord), no: Number(n) } : null;
}

function parseHash<T>(raw: unknown): T[] {
  const arr = Array.isArray(raw) ? (raw as string[]) : [];
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += 2) {
    try { out.push({ ...(JSON.parse(arr[i + 1]) as T), no: Number(arr[i]) }); } catch { /* 壊れた行は飛ばす */ }
  }
  return out.sort((a, b) => (a as { no: number }).no - (b as { no: number }).no);
}
export async function listMilano(): Promise<MilanoRecord[]> { return parseHash<MilanoRecord>(await redis('HGETALL', K.mApps)); }
export async function listRep(): Promise<RepRecord[]> { return parseHash<RepRecord>(await redis('HGETALL', K.rApps)); }

// ---- 表示用 ----
export function jstStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600e3);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
export const refLink = (origin: string, code: string) => `${origin}${BASE}/milano/?ref=${code}`;

// ---- 自動返信メール（原稿 4・5）。問い合わせ先が未定の間は「■ お問い合わせ」と※の行を出さない ----
const contactBlock = () => (VARS.CONTACT_EMAIL ? `\n■ お問い合わせ\n${VARS.CONTACT_EMAIL}\n` : '');
export async function mailMilano(rec: MilanoRecord, origin: string): Promise<boolean> {
  const link = refLink(origin, rec.myRef);
  const text = `${rec.name} 様

全国学生 未来視察連盟です。
ミラノ建築短期留学ツアーにご応募いただき、ありがとうございます。
下記の内容で受け付けました。

────────────────
受付番号：${rec.no}
応募日時：${jstStamp(rec.createdAt)}
お名前　：${rec.name}
大学　　：${rec.univ} ${rec.faculty} ${rec.grade}
────────────────

■ 今後の流れ
・応募締切：2027年1月15日（金）
・選考は、応募いただいた順に行います。
・結果は、応募締切のあとにこのメールアドレスへお知らせします。
・業種セミナー（全2回）の日程と会場も、メールでご案内します。

■ 友達に紹介する
下のリンクから、友達にもこのツアーを紹介できます。
${link}
${contactBlock()}${VARS.CONTACT_EMAIL ? '\n※このメールに心当たりがない場合は、お手数ですが上記までご連絡ください。\n' : ''}
全国学生 未来視察連盟
${origin}${BASE}/
`;
  const ok = await sendMail(rec.email, '【全国学生 未来視察連盟】ミラノ建築短期留学ツアーの応募を受け付けました', text, VARS.CONTACT_EMAIL ?? undefined, { fromName: ORG });
  // 運営への通知（個人情報はメール本文のみ。件名には出さない）
  await sendMail(notifyEmail(), `【未来視察連盟】ミラノ応募 受付番号${rec.no}`, `受付番号：${rec.no}\n応募日時：${jstStamp(rec.createdAt)}\nお名前：${rec.name}（${rec.kana}）\n大学：${rec.univ} ${rec.faculty} ${rec.grade}\nメール：${rec.email}\n電話：${rec.tel || '—'}\n知った経路：${SOURCES.find((x) => x.key === rec.source)?.label ?? rec.source}\n紹介者：${rec.referrer || '—'}\n紹介コード：${rec.ref || '—'}\n賛同企業の案内：${rec.optin ? '受け取る' : '受け取らない'}\n応募の理由：\n${rec.reason || '—'}\n\n一覧：${origin}${BASE}/admin/`, undefined, { fromName: ORG }).catch(() => false);
  return ok;
}
export async function mailRep(rec: RepRecord, origin: string): Promise<boolean> {
  const text = `${rec.name} 様

全国学生 未来視察連盟です。
学内代表にご応募いただき、ありがとうございます。

内容を確認のうえ、運営メンバーからあらためてご連絡します。
少しお時間をいただく場合があります。
${contactBlock()}
全国学生 未来視察連盟
${origin}${BASE}/
`;
  const ok = await sendMail(rec.email, '【全国学生 未来視察連盟】学内代表への応募を受け付けました', text, VARS.CONTACT_EMAIL ?? undefined, { fromName: ORG });
  await sendMail(notifyEmail(), `【未来視察連盟】学内代表 応募 ${rec.no}`, `番号：${rec.no}\n応募日時：${jstStamp(rec.createdAt)}\nお名前：${rec.name}（${rec.kana}）\n大学：${rec.univ} ${rec.faculty} ${rec.grade}\nメール：${rec.email}\n所属団体：${rec.group || '—'}\nやってみたいこと：\n${rec.wish || '—'}\n\n一覧：${origin}${BASE}/admin/`, undefined, { fromName: ORG }).catch(() => false);
  return ok;
}
