import { defineMiddleware } from 'astro:middleware';
import { BLOG_REDIRECTS } from './data/redirects';
import { enhanceArticleHtml } from './lib/articleHtml';

// URL の正規化：末尾スラッシュ無しでアクセスされた SSR ページを
// スラッシュ付きへ 301 リダイレクトする。canonical だけでは Google が
// /blog/xxx と /blog/xxx/ を別 URL として両方インデックスしてしまう
// （Search Console に両方計上された実績あり）ため、サーバー側で一本化する。
// API・拡張子付きファイル・Vercel 内部パスは対象外。
export const onRequest = defineMiddleware((context, next) => {
  const { pathname, search } = context.url;
  const isGet = context.request.method === 'GET' || context.request.method === 'HEAD';
  const needsSlash =
    isGet &&
    pathname !== '/' &&
    !pathname.endsWith('/') &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_') &&
    !/\.[a-z0-9]{1,5}$/i.test(pathname);
  // 検索意図が重複していたブログ記事を解説記事へ統合（301）。
  // 末尾スラッシュの有無に関わらず1回の転送で現 URL へ送る（スラッシュ正規化 → 統合の2段転送にしない）。
  const blogMatch = pathname.match(/^\/blog\/([^/]+)\/?$/);
  if (isGet && blogMatch && BLOG_REDIRECTS[blogMatch[1]]) {
    return context.redirect(BLOG_REDIRECTS[blogMatch[1]], 301);
  }
  if (needsSlash) {
    return context.redirect(`${pathname}/${search}`, 301);
  }
  // 解説記事・ブログ記事（一覧ページは除く）：文節の改行位置とステップ図を整えてから返す
  if (isGet && /^\/(guide|blog)\/[^/]+\/$/.test(pathname)) {
    return next().then(async (res) => {
      if (!(res.headers.get('content-type') ?? '').includes('text/html') || res.status !== 200) return res;
      const html = enhanceArticleHtml(await res.text());
      const headers = new Headers(res.headers);
      headers.delete('content-length');
      return new Response(html, { status: res.status, headers });
    });
  }
  return next();
});
