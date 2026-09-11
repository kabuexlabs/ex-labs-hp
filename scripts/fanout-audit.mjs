// クエリファンアウト（Google AI Mode のサブクエリ①〜⑥）に対する「答えの段落」の有無を、
// 記事・サービスページごとに機械監査する。
//   node scripts/fanout-audit.mjs          … 不足一覧を表示（終了コードは常に 0 = 警告扱い）
//   node scripts/fanout-audit.mjs --json   … docs/fanout-audit.json に結果を書き出す
//   node scripts/fanout-audit.mjs --strict … 不足があれば終了コード 1
// 監査項目：
//   ① 曖昧さの解消：定義文（「〜とは」）／読み方・英語（用語解説ページのみ必須）
//   ② 潜在ニーズ：目的別・向いている場面・選び方
//   ③ 深掘り：費用（万円）／期間・人数の具体値（歴史・作品紹介・語彙記事は対象外）
//   ④ 証拠：実績・出典・数字の根拠（報道・確認できる実績）
//   ⑤ エンティティ：会社名の自己言及＋執筆者（AuthorBox）またはサービス要約（svc-sum）
//   ⑥ 関連トピック：関連ガイド／サービスへの内部リンク（3本以上）
//   ＋ 要点ボックス（.key-points／.def-box／.svc-sum）と FAQ の有無
// ルール（CLAUDE.md「クエリファンアウト対応」）：新規記事は公開前に不足 0 を確認する。
import fs from 'node:fs';
import path from 'node:path';

const FROZEN = new Set(['immersive','madamis','zunousen','shinrisen','shisetsu-katsuyo','taikengata-event','shuyu-event','botsunyukan','saiji']);
// 「読み方・英語」を必須にする用語解説ページ（〜とは 系）
const TERM_PAGES = new Set(['immersive','madamis','zunousen','shinrisen','shisetsu-katsuyo','taikengata-event','shuyu-event','botsunyukan','saiji','yougo','sankagata-event','yukyu-kukaku','immersive-theater','madamis-nazotoki-chigai','magic-show-immersive-chigai']);
// 費用・期間・人数の具体値が本来不要なページ（歴史・作品紹介・語彙・VR比較など）
// madamis-tokyo は公演データから参加費（円）を表示するため 万円 判定を免除
const NO_COST = new Set(['madamis-tokyo','madamis-rekishi','zunousen-sakuhin','immersive-vr','botsunyukan','saiji','yougo','case-uwasabanashi','madamis-asobikata','madamis-shoshinsha']);
// 本文編集を禁止している保護ページ（一覧・特集）は監査対象から除外
const PROTECTED = new Set(['immersive-tokyo']);
const NO_TERM = new Set(['madamis-rekishi','zunousen-sakuhin','immersive-vr','botsunyukan','saiji','yougo','madamis-asobikata','madamis-shoshinsha']);

const files = [
  ...fs.readdirSync('src/pages/guide').filter((f) => f.endsWith('.astro') && f !== 'index.astro').map((f) => ['guide/' + f.replace('.astro',''), path.join('src/pages/guide', f)]),
  ...['immersive','murder-mystery','zunousen','shisetsu-event','nazotoki-kenshu'].map((s) => ['services/' + s, `src/pages/services/${s}.astro`]),
];
const strip = (s) => s
  .replace(/<script[\s\S]*?<\/script>/g, '')
  .replace(/<style[\s\S]*?<\/style>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ');
const rows = [];
for (const [slug, file] of files) {
  if (PROTECTED.has(slug.replace(/^guide\//, ''))) continue;
  const raw = fs.readFileSync(file, 'utf8');
  const text = strip(raw);
  const key = slug.replace(/^(guide|services)\//, '');
  const body = raw.split('---').slice(2).join('---');
  const links = [...body.matchAll(/href="(\/(guide|services|works)[^"#?]*)/g)].map((m) => m[1]).filter((h) => !slug.endsWith(h.replace(/^\/|\/$/g, '')));
  const uniqLinks = new Set(links);
  const c = {
    '①定義': /とは\s*[、は「]|とは\s*[^、。]{0,40}(のこと|を指し|です)|を指し|の略|意味です|def-box/.test(text) || /def-box/.test(raw),
    '①読み・英語': !TERM_PAGES.has(key) || /読み方|読み：|読みます|英語|（[a-z][a-z ]+）|\b[Ii]mmersive\b|mind game|murder mystery|battle|immersion/.test(text),
    '②目的別・向き': /向いて|向く|おすすめ|選び方|目的別|ケース|場面|に適し/.test(text),
    '③費用': NO_COST.has(key) || /万円/.test(text),
    '③期間・人数': NO_TERM.has(key) || (/(ヶ月|か月|週間|時間)/.test(text) && /(数十|数百|[0-9０-９]+)\s*(人|名)/.test(text)),
    '④実績・出典': /日本経済新聞|日経|電ファミ|完売|20件|1,000枚|出典|掲載|prtimes|bunka\.go\.jp|developers\.google|3か月連続/.test(raw),
    '⑤会社・著者': /株式会社ex Labs/.test(text) && /AuthorBox|author-box|svc-sum/.test(raw),
    '⑥関連リンク3+': uniqLinks.size >= 3,
    '要点/定義ボックス': /key-points|def-box|svc-sum/.test(raw),
    'FAQ': /const faqs\s*=\s*\[\s*\{/.test(raw) || /faq-list/.test(raw),
  };
  const miss = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
  rows.push({ slug, frozen: FROZEN.has(key), miss, links: uniqLinks.size });
}
rows.sort((a, b) => b.miss.length - a.miss.length || a.slug.localeCompare(b.slug));
let total = 0;
for (const r of rows) { total += r.miss.length; if (r.miss.length) console.log(`${r.frozen ? '[凍結] ' : ''}${r.slug}: ${r.miss.join('、')}`); }
console.log(`\n[fanout-audit] 対象 ${rows.length} ページ、不足 ${total} 項目、不足なし ${rows.filter((r) => !r.miss.length).length} ページ`);
if (process.argv.includes('--json')) fs.writeFileSync('docs/fanout-audit.json', JSON.stringify({ date: new Date().toISOString().slice(0, 10), total, rows }, null, 1));
if (process.argv.includes('--strict') && total) process.exit(1);
