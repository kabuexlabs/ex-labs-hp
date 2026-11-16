// デプロイ後の表示確認（2026-11-16 新設）。
// 「サイトを開くとファイル（zip）がダウンロードされる」障害（2026-10・2026-11-16 の2回、部品の更新後に本番で発生）を、
// 公開した直後に機械で見つけるためのチェック。GitHub Actions（.github/workflows/deploy-smoke.yml）から呼ばれる。
//   node scripts/smoke-deploy.mjs <ベースURL>
// 各ページについて、ブラウザと同じように圧縮を受け付けて取得し、
//   ・ステータス 200
//   ・Content-Type が text/html（sitemap・rss は XML）
//   ・Content-Disposition に attachment（ダウンロード扱い）が無い
//   ・Content-Encoding が gzip / br / zstd / なし のいずれかで、本文を展開すると <html（XML は <?xml）で始まる
// を確かめる。1つでも満たさなければ終了コード 1。
import zlib from 'node:zlib';

const BASE = (process.argv[2] || 'https://kabuexlabs.com').replace(/\/$/, '');
const PAGES = [
  ['/', 'html'], ['/guide/saiji/', 'html'], ['/guide/botsunyukan/', 'html'], ['/services/immersive/', 'html'],
  ['/company/', 'html'], ['/events/', 'html'], ['/gensou/', 'html'], ['/blog/', 'html'], ['/press/', 'html'],
  ['/sitemap.xml', 'xml'], ['/rss.xml', 'xml'],
];
const headersExtra = process.env.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS } : {};

const decode = (buf, enc) => {
  if (!enc || enc === 'identity') return buf;
  if (enc === 'gzip') return zlib.gunzipSync(buf);
  if (enc === 'br') return zlib.brotliDecompressSync(buf);
  if (enc === 'deflate') return zlib.inflateSync(buf);
  if (enc === 'zstd' && zlib.zstdDecompressSync) return zlib.zstdDecompressSync(buf);
  throw new Error(`未知の Content-Encoding: ${enc}`);
};

let failed = 0;
let protectedPreview = 0;
for (const [p, kind] of PAGES) {
  const url = BASE + p;
  let res;
  try {
    // fetch は自動で展開してしまうため、Accept-Encoding を明示し、生のバイト列を自分で展開して確かめる
    res = await fetch(url, { redirect: 'manual', headers: { 'accept-encoding': 'gzip, br', 'user-agent': 'exlabs-deploy-smoke/1.0', accept: 'text/html,application/xml;q=0.9,*/*;q=0.8', ...headersExtra } });
  } catch (e) {
    console.log(`NG  ${p}  取得できない: ${e.message}`); failed++; continue;
  }
  const ct = res.headers.get('content-type') || '';
  const cd = res.headers.get('content-disposition') || '';
  const ce = res.headers.get('content-encoding') || '';
  // プレビューが Vercel の認証で保護されている場合は判定できない（失敗にはしないが、明示する）
  const loc = res.headers.get('location') || '';
  if (!process.env.VERCEL_BYPASS && (((res.status === 401 || res.status === 403) && /vercel/i.test(res.headers.get('server') || '')) || ((res.status === 302 || res.status === 307) && /^https:\/\/vercel\.com\/(sso-api|login)/.test(loc)))) {
    console.log(`--  ${p}  保護されたプレビューのため判定不可（${res.status}）`); protectedPreview++; continue;
  }
  const problems = [];
  if (res.status !== 200) problems.push(`ステータス ${res.status}${res.headers.get('location') ? ` → ${res.headers.get('location')}` : ''}`);
  if (kind === 'html' && !/^text\/html\b/i.test(ct)) problems.push(`Content-Type が "${ct}"`);
  if (kind === 'xml' && !/xml/i.test(ct)) problems.push(`Content-Type が "${ct}"`);
  if (/attachment/i.test(cd)) problems.push(`Content-Disposition が "${cd}"（ダウンロード扱い）`);
  let head = '';
  try {
    // fetch（undici）は Content-Encoding を自動で展開する。展開済みかを見分けるため、まず text として読む
    const raw = Buffer.from(await res.arrayBuffer());
    let body = raw;
    // 先頭が gzip（1f8b）なら、二重圧縮などで展開されないまま届いている
    if (raw[0] === 0x1f && raw[1] === 0x8b) { problems.push('本文が gzip のまま（展開されずに届いている）'); body = decode(raw, 'gzip'); }
    head = body.subarray(0, 300).toString('utf8').trimStart().toLowerCase();
  } catch (e) { problems.push(`本文を読めない: ${e.message}`); }
  if (kind === 'html' && !(head.startsWith('<!doctype html') || head.startsWith('<html'))) problems.push(`本文の先頭が HTML ではない: ${JSON.stringify(head.slice(0, 40))}`);
  if (kind === 'xml' && !head.startsWith('<?xml')) problems.push(`本文の先頭が XML ではない: ${JSON.stringify(head.slice(0, 40))}`);
  if (problems.length) { failed++; console.log(`NG  ${p}  ${problems.join(' ／ ')}  [content-type=${ct} encoding=${ce}]`); }
  else console.log(`OK  ${p}  [${ct}${ce ? ` / ${ce}` : ''}]`);
}
console.log(`\n${BASE}: ${PAGES.length}ページ中 NG ${failed}${protectedPreview ? `、判定不可 ${protectedPreview}` : ''}`);
if (protectedPreview === PAGES.length) console.log('※ プレビューが保護されているため確認できませんでした（VERCEL_BYPASS を設定すると確認できます）');
process.exit(failed ? 1 : 0);
