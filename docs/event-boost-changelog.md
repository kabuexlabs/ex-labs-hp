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

### E1 Event JSON-LD（コミット `event(E1)`、changelog のみ）
- `/gensou/`: 既に `EventSeries`（name「午前零時の幻想集 第一夜「草陰の夢」」、startDate 2026-11-05T17:00+09:00、endDate 2026-11-22T20:50+09:00、eventStatus/eventAttendanceMode、location 夢の島熱帯植物館（〒136-0081 江東区夢の島2-1-2）、image=og:image、description=meta description、offers 個別3,500円／グループ14,000円（escape.id の URL）、organizer 株式会社ex Labs、url）＋ 12日分の `subEvent`（Event）を出力している。ランブックの雛形と同じ項目を満たすため、**二重出力を避けて追加しない**
- `/taikenbizyutu/7th-composition/`: 既に `Event`（name「体験する美術館「7枚目のコンポジション」」、2026-11-21T12:00〜2026-11-23T17:30+09:00、location 京都市京セラ美術館（606-8344 岡崎円勝寺町124）、image、description、offers 4,500円・validFrom 2026-10-17T19:00+09:00、organizer、url。performer なし）を出力している → 追加しない
- 確認: 改修前ビルドの HTML から両ページの JSON-LD を `JSON.parse` → 通過。`name` が H1（「午前零時の幻想集 第一夜「草陰の夢」× 夢の島熱帯植物館」「体験する美術館「7枚目のコンポジション」」）に含まれる。HTML の差分なし
- **提案（既存行の変更になるため実施していない）**: 両ページの `offers` に `availability: https://schema.org/InStock` と、7枚目の offer に `name`（1名チケット）を足す。`/gensou/` の個別チケット offer に `validFrom` は不明のため不要

### E2 ガイド2ページへの追記（コミット `event(E2)`）
- 変更: `src/pages/guide/yumenoshima-night.astro`（+37行）、`src/pages/guide/kyoto-kyocera-museum-7th.astro`（+47行）。いずれも**追加行のみ**（`git diff` で削除行 0）。追加位置は本文末尾（`<AuthorBox />` の直前。その次が「関連記事」`<LatestPosts>`）。目次の配列に3項目、scoped CSS に `scroll-margin-top` の既存値（88px）の行を1行追加
- `articleLd.dateModified` と FAQPage JSON-LD は既存行のため変えていない（**提案**: `dateModified` を 2026-10-19 に、追加した FAQ を `faqLd` に含める）。sitemap の lastmod は 2026-10-19 に更新（`src/pages/sitemap.xml.ts`、E4 コミットに含む）

#### E2-A `/guide/yumenoshima-night/` に追加した H2
1. 「夢の島熱帯植物館の基本情報（通常開館時）」— 表（開館時間／休館日／入館料／住所・電話／鉄道／バス／駐車場／公式サイト・公式X）
2. 「夜の植物館に入れるのはいつ？」— 4文
3. 「よくある質問（会場・アクセス）」— 5問

| 追記した事実 | 事実データの項目 |
|---|---|
| 開館時間 9:30〜17:00（入館は16:00まで） | 会場A 開館時間 |
| 休館日 月曜（祝日の場合は翌日）、12/29〜1/3 | 会場A 休館日 |
| 入館料 大人250円・65歳以上120円・中学生100円・小学生以下無料・都内在住在学の中学生無料 | 会場A 入館料 |
| 〒136-0081 東京都江東区夢の島2-1-2（夢の島公園内）、03-3522-0281 | 会場A 住所 |
| 新木場駅（JR京葉線・東京メトロ有楽町線・りんかい線）徒歩約15分／東陽町駅から都バス新木場駅行き「夢の島」下車 徒歩約7分 | 会場A アクセス |
| 第1駐車場（有料・352台）・第2駐車場（有料・103台）、第1駐車場は工事で一部閉鎖の告知 → 公式サイトで確認 | 会場A 駐車場 |
| 公式サイト https://www.yumenoshima.jp/botanicalhall、公式X @yumenetsu | 会場A 公式 |
| 公演は17:00〜20:50、最終回20:00開始・20:50終了予定、チケットは税込・入館料込（個別3,500円／グループ14,000円） | 公演A 時間・料金 |
| 対象 中学生以上（18歳未満は保護者同伴） | 公演A 対象 |

