export const prerender = false;

import type { APIRoute } from 'astro';
import { getPostList, isMicrocmsConfigured } from '../lib/microcms';

const STATIC_PATHS = [
  '/',
  '/blog',
  '/press/',
  '/services/',
  '/services/nazotoki-kenshu/',
  '/services/murder-mystery/',
  '/services/shisetsu-event/',
  '/services/zunousen/',
];

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://kabuexlabs.com');

  const urls: { loc: string; lastmod?: string }[] = STATIC_PATHS.map((p) => ({
    loc: new URL(p, base).toString(),
  }));

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
