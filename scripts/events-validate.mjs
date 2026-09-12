// 公演データ（src/data/events/）の登録検証。npm run check に含まれる。
//   node --experimental-strip-types scripts/events-validate.mjs
// 必須情報の不足・不正 URL・日付と時刻の矛盾・料金単位の欠落・情報源と確認日時の欠落・
// 画像の利用条件未確認・同じ公演回の重複・テストデータの公開・公開ページからの fixtures 参照を検出する。
import fs from 'node:fs';
import path from 'node:path';
import { validateDataset } from '../src/lib/events.ts';
import { sources } from '../src/data/events/sources.ts';
import { organizers } from '../src/data/events/organizers.ts';
import { venues } from '../src/data/events/venues.ts';
import { channels } from '../src/data/events/channels.ts';
import { works } from '../src/data/events/works.ts';
import { occurrences } from '../src/data/events/occurrences.ts';
import { AREAS, REGIONS } from '../src/data/events/areas.ts';

const errors = validateDataset({ sources, organizers, venues, channels, works, occurrences });
for (const v of venues) {
  if (!REGIONS.some((r) => r.id === v.regionId)) errors.push(`venue ${v.id}: regionId ${v.regionId} が areas.ts に無い`);
  if (!AREAS.some((a) => a.id === v.areaId && a.regionId === v.regionId)) errors.push(`venue ${v.id}: areaId ${v.areaId} が areas.ts に無い（地域と不一致）`);
}
for (const w of works) if (w.image && !fs.existsSync(path.join('public', w.image.path))) errors.push(`work ${w.id}: 画像の実体が無い ${w.image.path}`);

// 公開ページ・サイトマップから fixtures を参照していないか
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); } return out; };
for (const f of walk('src/pages')) if (fs.readFileSync(f, 'utf8').includes('events/fixtures')) errors.push(`${f} がテストデータ（fixtures）を参照している`);

// 情報提供：確認から時間が経った作品、未確認のまま近づく回
const now = Date.now();
const warns = [];
for (const w of works) {
  const age = (now - Date.parse(w.verified.at)) / 86400000;
  if (age > w.verifyTtlDays) warns.push(`work ${w.id}: 開催情報の確認から ${Math.floor(age)} 日（有効 ${w.verifyTtlDays} 日）。公式で再確認して verified.at を更新`);
}
const soon = occurrences.filter((o) => o.published && !o.test && o.sales.status === 'unknown' && (Date.parse(o.date + 'T00:00:00+09:00') - now) / 86400000 < 7 && Date.parse(o.date + 'T23:59:59+09:00') > now);
if (soon.length) warns.push(`7日以内の回 ${soon.length} 件が受付状況「未確認」のまま（${soon.map((o) => o.id).join(', ')}）`);

console.log(`公演データ: 作品 ${works.filter((w) => w.published).length}／回 ${occurrences.filter((o) => o.published && !o.test).length}（公開）`);
for (const w of warns) console.log('  ! ' + w);
if (errors.length) { console.log(`\nエラー ${errors.length} 件`); for (const e of errors) console.log('  ✗ ' + e); process.exit(1); }
console.log('公演データ検証: エラーなし');
