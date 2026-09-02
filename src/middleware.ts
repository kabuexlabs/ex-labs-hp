import { defineMiddleware } from 'astro:middleware';

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
  if (needsSlash) {
    return context.redirect(`${pathname}/${search}`, 301);
  }
  return next();
});
