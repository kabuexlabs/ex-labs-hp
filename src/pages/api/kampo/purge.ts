// 保持期限（3年）を過ぎたチェックの削除。Vercel Cron 用（Bearer CRON_SECRET）。
// Hobby プランの cron 枠（1日1回×2本）は /api/yoyaku/reminder と /api/hacktale/reminder で
// 使い切っているため、cron は登録していない。セッション本体は Redis の TTL で自動的に消え、
// 索引側はスタッフ画面の一覧表示時にも同じ掃除が走る（lazy purge）。手動で叩くときに使う。
export const prerender = false;
import type { APIRoute } from 'astro';
import { checkCronSecret } from '../../../lib/yoyaku';
import { isKvConfigured, purgeExpired } from '../../../lib/kampo/store';

export const GET: APIRoute = async ({ request }) => {
  if (!checkCronSecret(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  if (!isKvConfigured()) return new Response(JSON.stringify({ error: 'kv not configured' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  const r = await purgeExpired();
  return new Response(JSON.stringify({ ok: true, ...r }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
