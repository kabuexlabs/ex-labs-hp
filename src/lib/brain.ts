import { timingSafeEqual, randomBytes, createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// 「第二の脳」（/brain）のデータ層と認証。
//
// 名刺（連絡先）と議事録・メモ（ノート）を1か所に貯めて、あとから
// 横断検索で引っ張り出すための社内システム。入力は手入力・音声
// （ブラウザのWeb Speech API）・PDF取り込み（サーバー側でテキスト抽出）
// の3経路で、どこから入れても同じ検索にかかる。
//
// ストレージ: Upstash Redis の REST API（/yoyaku と同じ流儀。SDKなし）。
//
// 認証は /yoyaku より一段強い方式：
//   ・合言葉（BRAIN_ADMIN_KEY）は POST でのみ受け取り、照合はタイミングセーフ
//   ・Cookie に入れるのは合言葉そのものではなく、KV に保存した
//     ランダム256bitのセッショントークン（TTL付き）。Cookie が漏れても
//     合言葉は漏れず、サーバー側で失効もできる
//   ・ログイン試行は IP ごとにレート制限（総当たり対策）
//   ・全 POST で Origin ヘッダを検証（SameSite=Strict と二重のCSRF対策）
// ---------------------------------------------------------------------------

export interface Contact {
  id: string;
  name: string; // 氏名（必須）
  kana?: string; // ふりがな
  company?: string;
  role?: string; // 部署・役職
  email?: string;
  phone?: string;
  tags?: string; // カンマ区切りの自由タグ
  met?: string; // 出会った場所・きっかけ
  memo?: string;
  /** 名刺写真（brain:img:<id> に保存。/brain/img/<id> で表示） */
  photoId?: string;
  createdAt: string;
  updatedAt: string;
}

export type NoteSource = 'manual' | 'voice' | 'pdf' | 'photo';

export interface Note {
  id: string;
  title: string;
  date: string; // 'YYYY-MM-DD'（会議・出来事の日）
  people?: string; // 関係者（自由記述。名刺の氏名を書くと相互に紐づく）
  tags?: string;
  body: string;
  source: NoteSource;
  /** 添付写真（ホワイトボード・資料など） */
  photoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LogEntry {
  at: string;
  action: string;
}

// ノート本文の上限。Upstash REST のリクエスト上限（1MB）に余裕を持たせつつ、
// PDF数十ページ分の全文は収まるサイズ。超過分は切り詰めて、その旨を残す。
export const MAX_BODY = 100_000;

function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
  return v?.trim() || undefined;
}

// --- Redis (Upstash REST) ---------------------------------------------------

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
  if (!res.ok) throw new Error(`[brain] KV request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[brain] KV command failed: ${data.error}`);
  return data.result;
}

const CONTACTS_KEY = 'brain:contacts';
const NOTES_KEY = 'brain:notes';
const LOG_KEY = 'brain:log';
const sessKey = (token: string) => `brain:sess:${token}`;
const rlKey = (ipHash: string) => `brain:rl:${ipHash}`;

function parseHash<T>(flat: unknown): T[] {
  const out: T[] = [];
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      out.push(JSON.parse(String(flat[i + 1])) as T);
    } catch {
      // 壊れたレコードは無視して他を生かす
    }
  }
  return out;
}

const randHex = (bytes: number) => randomBytes(bytes).toString('hex');
const now = () => new Date().toISOString();

// --- 認証 -------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual は長さ違いで例外になるため先に弾く（長さは秘密ではない）
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function isAdminKeyConfigured(): boolean {
  return !!readEnv('BRAIN_ADMIN_KEY');
}

export function checkAdminKey(key: string | undefined | null): boolean {
  const expected = readEnv('BRAIN_ADMIN_KEY');
  return !!expected && !!key && safeEqual(key, expected);
}

// セッションは12時間。アクセスのたびに延長（使っている間は切れない）。
const SESSION_TTL = 12 * 3600;

export async function createSession(): Promise<string> {
  const token = randHex(32); // 256bit
  await redis('SET', sessKey(token), now(), 'EX', SESSION_TTL);
  return token;
}

/** Cookie のトークンが有効か。有効なら TTL を延長する。 */
export async function checkSession(token: string | undefined | null): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  if (!isKvConfigured()) return false;
  const val = await redis('GET', sessKey(token));
  if (typeof val !== 'string') return false;
  await redis('EXPIRE', sessKey(token), SESSION_TTL);
  return true;
}

