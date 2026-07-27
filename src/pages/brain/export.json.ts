// 全データ（名刺・議事録・操作ログ）のJSONバックアップ。
// ログイン済みセッションでのみダウンロードできる読み取り専用エンドポイント。
export const prerender = false;

import type { APIRoute } from 'astro';
import { BRAIN_COOKIE, checkSession, getContacts, getNotes, getLogs } from '../../lib/brain';

export const GET: APIRoute = async ({ cookies }) => {
  const authed = await checkSession(cookies.get(BRAIN_COOKIE)?.value).catch(() => false);
  if (!authed) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  const [contacts, notes, logs] = await Promise.all([getContacts(), getNotes(), getLogs(500)]);
  const payload = { exportedAt: new Date().toISOString(), contacts, notes, logs };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="brain-backup.json"',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
};
