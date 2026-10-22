// 進捗スナップショットの受信API。
// 端末側 (src/lib/case/sync.ts) が fire-and-forget で送ってくるため、
// 失敗しても来場者の体験には影響しない（レスポンスは見ていない）。
// 匿名の deviceId ごとに最新スナップショットを上書き保存するだけの
// 冪等な作りで、リトライ・重複送信で数字が壊れることはない。
export const prerender = false;

import type { APIRoute } from 'astro';
import { questions } from '../../../data/case/questions';
import {
  deleteSnapshot,
  isKvConfigured,
  saveSnapshot,
  type SnapshotQuestion,
} from '../../../lib/caseStats';

const MAX_BODY = 32_000;
const DEVICE_ID_RE = /^[0-9a-f][0-9a-f-]{15,63}$/i;
const validIds = new Set(questions.map((q) => q.id));

function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));
}

function clampInt(v: unknown, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), max);
}

export const POST: APIRoute = async ({ request }) => {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isKvConfigured()) {
    // ストレージ未設定でも来場者側をエラーにしない
    return new Response(JSON.stringify({ ok: false, reason: 'kv-not-configured' }), {
      status: 200,
      headers,
    });
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) {
      return new Response(JSON.stringify({ ok: false }), { status: 413, headers });
    }
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
  }

  const deviceId = String(body.deviceId ?? '');
  if (!DEVICE_ID_RE.test(deviceId)) {
    return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
  }

  try {
    // 開発用リセット: この端末の記録を消す
    if (body.reset === true) {
      await deleteSnapshot(deviceId);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    if (!isIsoDate(body.startedAt) || !Array.isArray(body.questions)) {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
    }

    // 既知の問題IDだけを受け入れ、値は妥当な範囲へ丸める
    const seen = new Set<number>();
    const sanitized: SnapshotQuestion[] = [];
    for (const raw of body.questions as Record<string, unknown>[]) {
      const id = Number(raw?.id);
      if (!validIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      sanitized.push({
        id,
        a: raw.a === true || raw.a === 1,
        s: raw.s === true || raw.s === 1,
        at: clampInt(raw.at, 999),
        h: clampInt(raw.h, 20),
      });
    }

    await saveSnapshot({
      deviceId: deviceId.toLowerCase(),
      startedAt: body.startedAt,
      ...(isIsoDate(body.finishedAt) ? { finishedAt: body.finishedAt } : {}),
      updatedAt: new Date().toISOString(),
      questions: sanitized,
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (e) {
    console.error('[case] track failed:', e);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers });
  }
};
