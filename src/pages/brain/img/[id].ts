// 保存済み写真の配信。ログイン済みセッションでのみ閲覧できる。
// Content-Type は保存時に検証済みの enum（jpeg/png/webp）のみ。
export const prerender = false;

import type { APIRoute } from 'astro';
import { BRAIN_COOKIE, checkSession, getImage } from '../../../lib/brain';

export const GET: APIRoute = async ({ params, cookies }) => {
  const authed = await checkSession(cookies.get(BRAIN_COOKIE)?.value).catch(() => false);
  if (!authed) return new Response('unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const img = await getImage(String(params.id ?? ''));
  if (!img) return new Response('not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  return new Response(Buffer.from(img.data, 'base64'), {
    headers: {
      'Content-Type': img.type,
      // ログイン中のブラウザ内キャッシュのみ許可（共有キャッシュには残さない）
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
};
