// 日本語の改行制御（2026-09 リニューアルのデザイン仕様をサーバー側に移植）。
// デザインファイル ServicePage.dc.html の build() → seg / cls / rich と同じ規則で、
// 文字列を「途中で折り返さない文節」の配列に分ける。描画は components/x/Cls.astro・Rich.astro。
//  - 「、」「。」「・」「／」の直後、「（」「「」の直前で文節を切る
//  - 10文字以下の文節は inline-block（途中で折り返さない）
//  - 長い文節は ZWSP の位置（ひらがな→漢字・カタカナ等の境目）で細かく分ける
//  - **太字** と金額・件数など（NUM）は強調（ライムのマーカー）

export type Part = { t: string; b: boolean };
export type Clause = Part[];
export type RichBlock =
  | { kind: 'p'; lines: Clause[][] }
  | { kind: 'list'; title: string; items: Clause[][] }
  | { kind: 'kv'; rows: { k: string; short: boolean; v: Clause[] }[] };

const KATA = /[ァ-ヺー]/;
const HIRA = /[ぁ-ゟ]/;
const KAN = /[一-鿿々]/;
const KT = /[ァ-ヺ]/;
const ZW = '​';

export function seg(str: string): string {
  if (!str) return '';
  const s = [...str];
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1] || '';
    out += c;
    if (n && (
      (HIRA.test(c) && /[一-鿿ァ-ヺA-Za-z0-9「（]/.test(n)) ||
      (KAN.test(c) && KT.test(n)) ||
      (/[ァ-ヺー]/.test(c) && KAN.test(n) && !/^[様]/.test(n)) ||
      (/[はをがにでへ]/.test(c) && /[一-鿿ァ-ヺ]/.test(s[i - 1] || '') && /[ぁ-ゟ一-鿿ァ-ヺ]/.test(n) && !/[、。）」]/.test(n))
    )) out += ZW;
  }
  return out;
}

const NUM = /(初期費用0円|初期費用負担なし|全公演(?:チケット)?完売|[0-9]+か月連続1位|数十万円台〜|数百万円規模|約?[0-9][0-9,]*(?:〜[0-9][0-9,]*)?(?:万円前後〜|万円台〜|万円|円|件以上|件|名規模)|無料)/g;

function tokens(str: string, emph: boolean): Part[] {
  const out: Part[] = [];
  (str || '').split(/\*\*(.+?)\*\*/).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) { out.push({ t: part, b: emph }); return; }
    if (!emph) { out.push({ t: part, b: false }); return; }
    let last = 0;
    part.replace(NUM, (m: string, _g: string, off: number) => {
      if (off > last) out.push({ t: part.slice(last, off), b: false });
      out.push({ t: m, b: true });
      last = off + m.length;
      return m;
    });
    if (last < part.length) out.push({ t: part.slice(last), b: false });
  });
  return out;
}

/** 文字列を文節（inline-block にする単位）の配列に分ける。emph=false なら強調しない（**は外す） */
export function cls(str: string, emph = true): Clause[] {
  const out: Clause[] = [];
  let cur: Part[] = [];
  const push = (t: string, b: boolean) => { if (t) cur.push({ t: seg(t), b }); };
  const close = () => {
    if (!cur.length) return;
    const len = cur.reduce((n, x) => n + x.t.replace(/​/g, '').length, 0);
    if (len > 10) {
      const frs: Clause[] = [];
      cur.forEach((x) => x.t.split(ZW).filter(Boolean).forEach((fr) => {
        if (frs.length && /^[」』）】、。，！？]/.test(fr)) frs[frs.length - 1].push({ t: fr, b: x.b });
        else frs.push([{ t: fr, b: x.b }]);
      }));
      frs.forEach((f) => out.push(f));
    } else out.push(cur);
    cur = [];
  };
  for (const { t, b } of tokens(str, emph)) {
    const ch = [...t];
    let buf = '';
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i], n = ch[i + 1] || '', pv = ch[i - 1] || '';
      if (/[（「『【]/.test(c) && (buf || cur.length) && !/[（「『【]/.test(pv)) { push(buf, b); buf = ''; close(); }
      buf += c;
      const closeNext = /[、。，！？」』）】：]/.test(n);
      if (!closeNext && (/[、。，！？]/.test(c) || (/[・／]/.test(c) && !(KATA.test(pv) && KATA.test(n))))) { push(buf, b); buf = ''; close(); }
    }
    push(buf, b);
  }
  close();
  // 10文字以下の文節には ZWSP が残る。狭い画面で文節が入りきらないときだけ、その位置（文節の切れ目）で折り返す
  return out;
}

/** 強調なしの文節（文字列の配列） */
export const plain = (s: string): string[] => cls((s || '').replace(/\*\*/g, ''), false).map((c) => c.map((x) => x.t).join(''));

/** 手組みの文節にも同じ規則で ZWSP（折り返し候補）を入れる */
export const segList = (list: string[]) => list.map(seg);

const OPEN = '（「『【(', CLOSE = '）」』】)';
function splitTop(s: string, chr: string): string[] {
  const out: string[] = []; let d = 0, cur = '';
  for (const c of s) { if (OPEN.includes(c)) d++; else if (CLOSE.includes(c)) d = Math.max(0, d - 1); if (c === chr && d === 0) { out.push(cur); cur = ''; } else cur += c; }
  out.push(cur);
  return out;
}
function sentences(s: string): string[] {
  const out: string[] = []; let d = 0, cur = '';
  for (const c of s) { if (OPEN.includes(c)) d++; else if (CLOSE.includes(c)) d = Math.max(0, d - 1); cur += c; if (c === '。' && d === 0) { out.push(cur); cur = ''; } }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** 本文の自動整形：文単位の改行、「／」区切りの箇条書き化、「A：B」のKV表化 */
export function rich(str: string): RichBlock[] {
  if (!str) return [];
  const blocks: RichBlock[] = [];
  let para: { kind: 'p'; lines: Clause[][] } | null = null;
  for (const s of sentences(str)) {
    const parts = splitTop(s, '／').map((x) => x.trim()).filter(Boolean);
    if (parts.length >= 2) {
      para = null;
      parts[parts.length - 1] = parts[parts.length - 1].replace(/。$/, '');
      const hasK = parts.map((x) => splitTop(x, '：').length > 1);
      if (hasK.every(Boolean)) {
        blocks.push({ kind: 'kv', rows: parts.map((x) => { const i = x.indexOf('：'); const k = x.slice(0, i); return { k: k.replace(/\*\*/g, ''), short: k.length <= 3, v: cls(x.slice(i + 1)) }; }) });
      } else {
        let title = ''; const i = parts[0].indexOf('：');
        if (hasK[0] && hasK.filter(Boolean).length === 1 && i > 0 && i < 30) { title = parts[0].slice(0, i); parts[0] = parts[0].slice(i + 1); }
        blocks.push({ kind: 'list', title: title.replace(/\*\*/g, ''), items: parts.map((x) => cls(x)) });
      }
    } else {
      if (!para) { para = { kind: 'p', lines: [] }; blocks.push(para); }
      para.lines.push(cls(s));
    }
  }
  return blocks;
}

/** HTML 属性・JSON-LD 用に強調記号を外した素の文字列 */
export const flat = (s: string) => (s || '').replace(/\*\*/g, '');