export async function destroySession(token: string | undefined | null): Promise<void> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return;
  await redis('DEL', sessKey(token));
}

// ログイン失敗のレート制限：同一IPから15分間に10回失敗でロック。
// IP はそのまま保存せずハッシュにする（KVにも生IPを残さない）。
const RL_WINDOW = 15 * 60;
const RL_MAX = 10;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

export async function loginLocked(ip: string): Promise<boolean> {
  const n = Number(await redis('GET', rlKey(hashIp(ip)))) || 0;
  return n >= RL_MAX;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const key = rlKey(hashIp(ip));
  const n = Number(await redis('INCR', key));
  if (n === 1) await redis('EXPIRE', key, RL_WINDOW);
}

/**
 * CSRF対策の二重目：POST の Origin がサイト自身であることを確認する。
 * （一重目は SameSite=Strict の Cookie。Origin を送らない古い環境の
 * フォーム送信は考慮しない — 管理者しか使わない社内ページのため。）
 */
export function checkOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === url.origin;
}

/** Vercel 経由のクライアントIP。取れなければ空文字（レート制限は共有バケツに落ちる）。 */
export function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : '';
}

// --- ページ共通の認証処理 -------------------------------------------------------
// 各ページの frontmatter 冒頭で呼ぶ。ログイン／ログアウトの POST を処理し、
// セッションの有無を返す。response が返ったらそのまま return する。

export const BRAIN_COOKIE = 'brain_session';

interface AstroLike {
  request: Request;
  url: URL;
  cookies: {
    get(name: string): { value: string } | undefined;
    set(name: string, value: string, opts: Record<string, unknown>): void;
    delete(name: string, opts: Record<string, unknown>): void;
  };
  redirect(path: string, status?: number): Response;
}

export interface AuthResult {
  authed: boolean;
  loginFailed: boolean;
  locked: boolean;
  /** ログイン成功・ログアウト時のリダイレクト。返ってきたらページはこれを return する */
  response?: Response;
}

export async function handleAuth(astro: AstroLike): Promise<AuthResult> {
  const token = astro.cookies.get(BRAIN_COOKIE)?.value;
  const result: AuthResult = { authed: false, loginFailed: false, locked: false };
  const cookieOpts = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/brain',
  };

  if (astro.request.method === 'POST' && isKvConfigured()) {
    // 認証系アクションだけ先読みしたいが、FormData は一度しか読めないため
    // ここで読んだものをページ側でも使えるよう返す…とすると複雑になる。
    // 認証系は Content-Type が urlencoded の小さなフォームのみなので、
    // clone() して覗く（本体のストリームは温存される）。
    let action = '';
    try {
      const ct = astro.request.headers.get('content-type') ?? '';
      if (ct.includes('application/x-www-form-urlencoded')) {
        const form = await astro.request.clone().formData();
        action = String(form.get('action') ?? '');
      }
    } catch {
      // multipart 等は認証系アクションではないので無視
    }

    if (action === 'login' || action === 'logout') {
      if (!checkOrigin(astro.request, astro.url)) {
        result.loginFailed = true;
        return result;
      }
      if (action === 'logout') {
        await destroySession(token);
        astro.cookies.delete(BRAIN_COOKIE, { path: '/brain' });
        result.response = astro.redirect('/brain/', 303);
        return result;
      }
      // login
      const ip = clientIp(astro.request);
      if (await loginLocked(ip)) {
        result.locked = true;
        return result;
      }
      const form = await astro.request.formData();
      const entered = String(form.get('key') ?? '').trim();
      if (checkAdminKey(entered)) {
        const newToken = await createSession();
        astro.cookies.set(BRAIN_COOKIE, newToken, cookieOpts);
        // POST 再送を防ぐため必ず GET にリダイレクト（クエリは引き継ぐ）
        result.response = astro.redirect(astro.url.pathname + astro.url.search, 303);
        return result;
      }
      await recordLoginFailure(ip);
      result.loginFailed = true;
      return result;
    }
  }

  result.authed = await checkSession(token);
  return result;
}

// --- 活動ログ -----------------------------------------------------------------
// 登録・更新・削除の操作履歴。ダッシュボードに表示する（直近500件）。

