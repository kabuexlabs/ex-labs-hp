export const prerender = false;

import type { APIRoute } from 'astro';
import { getPostList, isMicrocmsConfigured } from '../lib/microcms';
import { tmWorks } from '../data/toudaimurderWorks';
import { tmNews } from '../data/toudaimurderNews';
import { htPaths } from '../data/hacktale';
import { BLOG_REDIRECTS } from '../data/redirects';

// NOTE: keep every URL here in its canonical trailing-slash form, and
// never list pages that carry noindex (unlisted LPs, private tools) —
// a sitemap entry that resolves to a noindex page shows up in Search
// Console as "excluded / not indexed" noise.
const STATIC_PATHS = [
  '/',
  '/blog/',
  '/press/',
  '/media/',
  '/guide/',
  '/guide/madamis/',
  '/guide/madamis-cost/',
  '/guide/madamis-making/',
  '/guide/madamis-company/',
  '/guide/madamis-business/',
  '/guide/immersive-cost/',
  '/guide/immersive-company/',
  '/guide/immersive-tokyo/',
  '/guide/shisetsu-katsuyo/',
  '/guide/shogyoshisetsu-event/',
  '/guide/yukyu-kukaku/',
  '/guide/eigyo-jikangai/',
  '/guide/museum-event/',
  '/guide/hotel-event/',
  '/guide/taikengata-event/',
  '/guide/sankagata-event/',
  '/guide/taikengata-company/',
  '/guide/zunousen/',
  '/guide/zunousen-game/',
  '/guide/shinrisen/',
  '/guide/saiji/',
  '/guide/madamis-shoshinsha/',
  '/guide/botsunyukan/',
  '/guide/popup-event/',
  '/guide/nazotoki-event/',
  '/guide/nazotoki-company/',
  '/guide/nazotoki-idea/',
  '/guide/madamis-asobikata/',
  '/guide/nazotoki-kenshu/',
  '/guide/shanai-event/',
  '/guide/immersive-seisaku/',
  '/guide/kisetsu-event/',
  '/guide/shuyu-event/',
  '/guide/madamis-kenshu/',
  '/guide/immersive-making/',
  '/guide/immersive-vr/',
  '/guide/case-uwasabanashi/',
  '/guide/immersive/',
  '/guide/immersive-event/',
  '/guide/immersive-theater/',
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
  '/taikenbizyutu/news/lostframe-soldout/',
  '/game/',
  '/game/null-arden/',
  '/game/auction/',
  '/game/lost-frame/',
  '/uwasabanashi/',
  '/anator/',
  '/kaitou/',
  ...htPaths,
];

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://kabuexlabs.com');

  const urls: { loc: string; lastmod?: string }[] = STATIC_PATHS.map((p) => ({
    loc: new URL(p, base).toString(),
  }));

  // 新設・更新したページに lastmod を付けて再クロールを促す。
  const STATIC_LASTMOD: Record<string, string> = {
    '/guide/': '2026-08-10',
    '/guide/madamis/': '2026-08-12',
    '/guide/madamis-cost/': '2026-07-30',
    '/guide/madamis-making/': '2026-08-10',
    '/guide/madamis-company/': '2026-08-10',
    '/guide/madamis-business/': '2026-08-07',
    '/guide/immersive-cost/': '2026-08-07',
    '/guide/immersive-company/': '2026-08-07',
    '/guide/immersive-tokyo/': '2026-08-31',
    '/guide/shisetsu-katsuyo/': '2026-09-03',
    '/guide/shogyoshisetsu-event/': '2026-08-31',
    '/guide/yukyu-kukaku/': '2026-08-07',
    '/guide/eigyo-jikangai/': '2026-08-07',
    '/guide/museum-event/': '2026-08-13',
    '/guide/hotel-event/': '2026-08-10',
    '/guide/taikengata-event/': '2026-08-10',
    '/guide/sankagata-event/': '2026-08-13',
    '/guide/taikengata-company/': '2026-08-19',
    '/guide/zunousen/': '2026-08-27',
    '/guide/zunousen-game/': '2026-08-27',
    '/guide/shinrisen/': '2026-08-29',
    '/guide/saiji/': '2026-09-01',
    '/guide/madamis-shoshinsha/': '2026-09-01',
    '/guide/botsunyukan/': '2026-08-27',
    '/guide/popup-event/': '2026-08-27',
    '/guide/nazotoki-event/': '2026-08-27',
    '/guide/nazotoki-company/': '2026-08-12',
    '/guide/nazotoki-idea/': '2026-08-12',
    '/guide/madamis-asobikata/': '2026-08-12',
    '/guide/nazotoki-kenshu/': '2026-08-23',
    '/guide/shanai-event/': '2026-09-03',
    '/guide/immersive-seisaku/': '2026-08-24',
    '/guide/kisetsu-event/': '2026-08-24',
    '/guide/shuyu-event/': '2026-08-10',
    '/guide/madamis-kenshu/': '2026-08-10',
    '/guide/immersive-making/': '2026-08-10',
    '/guide/immersive-vr/': '2026-08-10',
    '/guide/case-uwasabanashi/': '2026-08-11',
    '/services/immersive/': '2026-08-10',
    '/guide/immersive-event/': '2026-07-31',
    '/guide/immersive-theater/': '2026-09-03',
    '/guide/immersive/': '2026-08-13',
    '/media/': '2026-08-07',
    '/taikenbizyutu/': '2026-09-03',
    '/taikenbizyutu/lostframe/': '2026-09-03',
    '/game/lost-frame/': '2026-09-03',
    '/taikenbizyutu/news/lostframe-soldout/': '2026-09-03',
  };
  for (const [p, d] of Object.entries(STATIC_LASTMOD)) {
    const u = urls.find((x) => x.loc.endsWith(p));
    if (u) u.lastmod = d;
  }

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
        if (BLOG_REDIRECTS[post.id]) continue; // 統合済み記事は載せない
        urls.push({
          // canonical はスラッシュ付きに正規化しているので sitemap も揃える
          // （不一致だと Search Console で両方の URL が計上されてしまう）
          loc: new URL(`/blog/${post.id}/`, base).toString(),
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
