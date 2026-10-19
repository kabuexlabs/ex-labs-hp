# seo-event-boost 実行記録（2026-10-19）

ブランチ: `event/nov-boost-20261019`（分岐点: `9a1d9ed` = origin/main）。ランブック: `.claude/skills/seo-event-boost/SKILL.md`（zip 支給。リポジトリにはコミットしていない）。

## E0: 調査

1. **ジェネレータ**: Astro 7（`astro build`、`@astrojs/vercel`、`output: 'static'` ＋ 一部ページは `prerender = false` でリクエスト時描画）。出力は `.vercel/output/static/`（事前描画 HTML 59 件）＋ Vercel 関数（SSR ページ）。ローカル確認は scratchpad の `prodserve.mjs`（:4400）
2. **ページ種別ごとのテンプレート／データ**:
   - `/gensou/`: `src/pages/gensou/index.astro`（単独 HTML。EventSeries＋subEvent の JSON-LD、FAQPage を出力済み。予約 URL `RESERVE_URL`、`ogImage`、`description` は定数）。SSR
   - `/taikenbizyutu/7th-composition/`: `src/pages/taikenbizyutu/7th-composition/index.astro`（単独 HTML。Event JSON-LD 出力済み。`TICKET_URL`、`ogImage`、`description` は定数）。静的
   - `/guide/*`: 個別 `.astro`（front matter なし。`src/data/guides.ts` に一覧用メタ、`src/pages/sitemap.xml.ts` に URL と lastmod の手書きマップ、`public/llms.txt`／`llms-full.txt` に案内）。`/guide/yumenoshima-night/` と `/guide/kyoto-kyocera-museum-7th/` は `prerender = false`、末尾は `<AuthorBox />` → `<LatestPosts category="immersive" />`（＝「関連記事」）
   - トップ `/`: `src/pages/index.astro`（SSR）。ヒーローの最後の段落が `<p class="xt-hero-visitor">参加したい方は …開催中の公演を探す →</p>`
3. **seo-improve の部品**: `.claude/skills/seo-improve/` はリポジトリに無い。`GuideCallout`・`seoOverrides.ts`・`docs/seo-changelog.md` は別ブランチ `seo/search-improvements-20261018`（ドラフト PR #128、未マージ）にあり、**main（本ブランチの分岐点）には未実装** → 再利用せず、期限付き告知用の小さなコンポーネント（`src/components/EventNotice.astro` ＋ `src/data/eventNotices.ts`）を1つ作る。PR #128 とはファイル単位で重ならないようにする（`src/pages/index.astro` と `sitemap.xml.ts` は両方が触るが別の行）
4. **JSON-LD の仕組み**: 各ページが `<script type="application/ld+json" set:html={JSON.stringify(...)}>`（LP）または `jsonLd()`（`src/lib/microcms.ts`、ガイド）で出力
5. **ビルド日時**: `src/lib/thisWeek.ts` の `jstDateString(new Date())`（JST の YYYY-MM-DD）。静的ページではビルド時、SSR ページではリクエスト時に評価される → 告知の `until` 判定に使う（SSR ページは期限で自動的に消える。静的ページは再デプロイ時に消える）
6. **改修前ビルド**: 成功（2026-10-19 14:39）。`/tmp/event-before/static/`（事前描画 HTML 59 件）に退避。SSR ページは scratchpad の before スナップショット（`snap-event-before/`）で比較する
7. **テスト／監査**: `npm run check`（build ＋ `scripts/seo-audit.mjs` ＋ テスト ＋ `events:validate` ＋ fanout-audit）、リンクチェッカー `scripts/crawl-audit.mjs --base=…`

### 判断ルールの適用
- front matter なし → 追加セクションは各 `.astro` の本文末尾（`<AuthorBox />` の直前＝「関連記事」の前）に追記。告知はパス→設定のマップ（`src/data/eventNotices.ts`）で有効化
- `guide-callout` なし → 期限付き告知コンポーネントを1つ作る。見た目は挿入先ページに既にあるクラス（トップ `xt-hero-visitor`、公演ページ `ev-notice`、各 LP の既存の段落クラス、ガイドは `key-points`）を流用し、新しい色・余白値は足さない
- ビルド日時を取れる → 告知は `until` を過ぎたら出さない（静的ページは次の再デプロイで消えるため、「人がやること」に確認を入れる）

## タスク記録