export async function addLog(action: string): Promise<void> {
  try {
    await redis('LPUSH', LOG_KEY, JSON.stringify({ at: now(), action } satisfies LogEntry));
    await redis('LTRIM', LOG_KEY, 0, 499);
  } catch (e) {
    // ログ書き込み失敗で本体の操作を巻き込まない
    console.error('[brain] addLog failed:', e);
  }
}

export async function getLogs(limit = 30): Promise<LogEntry[]> {
  const raw = await redis('LRANGE', LOG_KEY, 0, limit - 1);
  if (!Array.isArray(raw)) return [];
  const out: LogEntry[] = [];
  for (const item of raw) {
    try {
      out.push(JSON.parse(String(item)) as LogEntry);
    } catch {
      // skip
    }
  }
  return out;
}

// --- 連絡先（名刺） -----------------------------------------------------------

export async function getContacts(): Promise<Contact[]> {
  const list = parseHash<Contact>(await redis('HGETALL', CONTACTS_KEY));
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getContact(id: string): Promise<Contact | null> {
  const raw = await redis('HGET', CONTACTS_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Contact;
  } catch {
    return null;
  }
}

export async function saveContact(c: Contact): Promise<void> {
  await redis('HSET', CONTACTS_KEY, c.id, JSON.stringify(c));
}

export async function createContact(data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>): Promise<Contact> {
  const c: Contact = { ...data, id: randHex(6), createdAt: now(), updatedAt: now() };
  await saveContact(c);
  return c;
}

export async function deleteContact(id: string): Promise<void> {
  await redis('HDEL', CONTACTS_KEY, id);
}

// --- ノート（議事録・メモ） -----------------------------------------------------

export async function getNotes(): Promise<Note[]> {
  const list = parseHash<Note>(await redis('HGETALL', NOTES_KEY));
  // 会議日の新しい順（同日なら作成の新しい順）＝時系列アーカイブ
  return list.sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

export async function getNote(id: string): Promise<Note | null> {
  const raw = await redis('HGET', NOTES_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Note;
  } catch {
    return null;
  }
}

export async function saveNote(n: Note): Promise<void> {
  await redis('HSET', NOTES_KEY, n.id, JSON.stringify(n));
}

export async function createNote(data: Omit<Note, 'id' | 'createdAt' | 'updatedAt'>): Promise<Note> {
  const n: Note = { ...data, id: randHex(6), createdAt: now(), updatedAt: now() };
  await saveNote(n);
  return n;
}

export async function deleteNote(id: string): Promise<void> {
  await redis('HDEL', NOTES_KEY, id);
}

// --- 検索 -------------------------------------------------------------------
// 表記ゆれに強い正規化をかけた全文検索。スペース区切りは AND 条件。
//   ・大文字小文字を無視
//   ・全角英数字 → 半角
//   ・カタカナ → ひらがな（「タナカ」でも「たなか」でも当たる）

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, ' ');
}

function contactHaystack(c: Contact): string {
  return normalize(
    [c.name, c.kana, c.company, c.role, c.email, c.phone, c.tags, c.met, c.memo]
      .filter(Boolean)
      .join(' '),
  );
}

function noteHaystack(n: Note): string {
  return normalize([n.title, n.date, n.people, n.tags, n.body].filter(Boolean).join(' '));
}

export interface SearchResult {
  contacts: Contact[];
  notes: Note[];
}

export async function searchAll(query: string): Promise<SearchResult> {
  const terms = normalize(query).split(' ').filter(Boolean);
  if (terms.length === 0) return { contacts: [], notes: [] };
  const [contacts, notes] = await Promise.all([getContacts(), getNotes()]);
  return {
    contacts: contacts.filter((c) => {
      const hay = contactHaystack(c);
      return terms.every((t) => hay.includes(t));
    }),
    notes: notes.filter((n) => {
      const hay = noteHaystack(n);
      return terms.every((t) => hay.includes(t));
    }),
  };
}

/** 連絡先に関連するノート（氏名がタイトル・関係者・本文に出てくるもの）。 */
export function relatedNotes(contact: Contact, notes: Note[]): Note[] {
  const name = normalize(contact.name).replace(/ /g, '');
  if (name.length < 2) return [];
  return notes.filter((n) => noteHaystack(n).replace(/ /g, '').includes(name));
}