#### E2-B `/guide/kyoto-kyocera-museum-7th/` に追加した H2
1. 「京都市京セラ美術館の基本情報」— 表（開館時間／休館日（11/23は開館）／住所／アクセス／公式サイト・イベント一覧）
2. 「同じ日に楽しめる、同じ美術館・同じエリアの催し」— 「禅とジブリ」京都展、永観堂ライトアップ（H3）＋ E4 の新規ページへのリンク
3. 「よくある質問（会場・チケット）」— 5問

| 追記した事実 | 事実データの項目 |
|---|---|
| 開館時間 10:00〜18:00（最終入場は展覧会により異なる） | 会場B 開館時間 |
| 休館日 月曜（祝・休日は開館）、12/28〜1/2、11/23(月・祝)は開館 | 会場B 休館日 |
| 〒606-8344 京都市左京区岡崎円勝寺町124 | 会場B 住所 |
| 地下鉄東西線「東山駅」1番出口 徒歩約8分／市バス「岡崎公園 美術館・平安神宮前」下車すぐ | 会場B アクセス |
| 公式サイト https://kyotocity-kyocera.museum/ ・イベント一覧 /event | 会場B 公式 |
| 「禅とジブリ」京都展: 新館 東山キューブ、10/3〜12/6、10:00〜18:00（入場は閉館30分前）、一般・大学生1,900円、10/31から予約優先制（10/14付告知）、11/23開館、公式 https://www.ghibli.jp/event/zen/ | 周辺催事 |
| 永観堂ライトアップ: 11/20〜12/6、17:30〜20:30（受付20:30終了）、中学生以上1,000円、同じ岡崎・東山エリアで徒歩圏 | 周辺催事 |
| 公演の最終回は17:30終了、ライトアップの受付開始は17:30 | 周辺催事（この時刻だけ） |
| 公演は本館地下1階・別チケット・1名4,500円（税込）・別途入館料不要・各回最大18名（最少催行12名）・各日12:00〜17:30に7回（各60分） | 公演B |
| 最少催行人数に満たない場合の扱い → 公式ページの案内を確認 | 公式ページの注意事項に「最少催行人数に満たない場合の実施判断・連絡・返金」が列挙されているのみのため |
- 永観堂の公式サイト URL は事実データに無いためリンクしていない（**人がやること**: 必要なら追加）

### E3 期限付き告知（コミット `event(E3)`）
- 追加: `src/data/eventNotices.ts`（告知4種とパス→告知のマップ、`until`）、`src/components/EventNotice.astro`（パスで引き、`jstDateString(new Date())` が `until` を過ぎたら何も出さない。見た目は `class`／`style` で挿入先の既存クラス・既存のインライン値を流用。スタイルは持たない）
- 挿入（各ページ import 1行＋タグ1行の追加のみ。削除行 0）:

