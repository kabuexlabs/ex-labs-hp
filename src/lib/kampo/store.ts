// ---------------------------------------------------------------------------
// 漢方体質チェック（/kampo/）のデータ層。
// ストレージ: Upstash Redis（/yoyaku・/hacktale と同じ REST fetch 方式・依存ゼロ）。
//   kampo:s:<id>            … チェックセッション1件（JSON）。EXPIREAT で保持期限（3年）
//   kampo:sessions          … 全セッションの ZSET（score=開始時刻 ms）→ 本日一覧・CSV
//   kampo:c:<id>            … 顧客1件（JSON）
//   kampo:c:sessions:<cid>  … 顧客ごとのセッション ZSET
//   kampo:idx:member:<no>   … 会員番号 → 顧客ID（完全一致）
//   kampo:idx:phone:<num>   … 電話番号（ハイフンなし）→ 顧客ID
//   kampo:customers         … 顧客IDの SET（LINE表示名の検索用）
//   kampo:audit             … スタッフ画面の閲覧・保存の記録（LIST、新しい順、最大 5000）
// 設問・タイプ・処方のマスタはリポジトリ内 JSON（src/data/kampo/）。
// 保持期限：セッション本体は Redis の TTL で消える。索引（ZSET）側は
// purgeExpired() が期限切れ分を掃除し、セッションが0になった顧客も削除する。
// ---------------------------------------------------------------------------
import { randomBytes } from 'node:crypto';
import { QUESTIONNAIRE, axisName, type TypeKey } from './masters.ts';
import type { Answers } from './flow.ts';
import type { ScoreResult } from './scoring.ts';
import type { SafetyFlag, TagHit } from './safety.ts';

export function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
  return v?.trim() || undefined;
}
function kvConfig(): { url: string; token: string } | null {
  const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
  const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
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
  if (!res.ok) throw new Error(`[kampo] KV request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[kampo] KV command failed: ${data.error}`);
  return data.result;
}

// --- 型 -----------------------------------------------------------------------

/** 2026-10-24 版までの「舌チェックの担当」。v3 では舌は薬剤師だけが入力する（旧セッションの表示用に残す） */
export type TongueMode = 'self' | 'staff';
export type InputBy = 'customer' | 'staff';
export type SessionStatus = 'in_progress' | 'completed' | 'proposed';
export const STATUS_LABEL: Record<SessionStatus, string> = { in_progress: '回答中', completed: '回答完了', proposed: '提案済み' };
export const TONGUE_MODE_LABEL: Record<TongueMode, string> = { self: 'ご自分で', staff: 'スタッフが確認' };
export const INPUT_BY_LABEL: Record<InputBy, string> = { customer: 'ご本人', staff: 'スタッフ聞き取り' };

export interface KampoCustomer {
  id: string;
  memberNo?: string;
  phone?: string; // ハイフンなし
  lineName?: string;
  displayName?: string;
  sex?: string;
  ageBand?: string;
  createdAt: string;
}

export interface KampoProposal {
  staffName: string;
  /** 表示した候補（監査用。主訴ごとの候補と判定の要約＝selectionSnapshot） */
  candidates: unknown;
  selected: { formulaCode: string; name: string; reason?: string }[];
  note?: string;
  deliveredVia?: 'screen' | 'print' | '';
  createdAt: string;
  updatedAt: string;
}