/** 検索語の前後を切り出したスニペット（本文ヒットの文脈表示用）。 */
export function snippet(body: string, query: string, width = 60): string {
  const terms = normalize(query).split(' ').filter(Boolean);
  const hay = normalize(body);
  for (const t of terms) {
    const i = hay.indexOf(t);
    if (i >= 0) {
      // normalize は文字数を変えない（1文字→1文字の変換のみ）ので
      // 正規化後のインデックスを原文にそのまま使える
      const start = Math.max(0, i - Math.floor(width / 2));
      const end = Math.min(body.length, i + t.length + Math.floor(width / 2));
      return `${start > 0 ? '…' : ''}${body.slice(start, end).replace(/\s+/g, ' ')}${end < body.length ? '…' : ''}`;
    }
  }
  return body.slice(0, width).replace(/\s+/g, ' ') + (body.length > width ? '…' : '');
}

// --- 写真の保存 ---------------------------------------------------------------
// 写真はブラウザ側でJPEGに圧縮してから data URL で受け取り、マジックバイトを
// 検証した上で KV に保存する。名刺・ノートに紐づくまでは24時間で自動失効
// （撮ったが保存しなかった孤児データが残らない）。閲覧は /brain/img/<id> 経由で
// ログインセッション必須。

// Upstash REST のリクエスト上限（1MB）に収まるようbase64で800KB（実体約600KB）まで
export const MAX_IMAGE_B64 = 800_000;

const imgKey = (id: string) => `brain:img:${id}`;
const draftKey = (id: string) => `brain:draft:${id}`;

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

const IMAGE_MAGIC: Record<ImageType, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

export interface ImageData {
  type: ImageType;
  data: string; // base64
}

/** data URL を検証して {type, base64} に分解。不正・過大なら理由を返す。 */
export function parseImageDataUrl(dataUrl: string): { image?: ImageData; error?: string } {
  const m = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { error: '写真を選択してください（対応形式：JPEG/PNG/WebP）。' };
  if (m[2].length > MAX_IMAGE_B64) {
    return { error: '写真が大きすぎます。もう一度選び直してください（自動圧縮が働かなかった可能性があります）。' };
  }
  const type = m[1] as ImageType;
  const buf = Buffer.from(m[2], 'base64');
  if (!IMAGE_MAGIC[type].every((b, i) => buf[i] === b)) {
    return { error: '画像ファイルとして読み取れませんでした。' };
  }
  return { image: { type, data: m[2] } };
}

/** 画像を保存（未紐づけのまま24時間で自動失効）。ID を返す。 */
export async function saveImage(img: ImageData): Promise<string> {
  const id = randHex(8);
  await redis('SET', imgKey(id), JSON.stringify(img), 'EX', 86400);
  return id;
}

/** 名刺・ノートに紐づいたら失効を解除して永続化する。 */
export async function persistImage(id: string): Promise<void> {
  await redis('PERSIST', imgKey(id));
}

export async function getImage(id: string): Promise<ImageData | null> {
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  const raw = await redis('GET', imgKey(id));
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as ImageData;
  } catch {
    return null;
  }
}

export async function deleteImage(id: string | undefined): Promise<void> {
  if (id) await redis('DEL', imgKey(id));
}

// 名刺写真→AI読み取り→確認画面 の間だけ使う下書き（1時間で自動失効）
export interface ContactDraft {
  photoId: string;
  fields: Partial<Contact>;
  notice: string;
}

export async function saveDraft(draft: ContactDraft): Promise<void> {
  await redis('SET', draftKey(draft.photoId), JSON.stringify(draft), 'EX', 3600);
}

export async function getDraft(id: string): Promise<ContactDraft | null> {
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  const raw = await redis('GET', draftKey(id));
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as ContactDraft;
  } catch {
    return null;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  await redis('DEL', draftKey(id));
}

// --- 写真のAI読み取り（Claude vision） -----------------------------------------
// ANTHROPIC_API_KEY を設定すると、名刺写真から氏名・会社などを自動抽出し、
// ノートの写真（ホワイトボード・資料）から文字を書き起こす。未設定でも
// 写真の保存・添付自体は動く（読み取りだけ手入力になる）。

export function isVisionConfigured(): boolean {
  return !!readEnv('ANTHROPIC_API_KEY');
}

