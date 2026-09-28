// 解説記事・ブログ記事の HTML を配信直前に整える（src/middleware.ts から呼ぶ）。
//  1) 日本語の文節の切れ目に <wbr> を入れる（CSS の word-break:keep-all と組み合わせ、単語の途中で折り返さない）
//  2) 「①②…」で始まる項目だけの箇条書き（.bullets）に is-steps を付け、ステップ図として表示する
// script・style・title・textarea・pre・code の中身と、タグの属性には触れない。
import { seg } from './jpbreak';

const SKIP = new Set(['script', 'style', 'title', 'textarea', 'pre', 'code', 'svg', 'noscript']);
const JA = /[぀-ヿ㐀-鿿々〆ー]/;

function wbrText(text: string): string {
  if (!JA.test(text)) return text;
  // 実体参照（&amp; など）は1文字として扱い、途中に <wbr> を入れない
  const parts = text.split(/(&[#a-zA-Z0-9]+;)/);
  let out = '';
  for (const part of parts) {
    if (!part) continue;
    if (/^&[#a-zA-Z0-9]+;$/.test(part)) { out += part; continue; }
    const s = seg(part);
    const ch = [...s];
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i], n = ch[i + 1] || '';
      if (c === '​') { if (n && !/^[、。，．）」』】！？ー]/.test(n)) out += '<wbr>'; continue; }
      out += c;
      // 句読点・中黒・閉じ括弧の後も折り返し候補にする（次が閉じ記号なら入れない）
      if (/[、。，！？・／）」』】]/.test(c) && n && !/[、。，．）」』】！？​]/.test(n)) out += '<wbr>';
    }
  }
  return out;
}

export function enhanceArticleHtml(html: string): string {
  const bodyStart = html.indexOf('<body');
  if (bodyStart < 0) return html;
  const head = html.slice(0, bodyStart);
  const body = html.slice(bodyStart);
  const tokens = body.split(/(<[^>]+>)/);
  const stack: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t[0] === '<') {
      const m = /^<\/?([a-zA-Z0-9-]+)/.exec(t);
      if (!m) continue;
      const name = m[1].toLowerCase();
      if (SKIP.has(name)) {
        if (t[1] === '/') { if (stack[stack.length - 1] === name) stack.pop(); }
        else if (!t.endsWith('/>')) stack.push(name);
      }
      continue;
    }
    if (stack.length === 0) tokens[i] = wbrText(t);
  }
  let out = head + tokens.join('');
  // ①〜⑳で始まる項目だけでできた .bullets をステップ図に
  out = out.replace(/<ul class="bullets([^"]*)"([^>]*)>([\s\S]*?)<\/ul>/g, (all, cls: string, attrs: string, inner: string) => {
    const items = inner.match(/<li\b[^>]*>([\s\S]*?)<\/li>/g) ?? [];
    if (items.length < 2) return all;
    const steps = items.every((li) => /^<li\b[^>]*>\s*(?:<strong[^>]*>\s*)?[①-⑳]/.test(li));
    return steps ? `<ul class="bullets${cls} is-steps"${attrs}>${inner}</ul>` : all;
  });
  return out;
}
