export const prerender = false;

import type { APIRoute } from 'astro';
import { guideArticles } from '../data/guides';
import { getPostList, isMicrocmsConfigured } from '../lib/microcms';

// 解説記事（静的ガイド）＋microCMSブログを新しい順に配信するRSS。
// フィード購読者への通知に加え、クローラーへの更新シグナルにもなる。

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://kabuexlabs.com');

  interface FeedItem {
    title: string;
    link: string;
    desc: string;
    date: Date;
  }

  const items: FeedItem[] = guideArticles.map((g) => ({
    title: g.title,
    link: new URL(g.href, base).toString(),
    desc: g.desc,
    date: new Date(`${g.date}T09:00:00+09:00`),
  }));

  if (isMicrocmsConfigured()) {
    try {
      const { contents } = await getPostList(0, 30);
      for (const p of contents) {
        items.push({
          title: p.title,
          link: new URL(`/blog/${p.id}/`, base).toString(),
          desc: (p.body ?? '').replace(/<[^>]+>/g, '').slice(0, 120),
          date: new Date(p.publishedAt ?? Date.now()),
        });
      }
    } catch {
      // CMS障害時もガイド分だけで配信を続ける
    }
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0"><channel>\n' +
    '<title>株式会社ex Labs｜解説記事・ブログ</title>\n' +
    `<link>${base.toString()}</link>\n` +
    '<description>マダミス・イマーシブ・施設活用イベント・謎解きの解説記事と最新情報</description>\n' +
    '<language>ja</language>\n' +
    items
      .slice(0, 40)
      .map(
        (i) =>
          `<item><title>${esc(i.title)}</title><link>${i.link}</link><guid>${i.link}</guid><description>${esc(i.desc)}</description><pubDate>${i.date.toUTCString()}</pubDate></item>`,
      )
      .join('\n') +
    '\n</channel></rss>\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
