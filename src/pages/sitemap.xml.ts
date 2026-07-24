export const prerender = false;

import type { APIRoute } from 'astro';
import { getPostList, isMicrocmsConfigured } from '../lib/microcms';
import { tmWorks } from '../data/toudaimurderWorks';
import { tmNews } from '../data/toudaimurderNews';
import { htPaths } from '../data/hacktale';

// NOTE: keep every URL here in its canonical trailing-slash form, and
// never list pages that carry noindex (unlisted LPs, private tools) —
// a sitemap entry that resolves to a noindex page shows up in Search
// Console as "excluded / not indexed" noise.
const STATIC_PATHS = [
  '/',
  '/blog/',
  '/press/',
  '/guide/madamis/',
  '/guide/immersive/',
  '/services/',
  '/services/nazotoki-kenshu/',
  '/services/murder-mystery/',
  '/services/shisetsu-event/',
  '/services/immersive/',
  '/services/zunousen/',
  '/toudaimurder/',
  '/toudaimurder/works/',
  ...tmWorks.map((w) => `/toudaimurder/works/${w.slug}/`),
  '/toudaimurder/news/',
  ...tmNews.map((n) => `/toudaimurder/news/${n.slug}/`),
  '/toudaimurder/about/',
  '/toudaimurder/contact/',
  '/taikenbizyutu/',
  '/taikenbizyutu/lostframe/',
  '/game/',
  '/game/null-arden/',
  '/game/auction/',
  '/smystery/',
  '/smystery/events/',
  '/smystery/company/',
  '/uwasabanashi/',
  '/anator/',
  ...htPaths,
];

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://kabuexlabs.com');

  const urls: { loc: string; lastmod?: string }[] = STATIC_PATHS.map((p) => ({
    loc: new URL(p, base).toString(),
  }));

  // 日付を持つニュース記事は lastmod を付与（Google が再クロール判断に使う）。
  for (const n of tmNews) {
    const u = urls.find((x) => x.loc.endsWith(`/toudaimurder/news/${n.slug}/`));
    if (u && n.date) u.lastmod = n.date.replace(/\./g, '-');
  }

  if (isMicrocmsConfigured()) {
    // microCMS caps limit at 100 per request; page through everything.
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const { contents, totalCount } = await getPostList(offset, 100);
      if (contents.length === 0) break;
      total = totalCount;
      offset += contents.length;
      for (const post of contents) {
        urls.push({
          loc: new URL(`/blog/${post.id}`, base).toString(),
          lastmod: post.revisedAt ?? post.publishedAt,
        });
      }
    }
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        (u) =>
          `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`,
      )
      .join('\n') +
    '\n</urlset>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
