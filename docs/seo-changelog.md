# seo-improve 実行記録（2026-10-18）

ブランチ: `seo/search-improvements-20261018`（分岐点: `9a1d9ed`）。ランブック: `.claude/skills/seo-improve/SKILL.md`（zip 支給。リポジトリにはコミットしていない）。

## 環境（Step 0 調査）

1. **ジェネレータ**: Astro 7（`astro build`、アダプタ `@astrojs/vercel`、`output: 'static'` ＋ 一部ページは `export const prerender = false` でリクエスト時描画）。出力は `.vercel/output/static/`（事前描画 59 HTML）＋ Vercel 関数（SSR ページ）。ローカルプレビューは `npm run preview`（作業用には scratchpad の `prodserve.mjs` で `.vercel/output` を :4400 に配信）。
2. **title / description / og / canonical**: `src/layouts/BaseLayout.astro` 150〜155行で `<title>{title}</title>`・`og:title`・`meta description` を描画。title は各ページが props で手書き（サフィックス ` - 株式会社ex Labs` 込み）。canonical は BaseLayout が `Astro.url.pathname`（末尾スラッシュに正規化）から生成。`/toudaimurder/*` は `ToudaimurderLayout` で、`｜UNLIMITED MYSTERY` サフィックスをテンプレートリテラルで付与。
3. **URL パターン → テンプレート／データ**:
   - `/guide/*`: 個別の `.astro`（84 ファイル）。front matter なし。各ページが `title`・H1・`articleLd`（Article）・`faqs` を自前で持つ。一覧用メタ（href/title/desc/date/category/thumb）は `src/data/guides.ts`。
   - `/services/*`: `src/components/x/ServicePage.astro` ＋ `src/data/services.ts`（`ip` は `serviceIp.ts`）。各ページは `title`/`description`/`serviceLd` を props で渡す。
   - `/toudaimurder/works/[slug]`: `src/data/toudaimurderWorks.ts`（`meta: '5人／180分'`、`details` に料金）。Game ＋ BreadcrumbList の JSON-LD をテンプレートで出力済み。
   - `/toudaimurder/news/[slug]`: `src/data/toudaimurderNews.ts`（`workSlug` があれば記事末尾に「作品ページを見る →」が出る。リリース記事3本はすべて設定済み）。
   - `/events/*`: `src/pages/events/[slug].astro` ＋ `src/data/events/`（works/occurrences/venues/sources/areas）。公演回ごとに Event JSON-LD。
   - トップ: `src/pages/index.astro`（イベント欄・実績・サービス・解説記事は配列から描画）。
4. **ガイドのメタデータ**: front matter なし。日付は各ページの `articleLd.datePublished/dateModified`（手書き）と `guides.ts` の `date`。「関連記事」は `LatestPosts`（カテゴリ自動／`hrefs` 指定）。トップ・各記事末尾の解説記事欄も `guides.ts` 由来。
5. **JSON-LD**: BaseLayout が全ページに WebSite ＋ Organization、`Breadcrumb` コンポーネントが BreadcrumbList、ガイド 85 URL 中 83 が Article（`/guide/` は CollectionPage、`/guide/yougo/` は DefinedTermSet）、FAQ があるページは FAQPage。`src/lib/microcms.ts` の `jsonLd()` で出力。
6. **sitemap lastmod**: `src/pages/sitemap.xml.ts` の手書きマップ（path → 日付）＋ `/events/*` は `work.updatedAt`、ニュースは記事日付、ブログは CMS の `revisedAt`。lastmod の無い URL は `<lastmod>` なし。
7. **`/guide/immersive-tokyo/`**: 公演カレンダー・比較表は `src/data/events/` 由来（`buildGuideRows`／`shows.ts`）。→ P1-1 の Event JSON-LD はデータから生成する。マダミス公演（UNLIMITED MYSTERY）は貸切予約制で日程・会場のデータがないため、P1-3 の比較表・カレンダー・Event JSON-LD は作らない（判断ルール「直書き」相当）。
8. **テスト／監査**: `npm run check` ＝ build ＋ `scripts/seo-audit.mjs`（title/H1/会場名表記などの監査）＋ `test:spam`/`test:week`/`test:events`/`events:validate` ＋ `fanout-audit`。リンター（eslint 等）なし。リンクチェッカーは `scripts/crawl-audit.mjs`（要サーバー）。
9. **改修前の状態**: `/tmp/seo-before/static/`（事前描画 HTML 59 件）、`/tmp/seo-before/sitemap-urls.txt`（サイトマップ 154 URL）、`/tmp/seo-before/snapshot/`（全 154 URL の title/description/canonical/robots/見出し/本文/リンク/構造化データ）。改修前ビルド成功（2026-10-18 07:26）。

### 判断ルールの適用
- front matter なし → `src/data/seoOverrides.ts`（パス → `callout`/`toc`/`author`/`updated` と、callout 定義）を1つ作り、コンポーネントがパスで引く。
- title は手書き・サフィックス込み → BaseLayout に `/guide/*` だけサフィックスを `｜ex Labs` に正規化する処理を1箇所足す（title 本文は変えない）。
- 公演データはデータ由来 → P1-1 の Event JSON-LD は `src/data/events/` から生成。P1-3 はマダミスの日程データがないため title/H1/更新日のみ。
- 関連記事は自動生成（LatestPosts）→ それを使う。
- JSON-LD の仕組みあり（`jsonLd()`・Breadcrumb・各ページ Article）→ 拡張し二重出力しない。
- テストあり → 各タスク後に `node scripts/seo-audit.mjs` と `events:validate`、仕上げで `npm run check`。

## タスク記録