| ページ | 告知 | 位置 | 流用したクラス／値 | 判定 |
|---|---|---|---|---|
| `/` | 11月開催: …「午前零時の幻想集」（11/5〜22）／…「7枚目のコンポジション」（11/21〜23） | ヒーロー最後の段落「参加したい方は…」の直後 | `xt-hero-visitor`、リンク `x-link-lime` | SSR（期限で自動的に消える） |
| `/events/factroom/` | 次の公演: …「午前零時の幻想集」11/5〜22 | 概要段落の直後（`src/pages/events/[slug].astro`。データで factroom だけ有効） | `ev-notice`（終了公演の注意書きと同じ） | SSR |
| `/uwasabanashi/` | 同上 | KV のキャッチ＋日程・会場の直後 | `kvvenue` | SSR |
| `/uwasabanashi/kotohogi/` | 同上 | 紹介段落の直後 | 同じ段落のインライン値（margin:0;font-size:14px;line-height:2.05;letter-spacing:.04em） | SSR |
| `/kaitou/` | 同上 | ヒーローの日程・会場（hero-meta）の直後、CTA の前 | `story-p serif` | SSR |
| `/karma/` | 同上 | リード段落（lead-p）の直後 | `lead-p` | 静的（再デプロイで消える） |
| `/anator/` | 同上 | ヒーローのタグラインの直後 | `hero-reading` | 静的 |
| `/taikenbizyutu/lostframe/` | 次回公演: 京都市京セラ美術館「7枚目のコンポジション」11/21〜23 | 完売案内の直後 | `lpnote`、リンク `lpnote-link` | 静的 |
| `/guide/case-lostframe/` | 同上 | リード文の直後 | `key-points` | SSR |
| `/guide/tokyo-nazo-date/` `/guide/shibuya-rainy-date/` `/guide/kisetsu-event/` | 11月限定: 夜の植物館に入れる物語体験「午前零時の幻想集」（新木場・11/5〜22） | リード文の直後 | `key-points` | SSR |

- 挿入しなかったページ（改修前ビルドを Playwright で 1280×900／390×844 表示し、公演へのリンクの位置を測定）:
  - `/taikenbizyutu/`: ヒーローのキービジュアルが `/taikenbizyutu/7th-composition/` へのリンク（desktop y=543、mobile y=422。最初の画面内）
  - `/events/`: 冒頭のスケジュール欄に幻想集の予約リンク（mobile y=800 で最初の画面内。desktop y=1125 で最初の H2 直下）
  - `/works/`: 冒頭の Featured 枠に `/gensou/`・7枚目へのリンク（desktop y=903、mobile y=869。本文冒頭の最初のブロック）
  - `/guide/tokyo-holiday/` `/guide/tokyo-before-dating/` `/guide/tokyo-friends-activities/` `/guide/tokyo-experience-date/` `/guide/tokyo-date-under-5000/`: リード文・要点の直後に幻想集の特集ブロック（`GensouFeature`）があり `/gensou/` へリンク（desktop y=1165〜1406。最初の H2 より前）
  - `/guide/immersive-tokyo-date/` `/guide/immersive-tokyo-solo/`: 冒頭の公演カードに幻想集の予約リンク（desktop y=692。最初の画面内）
  - 存在しないページ: なし
- 静的ページ（karma, anator, lostframe）の告知はビルド時に判定されるため、11/23 以降に再デプロイがなければ残る → **人がやること**に記載

### E4 新規ガイド `/guide/kyoto-okazaki-november/`（コミット `event(E4)`）
- 追加: `src/pages/guide/kyoto-okazaki-november.astro`（`/guide/kyoto-kyocera-museum-7th/` と同じ部品・クラス。`prerender = false`）。登録: `src/data/guides.ts`（category `immersive`、thumb は既存の `/assets/events/7th-composition-kv.webp` を流用。画像は追加していない）、`src/pages/sitemap.xml.ts`（URL と lastmod 2026-10-19）、`public/llms.txt`・`public/llms-full.txt`（案内行・ブロック）
- title: `「禅とジブリ」京都展と同じ日に回る岡崎の半日｜永観堂ライトアップと美術館の物語体験【2026年11月】`（サフィックス除き51字）、H1: `「禅とジブリ」京都展と同じ日に回る、岡崎の半日（2026年11月）`、description 118字
- H2: この記事で扱う3つの催し（表）／同じ日に回す組み立て／「禅とジブリ」京都展の基本情報／「7枚目のコンポジション」の基本情報（＋escape.id の予約ボタン、公式ページ・案内ページへのリンク）／永観堂ライトアップの基本情報／よくある質問（3問）。関連記事は `LatestPosts`（自動）
- 組み立ての時刻は、開館10:00・公演の各回開始時刻（12:00〜16:30）と所要60分・受付10分前（公式ページ）・第7回の終了17:30・ライトアップ受付17:30〜20:30 だけで組んだ。移動の所要時間・飲食・店名・感想は書いていない

