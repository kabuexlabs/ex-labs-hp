// サイト全ページの技術 SEO クロール監査（dev サーバーに対して実行）。
//   npx astro dev --port 4322 --host 127.0.0.1 &  → node scripts/crawl-audit.mjs [--base http://127.0.0.1:4322]
// sitemap.xml の全 URL について、ステータス／canonical／title・description の重複／h1 の数／
// og:image／img の alt・width・height／noindex／lang を確認し、問題を一覧で出す。
const base = (process.argv.find((a) => a.startsWith('--base=')) || '--base=http://127.0.0.1:4322').split('=')[1];
const site = 'https://kabuexlabs.com';

const sm = await (await fetch(`${base}/sitemap.xml`)).text();
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(site, ''));
const extra = ['/contact/admin/', '/yoyaku/', '/bihin/', '/shimokita/', '/404'];
const problems = [];
const warns = [];
const titles = new Map();
const descs = new Map();
const rows = [];

function attr(tag, name) { const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i')); return m ? m[1] : null; }

for (const u of [...urls, ...extra]) {
  let res;
  try { res = await fetch(base + u, { redirect: 'manual' }); } catch (e) { problems.push(`${u} fetch失敗 ${e.message}`); continue; }
  const inSitemap = urls.includes(u);
  if (res.status !== 200) {
    if (inSitemap) problems.push(`${u} HTTP ${res.status}（sitemap 掲載ページ）`);
    else rows.push({ u, status: res.status });
    continue;
  }
  const h = await res.text();
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1] ?? '';
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1] ?? '';
  const canonical = (h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] ?? '';
  const robots = (h.match(/<meta name="robots" content="([^"]*)"/) || [])[1] ?? '';
  const ogImage = (h.match(/property="og:image" content="([^"]*)"/) || [])[1] ?? '';
  const lang = (h.match(/<html[^>]*lang="([^"]*)"/) || [])[1] ?? '';
  const h1s = (h.match(/<h1[\s>]/g) || []).length;
  const imgs = [...h.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
  const noAlt = imgs.filter((t) => attr(t, 'alt') === null && !/\salt(?:\s|>|\/)/.test(t)).length;
  const noSize = imgs.filter((t) => !attr(t, 'width') || !attr(t, 'height')).length;
  const noindex = /noindex/i.test(robots);

  if (!inSitemap) { rows.push({ u, status: 200, noindex }); if (!noindex) problems.push(`${u} sitemap 外なのに noindex がない（非公開ツールなら noindex を付ける）`); continue; }
  if (noindex) problems.push(`${u} sitemap 掲載なのに noindex`);
  if (!title) problems.push(`${u} title なし`);
  if (!desc) problems.push(`${u} description なし`);
  if (canonical !== site + u) problems.push(`${u} canonical 不一致: ${canonical || '(なし)'}`);
  if (h1s !== 1) problems.push(`${u} h1 が ${h1s} 個`);
  if (!ogImage) problems.push(`${u} og:image なし`);
  if (lang !== 'ja') problems.push(`${u} html lang="${lang}"`);
  if (noAlt) problems.push(`${u} alt のない img ${noAlt} 個`);
  // width/height 欠落は CLS 実測 0（2026-09-06 Playwright計測）のため警告のみ
  if (noSize > 2) warns.push(`${u} width/height のない img ${noSize} 個`);
  if (/undefined|\[object Object\]|NaN/.test(h.replace(/<script[\s\S]*?<\/script>/g, ''))) problems.push(`${u} 本文に undefined/NaN`);
  titles.set(title, [...(titles.get(title) || []), u]);
  descs.set(desc, [...(descs.get(desc) || []), u]);
  rows.push({ u, status: 200, title: title.length, desc: desc.length, h1s, imgs: imgs.length, noSize });
}
for (const [t, us] of titles) if (us.length > 1) problems.push(`title 重複 (${us.length}): ${us.join(' ')}  ← "${t.slice(0, 50)}"`);
for (const [d, us] of descs) if (us.length > 1 && d) problems.push(`description 重複 (${us.length}): ${us.join(' ')}`);

console.log(`${urls.length} URL（sitemap）＋ ${extra.length} URL（非公開）をクロール`);
if (warns.length && process.argv.includes('--warn')) { console.log(`\n警告 ${warns.length} 件`); for (const w of warns) console.log('  - ' + w); }
if (problems.length) { console.log(`\n問題 ${problems.length} 件`); for (const p of problems) console.log('  ✗ ' + p); process.exitCode = 1; }
else console.log('\n問題なし');
