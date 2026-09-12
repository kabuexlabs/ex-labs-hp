export const prerender = false;

// 外部サイト掲載の公演の定期再確認（vercel.json の crons から毎日 21:00 UTC＝日本時間 6:00 に呼ばれる）。
// 対象は autoRefresh: true の行だけ。autoRefresh は管理画面で、掲載元の利用条件を確認したサイト
// （sourceSites の terms: 'confirmed'）に対してのみ付けられる。初期状態では対象ゼロ＝何も取得しない。
// 再取得できなかった行は募集状況を「掲載元で確認」（unknown）に戻し、残席の表示を消す。
import type { APIRoute } from 'astro';
import { checkCronSecret, isKvConfigured } from '../../../lib/yoyaku';
import { kvListListings, kvUpsertListing } from '../../../lib/events-store';
import { fetchPage, extractCandidates } from '../../../lib/events-import';
import { sourceSites } from '../../../data/events/sourceSites';
import { jstDateString } from '../../../lib/thisWeek';

export const GET: APIRoute = async ({ request }) => {
  if (!checkCronSecret(request.headers.get('authorization'))) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  if (!isKvConfigured()) return new Response(JSON.stringify({ error: 'kv not configured' }), { status: 503 });
  const now = new Date();
  const today = jstDateString(now);
  const stamp = new Date(now.getTime() + 9 * 3600000).toISOString().replace(/\.\d{3}Z$/, '+09:00');
  const rows = (await kvListListings()).filter((l) => l.autoRefresh && l.published && l.date >= today && l.sourceUrl);
  let updated = 0, reset = 0, skipped = 0;
  const cache = new Map<string, Awaited<ReturnType<typeof fetchPage>>>();
  for (const l of rows) {
    const site = sourceSites.find((s) => s.id === l.siteId);
    if (!site || site.terms !== 'confirmed') { skipped++; continue; }
    let r = cache.get(l.sourceUrl!);
    if (!r) { r = await fetchPage(l.sourceUrl!); cache.set(l.sourceUrl!, r); }
    const hit = r.ok ? extractCandidates(r.body, l.sourceUrl!, now).candidates.find((c) => c.date === l.date && (c.startTime ?? '') === (l.startTime ?? '') && c.title === l.title) : undefined;
    if (hit) { await kvUpsertListing({ ...l, status: hit.status, remainingText: hit.remainingText, checkedAt: stamp, checkedBy: '自動再確認' }); updated++; }
    else { await kvUpsertListing({ ...l, status: 'unknown', remainingText: undefined, checkedAt: stamp, checkedBy: '自動再確認（取得できず）' }); reset++; }
  }
  return new Response(JSON.stringify({ candidates: rows.length, updated, reset, skipped }), { headers: { 'Content-Type': 'application/json' } });
};

export const ALL: APIRoute = () => new Response('Method Not Allowed', { status: 405 });
