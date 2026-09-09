# デザイン刷新（2026-09-09）の変更前後記録

目的：参考デザイン（白地・濃紺・グレー、大きな英字見出し、丸いボタン）に寄せる。SEO 要素は変更しない。

## 復元方法（元に戻す手順）

- 変更前のコードは git タグ `pre-design-2026-09-09` に保存。
- 戻す：`git revert <デザイン変更のコミット>` を main に push（Vercel が数分で再デプロイ）。
- 完全に戻す場合：`git checkout pre-design-2026-09-09 -- src/styles/global.css src/layouts/BaseLayout.astro src/components/ZeroCostBanner.astro src/pages/guide/immersive-tokyo.astro` → commit → push。

## 変更範囲

- `src/styles/global.css`：配色トークン（橙→濃紺 #0b47b5、黄→淡青ハイライト、方眼紙の地→白）、角丸（0→12〜16px、ボタンは丸型）、影（ハードなオフセット影→やわらかい影）、見出し（英字を Montserrat・中央揃え、明朝→ゴシック太字）、ヘッダー（罫線を細く、CTA を白丸ボタン）、ヒーロー（白い帯に墨文字、透かし文字を廃止）、塗りセクション（格子模様なしの濃紺）、お問い合わせ（グレー地・黒文字・青ボタン）、フッター（墨色→白）。
- `src/layouts/BaseLayout.astro`：Webフォントの読み込みを Archivo Black＋Shippori Mincho → Montserrat に変更（Noto Sans JP は維持）。右下の「TOP」ボタン（`<a href="#top">`）を追加し、header に `id="top"` を付与。
- `src/components/ZeroCostBanner.astro`、`src/pages/guide/immersive-tokyo.astro`：ページ内スタイルのハード影・墨フチをトークン参照に変更。
- 記事追加・文言変更・URL変更・テンプレート構造の変更・CMS 変更は含まない。

## SEO 要素の前後比較（scripts/seo-snapshot.mjs / seo-snapshot-diff.mjs、24ページ）

- title / meta description / canonical / robots / og / lang：全ページ一致。
- 見出し（h1〜h3 の文言と順序）：全ページ一致。
- 本文（main の innerText）：全ページ一致。
- 内部リンク：全ページで「#top｜TOP」の1件が追加。それ以外は一致。
- 構造化データ：全ページ一致（ハッシュ比較）。
- 画像：/works/ のヘッダー直後のロゴが lazy 読み込み — 変更前から同じ（今回の変更とは無関係、別途報告）。
- 参考：`before/_summary.json`、`after/_summary.json`。

## 表示性能（Lighthouse モバイル、ローカル dev サーバー）

テスト環境の値であり、実利用データ（CrUX）ではない。dev サーバーはバンドル最適化前のため絶対値は本番より悪く出る。前後の相対比較にのみ用いる。数値は `before/lighthouse/_summary.json`、`after/lighthouse/_summary.json`（jsonl は実行ログ）。

| ページ | 性能 前→後 | アクセシビリティ 前→後 | FCP 前→後 | LCP 前→後 | TBT 前→後 | CLS 前→後 |
|---|---|---|---|---|---|---|
| guide_immersive-tokyo | 57→60 | 96→100 | 7.7 s→4.2 s | 11.9 s→12.1 s | 80 ms→240 ms | 0→0 |
| root | 60→60 | 96→100 | 4.2 s→4.0 s | 11.3 s→11.3 s | 200 ms→220 ms | 0→0 |
| services_immersive | 63→64 | 96→100 | 4.2 s→4.2 s | 9.7 s→9.9 s | 130 ms→130 ms | 0→0 |
| works | 61→57 | 96→100 | 4.0 s→7.7 s | 11.6 s→11.6 s | 240 ms→90 ms | 0→0 |

読み：性能スコアと LCP は前後で同水準（dev サーバーの計測ぶれの範囲。FCP が 4秒台⇔7秒台で入れ替わっているのは同じ環境の再計測でも起きるばらつき）。CLS は前後とも 0。アクセシビリティはコントラスト改善により 96→100。

## Search Console

- 直近28日のページ別・クエリ別データは本セッションでは未取得（未確認）。
- 参照できたのは 24時間分の日次エクスポート（docs/seo-data/2026-09-01〜09-07）。9/7 分：クリック 54、表示 1,563、モバイル 48 クリック／PC 6 クリック。
- 公開後は週単位でページ別・クエリ別を比較する（前7日 vs 後7日）。単日の順位変動でデザインが原因と判断しない。

## 未確認事項

- 本番（Vercel）での Lighthouse・CrUX。
- 実機ブラウザ（iOS Safari など）での表示。Playwright の Chromium（390px／1280px）で確認。
- Search Console 28日データ。

## 公開記録

PUBLISH_RECORD