| 本文の事実 | 出典 |
|---|---|
| 「禅とジブリ」京都展: 新館 東山キューブ、10/3〜12/6、10:00〜18:00（入場は閉館30分前）、一般・大学生1,900円、10/31から予約優先制（10/14付告知）、11/23開館、公式 https://www.ghibli.jp/event/zen/ | 事実データ「同時期の周辺催事」 |
| 7枚目のコンポジション: 本館地下1階 講演室・多目的室、11/21〜23、各日7回（第1回12:00〜13:00、第7回16:30〜17:30）、所要60分（受付・説明・退場含む）、1名4,500円（税込）、別途入館料不要、各回最大18名（最少催行12名）、1名から、18歳以上、販売10/17(土)19:00〜・開演1時間前締切、escape.id | 事実データ「公演B」 |
| 各回の開始時刻 12:00／12:45／13:30／14:15／15:00／15:45／16:30、受付は各回開始の10分前から | 公式ページ `/taikenbizyutu/7th-composition/`（ガイドにも記載） |
| 永観堂: 11/20〜12/6、17:30〜20:30（受付20:30終了）、中学生以上1,000円、同じ岡崎・東山エリアで徒歩圏 | 事実データ「同時期の周辺催事」 |
| 美術館の休館日は月曜・祝休日は開館 | 事実データ「会場B」 |
- 禁止語の確認（`grep` 「分」「おすすめ」「カフェ」「ランチ」）: 「おすすめ」「カフェ」「ランチ」は 0 件。「分」は「所要60分」「閉館30分前」「受付は各回開始の10分前」「徒歩約8分」（いずれも事実データ・公式ページの記載）のみで、移動の所要分数はない

### E5 掲載依頼・SNS 用の原稿（コミット `event(E5)`）
- 追加: `docs/event-listings/gensou.md`、`docs/event-listings/7th-composition.md`。各ファイルに ①基本情報（フォーム用）、②紹介文 100字／200字／400字、③画像の要件メモ（既存 og:image のパス、横長 1,920px 推奨・最小720px・16:9／4:3／1:1）、④送信先チェックリスト（幻想集: 夢の島公式・Tokyo Art Beat・インターネットミュージアム・江東区観光協会／7枚目: 京セラ美術館公式・京都観光Navi・Kyoto Art Box・Tokyo Art Beat・インターネットミュージアム）、⑤SNS 投稿文（X 3本 ≤140字、Instagram 3本）
- 日付・料金・人数は事実データと一致（会期、時間、料金、対象、定員、販売開始、予約 URL、制作クレジット）。問い合わせ先は info@kabuexlabs.com（ランブック指定）

### E6 検索広告のキーワードと広告文（コミット `event(E6)`）
- 追加: `docs/ads/gensou.md`、`docs/ads/7th-composition.md`。キーワード候補（ランブック指定の8語ずつ＋除外候補）、レスポンシブ検索広告の見出し10本（10〜17字）・説明文4本（70〜90字）、ランディング先（幻想集 `/gensou/`、7枚目 `/taikenbizyutu/7th-composition/`、禅とジブリ・永観堂・岡崎観光系は E4 の新規ページ）、配信地域のメモ
- 「〜だけ」「3日間のみ」は事実（夜間に入れるのは公演時間帯だけ／会期3日間）に基づく表現のみ。在庫を示す語は使っていない

## 仕上げ（検証結果）

