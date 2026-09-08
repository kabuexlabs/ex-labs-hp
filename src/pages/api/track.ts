export const prerender = false;

// 問い合わせ導線の計測ビーコン（個人情報なし）。
// SiteGuard が「相談CTAのクリック」「フォームの表示」を、/api/contact が
// 「送信成功」を記録する。値はイベント名・ページパス・カテゴリの3つだけ。
// 解析アカウントの新設や外部サービス契約は不要で、既存の KV に日別で数える。
import type { APIRoute } from 'astro';
import { contactRedis, recordMetric, METRIC_EVENTS, type MetricEvent } from '../../lib/contact';

const PAGE_RE = /^\/[A-Za-z0-9\-._~\/]{0,118}$/;
const CAT_RE = /^[a-z][a-z0-9-]{0,39}$/;

export const POST: APIRoute = async ({ request }) => {
  let body: { e?: unknown; p?: unknown; c?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response(null, { status: 204 });
  }
  const e = String(body.e ?? '');
  const p = String(body.p ?? '').split('?')[0].split('#')[0];
  const c = String(body.c ?? '');
  if (!METRIC_EVENTS.includes(e as MetricEvent) || e === 'submit') return new Response(null, { status: 204 });
  if (!PAGE_RE.test(p)) return new Response(null, { status: 204 });
  if (c && !CAT_RE.test(c)) return new Response(null, { status: 204 });

  // 連打・bot 対策：IPごとに10分60回まで。KV未設定なら素通し（記録もされない）。
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const n = await contactRedis('INCR', `contact:trl:${ip}`);
  if (typeof n === 'number') {
    if (n === 1) await contactRedis('EXPIRE', `contact:trl:${ip}`, '600');
    if (n > 60) return new Response(null, { status: 204 });
  }
  await recordMetric(e as MetricEvent, p, c);
  return new Response(null, { status: 204 });
};

export const ALL: APIRoute = () => new Response('Method Not Allowed', { status: 405 });
