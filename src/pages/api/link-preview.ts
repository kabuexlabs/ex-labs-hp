export const prerender = false;

// 外部サイトのリンクプレビュー情報（og:image・タイトル）を返す。src/lib/linkPreview.ts に登録したページだけを取得する。
// 結果は CDN で1日キャッシュするので、相手のサイトへのアクセスはごくわずか。画像そのものはここを通さず、ブラウザが相手のサイトから直接読み込む。

import type { APIRoute } from 'astro';
import { findLinkPreviewTarget, extractOg, isAllowedImage } from '../../lib/linkPreview';

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });

export const GET: APIRoute = async ({ url }) => {
  const target = findLinkPreviewTarget(url.searchParams.get('url') ?? '');
  if (!target) return json({ image: null }, 404, 'no-store');
  try {
    const r = await fetch(target.url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; exLabsLinkPreview/1.0; +https://kabuexlabs.com/)', accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const html = (await r.text()).slice(0, 512 * 1024);
    const og = extractOg(html, r.url || target.url);
    const image = og.image && isAllowedImage(og.image, target.imageHosts) ? og.image : null;
    return json({ image, title: og.title ?? null, siteName: og.siteName ?? null }, 200, 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  } catch {
    // 取得できないときは画像なし（画面は文字のパネルのまま）。短めにキャッシュして相手先へ連続アクセスしない
    return json({ image: null }, 200, 'public, max-age=300, s-maxage=600');
  }
};