1. **ビルド**: `npm run build` 成功（2026-10-19 14:52）。`node scripts/seo-audit.mjs` エラーなし（警告 120 件は既存。新規ページの「被内部リンク 3 未満」は E2-B・E6 からの導線が付くまでの既知事項）、`npm run events:validate` エラーなし
2. **既存ページは追加のみ**: 事前描画 HTML 59 → 59（消えたファイル 0）。ソースの `git diff 9a1d9ed..HEAD` で、既存ページ 14 ファイル（ガイド2本＋告知12本）の削除行は 0。静的 HTML の `/tmp/event-before/static/` との比較では、告知を挿入した3ファイル（anator, karma, taikenbizyutu/lostframe）だけが変わり、挿入した `<p data-event-notice>` と CSS バンドルのハッシュ・`<link rel="stylesheet">` の位置を除けば改修前と同一。SSR ページは改修前後のスナップショット（全 154 URL）を比較し、title の変化 0、本文が短くなったページ 0、見出しの消失は「関連記事」枠（新規ガイドが入って古い記事カードが押し出されたもの）のみ
3. **リンク切れ**: `node scripts/crawl-audit.mjs --base=http://127.0.0.1:4400` → 155 URL（sitemap）＋ 5 URL をクロール、問題なし
4. **JSON-LD**: `/gensou/`（2本）・`/taikenbizyutu/7th-composition/`（1本）・新規ガイド（FAQPage/Article/BreadcrumbList ほか）が `JSON.parse` 通過。公式2ページは変更なし
5. **sitemap**: 新規 `/guide/kyoto-okazaki-november/` を収録（155 URL）。追記した2ガイドと新規ページの lastmod は 2026-10-19（`src/pages/sitemap.xml.ts` の手書きマップを更新。告知を入れたページの lastmod は本文の追加ではないため変えていない）
6. **告知の出力確認**: ビルド出力で 12 ページに `data-event-notice`（home 1、gensou-next 6、7th-next 2、gensou-nov 3）。対象外ページには出ていない。Playwright で 390px／1280px の表示を確認
7. **レビュー**: サブエージェント1つで `git diff 9a1d9ed..HEAD` を「既存ページは追加のみ」「事実データ外の記述なし」の2点で検査 → いずれも PASS（ブロッカーなし）。文言の指摘3件を修正（`event(E4)`/`event(E5)` のレビュー修正コミット）: ①新規ページ「予約した入場枠の時刻に合わせます」→「予約優先制です（美術館の告知、10月14日付）」 ②「日が暮れてからライトアップ」→「17:30からライトアップ」 ③X 投稿文「11月の3連休」→「11/21〜23の土日祝」。修正後に再ビルド成功。再レビューは行っていない
8. **引き渡し**: `origin` へ `event/nov-boost-20261019` を push し、ドラフト PR #129 を作成（https://github.com/kabuexlabs/ex-labs-hp/pull/129）。マージ・デプロイはしていない

## 人がやること（順番どおり）

1. デプロイ後に Search Console で `/gensou/` `/taikenbizyutu/7th-composition/` `/guide/yumenoshima-night/` `/guide/kyoto-kyocera-museum-7th/` `/guide/kyoto-okazaki-november/` の URL 検査 → インデックス登録をリクエスト
2. 夢の島熱帯植物館・京都市京セラ美術館に `docs/event-listings/gensou.md`・`docs/event-listings/7th-composition.md` の原稿で掲載依頼（横長画像 1,920px 推奨を用意）
3. Tokyo Art Beat／京都観光Navi／Kyoto Art Box／インターネットミュージアム／江東区観光協会に送信（各ファイルのチェックリスト）
4. `docs/ads/gensou.md`・`docs/ads/7th-composition.md` で検索広告を出稿
5. 11/23 以降に告知が消えていることを確認。SSR ページ（トップ、公演ページ、ウワサバナシ2本、怪盗、事例記事、デート系3本）はリクエスト時に自動で消える。静的ページ（`/karma/` `/anator/` `/taikenbizyutu/lostframe/`）は再デプロイで消える（11/23 以降に一度デプロイがなければ手で `src/data/eventNotices.ts` の `NOTICE_PAGES` から外す）
6. 任意（提案）: 公式2ページの `offers` に `availability` を追加、追記した2ガイドの `articleLd.dateModified` を更新し追加 FAQ を `faqLd` に含める、永観堂の公式 URL を E2-B／E4 に追加

