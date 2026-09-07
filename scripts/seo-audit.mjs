// SEO の「やり忘れ」を機械的に検出する静的監査。push 前に必ず走らせる。
//   node scripts/seo-audit.mjs          … 問題があれば一覧を出して exit 1
//   node scripts/seo-audit.mjs --warn   … 警告も表示
//
// 見るもの
//  1. guide 記事ごと: title の長さ / description の長さ / FAQ+Article 構造化データ /
//     サムネ実体 / guides.ts・sitemap・llms.txt への登録 / 被内部リンク数
//  2. 自社サブブランド（HACKTALE・UNLIMITED MYSTERY・体験する美術館 等）のフッターに
//     解説記事へのリンクがあるか（2026-09-06 に1ヶ月間ゼロだったのを検出できなかった反省）
//  3. guides.ts に登録されているのにファイルが無い記事
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const showWarn = process.argv.includes('--warn');
const errors = [];
const warns = [];

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(astro|ts|mjs|md|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}
const allSrc = walk('src').map((p) => [p, read(p)]);
const guidesTs = read('src/data/guides.ts');
const sitemap = read('src/pages/sitemap.xml.ts');
const llms = read('public/llms.txt');

// ---------- 1. guide 記事 ----------
const guideDir = 'src/pages/guide';
const guideFiles = fs.readdirSync(path.join(ROOT, guideDir)).filter((f) => f.endsWith('.astro') && f !== 'index.astro');
const NO_ARTICLE_LD = new Set(['yougo']); // 用語集は DefinedTermSet なので Article/FAQ 不要
const rows = [];
for (const f of guideFiles) {
  const slug = f.replace('.astro', '');
  const href = `/guide/${slug}/`;
  const s = read(`${guideDir}/${f}`);
  const title = (s.match(/^\s*title="([^"]*)"/m) || [])[1] ?? '';
  const desc = (s.match(/^\s*description="([^"]*)"/m) || [])[1] ?? '';
  const core = title.split(' - ')[0];
  const og = (s.match(/ogImage="([^"]*)"/) || [])[1] ?? '';

  if (!title) errors.push(`${href} title が取れない`);
  if (core.length > 60) errors.push(`${href} title が長すぎる (${core.length}字)：検索結果で切れる。45字以内目安`);
  else if (core.length > 45) warns.push(`${href} title ${core.length}字（45字以内推奨）`);
  if (desc.length < 90 || desc.length > 160) errors.push(`${href} description ${desc.length}字（90〜160字）`);
  if (!NO_ARTICLE_LD.has(slug)) {
    // FAQ リッチリザルトは 2026-06 以降表示されないため必須ではない（読者向け FAQ 本文は推奨）
    if (!/'FAQPage'/.test(s)) warns.push(`${href} FAQPage 構造化データなし（必須ではない）`);
    if (!/'Article'/.test(s)) warns.push(`${href} Article 構造化データなし`);
    if (!/reviewedBy/.test(s)) warns.push(`${href} 監修者(reviewedBy)なし`);
    if (og && !exists(`public${og}`)) errors.push(`${href} ogImage の実体がない: ${og}`);
    if (!og) warns.push(`${href} ogImage 未指定`);
    if (!guidesTs.includes(`'${href}'`)) errors.push(`${href} guides.ts 未登録`);
  }
  if (!sitemap.includes(`'${href}'`)) errors.push(`${href} sitemap 未登録`);
  if (!llms.includes(`kabuexlabs.com${href}`)) errors.push(`${href} llms.txt 未登録`);
  const lastmod = (sitemap.match(new RegExp(`'${href.replace(/\//g, '\\/')}': '([\\d-]+)'`)) || [])[1];
  const dateMod = (s.match(/dateModified: '([\d-]+)'/) || [])[1];
  if (lastmod && dateMod && lastmod !== dateMod) warns.push(`${href} sitemap lastmod(${lastmod}) と dateModified(${dateMod}) が不一致`);

  // 被内部リンク（guides.ts / sitemap / llms / 自分自身は除く）
  let inbound = 0;
  const re = new RegExp(`href="(?:https://kabuexlabs\\.com)?${href.replace(/\//g, '\\/')}(?:#[\\w-]*)?"`, 'g');
  for (const [p, c] of allSrc) {
    if (p.endsWith(`/${f}`) || p.endsWith('guides.ts') || p.endsWith('sitemap.xml.ts')) continue;
    inbound += (c.match(re) || []).length;
  }
  if (inbound < 3) warns.push(`${href} 被内部リンクが少ない (${inbound})`);
  rows.push({ href, core: core.length, desc: desc.length, inbound });
}

// guides.ts に登録されているがファイルが無い
for (const m of guidesTs.matchAll(/href: '\/guide\/([\w-]+)\/'/g)) {
  if (!exists(`${guideDir}/${m[1]}.astro`)) errors.push(`guides.ts の /guide/${m[1]}/ に対応するファイルがない`);
}

// ---------- 2. サブブランドから解説記事へのリンク ----------
const subBrand = [
  'src/layouts/HacktaleLayout.astro', 'src/pages/hacktale/index.astro',
  'src/layouts/ToudaimurderLayout.astro', 'src/pages/toudaimurder/index.astro',
  'src/layouts/TaikenbizyutuLayout.astro', 'src/layouts/AnatorLayout.astro', 'src/layouts/GameLayout.astro',
  'src/pages/uwasabanashi/index.astro',
  // kaitou は PR #115 で運営会社表記を外し公演ブランドに統一したため対象外（勝手に再追加しない）
];
for (const p of subBrand) {
  if (!exists(p)) continue;
  const n = (read(p).match(/\/guide\/[\w-]+\//g) || []).length;
  if (n === 0) errors.push(`${p} に解説記事(/guide/)へのリンクがない`);
}

// ---------- 3. サービス・トップ・フッターから軸ピラーへのリンク ----------
const pillars = ['/guide/immersive/', '/guide/madamis/', '/guide/zunousen/', '/guide/shinrisen/', '/guide/shisetsu-katsuyo/', '/guide/taikengata-event/', '/guide/shuyu-event/'];
const base = read('src/layouts/BaseLayout.astro');
for (const pl of pillars) if (!base.includes(`href="${pl}"`)) warns.push(`BaseLayout フッターに ${pl} へのリンクがない`);

// ---------- 出力 ----------
console.log(`guide 記事 ${rows.length} 本を監査`);
const weak = rows.filter((r) => r.inbound < 3).sort((a, b) => a.inbound - b.inbound);
if (weak.length) console.log('被内部リンク 3 未満: ' + weak.map((r) => `${r.href}(${r.inbound})`).join(' '));
if (showWarn && warns.length) { console.log(`\n警告 ${warns.length} 件`); for (const w of warns) console.log('  - ' + w); }
if (errors.length) { console.log(`\nエラー ${errors.length} 件`); for (const e of errors) console.log('  ✗ ' + e); process.exit(1); }
console.log(`\nエラーなし（警告 ${warns.length} 件${showWarn ? '' : '：--warn で表示'}）`);