/** 薬剤師の判定（AI の判定を開く前に記録する。2026-10-28 修正依頼 第8章） */
export interface PharmacistJudgment {
  staffName: string;
  /** 主となる体質（6タイプ） */
  types: TypeKey[];
  /** 寒熱：冷え／熱／どちらでもない／判断保留 */
  thermal: 'cold' | 'heat' | 'neutral' | 'pending';
  /** 虚実：虚証寄り／虚実間／実証寄り／判断保留 */
  defExc: 'def' | 'mid' | 'exc' | 'pending';
  /** 検討する漢方薬（任意） */
  formulas?: string;
  note?: string;
  /** 記録せずに AI の判定を開いた */
  skipped?: boolean;
  at: string;
  /** 判定を記録した時点の AI の判定（精度の検証用に並べて保存。第3弾 9） */
  ai?: { mainTypes: string[]; subTypes: string[]; thermalLabel: string; defExcLabel: string; pct: Record<string, number> };
}
export interface KampoSession {
  id: string;
  customerId?: string;
  /** 一覧表示用の識別子スナップショット（例: 会員 12345） */
  customerLabel: string;
  questionnaireVersion: string;
  tongueMode: TongueMode;
  inputBy: InputBy;
  consentAt: string;
  answers: Answers;
  /** 短い記入欄（2026-10-28〜 C3 の「何に出たか」。選択肢ID → 記入内容）。2026-10-24 版までの自由記入もここ */
  texts: Record<string, string>;
  /** 2026-10-24 版までの薬剤師の舌所見（旧セッションの表示用） */
  tongueOverride?: string[];
  /** 薬剤師の入力（舌・顔色・爪・体格・声・妊娠授乳・漢方薬。設問ID → 選択肢ID） */
  staffAnswers?: Answers;
  staffAnsweredAt?: string;
  /** 観察を入力した担当者 */
  staffAnsweredBy?: string;
  /** 安全確認タグの確認（タグID → 確認した担当者・日時・メモ） */
  tagChecks?: Record<string, { by: string; at: string; note?: string }>;
  /** 薬剤師の判定（AI の判定より先に記録） */
  judgment?: PharmacistJudgment;
  /** 漢方薬で体調を崩した経験がある方に、薬剤師が確認したうえで漢方候補を表示に切り替えた記録（第2弾 6-4） */
  kampoUnlocked?: { by: string; at: string };
  scores?: ScoreResult;
  safetyFlags?: SafetyFlag[];
  /** 安全確認タグ（保存時点） */
  tags?: TagHit[];
  /** 直ちに対応が必要な回答がある（回答の途中でも立てる） */
  urgent?: boolean;
  status: SessionStatus;
  startedAt: string;
  completedAt?: string;
  expiresAt: string;
  proposal?: KampoProposal;
}

export interface AuditEntry { at: string; action: string; target: string; staffName?: string }

// --- ユーティリティ -----------------------------------------------------------

const randHex = (bytes: number) => randomBytes(bytes).toString('hex');
export const newId = () => randHex(8);
export const retentionYears = () => Math.max(1, parseInt(readEnv('KAMPO_RETENTION_YEARS') ?? '3', 10) || 3);

/** 日本時間の 'YYYY-MM-DD' */
export function jstDate(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
/** 'YYYY-MM-DD'（JST）の 0:00 と翌 0:00 の epoch ms */
export function jstDayRange(date: string): { from: number; to: number } {
  const from = new Date(`${date}T00:00:00+09:00`).getTime();
  return { from, to: from + 86400 * 1000 };
}
export const fmtJst = (iso: string, withDate = true) => {
  const d = new Date(iso);
  const j = new Date(d.getTime() + 9 * 3600 * 1000);
  const hm = `${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`;
  return withDate ? `${j.toISOString().slice(0, 10).replace(/-/g, '/')} ${hm}` : hm;
};
export function normalizePhone(raw: string): string {
  return raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\D/g, '');
}

const parse = <T,>(raw: unknown): T | null => {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};
const sKey = (id: string) => `kampo:s:${id}`;
const cKey = (id: string) => `kampo:c:${id}`;
const cSessKey = (cid: string) => `kampo:c:sessions:${cid}`;
const SESSIONS = 'kampo:sessions';
const CUSTOMERS = 'kampo:customers';
const AUDIT = 'kampo:audit';

// --- 顧客 ---------------------------------------------------------------------

