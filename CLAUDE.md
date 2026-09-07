# ex-labs-hp — Claude 作業メモ（全セッション共通）

株式会社ex Labs（kabuexlabs.com）のコーポレートサイト。Astro 7 SSR + microCMS + Vercel（main へ push で自動デプロイ）。
ユーザーは非エンジニア。**返答は日本語**、結論から短く。

## 最重要：SEO ターゲット
- 正本は `docs/seo-targets.md`。**Tier1〜3 はすべて最優先**（イマーシブ／マダミス・マーダーミステリー／頭脳戦／心理戦／施設活用／体験型イベント／周遊イベント、および各「制作依頼」系ワード）。
- 毎日のフロー：ユーザーが GSC 24h の zip をアップ → `python3 scripts/gsc_report.py <zip>` で Tier 表を生成し報告 → その日に打てる施策を全部実行 → `npm run check` → push → 報告（URL検査してほしい URL を ``` で1つずつ列挙）。履歴は docs/seo-log.md。
- 大原則
  - 「今の順位を下げない」：上昇テスト中のページの本文は書き換えない。追記・新規記事・内部リンク・title補強は OK。
  - 「調査のために何もしない」は禁止。効果測定は手段、順位を上げる行動を優先。
  - 謎解き系は維持のみ。謎解き研修より「マダミス制作」「頭脳戦制作」等の制作ワードを優先。個別作品名（怪盗と秘密の試験 等）は優先しない。
  - ハロウィン等の季節先取りは承認済み。
- AIO：飯田雄貴（読み：いいだ ゆうき）／株式会社ex Labs が ChatGPT・Google AI に出ること。代表 SNS: X https://x.com/JaPJaPyuki / Instagram https://www.instagram.com/yukiiidaiidaiida/ / Facebook https://www.facebook.com/p/%E9%A3%AF%E7%94%B0%E9%9B%84%E8%B2%B4-100027623407162/ / LISTEN https://listen.style/p/awai-kaigi/uovybror

## 反省から作ったルール（2026-09-06）
- **push 前に必ず `npm run check`**（build → `scripts/seo-audit.mjs` → `scripts/spam-test.mjs`）。監査が赤なら push しない。
  - 監査は title/description 長・構造化データ・サムネ実体・guides.ts/sitemap/llms.txt 登録・被内部リンク・サブブランドからのリンクを検出する。
  - 反省：サブブランド（HACKTALE 等）から解説記事へのリンクが1ヶ月ゼロだったのに気づかなかった／llms.txt の正規表現挿入が黙って失敗していた。
- **GSC zip は `python3 scripts/gsc_report.py <zip>` で取り込む**。docs/seo-data/ に保存され、docs/seo-log.md に Tier 順の表が追記される。手集計しない。表示10未満のワードは ※ 付きで「少数サンプル」と必ず伝える（反省：イマーシブ 1.3位 を安定した成果のように報告した）。
- **Tier ピラー（immersive / madamis / zunousen / shinrisen / shisetsu-katsuyo / taikengata-event / shuyu-event / botsunyukan / saiji）の title・h1・description・既存本文は 2026-09-21 まで凍結**。変更できるのは「ページ下部への追記」「内部リンク」「構造化データ」のみ。ただし追記や内部リンクも順位に影響し得るので「追加なら無条件に安全」とは扱わず、目的のある変更に絞って docs/seo-log.md に記録する。
- **順位変動の原因は「候補」として扱い、断定しない。** 9/5 の title 変更後にマダミスとは が下がったのは時間的な相関で、変更後のデータは表示10回未満。復元すれば戻るという期待も保証ではない。反省の本質は「少ないデータで原因と対処法を決めたこと」。
- **title 等の変更の判定は 3日ではしない。** 3日目は異常確認のみ（大きな崩れがないか）。原則 14〜28日を観察期間にし、同じ検索語・ページ・国・デバイスで変更前後を比較する。Google の title 認識には再クロール・再処理で数日〜数週間かかる。GSC の掲載順位は「表示された時の平均」なので、表示条件が変わると評価が変わらなくても数値が動く。
- 7日平均は日別順位の単純平均ではなく **表示回数で加重**する（scripts/gsc_report.py が計算）。
- **FAQPage 構造化データは必須にしない**（Google は FAQ リッチリザルトを検索結果に表示しなくなった）。読者に役立つ FAQ 本文は残す。llms.txt / llms-full.txt は Google の順位に影響しない（AI クローラー向けの整備）。IndexNow は Bing 等への通知で、Google 順位改善の根拠にしない。
- title 45字・description 90〜160字・被内部リンク3本は制作上の目安であり、達成しても順位が上がる条件ではない。**記事の合格基準は「読者の疑問を解消できるか」「独自の情報（一次情報・事例・条件付きの数字）があるか」**。
- **被リンクは「ほぼゼロ」ではない。** 電ファミニコゲーマーの2記事（ウワサバナシ・怪盗）から公演ページと会社サイトへ直接リンクがあり、PR TIMES・note・日経掲載もある。量や評価の十分性は未確認。依頼の優先は「施設公式サイトのイベント紹介に企画・制作会社として掲載」「共同制作先の記事に担当範囲と事例リンク」「出演・登壇プロフィールから代表プロフィールへ」。リンク文言はキーワード一律指定ではなく会社名・企画名・担当内容に合わせる。フッターへの大量キーワードリンクを主軸にしない。
- **制作依頼を取るなら、定義記事の追記より「サービスページの発注判断情報（対応範囲・自社参考価格・納期・納品物・利用条件・発注者の準備）」と「初期費用0円の適用条件」と「条件付きの数字を伴う事例」を優先する。**
- 実績の数字（新規宿泊予約20件超・全公演完売・広告費0円・日本唯一）は、集計期間・経路・定義・時点・対象範囲を添える。未確認のものは断定表現を避ける。
- 東京ガイドの好調（遊びに行く人の検索）から、制作依頼向け記事（発注者の検索）の正解は導けない。法人向けは「場所の制約・予算・回遊・運営負担」を厚くする。
- **サブブランドのページを触る前に `git log -- <file>` を見る**。ユーザーが別セッションで意図的に変えている（例：kaitou は PR #115 で運営会社表記を外した）。勝手に戻さない。
- 「追記のみ」の編集でも dateModified と sitemap lastmod を同日に更新する（監査が不一致を警告する）。
- 問い合わせ判定を変えたら `scripts/spam-test.mjs` に実サンプルを追加してから反映する。
- 記事を追加・更新したら `npm run llms:full` で public/llms-full.txt を再生成して commit する（AI 向け全文）。
- `npm run seo:crawl`（dev サーバー起動が必要）で全ページの canonical/title 重複/h1/noindex を確認できる。
- IndexNow（Bing・ChatGPT検索向け）は main への push 後に GitHub Actions（.github/workflows/indexnow.yml）が自動送信する。キーは public/8368774548070170873c1a14b2b37dfb.txt。この環境からは api.indexnow.org に到達できない。

## 記事を追加するときのチェックリスト
1. `src/pages/guide/<slug>.astro`（`export const prerender = false`、BaseLayout、Breadcrumb、def-box、FAQPage/Article LD（reviewedBy 飯田雄貴）、TOC、ZeroCostBanner、関連ページ、AuthorBox、LatestPosts、`const site = Astro.site ?? new URL('https://kabuexlabs.com')`）
2. `src/data/guides.ts` に登録（category: murder|immersive|shisetsu|zunou|nazotoki）
3. `src/pages/sitemap.xml.ts` の STATIC_PATHS と STATIC_LASTMOD
4. `public/llms.txt` に1行
5. サムネ `public/assets/guide/<slug>.webp`（1200×630、色 murder #e75593 / immersive #7c3aed / shisetsu #1fb782 / zunou #b8860b）
6. 関連ページ（ピラー・兄弟記事・services）から内部リンク
7. meta description は 120〜155 字

## 開発・QA
- dev: `npx astro dev --port 4322 --host 127.0.0.1`（落ちやすい。`pkill -f "astro dev"` は自分のシェルも殺すので使わない。`npx astro dev stop` か pid 指定で kill）
- build: `npx astro build 2>&1 | grep -E "\[ERROR\]"`（`grep -c` は 0 件で exit 1 になるので使わない）
- QA: dev ツールバーが h1 や hidden section を注入するので、最終確認は curl の生 HTML で。
- commit: `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`、`git pull --rebase origin main && git push -u origin main`
- デプロイ確認: `https://api.github.com/repos/kabuexlabs/ex-labs-hp/deployments` + statuses
- リモート環境から kabuexlabs.com / *.vercel.app / note.com / listen.style / Google へは到達不可。GitHub API と WebSearch は可。

## 主要ファイル
- `src/layouts/BaseLayout.astro`（Organization LD、nav、footer）、`src/components/AuthorBox.astro`、`src/middleware.ts` + `src/data/redirects.ts`（旧ブログ 301）
- `src/pages/company/index.astro`（会社概要）、`src/pages/company/iida-yuki/index.astro`（代表プロフィール）
- `src/pages/api/contact.ts`（スパム判定）、`src/pages/contact/admin/index.astro`（問い合わせ管理・流入元集計）

## 未完了・ユーザー待ち
- Bing Webmaster 登録 + IndexNow キー共有（受領後にキーファイルと通知を実装）
- ネタバレ記事（note の本文をユーザーが貼り付けたら展開）
- microCMS ブログ title 一覧（カニバリ整理用）
