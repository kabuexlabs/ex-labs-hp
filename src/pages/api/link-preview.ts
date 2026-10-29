export const prerender = false;

// 外部サイトのリンクプレビュー情報（og:image・タイトル）を返す。src/lib/linkPreview.ts に登録したページだけを取得する。
// 画像が取れたときだけ CDN で1日キャッシュする（相手のサイトへのアクセスはごくわずか）。画像そのものはここを通さず、ブラウザが相手のサイトから直接読み込む。
// 画像が出ないときの原因を確かめられるよう、status（ok／http-error／fetch-error／no-image／image-host-not-allowed）と detail を返す。

import type { APIRoute } from 'astro';
import { findLinkPreviewTarget, extractOg, isAllowedImage } from '../../lib/linkPreview';

const json = (body: unknown, status: number, cache: string) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });
// 画像が取れなかった結果は短くキャッシュする（相手先へ連続アクセスしない範囲で、直ればすぐ反映されるように）
const SHORT = 'public, max-age=60, s-maxage=300';

export const GET: APIRoute = async ({ url }) => {
  const target = findLinkPreviewTarget(url.searchParams.get('url') ?? '');
  if (!target) return json({ image: null, status: 'not-registered' }, 404, 'no-store');
  let r: Response;
  try {
    r = await fetch(target.url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; exLabsLinkPreview/1.0; +https://kabuexlabs.com/)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ja,en;q=0.5',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
  } catch (e) {
    return json({ image: null, status: 'fetch-error', detail: e instanceof Error ? `${e.name}: ${e.message}${(e as { cause?: { code?: string; message?: string } }).cause ? ` (${(e as { cause?: { code?: string; message?: string } }).cause?.code ?? (e as { cause?: { message?: string } }).cause?.message})` : ''}`.slice(0, 200) : 'unknown' }, 200, SHORT);
  }
  if (!r.ok) return json({ image: null, status: 'http-error', detail: `HTTP ${r.status} ${r.url}`.slice(0, 200) }, 200, SHORT);
  const html = (await r.text()).slice(0, 512 * 1024);
  const og = extractOg(html, r.url || target.url);
  const base = { title: og.title ?? null, siteName: og.siteName ?? null };
  if (!og.image) return json({ image: null, ...base, status: 'no-image', detail: `og:image なし（${html.length}文字のHTMLを確認）` }, 200, SHORT);
  if (!isAllowedImage(og.image, target.imageHosts)) {
    let host = '';
    try { host = new URL(og.image).hostname; } catch { host = og.image.slice(0, 80); }
    return json({ image: null, ...base, status: 'image-host-not-allowed', detail: host }, 200, SHORT);
  }
  return json({ image: og.image, ...base, status: 'ok' }, 200, 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
};