export async function getCustomer(id: string): Promise<KampoCustomer | null> {
  if (!id) return null;
  return parse<KampoCustomer>(await redis('GET', cKey(id)));
}
export async function saveCustomer(c: KampoCustomer): Promise<void> {
  await redis('SET', cKey(c.id), JSON.stringify(c));
  await redis('SADD', CUSTOMERS, c.id);
  if (c.memberNo) await redis('SET', `kampo:idx:member:${c.memberNo}`, c.id);
  if (c.phone) await redis('SET', `kampo:idx:phone:${c.phone}`, c.id);
}
export async function findCustomerByMember(memberNo: string): Promise<KampoCustomer | null> {
  const id = await redis('GET', `kampo:idx:member:${memberNo}`);
  return typeof id === 'string' ? getCustomer(id) : null;
}
export async function findCustomerByPhone(phone: string): Promise<KampoCustomer | null> {
  const id = await redis('GET', `kampo:idx:phone:${normalizePhone(phone)}`);
  return typeof id === 'string' ? getCustomer(id) : null;
}
export async function listCustomers(): Promise<KampoCustomer[]> {
  const ids = await redis('SMEMBERS', CUSTOMERS);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const out: KampoCustomer[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const raws = await redis('MGET', ...ids.slice(i, i + 100).map((x) => cKey(String(x))));
    if (Array.isArray(raws)) for (const r of raws) { const c = parse<KampoCustomer>(r); if (c) out.push(c); }
  }
  return out;
}
/** LINE表示名の部分一致（大文字小文字・全角半角スペースを無視） */
export async function findCustomersByLineName(name: string): Promise<KampoCustomer[]> {
  const norm = (s: string) => s.toLowerCase().replace(/[\s　]/g, '');
  const n = norm(name);
  if (!n) return [];
  return (await listCustomers()).filter((c) => c.lineName && norm(c.lineName).includes(n));
}
/** 会員番号・電話・LINE名のいずれかで検索（スタッフ画面の検索欄） */
export async function searchCustomers(qstr: string): Promise<KampoCustomer[]> {
  const s = qstr.trim();
  if (!s) return [];
  const found = new Map<string, KampoCustomer>();
  const byM = await findCustomerByMember(s);
  if (byM) found.set(byM.id, byM);
  const digits = normalizePhone(s);
  if (digits.length >= 6) { const byP = await findCustomerByPhone(digits); if (byP) found.set(byP.id, byP); }
  for (const c of await findCustomersByLineName(s)) found.set(c.id, c);
  // 会員番号の部分一致も拾う（番号の一部しか分からないとき）
  if (found.size === 0) for (const c of await listCustomers()) if (c.memberNo?.includes(s)) found.set(c.id, c);
  return [...found.values()];
}
export function customerLabel(c: KampoCustomer | null | undefined): string {
  if (!c) return '識別なし';
  const parts: string[] = [];
  if (c.displayName) parts.push(c.displayName);
  if (c.memberNo) parts.push(`会員 ${c.memberNo}`);
  else if (c.phone) parts.push(`電話 ${c.phone}`);
  else if (c.lineName) parts.push(`LINE ${c.lineName}`);
  return parts.join('／') || '識別なし';
}
async function deleteCustomer(c: KampoCustomer): Promise<void> {
  await redis('DEL', cKey(c.id), cSessKey(c.id));
  await redis('SREM', CUSTOMERS, c.id);
  if (c.memberNo) await redis('DEL', `kampo:idx:member:${c.memberNo}`);
  if (c.phone) await redis('DEL', `kampo:idx:phone:${c.phone}`);
}

// --- セッション ---------------------------------------------------------------

