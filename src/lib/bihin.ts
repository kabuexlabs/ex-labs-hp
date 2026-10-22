import { timingSafeEqual, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// 社内備品管理（/bihin）のデータ層。
//
// 備品ごとに「名前・個数・購入価格・保管場所・写真」を持ち、あとから
// 何度でも更新できる。閲覧・編集は BIHIN_ADMIN_KEY の合言葉を知っている
// 社内メンバーのみ。
//
// ストレージ: Upstash Redis の REST API（yoyaku / contact と同じ
//   インスタンス・同じ無料枠。キーは bihin: プレフィックスで分離）。
// 写真: ブラウザ側で縮小した JPEG を data URI として写真専用キーに保存し、
//   一覧・詳細の HTML には埋め込まず /bihin/photo/<id> 経由で配信する。
//   （HGETALL で全写真を一括取得すると応答が肥大化するため、備品本体と
//   写真は必ず別キーに分ける）
// ---------------------------------------------------------------------------

export interface Item {
  id: string;
  name: string;
  quantity: number;
  // 購入価格（円）。不明・未記入は undefined のまま持ち「不明」と表示する。
  price?: number;
  location: string;
  // いつ・何の用途で買ったかの自由記述メモ。未記入は undefined。
  note?: string;
  // 写真の有無＋<img> のキャッシュバスターを兼ねる（写真自体は別キー）。
  photoUpdatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Vercel injects dashboard variables into process.env at runtime;
// import.meta.env covers .env files and build-time injection.
function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
  return v?.trim() || undefined;
}

// --- Redis (Upstash REST) ---------------------------------------------------

// yoyaku.ts と同じ二系統対応（Vercel Marketplace = KV_REST_API_*、
// Upstash 直結 = UPSTASH_REDIS_REST_*）。
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
  if (!res.ok) throw new Error(`[bihin] KV request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[bihin] KV command failed: ${data.error}`);
  return data.result;
}

const ITEMS_KEY = 'bihin:items';
const photoKey = (id: string) => `bihin:photo:${id}`;

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

// --- 備品 -------------------------------------------------------------------

export async function getItems(): Promise<Item[]> {
  const map = parseHash<Item>(await redis('HGETALL', ITEMS_KEY));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

export async function getItem(id: string): Promise<Item | null> {
  const raw = await redis('HGET', ITEMS_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Item;
  } catch {
    return null;
  }
}

export async function saveItem(item: Item): Promise<void> {
  await redis('HSET', ITEMS_KEY, item.id, JSON.stringify(item));
}

export function newItemId(): string {
  return randomBytes(6).toString('hex');
}

/** 備品削除。写真も一緒に消す。 */
export async function deleteItem(id: string): Promise<void> {
  await redis('HDEL', ITEMS_KEY, id);
  await redis('DEL', photoKey(id));
}

// --- 写真 -------------------------------------------------------------------

/** data URI（data:image/jpeg;base64,...）をそのまま保存する。 */
export async function savePhoto(id: string, dataUri: string): Promise<void> {
  await redis('SET', photoKey(id), dataUri);
}

export async function getPhoto(id: string): Promise<string | null> {
  const raw = await redis('GET', photoKey(id));
  return typeof raw === 'string' ? raw : null;
}

export async function deletePhoto(id: string): Promise<void> {
  await redis('DEL', photoKey(id));
}

// --- 認証 -------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual は長さ違いで例外になるため先に弾く（長さは秘密ではない）。
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 備品管理ページの合言葉。 */
export function checkBihinKey(key: string | undefined | null): boolean {
  const expected = readEnv('BIHIN_ADMIN_KEY');
  return !!expected && !!key && safeEqual(key, expected);
}

// --- 表示ヘルパー -------------------------------------------------------------

/** 12345 → '¥12,345'。未記入は '不明'。 */
export function formatPrice(price: number | undefined): string {
  return typeof price === 'number' ? `¥${price.toLocaleString('ja-JP')}` : '不明';
}
