// 公開サイトの全ページ検査（2026-11-16 新設）。
//   node scripts/site-check.mjs <ベースURL> [--out <dir>]
// サイトマップの全ページ（＋サイトマップ外の主要ページ）を開き、
//   1) ページ自体：200・text/html・ダウンロード扱いでない・本文が HTML で始まり </html> で終わる（途中で切れていない）
//   2) ページが読み込むもの：CSS・JS・画像・フォント・動画（HTML の属性と、CSS の url(...) の両方）が
//      すべて 200 で、種類に合った Content-Type で返る
// を確かめる。1つでも問題があれば終了コード 1。結果は標準出力と <out>/site-check.json に出す。
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const BASE = (args[0] || 'https://kabuexlabs.com').replace(/\/$/, '');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const EXTRA_PAGES = ['/karma/', '/kaitou/', '/uwasabanashi/', '/taikenbizyutu/', '/taikenbizyutu/lostframe/', '/anator/', '/contact/thanks/', '/hacktale/reservation/', '/guide/', '/works/', '/media/', '/press/', '/outing/', '/game/', '/404-check-not-exist/'];
const LOCAL = /\/\/(127\.0\.0\.1|localhost)/.test(BASE); // 手元の確認用サーバー（404 ページと Vercel の計測スクリプトは無い）
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 exlabs-site-check/1.0';
const H = { 'user-agent': UA, 'accept-encoding': 'gzip, br', ...(process.env.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS } : {}) };

