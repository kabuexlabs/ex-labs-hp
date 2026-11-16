// 公開済みの版のデザイン用ファイル（/_astro/ 以下の CSS・JS）を public/_astro/ に残す（2026-11-16 新設）。
//
// なぜ必要か：CSS や JS を変えると /_astro/ のファイル名（末尾の英数字）が変わり、前の版のファイルは配信されなくなる。
// 前の版のページを端末が持ったままだと（アプリ内ブラウザ・復元されたタブなど）、デザイン用ファイルが 404 になり、
// 文字とリンクだけのページが表示される（2026-11-16、/gensou/ などで発生）。
// 前の版のファイルを public/_astro/ に置いておけば、新しい版になっても同じ URL で配信され続ける。
//
//   node scripts/keep-assets.mjs --pre   ビルドの前：まだ公開していない版の残り物と、古くなったものを消す
//   node scripts/keep-assets.mjs         ビルドの後：今回のビルドで出来たファイルを public/_astro/ に写す
// どちらも `npm run check` の中で自動で実行される。public/_astro/ と scripts/kept-assets.json は一緒にコミットする。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEEP = path.join(ROOT, 'public/_astro');
const BUILD = path.join(ROOT, '.vercel/output/static/_astro');
const MANIFEST = path.join(ROOT, 'scripts/kept-assets.json'); // ファイル名 → 残し始めた日
const MAX_AGE_DAYS = 120; // これより古く、今の版で使われていないものは消す
const PRE = process.argv.includes('--pre');

const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
const kept = () => (fs.existsSync(KEEP) ? fs.readdirSync(KEEP).filter((f) => /\.(css|js)$/.test(f)) : []);
const today = new Date().toISOString().slice(0, 10);

if (PRE) {
  // 1) 公開済み（origin/main にある）ではないもの＝途中のビルドの残り物を消す
  let committed = null;
  try {
    committed = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', 'origin/main', '--', 'public/_astro'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean).map((f) => path.basename(f)));
  } catch { /* git が使えない環境では何も消さない */ }
  let removed = 0;
  if (committed) for (const f of kept()) if (!committed.has(f)) { fs.rmSync(path.join(KEEP, f)); removed++; }
  // 2) 古くなったものを消す（今の版でも使われていれば、ビルド後の処理でまた置かれる）
  let expired = 0;
  for (const f of kept()) {
    const since = manifest[f];
    if (since && (Date.now() - Date.parse(since)) / 86400000 > MAX_AGE_DAYS) { fs.rmSync(path.join(KEEP, f)); expired++; }
  }
  console.log(`以前の版のファイル：未公開の残り ${removed}件・期限切れ ${expired}件を整理（残り ${kept().length}件）`);
} else {
  if (!fs.existsSync(BUILD)) { console.error('ビルド結果がありません（先に npm run build）'); process.exit(1); }
  fs.mkdirSync(KEEP, { recursive: true });
  const have = new Set(kept());
  let added = 0;
  for (const f of fs.readdirSync(BUILD)) {
    if (!/\.(css|js)$/.test(f)) continue;
    if (!have.has(f)) { fs.copyFileSync(path.join(BUILD, f), path.join(KEEP, f)); added++; }
    manifest[f] ??= today;
  }
  const now = new Set(kept());
  for (const f of Object.keys(manifest)) if (!now.has(f)) delete manifest[f];
  fs.writeFileSync(MANIFEST, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 1) + '\n');
  console.log(`以前の版のファイル：今回のビルドから ${added}件を追加（public/_astro/ に計 ${now.size}件）`);
}