## 追記（2026-10-21）: 「夢の島熱帯植物館」で検索しても公演が出ない件への対応

### 現状の確認
- PR #129（本ブランチ）・PR #128 とも未マージのため、会場名向けの追記・告知・新規ページは本番に出ていない
- 検索結果（Bing 系）で「夢の島熱帯植物館」は、植物館公式サイト・TOKYOおでかけガイド・るるぶ&more.・江東おでかけ情報局（江東区観光協会）・いこーよ・Wikipedia・Tokyo Art Beat・NAVITIME が占め、kabuexlabs.com は出ない。「夢の島熱帯植物館 イベント 11月 夜」では江東区観光協会の「夢の島熱帯植物館 11月開催イベント」、レッツエンジョイ東京、駅探（夜間開館2025）、植物館公式のイベントページが出る
- 公演名「午前零時の幻想集 草陰の夢」で検索しても、自社サイト以外に掲載がない（公演名の露出が自社サイトと escape.id だけ）
- → 会場名の検索で出すには、(1) 自社ページ（`/guide/yumenoshima-night/` ＝会場名で始まる title）を本番に出してインデックス登録を求めること、(2) 会場名の検索結果を占めている植物館公式サイト・おでかけ情報サイトに公演を載せてもらうこと、の両方が必要。Google の「イベント」枠に出すには Event 構造化データだけでは足りず、これらの掲載サイト経由が実質的な経路

### 本ブランチでの変更
1. `origin/main`（`4db7b89`）に rebase。main 側で 7枚目のコンポジションの定員が「各回30名 → 18名」に変わっていたため、本ブランチの記述を揃えた: `src/pages/guide/kyoto-kyocera-museum-7th.astro`（既存の対象行と FAQ）、`src/pages/guide/kyoto-okazaki-november.astro`、`src/data/events/works.ts`（公演データ）、`public/llms-full.txt`、`docs/event-listings/7th-composition.md`、`docs/ads/7th-composition.md`、本 changelog（E2-B／E4 の対応表）。**既存ページの文字を変えた箇所**: kyoto-kyocera-museum-7th.astro の「各回最大30名」2箇所と works.ts の2箇所（事実の更新のため）
2. Event JSON-LD の `offers` に `availability: InStock` を追加（`/gensou/` 2 offer、`/taikenbizyutu/7th-composition/` 1 offer＋`name`）。E1 で「提案」としていたもの
3. `docs/event-listings/gensou.md` の送信先に、会場名検索の上位サイトを追加: 植物館公式サイトのイベントページ・Google ビジネスプロフィールの「イベント」投稿・note／PR TIMES／Walkerplus（KADOKAWA の受付フォーム）／レッツエンジョイ東京（窓口未確認）／駅探（観光協会経由）／いこーよ（対象外と判定）／施設紹介サイト
4. `docs/press/gensou-prtimes.md`: PR TIMES 用のプレスリリース原稿（タイトルと冒頭に会場名。事実は公演ページと会社概要ページのみ）

### 人がやること（優先順）
1. PR #129 をマージしてデプロイ → Search Console で `/guide/yumenoshima-night/`・`/gensou/` のインデックス登録をリクエスト
2. 夢の島熱帯植物館に、公式サイトのイベントページ・月間チラシ・Google マップの投稿・X・note への掲載を依頼（`docs/event-listings/gensou.md` の原稿）
3. PR TIMES で配信（`docs/press/gensou-prtimes.md`）。配信後、記事 URL を公演ページと案内ページの関連リンクに追加
4. 江東区観光協会（03-6458-7400）に「夢の島熱帯植物館 11月開催イベント」への掲載を相談（植物館経由が早い）
5. Walkerplus の受付フォーム、レッツエンジョイ東京のサポート窓口に送付
