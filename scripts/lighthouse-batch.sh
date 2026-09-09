#!/usr/bin/env bash
# モバイル条件の Lighthouse を主要ページで実行し、要約を outDir に保存する。
#   scripts/lighthouse-batch.sh <outDir> [baseUrl]
# テスト環境（dev サーバー／ビルド）での測定値であり、実利用データ（CrUX）ではない。
set -u
OUT="$1"; BASE="${2:-http://127.0.0.1:4322}"; mkdir -p "$OUT"
export CHROME_PATH=/opt/pw-browsers/chromium
for p in / /services/immersive/ /works/ /guide/immersive-tokyo/; do
  slug=$([ "$p" = "/" ] && echo root || echo "$p" | sed 's#^/##; s#/$##; s#/#_#g')
  npx --yes lighthouse "$BASE$p" --only-categories=performance,accessibility,best-practices,seo --form-factor=mobile --screenEmulation.mobile --throttling-method=simulate --quiet --chrome-flags="--headless=new --no-sandbox --disable-gpu" --output=json --output-path="$OUT/$slug.json" >/dev/null 2>&1
  node -e '
    const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); const c=r.categories, a=r.audits;
    const g=(k)=>a[k]?a[k].displayValue:"-";
    console.log(JSON.stringify({url:r.finalDisplayedUrl,perf:Math.round(c.performance.score*100),a11y:Math.round(c.accessibility.score*100),bp:Math.round(c["best-practices"].score*100),seo:Math.round(c.seo.score*100),FCP:g("first-contentful-paint"),LCP:g("largest-contentful-paint"),TBT:g("total-blocking-time"),CLS:g("cumulative-layout-shift"),SI:g("speed-index")}));
  ' "$OUT/$slug.json" | tee -a "$OUT/_summary.jsonl"
done
