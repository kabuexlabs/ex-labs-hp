# 「東京メトロ陣取り」LP（限定公開・関係者確認用）

- URL（限定公開）：https://kabuexlabs.com/preview/jintori-k40cbdz8/
- 本番URL：未定
- 実装（2026-11-08）
  - `src/lp/jintori/index.html`：ユーザー提供の完成済みLP（1ファイル完結）を**そのまま**置いたもの。デザイン・文言の正本。
  - `src/pages/preview/jintori-k40cbdz8/index.astro`：上の HTML を `?raw` で読み込み、**加工せずに**返すだけ（Astro のテンプレート処理・BaseLayout・SiteGuard を通さない）。配信される HTML は元ファイルとバイト単位で一致することを確認済み。
  - 元ファイルは claude.ai へのアップロード時に外側の `<!doctype html><html>…<body>` と末尾の `</body></html>` で包まれていたので、その包みだけ外した（中身の 2〜679 行目をそのまま）。
- 画像ファイルなし（すべて CSS・インライン SVG）。外部読み込みは Google Fonts のみ。

## 限定公開の仕組み
- URL は推測しにくい `/preview/jintori-k40cbdz8/`。sitemap・llms.txt・ナビ・トップ・お知らせ一覧・他ページからリンクしない。
- 検索対策：HTML 内の `<meta name="robots" content="noindex, nofollow">`（元のまま）＋レスポンスヘッダー `X-Robots-Tag: noindex, nofollow, noarchive`（ページ側と vercel.json の `/preview/(.*)`）。
- CDN にキャッシュさせない：`Cache-Control: private, no-store`（ページ側）＋ middleware の PRIVATE に `/preview/`。
- `Referrer-Policy: no-referrer`：外部（Google Fonts 等）へ URL を送らない。
- アクセス制限：Vercel の環境変数 `JINTORI_PREVIEW_PASSWORD` を設定すると Basic 認証（ユーザー名は任意、パスワードだけ照合）。**リポジトリが公開なので URL だけでは秘密にならない**（GitHub でこのリポジトリを見た人には URL が分かる）。未設定の間は URL を知っていれば誰でも見られる。共有は URL とパスワードを別経路で。

## 文言・デザインを直すとき
- `src/lp/jintori/index.html` を差し替えるだけ（index.astro は触らない）。新しい書き出しで置き換える場合も、外側に余計な包みが付いていないか先頭行を確認する。
- CTA「開催日程・チケットを見る」は現状すべてページ内の `#ticket` へ移動（販売URL未設定）。販売URLが決まったら HTML 側を直す。

## 本番公開するとき
- 本番URLを決め、ページを移動し、旧プレビューURLは vercel.json で 301（言祝ぎの家と同じ手順）。
- noindex（HTML の meta robots・`X-Robots-Tag`・`Cache-Control: private, no-store`）と Basic 認証を外し、canonical・OGP・description を設定する。
- sitemap・llms.txt に登録し、`npm run llms:full`。関連ページから内部リンク。

## 確認すること
- 「東京メトロ」の名称・ブランドカラー（ブライトブルー・路線色）の使用についての許諾・表記ルール（東京メトロ側との取り決め）。
