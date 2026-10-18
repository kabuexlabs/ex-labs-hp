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
### C-1 / C-2 共通部品（コミット `seo(C)`）
- 追加: `src/data/seoOverrides.ts`（callout 定義8種 + パス→`callout`/`toc`/`author`/`updated` のマップ。P2-1 用に `madamis-b2b` も定義）、`src/components/guide/GuideCallout.astro`（`<aside class="guide-callout key-points" aria-label="関連ページ" data-callout=…>`。既存の `.key-points`・`.vc-line` を流用し CSS は追加していない。リンクは既存の `data-track`（/services→`cta`、他→`show`）で計測）、`src/components/guide/GuideMeta.astro`（H1 直下の「最終更新: YYYY年M月D日」と目次。目次項目は H2 の id をページが持つため、ページから `toc` prop で渡す）
- 変更: `src/layouts/BaseLayout.astro`（`/guide/*` のみ `<title>`/`og:title` の末尾 ` - 株式会社ex Labs` → `｜ex Labs`。title 本文は変えない。他ディレクトリは現状維持）、`src/components/AuthorBox.astro`（`author: 'iida-yuki'` のページは「この記事の監修・執筆 飯田雄貴（株式会社ex Labs 代表取締役）」＋ `/company/iida-yuki/` リンク）
- callout の文言: `shisetsu-event` の text はランブック案「周遊型イベントをレベニューシェア（初期費用0円）でも実施できます」をリンク先 `/services/shisetsu-event/` の実際の条件（有料チケット型が対象・施設側の初期費用0円）に合わせ「有料チケット型なら、レベニューシェア（施設側の初期費用0円）でも実施できます。」にした。他7種はランブックどおり（各リンク先の記載と矛盾なし）
- JSON-LD: 全 `/guide/*` に既に Article（84本）と BreadcrumbList（Breadcrumb コンポーネント）が出ているため新設せず（二重出力しない）。`/guide/` は CollectionPage、`/guide/yougo/` は DefinedTermSet のまま
- 確認: ビルド後の全ガイド 85 URL の `<title>` 末尾が `｜ex Labs`（77 ページはサフィックスのみの差分、本文は不変）。`/services/*`・`/toudaimurder/*` などの title は変化なし

### P1-1 `/guide/immersive-tokyo/`（コミット `seo(P1-1)`）
- 変更: `src/pages/guide/immersive-tokyo.astro`、`src/pages/sitemap.xml.ts`（lastmod 2026-10-18）、`scripts/seo-audit.mjs`（title がテンプレートリテラルのページも監査できるよう `${seoYear}` を今年に置換して読む）
- title before: `東京で体験できるイマーシブイベント【2026年最新】｜種類・選び方・注目公演 - 株式会社ex Labs`
- title after: `東京のイマーシブ体験・イマーシブシアター公演一覧【2026年最新】開催日・料金・予約｜ex Labs`（年はビルド時の JST 年 `seoYear`。H1 同文。サフィックス除き42字で付録 B の32字を超えるが、ランブック指定の文言どおり）
- 更新日「最終更新: 2026年10月18日」と目次（10項目: 今週の開催日／比較／選ぶ／開催中／種類／シアター／動向／終了／FAQ／企業向け）を H1 直下（VisualHero の直後）に表示
- 擬似見出し→H2: アコーディオンの `<span class="acc-t">` 7本（人数・好み・参加形式で選ぶ／公演ごとの詳しい紹介／東京のイマーシブ体験の種類／{年}年の東京イマーシブ動向／終了した公演・閉業した施設／よくある質問／イマーシブイベントを開催したい企業・施設の方へ）を `<h2 class="acc-t">` に変更（`.acc-t` に `margin:0` を足して見た目は同じ）。「開催中の公演を表で比較する」「イマーシブシアターを東京で探す」「受付から終了までの流れ」は指定外のため span のまま
- 「東京のイマーシブ体験の種類」の直後に `<h2 id="theater-now">東京でイマーシブシアターを観るなら</h2>` ＋ 開催中公演のうち「俳優と交流する物語体験」形式のものを公演カードへのページ内リンクで案内する段落（公演データの既存の事実のみ）
- Event JSON-LD: 比較表 `compareRows`（開催中・開催予定の東京公演）から ItemList（Event: name/startDate/endDate/eventStatus/eventAttendanceMode/location/image/description/offers/organizer/url）を生成。料金が不明の回は price を省略、全回完売なら availability=SoldOut。終了公演は含めない。京都の公演は Tokyo 向けページのため対象外
- 確認（ビルド後 HTML）: `JSON.parse` 通過、ItemList の Event 数 2 ＝ 比較表の公演数 2（体験型取調室 FACTROOM 2026-10-10〜11-08、午前零時の幻想集 第一夜「草陰の夢」2026-11-05〜11-22）。H2 14本（既存7＋変換7。うち「関連記事」「デート・お出かけで探す」は共通部品）

### P1-2 「とは」ページに一覧への導線（コミット `seo(P1-2)`）
- 変更: `src/pages/guide/{immersive,immersive-theater,immersive-taiken,immersive-event,botsunyukan,immersive-vr}.astro`（title・H1・`articleLd.headline`・`dateModified: 2026-10-18`。immersive-vr は callout のみ）。callout は `seoOverrides.ts` の `callout: 'immersive-tokyo'`
- meta description は現状維持

