import { timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// 展示型謎解きアプリ (/case) の統計データ層。
//
// 各端末（匿名の deviceId）が自分の進捗スナップショットを
// /api/case/track へ送信し、ここで Redis に保存する。集計は管理ページ
// (/case/admin) の表示時にまとめて行う — 送信のたびに集計値を更新する
// 方式より二重計上・リトライに強く、後から集計軸を増やせる。
//
// ストレージ: Upstash Redis の REST API（yoyaku / bihin / contact と同じ
//   インスタンス・同じ無料枠。キーは case: プレフィックスで分離）。
//   1端末 = ハッシュの1フィールド（約1KB）。数百人規模のイベントでも
//   HGETALL は問題ないサイズに収まる。
// 個人情報: 一切保存しない。deviceId は端末側で生成したランダムな
//   匿名IDで、氏名・連絡先とは紐付かない。
// ---------------------------------------------------------------------------

/** 1問ぶんの進捗（送信ペイロードを小さく保つため短縮キー）。 */
export interface SnapshotQuestion {
  id: number;
  /** attempted */
  a: boolean;
  /** solved */
  s: boolean;
  /** attempts（回答回数） */
  at: number;
  /** hintLevel（何段階目までヒントを見たか） */
  h: number;
}

export interface DeviceSnapshot {
  deviceId: string;
  startedAt: string;
  finishedAt?: string;
  /** サーバー側で付与する最終受信時刻。 */
  updatedAt: string;
  questions: SnapshotQuestion[];
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
  if (!res.ok) throw new Error(`[case] KV request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[case] KV command failed: ${data.error}`);
  return data.result;
}

const SNAPSHOTS_KEY = 'case:stats:devices';

export async function saveSnapshot(snapshot: DeviceSnapshot): Promise<void> {
  await redis('HSET', SNAPSHOTS_KEY, snapshot.deviceId, JSON.stringify(snapshot));
}

/** 端末の記録を削除する（開発用リセット・テスト端末の掃除）。 */
export async function deleteSnapshot(deviceId: string): Promise<void> {
  await redis('HDEL', SNAPSHOTS_KEY, deviceId);
}

/** 全記録の削除（管理ページの「統計をリセット」）。 */
export async function deleteAllSnapshots(): Promise<void> {
  await redis('DEL', SNAPSHOTS_KEY);
}

export async function getSnapshots(): Promise<DeviceSnapshot[]> {
  const flat = await redis('HGETALL', SNAPSHOTS_KEY);
  const out: DeviceSnapshot[] = [];
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      const parsed = JSON.parse(String(flat[i + 1])) as DeviceSnapshot;
      if (parsed && Array.isArray(parsed.questions)) out.push(parsed);
    } catch {
      // 壊れたレコードは無視して他を生かす
    }
  }
  return out;
}

// --- 認証 -------------------------------------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual は長さ違いで例外になるため先に弾く（長さは秘密ではない）。
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 統計管理ページ (/case/admin) の合言葉。 */
export function checkCaseAdminKey(key: string | undefined | null): boolean {
  const expected = readEnv('CASE_ADMIN_KEY');
  return !!expected && !!key && safeEqual(key, expected);
}

// --- 集計 -------------------------------------------------------------------

export interface QuestionStats {
  id: number;
  /** この問題に一度でも回答した端末数。 */
  attemptedDevices: number;
  /** 解決した端末数。 */
  solvedDevices: number;
  /** 正答率 (%) = 解決端末 / 挑戦端末。挑戦0なら null。 */
  accuracy: number | null;
  /** 挑戦端末あたりの平均回答回数。 */
  avgAttempts: number | null;
  /** ヒントを1段階以上見た端末数。 */
  hintDevices: number;
}

export interface CaseStats {
  /** 記録のある端末数（= 調査を開始した参加者数）。 */
  totalDevices: number;
  /** 1問以上回答した端末数。 */
  activeDevices: number;
  /** 体験を終了（結果画面まで到達）した端末数。 */
  finishedDevices: number;
  /** 回答した端末の平均正答率 (%)（正解数 / 全問題数）。 */
  avgAccuracy: number | null;
  /** 最終問題（真相）に挑戦した端末数。 */
  finalAttemptedDevices: number;
  /** 最終問題を解決した端末数。 */
  finalSolvedDevices: number;
  /** ランク別の端末数（1問以上回答した端末が対象）。 */
  rankCounts: Record<string, number>;
  perQuestion: QuestionStats[];
}

/**
 * 全端末のスナップショットから統計を組み立てる。
 * ランク判定は結果画面と同じ rankForScore を使うため、呼び出し側から
 * 注入する（このモジュールをデータ・集計に閉じるため）。
 */
export function aggregateStats(
  snapshots: DeviceSnapshot[],
  questionIds: number[],
  finalQuestionId: number,
  rankForScore: (score: number) => { rank: string },
): CaseStats {
  const totalQuestions = questionIds.length;
  const perQuestion = new Map<
    number,
    { attempted: number; solved: number; attempts: number; hints: number }
  >(questionIds.map((id) => [id, { attempted: 0, solved: 0, attempts: 0, hints: 0 }]));

  let activeDevices = 0;
  let finishedDevices = 0;
  let accuracySum = 0;
  let finalAttempted = 0;
  let finalSolved = 0;
  const rankCounts: Record<string, number> = {};

  for (const snap of snapshots) {
    let attemptedAny = false;
    let solvedCount = 0;
    for (const q of snap.questions) {
      const agg = perQuestion.get(q.id);
      if (!agg) continue; // 現在の問題セットに無いIDは無視
      if (q.a) {
        agg.attempted += 1;
        agg.attempts += q.at;
        attemptedAny = true;
      }
      if (q.s) {
        agg.solved += 1;
        solvedCount += 1;
      }
      if (q.h > 0) agg.hints += 1;
      if (q.id === finalQuestionId) {
        if (q.a) finalAttempted += 1;
        if (q.s) finalSolved += 1;
      }
    }
    if (snap.finishedAt) finishedDevices += 1;
    if (attemptedAny) {
      activeDevices += 1;
      const accuracy =
        totalQuestions === 0 ? 0 : Math.round((solvedCount / totalQuestions) * 100);
      accuracySum += accuracy;
      const rank = rankForScore(accuracy).rank;
      rankCounts[rank] = (rankCounts[rank] ?? 0) + 1;
    }
  }

  return {
    totalDevices: snapshots.length,
    activeDevices,
    finishedDevices,
    avgAccuracy: activeDevices === 0 ? null : Math.round(accuracySum / activeDevices),
    finalAttemptedDevices: finalAttempted,
    finalSolvedDevices: finalSolved,
    rankCounts,
    perQuestion: questionIds.map((id) => {
      const agg = perQuestion.get(id)!;
      return {
        id,
        attemptedDevices: agg.attempted,
        solvedDevices: agg.solved,
        accuracy:
          agg.attempted === 0 ? null : Math.round((agg.solved / agg.attempted) * 100),
        avgAttempts:
          agg.attempted === 0 ? null : Math.round((agg.attempts / agg.attempted) * 10) / 10,
        hintDevices: agg.hints,
      };
    }),
  };
}
