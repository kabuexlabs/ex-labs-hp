// IndexNow（Bing / Yandex 等）へ URL を一括送信する。ChatGPT 検索は Bing のインデックスを使うため AIO にも効く。
//   node scripts/indexnow.mjs                 … 本番 sitemap.xml の全 URL を送信
//   node scripts/indexnow.mjs /guide/x/ /y/   … 指定 URL だけ送信
// キーは public/8368774548070170873c1a14b2b37dfb.txt として公開済み（IndexNow の所有確認用）。
const KEY = '8368774548070170873c1a14b2b37dfb';
const HOST = 'kabuexlabs.com';
let urls = process.argv.slice(2).map((u) => (u.startsWith('http') ? u : `https://${HOST}${u}`));
if (!urls.length) {
  const sm = await (await fetch(`https://${HOST}/sitemap.xml`)).text();
  urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
const res = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls }),
});
const ok = res.status === 200 || res.status === 202;
console.log(`IndexNow: ${urls.length} URL 送信 → HTTP ${res.status} ${ok ? 'OK' : await res.text()}`);
if (!ok) process.exit(1); // 失敗を GitHub Actions の赤で見えるようにする
