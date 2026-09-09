// デザイン変更の前後比較用スナップショット。
//   node scripts/seo-snapshot.mjs <outDir> [baseUrl]
// 各ページの title / description / canonical / robots / 見出し / 本文 / 内部リンク /
// 構造化データ / 画像 を JSON に保存する。比較は scripts/seo-snapshot-diff.mjs。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const outDir = process.argv[2];
const BASE = process.argv[3] || 'http://127.0.0.1:4322';
if (!outDir) { console.error('usage: seo-snapshot.mjs <outDir> [baseUrl]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });

export const PAGES = [
  '/', '/services/', '/services/immersive/', '/services/murder-mystery/', '/services/zunousen/', '/services/shisetsu-event/', '/services/nazotoki-kenshu/',
  '/works/', '/company/', '/company/iida-yuki/', '/guide/', '/guide/immersive-tokyo/', '/guide/immersive/', '/guide/madamis/', '/guide/zunousen/', '/guide/shinrisen/',
  '/guide/botsunyukan/', '/guide/saiji/', '/guide/case-uwasabanashi/', '/guide/event-revenue-share/', '/press/', '/media/', '/blog/', '/game/',
];
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const pg = await (await br.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const summary = [];
for (const p of PAGES) {
  const r = await pg.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const d = await pg.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const meta = (n) => q(`meta[name="${n}"]`)?.content ?? null;
    const prop = (n) => q(`meta[property="${n}"]`)?.content ?? null;
    const heads = [...document.querySelectorAll('h1,h2,h3')].map((h) => `${h.tagName.toLowerCase()}:${h.textContent.replace(/\s+/g, ' ').trim()}`);
    const main = document.querySelector('main') || document.body;
    const text = main.innerText.replace(/\s+/g, ' ').trim();
    const links = [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, ' ').trim().slice(0, 80) }));
    const lds = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
    const imgs = [...document.querySelectorAll('img')].map((i) => ({ src: i.getAttribute('src'), alt: i.alt, loading: i.getAttribute('loading'), w: i.getAttribute('width'), h: i.getAttribute('height') }));
    return { title: document.title, description: meta('description'), robots: meta('robots'), canonical: q('link[rel=canonical]')?.href ?? null, ogTitle: prop('og:title'), ogImage: prop('og:image'), heads, textLen: text.length, text, links, lds, imgs, lang: document.documentElement.lang };
  });
  const rec = { url: p, status: r.status(), title: d.title, description: d.description, robots: d.robots, canonical: d.canonical, ogTitle: d.ogTitle, ogImage: d.ogImage, lang: d.lang, heads: d.heads, textLen: d.textLen, textHash: sha(d.text), links: d.links, ldTypes: d.lds.map((s) => { try { const j = JSON.parse(s); return j['@type']; } catch { return 'INVALID'; } }), ldHash: sha(d.lds.join('\n')), imgs: d.imgs };
  fs.writeFileSync(path.join(outDir, (p === '/' ? 'root' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_')) + '.json'), JSON.stringify({ ...rec, text: d.text, lds: d.lds }, null, 1));
  summary.push({ url: p, status: rec.status, title: rec.title, h1: rec.heads.filter((h) => h.startsWith('h1:')).length, heads: rec.heads.length, textLen: rec.textLen, links: rec.links.length, ld: rec.ldTypes.join('+'), canonical: rec.canonical, robots: rec.robots });
  console.log(rec.status, p, `heads=${rec.heads.length} text=${rec.textLen} links=${rec.links.length} ld=${rec.ldTypes.join('+')}`);
}
fs.writeFileSync(path.join(outDir, '_summary.json'), JSON.stringify(summary, null, 1));
await br.close();