const TYPE_OK = [
  [/\.css(\?|$)/i, /text\/css/i], [/\.m?js(\?|$)/i, /javascript/i], [/\.webp(\?|$)/i, /image\/webp/i], [/\.png(\?|$)/i, /image\/png/i],
  [/\.jpe?g(\?|$)/i, /image\/jpeg/i], [/\.svg(\?|$)/i, /image\/svg/i], [/\.gif(\?|$)/i, /image\/gif/i], [/\.avif(\?|$)/i, /image\/avif/i],
  [/\.ico(\?|$)/i, /image\//i], [/\.woff2(\?|$)/i, /font|octet-stream/i], [/\.woff(\?|$)/i, /font|octet-stream/i], [/\.mp4(\?|$)/i, /video\/mp4/i], [/\.webm(\?|$)/i, /video\/webm/i],
  [/\.json(\?|$)/i, /json/i], [/\.xml(\?|$)/i, /xml/i], [/\.webmanifest(\?|$)/i, /json|manifest/i],
];

async function get(url, { body = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: H, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      const out = { status: res.status, ct: res.headers.get('content-type') || '', cd: res.headers.get('content-disposition') || '', loc: res.headers.get('location') || '', len: 0, text: '' };
      const buf = Buffer.from(await res.arrayBuffer());
      out.len = buf.length;
      out.gz = buf[0] === 0x1f && buf[1] === 0x8b;
      if (body) out.text = buf.toString('utf8');
      return out;
    } catch (e) {
      if (attempt >= 2) return { status: 0, ct: '', cd: '', loc: '', len: 0, text: '', err: String(e.message || e) };
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

const abs = (u, base) => { try { return new URL(u, base).toString(); } catch { return null; } };
const sameSite = (u) => u && (u.startsWith(BASE + '/') || u === BASE);

function assetsOfHtml(html, pageUrl) {
  const out = new Set();
  const add = (u) => { if (!u || /^(data:|blob:|javascript:|mailto:|tel:|#|%23|\\)/i.test(u.trim()) || /[${}`]/.test(u)) return; const a = abs(u.trim().replace(/&amp;/g, '&'), pageUrl); if (sameSite(a)) out.add(a.split('#')[0]); };
  for (const m of html.matchAll(/<(?:img|script|source|video|audio|iframe|embed|track)\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi)) add(m[2] ?? m[3]);
  for (const m of html.matchAll(/\s(?:srcset|imagesrcset)\s*=\s*("([^"]*)"|'([^']*)')/gi)) for (const part of (m[2] ?? m[3]).split(',')) add(part.trim().split(/\s+/)[0]);
  for (const m of html.matchAll(/<video\b[^>]*?\sposter\s*=\s*("([^"]*)"|'([^']*)')/gi)) add(m[2] ?? m[3]);
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]; const rel = (/\srel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1] || '').toLowerCase(); const href = /\shref\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    if (href && /stylesheet|preload|modulepreload|icon|manifest|apple-touch-icon/.test(rel)) add(href[2] ?? href[3]);
  }
  for (const m of html.matchAll(/<use\b[^>]*?\s(?:xlink:)?href\s*=\s*["']([^"'#][^"']*)["']/gi)) add(m[1]);
  // url(...) は <style> の中と style="" 属性の中だけを見る（インラインのスクリプト内の文字列を拾わない）
  const cssText = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).concat([...html.matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'"))).join('\n');
  for (const m of cssText.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) add(m[1]);
  for (const m of html.matchAll(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  return out;
}
function assetsOfCss(css, cssUrl) {
  const out = new Set();
  for (const m of css.matchAll(/url\(\s*["']?([^"')]+?)["']?\s*\)/gi)) { const u = m[1].trim(); if (/^(data:|#|%23|\\)/i.test(u)) continue; const a = abs(u, cssUrl); if (sameSite(a)) out.add(a.split('#')[0]); }
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']/gi)) { const a = abs(m[1], cssUrl); if (sameSite(a)) out.add(a); }
  return out;
}

const pool = async (items, n, fn) => { const q = [...items]; await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); })); };

// ---- 1) ページ一覧
const sm = await get(BASE + '/sitemap.xml', { body: true });
const pages = new Set(EXTRA_PAGES);
for (const m of sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)) pages.add(m[1].replace(/^https?:\/\/[^/]+/, ''));
if (sm.status !== 200 || pages.size < 50) { console.log(`NG  サイトマップを取得できない（status=${sm.status}・${pages.size}件）`); process.exit(1); }

const problems = [];        // {page, kind, detail}
const assetRefs = new Map(); // assetUrl -> Set(page)
let pageCount = 0;
await pool([...pages], 6, async (p) => {
  const url = BASE + p;
  const r = await get(url, { body: true });
  pageCount++;
  const expect404 = p === '/404-check-not-exist/';
  const bad = [];
  if (expect404) { if (r.status !== 404) bad.push(`存在しないページが ${r.status}（404 のはず）`); }
  else if (r.status !== 200) bad.push(`ステータス ${r.status}${r.loc ? ` → ${r.loc}` : ''}${r.err ? ` ${r.err}` : ''}`);
  if (r.status === 200 || expect404) {
    if (!/^text\/html\b/i.test(r.ct) && !(expect404 && LOCAL)) bad.push(`Content-Type "${r.ct}"`);
    if (/attachment/i.test(r.cd)) bad.push(`ダウンロード扱い（${r.cd}）`);
    if (r.gz) bad.push('本文が gzip のまま届いている');
    const t = r.text.trimStart().toLowerCase();
    if (!(t.startsWith('<!doctype html') || t.startsWith('<html')) && !(expect404 && LOCAL)) bad.push(`本文の先頭が HTML ではない: ${JSON.stringify(t.slice(0, 40))}`);
    if (r.len > 0 && !/<\/html>/i.test(r.text.slice(-20000))) bad.push(`本文に </html> が無い（途中で切れている）: 末尾 ${JSON.stringify(r.text.slice(-60))}`);
    if (!expect404 && r.len < 2000) bad.push(`本文が極端に短い（${r.len}バイト）`);
    if (/Internal Server Error|FUNCTION_INVOCATION_FAILED|An error occurred with your deployment/i.test(r.text)) bad.push('サーバーエラーの文言が本文にある');
    for (const a of assetsOfHtml(r.text, url)) { if (!assetRefs.has(a)) assetRefs.set(a, new Set()); assetRefs.get(a).add(p); }
  }
  for (const d of bad) problems.push({ page: p, kind: 'page', detail: d });
});

// ---- 2) 読み込むもの（CSS の中の url() も1段たどる）
const checked = new Map();
const checkAsset = async (a) => {
  const isCss = /\.css(\?|$)/i.test(a);
  const r = await get(a, { body: isCss });
  const bad = [];
  if (r.status !== 200) bad.push(`ステータス ${r.status}${r.loc ? ` → ${r.loc}` : ''}${r.err ? ` ${r.err}` : ''}`);
  else {
    const rule = TYPE_OK.find(([ext]) => ext.test(new URL(a).pathname));
    if (rule && !rule[1].test(r.ct)) bad.push(`Content-Type "${r.ct}"`);
    if (/attachment/i.test(r.cd)) bad.push(`ダウンロード扱い（${r.cd}）`);
    if (r.len === 0) bad.push('中身が空');
    if (/^text\/html/i.test(r.ct) && !/\.html?$|\/$/.test(new URL(a).pathname)) bad.push('HTML が返っている（ファイルが無く、ページに置き換わっている）');
  }
  checked.set(a, bad);
  return isCss && r.status === 200 ? assetsOfCss(r.text, a) : new Set();
};
const nested = new Map();
if (LOCAL) for (const a of [...assetRefs.keys()]) if (a.includes('/_vercel/')) assetRefs.delete(a);
// 取り消した版のデザイン用ファイル（public/_astro/。古いページを持つ端末が読みに来る）も配信されているか確かめる
const LEGACY_DIR = new URL('../public/_astro/', import.meta.url);
if (fs.existsSync(LEGACY_DIR)) for (const f of fs.readdirSync(LEGACY_DIR)) { const a = `${BASE}/_astro/${f}`; if (!assetRefs.has(a)) assetRefs.set(a, new Set(['（以前の版のページ）'])); }
await pool([...assetRefs.keys()], 10, async (a) => { for (const n of await checkAsset(a)) { if (!nested.has(n)) nested.set(n, a); } });
await pool([...nested.keys()].filter((n) => !checked.has(n)), 10, async (n) => { await checkAsset(n); assetRefs.set(n, new Set([`（CSS ${nested.get(n).replace(BASE, '')} 経由）`])); });
for (const [a, bad] of checked) for (const d of bad) problems.push({ page: [...(assetRefs.get(a) ?? [])].slice(0, 4).join(' '), kind: 'asset', asset: a.replace(BASE, ''), detail: d, pages: assetRefs.get(a)?.size ?? 0 });

// ---- 結果
const byKind = (k) => problems.filter((x) => x.kind === k);
console.log(`${BASE}: ページ ${pageCount}件・読み込むファイル ${checked.size}件を確認`);
for (const x of byKind('page')) console.log(`NG ページ  ${x.page}  ${x.detail}`);
for (const x of byKind('asset')) console.log(`NG ファイル ${x.asset}  ${x.detail}  ← ${x.pages}ページで使用（例: ${x.page}）`);
console.log(`\n結果: ページの問題 ${byKind('page').length}件、ファイルの問題 ${byKind('asset').length}件`);
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'site-check.json'), JSON.stringify({ base: BASE, pages: pageCount, assets: checked.size, problems }, null, 1)); }
process.exit(problems.length ? 1 : 0);