| ページ | title before | title after | 文字数 |
|---|---|---|---|
| `/guide/immersive/` | イマーシブ（immersive）とは？意味を1分で解説｜読み方・例文・体験事例【制作会社が紹介】 - 株式会社ex Labs | イマーシブ（immersive）とは？意味・読み方・例文を1分で解説｜ex Labs | 34 |
| `/guide/immersive-theater/` | イマーシブシアターとは？東京の公演・料金・楽しみ方を初心者向けに解説 - 株式会社ex Labs | イマーシブシアターとは？意味・特徴・楽しみ方をやさしく解説｜ex Labs | 29 |
| `/guide/immersive-taiken/` | イマーシブ体験とは？種類・事例・楽しみ方と、企業・施設での活かし方 - 株式会社ex Labs | イマーシブ体験とは？種類・楽しみ方・初めての選び方｜ex Labs | 25 |
| `/guide/immersive-event/` | イマーシブイベントとは？企業の活用事例4選と費用・開催の流れ - 株式会社ex Labs | イマーシブイベントとは？種類・事例・企画のポイント｜ex Labs | 25 |
| `/guide/botsunyukan/` | 没入感とは？意味・使い方・例文と言い換え｜没入感を味わえる東京の体験も紹介 - 株式会社ex Labs | 没入感とは？意味・使い方・例文・言い換えを1分で解説｜ex Labs | 26 |
| `/guide/immersive-vr/` | イマーシブとVR・メタバースの違い｜リアル型没入体験の強み - 株式会社ex Labs | イマーシブとVR・メタバースの違い｜リアル型没入体験の強み｜ex Labs | 29 |

- `/guide/immersive/` はランブック指定の文言そのままで34字（32字超）。他は32字以内
- 確認: 6ページの HTML に `data-callout="immersive-tokyo"` が各1つ（同じ GuideCallout コンポーネントから出力）。囲みは定義ボックス＋リード文の直後（スクリーンショットで 390px/1280px を確認）

### P1-3 `/guide/madamis-tokyo/`（コミット `seo(P1-3)`）
- Step 0 のとおり、マダミス公演（UNLIMITED MYSTERY）は貸切予約制で日程・会場・料金のデータファイルがないため、カレンダー・比較表・Event JSON-LD は作らず、title/H1/更新日/callout のみ。**公演データのデータ化が必要**（人がやること）
- 変更: `src/pages/guide/madamis-tokyo.astro`（title・H1・`dateModified`・`<GuideMeta />`）、`src/pages/sitemap.xml.ts`（lastmod 2026-10-18）
- title before: `東京でマダミスを遊ぶには？店舗・公演・オンラインの探し方と初心者の選び方【2026年版】 - 株式会社ex Labs`
- title after: `東京のマダミス公演・店舗一覧【2026年最新】初心者OK・オンラインも｜ex Labs`（ランブック案の「2人から」は本文に2人用の案内がないため入れず「初心者OK・オンラインも」とした。35字）
- 確認: 「最終更新: 2026年10月18日」表示、`data-callout="madamis"` 1つ

