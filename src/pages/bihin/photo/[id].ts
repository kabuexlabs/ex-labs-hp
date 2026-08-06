export const prerender = false;

// 備品写真の配信エンドポイント。
// 写真は KV に data URI で保存されているが、一覧ページの HTML に全件
// 埋め込むと重くなるため、<img src="/bihin/photo/<id>"> でここから
// 1枚ずつ返す。合言葉のセッション Cookie（/bihin でログイン済み）が
// ないと 401 になるので、URL を直接知られても写真は見えない。

import type { APIRoute } from 'astro';
import { checkBihinKey, getPhoto, isKvConfigured } from '../../../lib/bihin';

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!checkBihinKey(cookies.get('bihin_admin')?.value)) {
    return new Response('unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!isKvConfigured()) return new Response('kv not configured', { status: 503 });

  const id = params.id ?? '';
  // ID は newItemId() が発行する16進のみ。それ以外は照会せず 404。
  if (!/^[0-9a-f]{1,32}$/.test(id)) return new Response('not found', { status: 404 });

  const dataUri = await getPhoto(id);
  const m = dataUri?.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  return new Response(Buffer.from(m[2], 'base64'), {
    headers: {
      'Content-Type': m[1],
      // 写真更新時は ?v=<photoUpdatedAt> でURLが変わるので長めに私的キャッシュ
      'Cache-Control': 'private, max-age=86400',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
};
