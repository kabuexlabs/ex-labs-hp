// 公開サイトを実際のブラウザで開いて撮る（GitHub Actions 用。2026-11-16 新設）。
//   node scripts/site-shots.mjs <ベースURL> <出力dir> [path...]
// 各ページをスマホ幅・PC幅で開き、上から3画面を撮る。あわせて、ブラウザのエラー・読み込みに失敗した通信・
// 壊れた画像（読み込めていない <img>）・横のはみ出しを報告する。問題があれば終了コード 1。
import { chromium, webkit, firefox, devices } from 'playwright';
import fs from 'node:fs';

const [BASE, OUT, ...rest] = process.argv.slice(2);
const PAGES = rest.length ? rest : ['/', '/gensou/', '/guide/saiji/', '/guide/botsunyukan/', '/services/immersive/', '/company/', '/events/', '/taikenbizyutu/7th-composition/', '/uwasabanashi/kotohogi/', '/hacktale/', '/toudaimurder/', '/karma/', '/blog/', '/works/'];
fs.mkdirSync(OUT, { recursive: true });
// 確認するブラウザ（環境変数 BROWSERS。既定は chromium のみ）。webkit は iPhone・Mac の Safari と同じ描画エンジン
const ENGINES = { chromium, webkit, firefox };
const TARGETS = (process.env.BROWSERS || 'chromium').split(',').flatMap((name) => {
  if (name === 'webkit') return [{ eng: 'webkit', tag: 'iphone', w: 390, opts: { ...devices['iPhone 14'], deviceScaleFactor: 1 } }, { eng: 'webkit', tag: 'safari', w: 1280, opts: { viewport: { width: 1280, height: 900 } } }];
  if (name === 'firefox') return [{ eng: 'firefox', tag: 'firefox', w: 1280, opts: { viewport: { width: 1280, height: 900 } } }];
  return [{ eng: 'chromium', tag: 'android', w: 390, opts: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }, { eng: 'chromium', tag: 'chrome', w: 1280, opts: { viewport: { width: 1280, height: 900 } } }];
});
const launched = {};
let bad = 0;
for (const p of PAGES) for (const t of TARGETS) {
  const b = (launched[t.eng] ||= await ENGINES[t.eng].launch());
  const w = t.w;
  const ctx = await b.newContext({ ...t.opts, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const h = t.opts.viewport?.height ?? 844;
  const pg = await ctx.newPage();
  const errs = new Set(), fails = new Set();
  pg.on('pageerror', (e) => errs.add('JSエラー: ' + String(e).slice(0, 200)));
  pg.on('console', (m) => { if (m.type() === 'error') errs.add('console: ' + m.text().slice(0, 200)); });
  pg.on('requestfailed', (r) => { const u = r.url(); if (!/\/api\/track|vitals|insights/.test(u)) fails.add(`${r.failure()?.errorText || 'failed'} ${u.slice(0, 140)}`); });
  pg.on('response', (r) => { if (r.status() >= 400 && !/\/api\/track/.test(r.url())) fails.add(`${r.status()} ${r.url().slice(0, 140)}`); });
  const name = (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_')) + '-' + t.tag;
  try {
    const res = await pg.goto(BASE + p, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForTimeout(4000);
    const info = await pg.evaluate(() => ({
      H: document.scrollingElement.scrollHeight,
      overflow: document.scrollingElement.scrollWidth - innerWidth,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).map((i) => i.getAttribute('src')).slice(0, 8),
      sheets: document.styleSheets.length,
      bodyText: document.body.innerText.trim().length,
      font: getComputedStyle(document.body).fontFamily.slice(0, 60),
    }));
    for (let i = 0; i < 3 && i * (h - 80) < info.H; i++) {
      await pg.evaluate((y) => window.scrollTo(0, y), i * (h - 80));
      await pg.waitForTimeout(900);
      await pg.screenshot({ path: `${OUT}/${name}-${i}.jpg`, type: 'jpeg', quality: 72 });
    }
    const problems = [];
    if (res.status() !== 200) problems.push(`ステータス ${res.status()}`);
    if (info.overflow > 2) problems.push(`横に ${info.overflow}px はみ出し`);
    if (info.broken.length) problems.push(`読み込めない画像: ${info.broken.join(', ')}`);
    if (info.bodyText < 200) problems.push(`本文がほとんど無い（${info.bodyText}文字）`);
    if (info.sheets === 0) problems.push('スタイルシートが1つも読み込まれていない');
    const consoleErrs = [...errs].filter((e) => !/Failed to load resource/.test(e));
    if (consoleErrs.length) problems.push(...consoleErrs.slice(0, 4));
    if (fails.size) problems.push(...[...fails].slice(0, 6).map((f) => '通信失敗: ' + f));
    if (problems.length) bad++;
    console.log(`${problems.length ? 'NG' : 'OK'}  ${name}  高さ${info.H}px${problems.length ? '\n      ' + problems.join('\n      ') : ''}`);
  } catch (e) { bad++; console.log(`NG  ${name}  開けない: ${String(e).slice(0, 200)}`); }
  await ctx.close();
}
for (const x of Object.values(launched)) await x.close();
console.log(`\n${BASE}: 問題のあった画面 ${bad}件`);
process.exit(bad ? 1 : 0);
