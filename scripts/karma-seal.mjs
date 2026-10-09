// 真凜会 会員限定書庫（/karma/shinrinkai/）の特典素材をパスワードで暗号化して公開フォルダに書き出す。
//
// リポジトリは公開なので、ショートストーリーの本文や肖像写真の原本はコミットしない（/private/ は .gitignore 済み）。
// ここで AES-GCM（鍵は パスワード→PBKDF2-SHA256 60万回）で暗号化した結果だけを
// public/assets/karma/sealed/ に置き、閲覧者のブラウザがパスワード入力時に復号する（src/scripts/karmaSeal.ts）。
// パスワードはコマンドの環境変数で渡すだけで、どこにも保存しない。
//
// 使い方：
//   KARMA_STORY_PASS='合言葉' node scripts/karma-seal.mjs story private/karma/story.txt
//     … 1行目＝タイトル、2行目以降＝本文（空行で段落区切り）
//   KARMA_PORTRAIT_PASS='合言葉' node scripts/karma-seal.mjs portraits private/karma/portraits
//     … フォルダ内の画像（.webp .jpg .jpeg .png）を名前順に。表示名はファイル名（拡張子なし）
//       （大きい写真は先に長辺1600px程度へ縮小しておく）
//       同じ名前のサムネイルを <フォルダ>/_thumbs/ に置くと一覧にはそれを使う（無ければ本体を縮小表示）
//       並び順は <フォルダ>/_order.txt（1行1ファイル名）で指定できる
//   書き直すと前回分は消える（毎回すべて作り直す）。
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto, randomBytes } from 'node:crypto';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'public/assets/karma/sealed');
const ITER = 600000;
const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');

async function keyFrom(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
}
async function seal(key, data) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return { iv, ct };
}
function needPass(name) {
  const p = process.env[name];
  if (!p) { console.error(`環境変数 ${name} にパスワードを入れてください`); process.exit(1); }
  if (p.length < 10) console.warn(`※ パスワードが ${p.length} 文字です。暗号文は公開されるため、短いと総当たりで開けられます（目隠し程度の強さ）。`);
  // ブラウザ側（karmaSeal.ts）と同じく全角/半角・大文字/小文字の揺れを吸収してから使う
  return p.normalize('NFKC').trim().toLowerCase();
}

const [kind, src] = process.argv.slice(2);
if (kind === 'story') {
  const pass = needPass('KARMA_STORY_PASS');
  const raw = fs.readFileSync(src, 'utf8').replace(/\r\n?/g, '\n').trim();
  const [title, ...rest] = raw.split('\n');
  const body = rest.join('\n').trim();
  if (!title || !body) { console.error('1行目にタイトル、2行目以降に本文を書いてください'); process.exit(1); }
  const salt = randomBytes(16);
  const key = await keyFrom(pass, salt);
  const { iv, ct } = await seal(key, enc.encode(JSON.stringify({ title: title.trim(), body })));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'story.json'), JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  console.log(`story.json を書き出しました（タイトル「${title.trim()}」、本文 ${body.length} 字）`);
} else if (kind === 'portraits') {
  const pass = needPass('KARMA_PORTRAIT_PASS');
  const types = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
  // 掲載しない出演者（2026-10-08〜09 ユーザー指示：桐谷 紫月・遥。/karma/ からも削除済み）。
  // ファイル名にこの文字列を含む写真は暗号化せず、公開フォルダにも出さない。
  const EXCLUDE = ['桐谷', '紫月', '遥', 'kiritani', 'haruka'];
  const all = fs.readdirSync(src).filter((f) => types[path.extname(f).toLowerCase()]);
  const skipped = all.filter((f) => EXCLUDE.some((w) => f.normalize('NFKC').toLowerCase().includes(w)));
  if (skipped.length) console.log(`掲載しない出演者の写真を除外しました：\n  ${skipped.join('\n  ')}`);
  // 並び順：<フォルダ>/_order.txt（1行に1ファイル名、拡張子なしでも可）があればその順、無い分は名前順で後ろに。
  const orderFile = path.join(src, '_order.txt');
  const order = fs.existsSync(orderFile) ? fs.readFileSync(orderFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  const rank = (f) => { const i = order.findIndex((o) => o === f || o === path.parse(f).name); return i < 0 ? Infinity : i; };
  const files = all.filter((f) => !skipped.includes(f)).sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b, 'ja', { numeric: true }));
  if (!files.length) { console.error('画像が見つかりません'); process.exit(1); }
  const dir = path.join(OUT, 'portraits');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const salt = randomBytes(16);
  const key = await keyFrom(pass, salt);
  const list = [];
  for (const f of files) {
    const id = randomBytes(8).toString('hex');
    const { iv, ct } = await seal(key, fs.readFileSync(path.join(src, f)));
    fs.writeFileSync(path.join(dir, `${id}.bin`), Buffer.concat([iv, ct]));
    const item = { name: f, file: `${id}.bin`, type: types[path.extname(f).toLowerCase()] };
    const thumbSrc = fs.existsSync(path.join(src, '_thumbs')) && fs.readdirSync(path.join(src, '_thumbs')).find((t) => path.parse(t).name === path.parse(f).name);
    if (thumbSrc) {
      const tid = randomBytes(8).toString('hex');
      const t = await seal(key, fs.readFileSync(path.join(src, '_thumbs', thumbSrc)));
      fs.writeFileSync(path.join(dir, `${tid}.bin`), Buffer.concat([t.iv, t.ct]));
      item.thumb = `${tid}.bin`;
      item.thumbType = types[path.extname(thumbSrc).toLowerCase()];
    }
    list.push(item);
  }
  const { iv, ct } = await seal(key, enc.encode(JSON.stringify(list)));
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  console.log(`肖像 ${files.length} 枚を暗号化しました：\n  ${files.join('\n  ')}`);
} else {
  console.error('使い方: node scripts/karma-seal.mjs story <テキスト> | portraits <フォルダ>');
  process.exit(1);
}