async function anthropicClient() {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  return new Anthropic({ apiKey: readEnv('ANTHROPIC_API_KEY') });
}

const CARD_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '氏名（フルネーム）。読み取れなければ空文字' },
    kana: { type: 'string', description: '氏名のふりがな。名刺に記載がある場合のみ' },
    company: { type: 'string', description: '会社名・組織名' },
    role: { type: 'string', description: '部署・役職（例：営業部 部長）' },
    email: { type: 'string', description: 'メールアドレス' },
    phone: { type: 'string', description: '電話番号（携帯優先）' },
    memo: { type: 'string', description: '住所・URL・その他名刺に書かれた情報' },
  },
  required: ['name', 'kana', 'company', 'role', 'email', 'phone', 'memo'],
  additionalProperties: false,
} as const;

/** 名刺写真から連絡先情報を抽出する。失敗時は null（呼び出し側で手入力に誘導）。 */
export async function extractCardFields(img: ImageData): Promise<Partial<Contact> | null> {
  if (!isVisionConfigured()) return null;
  try {
    const client = await anthropicClient();
    const res = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 2048,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: CARD_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } },
            { type: 'text', text: 'この名刺の画像から連絡先情報を読み取ってください。読み取れない項目は空文字にしてください。' },
          ],
        },
      ],
    } as never);
    if (res.stop_reason === 'refusal') return null;
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    const raw = JSON.parse(block.text) as Record<string, unknown>;
    const f = (key: string, max: number) =>
      typeof raw[key] === 'string' ? (raw[key] as string).trim().slice(0, max) || undefined : undefined;
    return {
      name: f('name', 100),
      kana: f('kana', 100),
      company: f('company', 120),
      role: f('role', 120),
      email: f('email', 254),
      phone: f('phone', 40),
      memo: f('memo', 4000),
    };
  } catch (e) {
    console.error('[brain] card extraction failed:', e);
    return null;
  }
}

/** 写真（ホワイトボード・紙資料など）から文字を書き起こす。失敗時は null。 */
export async function extractImageText(img: ImageData): Promise<string | null> {
  if (!isVisionConfigured()) return null;
  try {
    const client = await anthropicClient();
    const res = await client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 8192,
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } },
            {
              type: 'text',
              text: 'この画像に写っている文字情報を、できるだけ忠実にすべて書き起こしてください。ホワイトボード・手書きメモ・紙資料などです。図や表は内容がわかるよう箇条書きにしてください。書き起こし本文のみを出力し、前置きは不要です。文字がなければ「（文字情報は読み取れませんでした）」とだけ出力してください。',
            },
          ],
        },
      ],
    } as never);
    if (res.stop_reason === 'refusal') return null;
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    return block.text.trim().slice(0, MAX_BODY) || null;
  } catch (e) {
    console.error('[brain] image transcription failed:', e);
    return null;
  }
}

// --- PDF テキスト抽出 ----------------------------------------------------------

// Vercel のリクエストボディ上限（約4.5MB）に収まるよう 4MB に抑える
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/**
 * アップロードされたPDFからテキストを抽出する。ファイル自体は保存しない
 * （抽出テキストだけをノートとして残す）。マジックバイトで本当にPDFかを
 * 確認してから処理する。
 */
export async function extractPdfText(buf: ArrayBuffer): Promise<{ text: string; pages: number }> {
  const bytes = new Uint8Array(buf);
  const head = String.fromCharCode(...bytes.slice(0, 5));
  if (head !== '%PDF-') throw new Error('PDFファイルではありません。');
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(bytes);
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  return { text: (text as string).trim(), pages: totalPages };
}

// --- 表示ヘルパー --------------------------------------------------------------

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDateJa(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return date;
  const wd = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日(${wd})`;
}

export function formatDateTimeJa(iso: string): string {
  const d = new Date(iso);
  // JSTに変換して表示
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${j.getUTCFullYear()}/${String(j.getUTCMonth() + 1).padStart(2, '0')}/${String(j.getUTCDate()).padStart(2, '0')} ${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`;
}

export function jstToday(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const SOURCE_LABEL: Record<NoteSource, string> = {
  manual: '手入力',
  voice: '音声入力',
  pdf: 'PDF取り込み',
  photo: '写真',
};
