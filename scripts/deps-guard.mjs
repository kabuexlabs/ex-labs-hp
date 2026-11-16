// 部品（依存パッケージ）の版の見張り（2026-11-16 新設）。`npm run check` の最初に動く。
// astro・@astrojs/vercel・vite は、上げると Vercel の本番でだけ「ページがファイルとしてダウンロードされる」障害が
// 2回起きた（2026-10：astro 7.3 系＋@astrojs/vercel 11.0.11、2026-11-16：astro 7.4.12＋@astrojs/vercel 11.0.3）。
// ローカルのビルド・表示確認ではどちらも再現しなかったため、ここに書いた版以外になったら必ず止める。
// 版を変えるのは、docs/deploy-safety.md の手順（プレビューで実際に開けることを人が確認）を終えた後に、
// この表を書き換えるときだけ。
import fs from 'node:fs';

const APPROVED = {
  astro: '7.1.3',
  '@astrojs/vercel': '11.0.2',
  vite: '8.1.3',
};

const lock = JSON.parse(fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
let bad = 0;
for (const [name, ver] of Object.entries(APPROVED)) {
  const got = lock.packages?.[`node_modules/${name}`]?.version;
  if (got !== ver) { console.error(`✗ ${name}: package-lock は ${got ?? '（なし）'}、許可している版は ${ver}`); bad++; }
  const spec = pkg.dependencies?.[name];
  if (spec !== undefined && spec !== ver) { console.error(`✗ ${name}: package.json の指定が "${spec}"（"${ver}" に固定すること）`); bad++; }
}
if (bad) {
  console.error('\n部品の版が許可した版と違います。本番で表示できなくなる障害を防ぐため、ここで止めます。');
  console.error('更新する場合は docs/deploy-safety.md の手順（プレビューで確認→許可の表を更新）に従ってください。');
  process.exit(1);
}
console.log(`部品の版：許可した版のまま（${Object.entries(APPROVED).map(([n, v]) => `${n}@${v}`).join('、')}）`);
