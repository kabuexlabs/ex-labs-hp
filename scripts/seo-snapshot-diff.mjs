// 前後スナップショットの差分。SEO要素（title/description/canonical/robots/見出し/本文/リンク/構造化データ）に
// 意図しない変化がないかを確認する。  node scripts/seo-snapshot-diff.mjs <beforeDir> <afterDir>
import fs from 'node:fs';
import path from 'node:path';
const [a, b] = process.argv.slice(2);
let issues = 0;
for (const f of fs.readdirSync(a).filter((x) => x.endsWith('.json') && !x.startsWith('_'))) {
  const A = JSON.parse(fs.readFileSync(path.join(a, f))); const bf = path.join(b, f);
  if (!fs.existsSync(bf)) { console.log('MISSING after:', f); issues++; continue; }
  const B = JSON.parse(fs.readFileSync(bf));
  const diffs = [];
  for (const k of ['status', 'title', 'description', 'canonical', 'robots', 'ogTitle', 'ogImage', 'lang']) if (A[k] !== B[k]) diffs.push(`${k}: ${A[k]} -> ${B[k]}`);
  if (JSON.stringify(A.heads) !== JSON.stringify(B.heads)) diffs.push(`heads: ${A.heads.length} -> ${B.heads.length}\n    -${A.heads.filter((h) => !B.heads.includes(h)).join('\n    -')}\n    +${B.heads.filter((h) => !A.heads.includes(h)).join('\n    +')}`);
  if (A.textHash !== B.textHash) {
    // 本文差分（追加・削除の文を簡易表示）
    const at = new Set(A.text.split(/(?<=[。！？!?])/)); const bt = new Set(B.text.split(/(?<=[。！？!?])/));
    const rem = [...at].filter((s) => !bt.has(s)).slice(0, 8); const add = [...bt].filter((s) => !at.has(s)).slice(0, 8);
    diffs.push(`text: ${A.textLen} -> ${B.textLen}\n    -${rem.join('\n    -')}\n    +${add.join('\n    +')}`);
  }
  const la = new Set(A.links.map((l) => l.href + '|' + l.text)); const lb = new Set(B.links.map((l) => l.href + '|' + l.text));
  const lrem = [...la].filter((x) => !lb.has(x)); const ladd = [...lb].filter((x) => !la.has(x));
  if (lrem.length || ladd.length) diffs.push(`links: ${A.links.length} -> ${B.links.length}\n    -${lrem.join('\n    -')}\n    +${ladd.join('\n    +')}`);
  if (A.ldHash !== B.ldHash) diffs.push(`structured data changed: ${A.ldTypes.join('+')} -> ${B.ldTypes.join('+')}`);
  // 先頭画像の遅延読み込みが「新たに」増えた場合だけ警告（元からのものは対象外）
  const lazyA = A.imgs.slice(0, 2).filter((i) => i.loading === 'lazy').length, lazyB = B.imgs.slice(0, 2).filter((i) => i.loading === 'lazy').length;
  if (lazyB > lazyA) diffs.push(`first images newly lazy-loaded: ${lazyA} -> ${lazyB}`);
  if (diffs.length) { issues++; console.log(`\n### ${A.url}\n  ` + diffs.join('\n  ')); }
}
console.log(issues ? `\n差分あり: ${issues} ページ（内容を確認）` : '\n差分なし：SEO要素は前後で一致');
