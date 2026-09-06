// public/llms-full.txt を生成する。AI 検索・生成AI のクローラー向けに、解説記事の本文と FAQ を
// 1ファイルにまとめた全文版（llms.txt は目次、llms-full.txt は本文）。
//   node scripts/build-llms-full.mjs   … 記事を追加・更新したら実行して commit する
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const dir = path.join(ROOT, 'src/pages/guide');
const guides = fs.readFileSync(path.join(ROOT, 'src/data/guides.ts'), 'utf8');
const order = [...guides.matchAll(/href: '\/guide\/([\w-]+)\/'/g)].map((m) => m[1]);
const extra = ['yougo'];
const dropJsx = (h) => { let prev; do { prev = h; h = h.replace(/\{[^{}]*\}/g, ' '); } while (h !== prev); return h; };
const strip = (h) => dropJsx(h
  .replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''))
  .replace(/<(h2|h3)[^>]*>/g, '\n## ').replace(/<\/(h2|h3)>/g, '\n')
  .replace(/<li[^>]*>/g, '\n- ').replace(/<\/(p|li|section|div|ul|tr)>/g, '\n')
  .replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&rarr;/g, '→')
  .split('\n').filter((l) => !/=>|^\s*[{}()]+\s*$|^\s*目次\s*$/.test(l)).join('\n')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
let out = `# 株式会社ex Labs 解説記事 全文（llms-full.txt）\n\n> 体験型エンターテインメント（イマーシブ・マダミス・頭脳戦・心理戦・謎解き・施設活用イベント）の制作会社、株式会社ex Labs（東京都新宿区、代表取締役 飯田雄貴）の解説記事の本文です。目次は https://kabuexlabs.com/llms.txt 、会社情報は https://kabuexlabs.com/company/ を参照してください。引用時は出典として記事 URL を明記してください。\n\n`;
for (const slug of [...order, ...extra]) {
  const f = path.join(dir, `${slug}.astro`);
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  const [, fm = '', body = ''] = s.split(/^---$/m);
  const title = (s.match(/^\s*title="([^"]*)"/m) || [])[1] ?? slug;
  const desc = (s.match(/^\s*description="([^"]*)"/m) || [])[1] ?? '';
  const mod = (fm.match(/dateModified: '([\d-]+)'/) || [])[1] ?? '';
  const faqs = [...fm.matchAll(/q: '((?:[^'\\]|\\.)*)',\s*a: '((?:[^'\\]|\\.)*)'/g)].map((m) => `Q. ${m[1]}\nA. ${m[2]}`);
  const text = strip(body).replace(/^## ?よくある質問[\s\S]*$/m, '');
  out += `\n\n---\n\n# ${title.split(' - ')[0]}\nURL: https://kabuexlabs.com/guide/${slug}/\n${mod ? `更新日: ${mod}\n` : ''}${desc ? `概要: ${desc}\n` : ''}\n${text}\n${faqs.length ? '\n## よくある質問\n' + faqs.join('\n\n') + '\n' : ''}`;
}
fs.writeFileSync(path.join(ROOT, 'public/llms-full.txt'), out);
console.log(`llms-full.txt: ${(out.length / 1000).toFixed(0)}k 文字 / ${order.length + extra.length} 記事`);