// 2026-10-25 に一時反映して取り消した v2 の設問で保存されたセッションは texts を持たないので補う（画面・CSV が落ちないように）
const normalizeSession = (s: KampoSession | null): KampoSession | null => { if (s) s.texts ??= {}; return s; };
export async function getSession(id: string): Promise<KampoSession | null> {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  return normalizeSession(parse<KampoSession>(await redis('GET', sKey(id))));
}
export async function saveSession(s: KampoSession): Promise<void> {
  const exp = Math.floor(new Date(s.expiresAt).getTime() / 1000);
  await redis('SET', sKey(s.id), JSON.stringify(s), 'EXAT', exp);
}
export async function createSession(input: { customer: KampoCustomer | null; inputBy: InputBy }): Promise<KampoSession> {
  const now = new Date();
  const exp = new Date(now);
  exp.setFullYear(exp.getFullYear() + retentionYears());
  const s: KampoSession = {
    id: newId(),
    customerId: input.customer?.id,
    customerLabel: customerLabel(input.customer),
    questionnaireVersion: QUESTIONNAIRE.version,
    tongueMode: 'staff',
    inputBy: input.inputBy,
    consentAt: now.toISOString(),
    answers: {},
    texts: {},
    status: 'in_progress',
    startedAt: now.toISOString(),
    expiresAt: exp.toISOString(),
  };
  await saveSession(s);
  await redis('ZADD', SESSIONS, now.getTime(), s.id);
  if (input.customer) await redis('ZADD', cSessKey(input.customer.id), now.getTime(), s.id);
  return s;
}
async function mgetSessions(ids: string[]): Promise<KampoSession[]> {
  const out: KampoSession[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const raws = await redis('MGET', ...ids.slice(i, i + 100).map(sKey));
    if (Array.isArray(raws)) raws.forEach((r, j) => {
      const s = normalizeSession(parse<KampoSession>(r));
      if (s) out.push(s);
      else void redis('ZREM', SESSIONS, ids[i + j]).catch(() => {}); // TTL で消えた本体の索引を掃除
    });
  }
  return out;
}
/** 指定日（JST 'YYYY-MM-DD'）のセッション。新しい順 */
export async function listSessionsByDay(date: string): Promise<KampoSession[]> {
  const { from, to } = jstDayRange(date);
  const ids = await redis('ZRANGEBYSCORE', SESSIONS, from, to - 1);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return (await mgetSessions(ids.map(String))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export async function listAllSessions(): Promise<KampoSession[]> {
  const ids = await redis('ZRANGE', SESSIONS, 0, -1);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return (await mgetSessions(ids.map(String))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
/** 日付をまたいだ直近のセッション（新しい順） */
export async function listRecentSessions(n = 20): Promise<KampoSession[]> {
  const ids = await redis('ZRANGE', SESSIONS, -n, -1);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return (await mgetSessions(ids.map(String))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export async function listCustomerSessions(cid: string): Promise<KampoSession[]> {
  const ids = await redis('ZRANGE', cSessKey(cid), 0, -1);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return (await mgetSessions(ids.map(String))).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export async function countSessions(): Promise<number> {
  return Number(await redis('ZCARD', SESSIONS)) || 0;
}

/** 保持期限（3年）を過ぎたセッションの索引と、セッションが0になった顧客を削除する */
export async function purgeExpired(now = new Date()): Promise<{ sessions: number; customers: number }> {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - retentionYears());
  const ids = await redis('ZRANGEBYSCORE', SESSIONS, '-inf', cutoff.getTime());
  let sessions = 0;
  let customers = 0;
  const touched = new Set<string>();
  if (Array.isArray(ids) && ids.length) {
    for (const raw of ids) {
      const id = String(raw);
      const s = await getSession(id);
      if (s?.customerId) touched.add(s.customerId);
      await redis('DEL', sKey(id));
      await redis('ZREM', SESSIONS, id);
      sessions++;
    }
  }
  // 期限切れセッションに紐づいていた顧客、および索引が空の顧客を確認
  const candidates = new Set(touched);
  if (sessions > 0 || candidates.size === 0) {
    const all = await redis('SMEMBERS', CUSTOMERS);
    if (Array.isArray(all)) for (const id of all) candidates.add(String(id));
  }
  for (const cid of candidates) {
    const live = await redis('ZRANGEBYSCORE', cSessKey(cid), cutoff.getTime() + 1, '+inf');
    const liveIds = Array.isArray(live) ? live.map(String) : [];
    // 索引に残っていても本体が消えているものは除く
    const existing = liveIds.length ? await mgetSessions(liveIds) : [];
    if (existing.length === 0) {
      const c = await getCustomer(cid);
      if (c) { await deleteCustomer(c); customers++; }
      else await redis('SREM', CUSTOMERS, cid);
    } else if (existing.length !== liveIds.length) {
      await redis('ZREMRANGEBYSCORE', cSessKey(cid), '-inf', cutoff.getTime());
    }
  }
  return { sessions, customers };
}

// --- 監査記録 -----------------------------------------------------------------

/** 担当者の名簿（スタッフ画面で登録。KAMPO_STAFF_NAMES と合わせて使う。第3弾 10-3） */
const ROSTER = 'kampo:staffnames';
export async function getStaffRoster(): Promise<string[]> {
  const raw = await redis('GET', ROSTER).catch(() => null);
  const kv = typeof raw === 'string' ? (parse<string[]>(raw) ?? []) : [];
  const env = (readEnv('KAMPO_STAFF_NAMES') ?? '').split(/[,、，]/).map((x) => x.trim()).filter(Boolean);
  return [...new Set([...env, ...kv])];
}
export async function saveStaffRoster(names: string[]): Promise<void> {
  const clean = [...new Set(names.map((x) => x.trim().slice(0, 30)).filter(Boolean))].slice(0, 50);
  await redis('SET', ROSTER, JSON.stringify(clean));
}

export async function audit(action: string, target: string, staffName?: string): Promise<void> {
  try {
    const e: AuditEntry = { at: new Date().toISOString(), action, target, staffName };
    await redis('LPUSH', AUDIT, JSON.stringify(e));
    await redis('LTRIM', AUDIT, 0, 4999);
  } catch (err) {
    console.error('[kampo] audit failed:', err);
  }
}
export async function recentAudit(limit = 50): Promise<AuditEntry[]> {
  const raw = await redis('LRANGE', AUDIT, 0, limit - 1);
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => parse<AuditEntry>(r)).filter((x): x is AuditEntry => !!x);
}

// --- 表示用 -------------------------------------------------------------------

/** タイプの名前（旧版のセッションの陽虚・陽盛なども表示する） */
export const typeNamesOf = (keys: string[] | undefined) => (keys ?? []).map(axisName).join('・');