### P2-1 `/guide/madamis/` の意図を純化（コミット `seo(P2-1)`）
- 変更: `src/pages/guide/madamis.astro`、`src/pages/guide/madamis-seisaku.astro`（移動先）、`src/pages/guide/madamis-company.astro`（移動先）、`src/pages/sitemap.xml.ts`（3ページ lastmod 2026-10-18）
- 移動: 「マダミスを制作・依頼するには」（`#make`）と「制作現場の知見：企業・施設向けマダミスを設計するときに判断していること」（`#field`）→ `/guide/madamis-seisaku/` の「制作会社の選び方」と FAQ の間（目次にも追加。`.mk-*` のスタイルも一緒に移動）。「提携マダミス会社様」（`<MadamisPartners />`）→ `/guide/madamis-company/` の AuthorBox 直前
- 移動前後の diff（段落単位、22段落）: 完全一致 19、文言調整 2、消失 0。見出し1本は「マダミスを制作・依頼するには（依頼できる内容・相談先）」に改名。調整した2段落は移動先に同等の内容があるため重複を避けたもの: ①費用段落末尾の「…レベニューシェア型（初期費用0円）も選べます。」→「有料チケット型のレベニューシェアを含む料金の考え方は[費用の目安と期間](#cost)にまとめています。」（同ページ `#cost` に同じ RS 条件の箇条書きあり）、②費用カードの「（目安は上記。…）」→「（目安は[費用の目安と期間](#cost)。…）」。`<RevShareCallout>` は移動先ページ冒頭に同じものが既にあるため移動していない
- 移動元には `<GuideCallout callout="madamis-b2b" />`（見出し「企業・施設でマダミスを作りたい方へ」、リンク `/guide/madamis-seisaku/`・`/services/murder-mystery/`）を1つ残した（`#make` の位置）。費用の節にあった `#make` へのページ内リンクは `/guide/madamis-seisaku/#make` に変更
- H2（12本）: マダミスとは → マダミスを体験する → マダミスの遊び方・当日の流れ → マダミスを遊ぶには → 遊ぶときの費用の目安 → マダミスと謎解き・人狼の違い → マダミスの種類 → マダミス用語ミニ辞典 → マダミスの歴史・発祥 → よくある質問 → 関連ガイド → デート・お出かけで探す（末尾の CTA 枠「マダミス制作のご相談はこちら」は既存のまま）
- H1 直後の最初の `<p>`: 「マダミス（マーダーミステリー）とは、参加者が物語の登場人物になりきり、会話と推理で事件の真相を探す体験型の推理ゲームです。」（61字）。更新日は `<div class="guide-updated">` で出すため最初の `<p>` は定義文のまま
- title before: `マダミスとは？遊び方・人数・料金・初心者におすすめの作品を解説 - 株式会社ex Labs` → after: `マダミスとは？意味・遊び方・人数・費用をわかりやすく解説｜ex Labs`（H1・`articleLd.headline` 同文）
- `author: iida-yuki`（末尾「この記事の監修・執筆 飯田雄貴」）、Article の `author` を Person（飯田雄貴, `/company/iida-yuki/`, worksFor 株式会社ex Labs）、`dateModified: 2026-10-18`。`toc: true` だが目次はこのページ既存の `<nav class="toc">`（要点ボックスの下）をそのまま使い、GuideMeta からは更新日のみ出す
- 関連ガイド: `<LatestPosts heading="関連ガイド" hrefs={[asobikata, shoshinsha, nazotoki-chigai, tokyo, cost, rekishi, haishin]} limit={7} />`（既存の自動生成部品）
- 確認: ビルド後 HTML で H2 12本・順序一致、`data-callout="madamis-b2b"` あり、移動先 `/guide/madamis-seisaku/` に `id="make"`・`id="field"`、`/guide/madamis-company/` に `id="partners"`

### P2-2 ピラーへの内部リンク（コミット `seo(P2-2)`）
- `callout: madamis` を `/guide/madamis-*/` 全12ページ（asobikata, shoshinsha, nazotoki-chigai, rekishi, tenpo, haishin, seisaku, company, business, making, cost, kenshu。tokyo は P1-3 で設定済み）に設定。B2B 向け5本（seisaku, company, business, making, cost）は P3-2 の `murder-mystery` と併記、kenshu は `nazotoki-kenshu` と併記
- 作品テンプレート `src/pages/toudaimurder/works/[slug].astro`: INFO ブロック直後に `<p class="syn">マーダーミステリーが初めての方は「<a href="/guide/madamis/">マダミスとは？遊び方・費用の基本</a>」をご覧ください。</p>`（テンプレート共通。個別ページは触っていない）
- `/guide/madamis/` の「関連ガイド」は P2-1 で LatestPosts（hrefs 指定）により生成
- トップ `src/pages/index.astro`: 解説記事欄（`latestGuides`）の先頭に `/guide/madamis/` を固定（ナビは変えない）
- 確認: ビルド後 HTML の `/guide/madamis-*`（13ページ）と `/toudaimurder/works/*`（13作品）すべてで、H1 より後ろ・フッターより前に `href="/guide/madamis/"` が1つ以上ある（不足 0）

### P2-3 「マダミス オンライン」の受け皿（コミット `seo(P2-3)`、changelog のみ）
- `/guide/madamis-haishin/` の本文は「動画・配信用マダミスの制作依頼」（視聴者向け企画・配信準備）で、オンラインで遊ぶマダミスの記事ではない → **変更なし**
- **人がやること**: `/guide/madamis-online/` の新規作成が必要（内容は人が用意。title 案 `オンラインマダミスとは？遊び方・必要なもの・おすすめの作品【{年}年】`）

### P3-1 `/services/nazotoki-kenshu/`（コミット `seo(P3-1)`）
- 変更: `src/data/services.ts`（nazotoki）、`src/components/x/ServicePage.astro`（`hero.h1` があれば H1 にし、従来のキャッチコピー行を `<p class="xs-h1 xs-lead">` に降格。ギャラリーの `desc` を figcaption に表示）、`src/pages/services/nazotoki-kenshu.astro`（Service JSON-LD の `serviceType` に「チームビルディング研修」を追加）
- H1: 「自社の社員研修や採用を『面白い』コンテンツにしませんか？」→ `<p>` に降格し、H1 を `謎解き研修｜チームビルディング研修の企画・制作` に。title は現状維持（`謎解き研修｜体験型チームビルディング研修の企画・制作 - 株式会社ex Labs`）
- H2「プログラム一覧」: 既存プログラムの実施／オリジナル制作の2行（対応人数・所要時間・会場・費用目安・向いている目的）。値は同ページ既存の FAQ・本文（「少人数のチーム単位から数百名規模」「数十万円台〜」「個別にお見積り」「会議室・研修施設・宴会場」）のみ。所要時間は「要相談」
- H2「導入事例・制作実績」（旧「シナリオ制作力の裏付けとなる実績」）: 謎解き研修そのものの公開事例はまだない旨をリード文に明記し、2つの画像事例に文章を追加。出典: 博報堂×紀伊國屋書店「月明かりの書店と呪われた原稿」→ `/works/`（ミステリー原案・閉店後の一夜限りのイベント・営業時間外活用）と `/guide/eigyo-jikangai/`（博報堂様との取り組み、ミステリー原案・体験設計を担当）。「ロスト・フレーム」→ `src/data/taikenbizyutu.ts`（startDate 2026-07-07、endDate 2026-08-31、duration 75分、capacity 1〜4名）、`/taikenbizyutu/lostframe/`、`/guide/case-lostframe/`（全公演完売、自社企画・主催）。新しい数字は作っていない
- Service JSON-LD: 既存（name 謎解き研修、provider 株式会社ex Labs、areaServed JP、url）に `serviceType: ['謎解き研修', 'チームビルディング研修']`
- H2「関連ガイド」: P3-3 の逆引き（`nazotoki-kenshu` callout を持つ5本）＋ 既存の手書き6本（nazotoki-kenshu, nazotoki-company, nazotoki-event, madamis-kenshu, shanai-event, bonenkai-nazotoki）
- 確認: ビルド後 HTML の H1 は1つで「謎解き研修｜チームビルディング研修」を含む。`id="program"` の表と事例文あり。Service JSON-LD `JSON.parse` 通過

### P3-2 B2B ガイドからサービスへの導線（コミット `seo(P3-2)`）
- 設定（`src/data/seoOverrides.ts`）: `nazotoki-kenshu` 5ページ／`event-seisaku` 12ページ／`shisetsu-event` 17ページ／`murder-mystery` 5ページ／`immersive` 4ページ／`hacktale` 7ページ。ランブックの表に挙がったページは全て存在し、スキップなし
- 各ページに `<GuideCallout />` をリード文直後に挿入（import 1行＋タグ1行）。既存の本文末尾 CTA はそのまま
- 確認（ビルド後 HTML の `data-callout` 件数）: shisetsu-event 17、event-seisaku 12、hacktale 7、nazotoki-kenshu 5、murder-mystery 5、immersive 4（いずれも設定ページ数と一致）。参考: madamis 13（P2-2）、immersive-tokyo 6（P1-2）

### P3-3 `/services/*` から関連ガイドへの逆リンク（コミット `seo(P3-3)`）
- 変更: `src/components/x/ServicePage.astro`（`SERVICE_CALLOUT`（nazotoki→nazotoki-kenshu、murder→murder-mystery、shisetsu→shisetsu-event、immersive→immersive、zunousen→hacktale）で `guidesWithCallout()` を逆引きし、既存の手書きリストの後ろに自動で追加。ラベルは `guides.ts` の title の「｜」より前）、`src/pages/services/index.astro`（`event-seisaku` の12本を「関連する解説記事」として末尾に追加）
- 確認: `/services/shisetsu-event/` の関連ガイドに `shisetsu-event` の17ページ全部、`/services/nazotoki-kenshu/` 5/5、`/services/murder-mystery/` 5/5、`/services/immersive/` 4/4、`/services/zunousen/` 7/7、`/services/` 12/12

### P4-1 作品テンプレート `/toudaimurder/works/*`（コミット `seo(P4-1)`）
- 変更: `src/pages/toudaimurder/works/[slug].astro`（title・description・Game JSON-LD・BreadcrumbList）。作品データは触っていない
- title: `{作品名}｜東大マダミス UNLIMITED MYSTERY｜{人数}人・{時間}分のマーダーミステリー`（人数・時間は `meta`（例 `5人／180分`）から。無ければ後半を省略）。例: `あるマーダーミステリーについて｜東大マダミス UNLIMITED MYSTERY｜5人・150分のマーダーミステリー` と `あるマーダーミステリーについて2｜…｜5人・180分のマーダーミステリー`
- H1: 作品名のまま（変更なし）
- description: 文頭に作品名、「東大マダミス（UNLIMITED MYSTERY）制作のマーダーミステリー。{人数}人・{時間}分。…」（155字で切る）
- JSON-LD: 既存の Game に `alternateName`（「{作品名}（東大マダミス）」「{作品名}（マダミス）」）、`author` を 東大マダミス UNLIMITED MYSTERY（`/toudaimurder/`）、`publisher` 株式会社ex Labs。BreadcrumbList を ホーム → 東大マダミス UNLIMITED MYSTERY → マーダーミステリー作品一覧 → 作品名 に
- `/toudaimurder/news/*-release/` → 作品ページ: 記事データ `workSlug` により既に「作品ページを見る →」が出ているため変更なし
- 確認: 13作品すべて title が作品名で始まり、Game の `name` ＝ H1、`arumadamisu` と `arumadamisu2` の title が区別できる

### P4-2 他ブランドの作品・公演ページ（コミット `seo(P4-2)`）
- title の先頭が作品名でなかった5ページ（`/gensou/` `/kaitou/` `/karma/` `/uwasabanashi/` `/uwasabanashi/kotohogi/`）は「【公式】」が先頭だったため、作品名の直後に移動（サフィックス・区切りは既存のまま）。変更ファイル: `src/pages/{gensou,kaitou,karma,uwasabanashi,uwasabanashi/kotohogi}/index.astro`
- JSON-LD: `/events/*` はテンプレートで Event 出力済み。`/hacktale/works/*` は個別 `.astro` だが Game 出力済み。`/uwasabanashi/kotohogi/` は構造化データなし、`/taikenbizyutu/*`・`/uwasabanashi/`・`/karma/`・`/kaitou/`・`/gensou/`・`/anator/` は個別 HTML（LP）で各自の Event/TheaterEvent/EventSeries を持つ → **要個別対応**（テンプレート化はしない）
- `/anator/` と `/uwasabanashi/` は H1 に文字がない（画像のみ）、`/karma/` は H1 がキャッチコピー。本タスクは title のみのため変更せず記録

| URL | title（修正後） | H1 | JSON-LD | 備考 |
|---|---|---|---|---|
| `/anator/` | ANATOR｜少人数密室型イマーシブ空間 |  | TheaterGroup+PerformingArtsTheater | 個別 HTML → 要個別対応 |
| `/events/` | 今日できるイマーシブ｜東京で今日・明日・今週末に参加できる公演を探す - 株式会社ex Labs | 今日できるイマーシブを​探す東京の​今日・明日・今週末の​公演 | Organization+WebSite+FAQPage+CollectionPage+BreadcrumbList | 一覧・案内ページ（対象外） |
| `/events/7th-composition/` | 体験する美術館「7枚目のコンポジション」｜開催日程・料金・予約先（京都・京都市・岡崎） - 株式会社ex Labs | 体験する美術館「7枚目のコンポジション」 | Organization+WebSite++BreadcrumbList | テンプレート（Event JSON-LD 出力済み） |
| `/events/about/` | 公演情報サービスについて｜掲載基準・運営者・修正依頼 - 株式会社ex Labs | 公演情報サービスについて | Organization+WebSite+BreadcrumbList | 一覧・案内ページ（対象外） |
| `/events/factroom/` | 体験型取調室 FACTROOM｜開催日程・料金・予約先（東京・神田） - 株式会社ex Labs | 体験型取調室 FACTROOM | Organization+WebSite+BreadcrumbList | テンプレート（Event JSON-LD 出力済み） |
| `/events/gensou/` | 午前零時の幻想集 第一夜「草陰の夢」｜開催日程・料金・予約先（東京・新木場・夢の島） - 株式会社ex Labs | 午前零時の幻想集 第一夜「草陰の夢」 | Organization+WebSite++BreadcrumbList | テンプレート（Event JSON-LD 出力済み） |
| `/events/kaitou/` | 怪盗と秘密の試験｜開催日程・料金・予約先（東京・六本木） - 株式会社ex Labs | 怪盗と秘密の試験 | Organization+WebSite+BreadcrumbList | テンプレート（Event JSON-LD 出力済み） |
| `/events/kotohogi/` | ウワサバナシ調査委員会 case2「言祝ぎの家 -呪われた花嫁-」｜開催日程・料金・予約先（埼玉・さいたま市） - 株式会社ex Labs | ウワサバナシ調査委員会 case2「言祝ぎの家 -呪われた花嫁-」 | Organization+WebSite++BreadcrumbList | テンプレート（Event JSON-LD 出力済み） |
| `/events/uwasabanashi/` | ウワサバナシ調査委員会｜開催日程・料金・予約先（東京・渋谷） - 株式会社ex Labs | ウワサバナシ調査委員会 | Organization+WebSite+BreadcrumbList | テンプレート（Event JSON-LD 出力済み） |
| `/gensou/` | 午前零時の幻想集 第一夜「草陰の夢」【公式】｜ 夢の島熱帯植物館の夜のイマーシブ体験 | 午前零時の幻想集 第一夜「草陰の夢」× 夢の島熱帯植物館 | EventSeries+FAQPage | title 先頭の【公式】を作品名の後ろへ（個別 HTML） |
| `/hacktale/works/` | 作品一覧 WORKS ｜ ハックテイル | WORKS作品一覧 | BreadcrumbList+ItemList+BreadcrumbList | 一覧・案内ページ（対象外） |
| `/hacktale/works/dice-box/` | ダイスボックス THE DICE BOX ｜ ハックテイル | ダイスボックス | BreadcrumbList+Game+BreadcrumbList | 個別 HTML（Game JSON-LD 出力済み） |
| `/hacktale/works/present-poker/` | プレゼント・ポーカー ｜ ハックテイル | プレゼント・ポーカー | BreadcrumbList+Game+BreadcrumbList | 個別 HTML（Game JSON-LD 出力済み） |
| `/hacktale/works/werewolf-theorem/` | 人狼定理 WEREWOLF THEOREM ｜ ハックテイル | 人狼定理 | BreadcrumbList+Game+BreadcrumbList | 個別 HTML（Game JSON-LD 出力済み） |
| `/kaitou/` | 怪盗と秘密の試験【公式】｜ イマーシブイリュージョン | 怪盗と秘密の試験 | TheaterEvent+FAQPage | title 先頭の【公式】を作品名の後ろへ（個別 HTML） |
| `/karma/` | 臓腑、或いはカルマ【公式】｜ 体験型取調室 FACT ROOM | 「その言葉は、予言か。殺意か。」 | TheaterEvent+FAQPage | title 先頭の【公式】を作品名の後ろへ（個別 HTML） |
| `/taikenbizyutu/` | 体験する美術館｜参加型アート・周遊型の物語体験｜絵画×物語×街歩き謎解き | 体験する美術館｜下北沢の街を巡る参加型アート・周遊型の物語体験｜絵画と物語、街歩き謎解きの体験 | Organization+FAQPage+Event | 個別 HTML → 要個別対応 |
| `/taikenbizyutu/7th-composition/` | 体験する美術館「7枚目のコンポジション」公式サイト｜京都市京セラ美術館 2026.11.21–23 | 体験する美術館「7枚目のコンポジション」 | Event | 個別 HTML → 要個別対応 |
| `/taikenbizyutu/lostframe/` | ロスト・フレーム Lost Frame｜下北沢を巡る周遊型の物語体験・街歩き謎解き｜体験する美術館 | ロスト・フレーム Lost Frame｜下北沢の街を巡る周遊型の物語体験・街歩き謎解き｜体験する美術館 | Organization+Event+BreadcrumbList | 個別 HTML → 要個別対応 |
| `/taikenbizyutu/news/lostframe-soldout/` | 『ロスト・フレーム』全公演 完売のお知らせ｜体験する美術館 | 『ロスト・フレーム』全公演 完売のお知らせ | Organization+NewsArticle+BreadcrumbList | 一覧・案内ページ（対象外） |
| `/uwasabanashi/` | ウワサバナシ調査委員会【公式】｜ イマーシブ公演 |  | TheaterEvent+FAQPage | title 先頭の【公式】を作品名の後ろへ（個別 HTML） |
| `/uwasabanashi/iinkai/` | ウワサバナシ調査委員会とは｜活動内容と調査記録 case1・case2 |  | CollectionPage+VideoObject | 一覧・案内ページ（対象外） |
| `/uwasabanashi/kotohogi/` | ウワサバナシ調査委員会 case2「言祝ぎの家」【公式】｜さいたま市の一軒家で体験するイマーシブホラー | ウワサバナシ調査委員会case2「言祝ぎの家」呪われた花嫁 | — | title 先頭の【公式】を作品名の後ろへ（個別 HTML） |

### P5 辞書系は守りだけ（コミット `seo(P5)`、changelog のみ）
1. C-2 の title サフィックス短縮・Article・BreadcrumbList は有効（C-1/C-2 参照）
2. サフィックスを除いた title が全角32文字を超える `/guide/*`（変更していない。P1・P2 で指定したページは指定の文言）:

| URL | 文字数 | title |
|---|---|---|
| `/guide/tokyo-friends-activities/` | 34 | 東京で友達と遊ぶ体験｜2〜4人で楽しめる屋内・謎解き・物語体験を比較｜ex Labs |
| `/guide/tokyo-nazo-date/` | 34 | 東京で二人で参加できる謎解き・脱出ゲーム｜貸切・料金・所要時間で比較｜ex Labs |
| `/guide/saiji-kikaku/` | 35 | 催事の企画・やり方｜百貨店・商業施設で集客につながる体験型催事の進め方｜ex Labs |
| `/guide/shanai-quiz/` | 35 | 社内イベントで盛り上がるクイズ・ゲーム企画｜人数別の選び方と進行のコツ｜ex Labs |
| `/guide/madamis-tenpo/` | 36 | 飲食店・バー・ホテルへのマダミス導入｜貸切公演・常設・宿泊プランの進め方｜ex Labs |
| `/guide/event-original-or-existing/` | 34 | 体験型イベントはオリジナル制作か既存導入か｜費用・納期・自由度を比較｜ex Labs |
| `/guide/event-revenue-share/` | 33 | 施設イベントのレベニューシェアとは｜費用回収・売上分配・負担を解説｜ex Labs |
| `/guide/` | 44 | 解説記事・完全ガイド一覧｜イマーシブ・マダミス・頭脳戦・心理戦・施設活用・体験型イベント - 株式会社ex Labs |
| `/guide/immersive-tokyo/` | 42 | 東京のイマーシブ体験・イマーシブシアター公演一覧【2026年最新】開催日・料金・予約｜ex Labs |
| `/guide/yukyu-kukaku/` | 34 | 遊休区画・空きスペースの活用アイデア｜体験型イベントで目的地に変える｜ex Labs |
| `/guide/taikengata-idea/` | 38 | 体験型イベントの企画アイデア15選｜盛り上がる・集客できる企画を目的別に解説｜ex Labs |
| `/guide/event-hiyou/` | 41 | 体験型イベントの費用・料金相場｜謎解き・マダミス・イマーシブ・頭脳戦を規模別に解説｜ex Labs |
| `/guide/madamis-rekishi/` | 41 | マーダーミステリーの歴史とは？起源・海外との違い・日本での広がりと2026年の動向｜ex Labs |
| `/guide/madamis-tokyo/` | 35 | 東京のマダミス公演・店舗一覧【2026年最新】初心者OK・オンラインも｜ex Labs |
| `/guide/zunousen-sakuhin/` | 39 | 頭脳戦・心理戦が面白い漫画・アニメ・映画おすすめ15選｜リアルで体験する方法も｜ex Labs |
| `/guide/shinrisen-game/` | 34 | 心理戦ゲームとは？おすすめ10選と種類・選び方・イベントでの活かし方｜ex Labs |
| `/guide/madamis-nazotoki-chigai/` | 35 | マダミスと謎解きの違いとは？イマーシブ・頭脳戦・人狼との比較表と選び方｜ex Labs |
| `/guide/yougo/` | 39 | 体験型イベント用語集｜イマーシブ・マダミス・頭脳戦・心理戦・施設活用の用語解説｜ex Labs |
| `/guide/sankagata-event/` | 45 | 参加型イベントとは？体験型との違い・種類・企業の実例・盛り上がる企画の方法を制作会社が解説｜ex Labs |
| `/guide/shinrisen/` | 44 | 心理戦とは？意味・頭脳戦との違い・強い人の特徴・おすすめゲームを頭脳戦専門レーベルが解説｜ex Labs |
| `/guide/saiji/` | 45 | 催事とは？意味・読み方・ポップアップとの違い・集客できる体験型催事の企画例【2026年版】｜ex Labs |
| `/guide/halloween-event/` | 48 | ハロウィンイベントの企画アイデア12選【2026年】｜商業施設・店舗・社内で盛り上がる体験型企画｜ex Labs |
| `/guide/madamis-shoshinsha/` | 37 | マダミス初心者完全ガイド｜恥ずかしい？何時間かかる？不安解消と作品の選び方｜ex Labs |
| `/guide/shanai-event/` | 36 | 社内イベントの企画アイデア20選｜体験型で盛り上がる懇親会・全社会・研修｜ex Labs |
| `/guide/kisetsu-event/` | 33 | 商業施設の季節イベント企画｜ハロウィン・クリスマスを体験型で集客に｜ex Labs |
| `/guide/case-uwasabanashi/` | 36 | イマーシブイベント制作事例：渋谷サクラステージ「ウワサバナシ調査委員会」｜ex Labs |
| `/guide/case-lostframe/` | 40 | 街歩き型イマーシブ制作事例：下北沢「ロスト・フレーム」｜街を美術館にした周遊企画｜ex Labs |
| `/guide/bonenkai-nazotoki/` | 36 | 忘年会の食事と謎解きを、どう組み合わせるか｜着席・立食の進め方と担当範囲｜ex Labs |
| `/guide/yumenoshima-night/` | 51 | 夢の島熱帯植物館の夜イベント｜物語体験「午前零時の幻想集」の日程・チケット・行き方（2026年11月）｜ex Labs |
| `/guide/kyoto-kyocera-museum-7th/` | 57 | 京都市京セラ美術館のイベント｜体験する美術館「7枚目のコンポジション」の日程・チケット・行き方（2026年11月）｜ex Labs |
| `/guide/immersive/` | 34 | イマーシブ（immersive）とは？意味・読み方・例文を1分で解説｜ex Labs |
| `/guide/ip-multi-site/` | 40 | IPを活用した体験型イベントの全国・複数施設展開｜企画・施設調整・運営・効果測定｜ex Labs |
| `/guide/tokyo-holiday/` | 35 | 東京で休日に行く場所がないときの過ごし方｜二人・友達・一人で体験を比較｜ex Labs |
| `/guide/tokyo-before-dating/` | 38 | 東京で付き合う前に行きたいデート｜会話が自然に生まれる体験を料金・時間で比較｜ex Labs |

3. 対応状況の確認: `/guide/botsunyukan/` `/guide/immersive/` は P1-2（callout immersive-tokyo・title 変更）、`/guide/saiji/` `/guide/shuyu-event/` `/guide/popup-event/` `/guide/sankagata-event/` `/guide/taikengata-event/` は P3-2（shisetsu-event／event-seisaku の callout）、`/guide/shinrisen/` `/guide/zunousen/` 系7本は P3-2 の `hacktale` で対応済み
- 確認: `/guide/madamis/` `/guide/immersive-tokyo/` `/guide/madamis-tokyo/` の Article JSON-LD が `JSON.parse` 通過、`dateModified` 2026-10-18 ＝ 表示中の `<time datetime>` 2026-10-18

## 仕上げ（検証結果）

1. **ビルド**: `npm run check`（build ＋ seo-audit ＋ test:spam/week/events ＋ events:validate ＋ fanout-audit）成功（2026-10-18 07:58。レビュー修正後に build・seo-audit・crawl-audit を再実行し成功 08:11）。seo-audit「エラーなし（警告 117 件）」、公演データ検証「エラーなし」。fanout-audit の不足 52 項目は改修前からの既存指摘で、本ブランチでは触っていない
2. **URL 不変**: 事前描画 HTML 59 → 59（消えたファイル 0、増えたファイル 0）。サイトマップ 154 URL → 154 URL（増減 0）
3. **リンク切れ**: `node scripts/crawl-audit.mjs --base=http://127.0.0.1:4400` → 「154 URL（sitemap）＋ 5 URL（非公開）をクロール／問題なし」。追加したリンク（callout・関連ガイド・/guide/madamis/・/guide/madamis-seisaku/#make など）に 404 なし
4. **title/H1 監査**: `docs/seo-title-audit.csv`（154 URL。列: URL, title, H1, title文字数(サフィックス除く), H1数）。H1 が2つ以上のページ 0、title が空のページ 0。title を変えたページ 103（うちサフィックスのみ `｜ex Labs` 化 77、本文を変えたもの 26 = P1-1 1 ＋ P1-2 5 ＋ P1-3 1 ＋ P2-1 1 ＋ P4-1 13 ＋ P4-2 5）
5. **JSON-LD**: 全 154 ページの `application/ld+json` が `JSON.parse` を通過（エラー 0）。`@type` 別件数: Organization 137、BreadcrumbList 138、WebSite 110、FAQPage 95、Article 84、DefinedTerm 18、Game 17、CollectionPage 8、ItemList 7（うち Event を含む ItemList 1 = immersive-tokyo の Event 2 件、NewsArticle 3 件）、Service 6、NewsArticle 5、Event 4、TheaterEvent 3、DefinedTermSet 1、Person 1、ProfilePage 1、VideoObject 1、TheaterGroup 1、PerformingArtsTheater 1、EventSeries 1
6. **sitemap lastmod**: `src/pages/sitemap.xml.ts` の手書きマップ（path → 日付）で決まり、`/events/*` は `work.updatedAt`、ニュースは記事日付、ブログは CMS の `revisedAt`。154 URL 中 123 に `<lastmod>` あり。今回 title・本文を変えたガイド5本（madamis, madamis-tokyo, immersive-tokyo, madamis-seisaku, madamis-company）は 2026-10-18 に更新。P1-2 の5ページもレビュー後に 2026-10-18 に揃えた（`dateModified` を変えたため）。`/toudaimurder/works/*`（lastmod なし）、`/services/nazotoki-kenshu/`（2026-09-28）、P4-2 の LP は lastmod を変えていない（title/JSON-LD のみの変更のため。更新したい場合は同マップに日付を足す）
7. **レビュー**: サブエージェント1つで `git diff 9a1d9ed..HEAD` をランブックの「変更してはいけないもの」と各完了条件に照らして検査。結果「ブロッカーなし」。指摘7件のうち正しさ・要件に関わる6件を修正（タスク別に `seo(…): レビュー修正` コミット）、1件（CSV 未コミット）は仕上げコミットで解消:
   1. Article `headline` が新しい H1 と不一致（immersive-tokyo, madamis-tokyo, immersive, immersive-theater, immersive-taiken, immersive-event, botsunyukan の7ページ）→ H1 と同文に（一覧2ページは `${seoYear}`）
   2. immersive-tokyo の「東京でイマーシブシアターを観るなら」の本番側の分岐（シアター形式の開催中公演が0件のとき）で「下の『イマーシブシアターを東京で探す』」と書いていたが、そのアコーディオンは上にある → `#theater` へのリンクに変更
   3. Event JSON-LD の `addressLocality`（区名）がページ内の直書き表だった → データにない項目は省略するルールに合わせ削除（`streetAddress`・`addressRegion` 東京都・`addressCountry` JP は維持）
   4. 謎解き研修のプログラム表「数十万円台〜（税抜。…）」の「税抜」が同ページに根拠なし → 削除（changelog P3-1 の記載も修正）
   5. `/guide/madamis-tokyo/` の `madamis` 囲みに自ページへのリンク「東京の公演を探す」が出ていた → GuideCallout で自ページへのリンクを除外
   6. P1-2 の5ページは `dateModified` を 2026-10-18 にしたのに sitemap lastmod が旧日付 → 2026-10-18 に揃えた
   - 対応不要とした指摘: madamis-tokyo の title で「2人から」を外した点（本文に2人用の案内がないため、記録済み）、immersive-tokyo の description に残る【2026年最新】（P1-1 の対象外）
   - 再レビューは行っていない（修正は1〜2行の差分のみで、ビルド・監査・リンクチェックを再実行して確認）
8. **引き渡し**: `origin`（github.com/kabuexlabs/ex-labs-hp）へ `seo/search-improvements-20261018` を push し、ドラフト PR を作成（URL は PR 欄参照）。マージ・デプロイはしていない

## 人がやること

1. `/guide/madamis-online/` の新規作成（P2-3。`/guide/madamis-haishin/` は配信用制作の記事のため受け皿にならない。内容は人が用意）
2. マダミス公演（東大マダミス UNLIMITED MYSTERY）の日程・会場・料金のデータ化（P1-3。`src/data/events/` に載れば `/guide/madamis-tokyo/` に比較表・カレンダー・Event JSON-LD を出せる）
3. `/taikenbizyutu/*` `/uwasabanashi/*` `/karma/` `/kaitou/` `/gensou/` `/anator/` の JSON-LD は個別 HTML（LP）のため要個別対応（P4-2）。`/uwasabanashi/kotohogi/` は構造化データなし
4. `/guide/madamis/` の「この記事の監修・執筆 飯田雄貴」は seoOverrides の `author: 'iida-yuki'` で表示している。事実（実際に監修・執筆しているか）の確認
5. P5 の一覧にある32字超の title（34ページ）は変更していない。短くする場合は個別に判断
6. 効果測定: 4〜6週間後（2026-11-15〜11-29 ごろ）に Search Console で「体験探し群（イマーシブ体験 東京／イマーシブシアター 東京 など）の6位以下の語の順位」「マダミス一般（マダミスとは／マダミス）の平均順位」「B2B 群（謎解き研修／商業施設 集客イベント など）の平均順位」「作品名クエリの CTR」を改修前（2026-10-18 以前の同期間）と比較

## 成果物

- ブランチ `seo/search-improvements-20261018`（分岐点 `9a1d9ed`、タスクごとのコミット＋レビュー修正コミット）
- `docs/seo-changelog.md`（本ファイル）、`docs/seo-title-audit.csv`（154 URL の title/H1 監査）
- 改修前の出力: `/tmp/seo-before/`（セッション内のみ。リポジトリには含めない）
