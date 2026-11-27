# 全国学生 未来視察連盟 LP（仮・限定公開）

- URL（限定公開）：https://kabuexlabs.com/preview/zengaku-h4tq8wnm/ （2026-11-27 仮実装。ブランチ claude/zengaku-lp-implementation-u4q0bv）
- 原稿：ユーザー提供「全国学生 未来視察連盟 LP 原稿（実装用・確定版）」2026-11-27。文言は原稿のまま。
- デザイン：ユーザー提供の参考スクリーンショット（トビタテ!留学JAPAN／日米学生会議）の雰囲気のみ。白×淡い水色、赤と青のアクセント、明朝の見出し＋筆記体の英字小見出し、赤い丸ボタン、画面下の追従ボタン（黄色の札）。**参考サイトのロゴ・画像・文言は使っていない**（赤と青の2点を点線で結ぶ「視察ルート」の印、ミラノのアーチの線画は自作 SVG）。

## ページ（原稿のパス → 実際のパス）
| 原稿 | 実際 | ファイル |
|---|---|---|
| `/` | `/preview/zengaku-h4tq8wnm/` | `src/pages/preview/zengaku-h4tq8wnm/index.astro` |
| `/milano` | `…/milano/` | `milano/index.astro` |
| `/milano/thanks` | `…/milano/thanks/?t=受付トークン` | `milano/thanks/index.astro` |
| `/representative` | `…/representative/` | `representative/index.astro` |
| `/representative/thanks` | `…/representative/thanks/` | `representative/thanks/index.astro` |
| `/privacy` | `…/privacy/` | `privacy/index.astro` |
| （運営用） | `…/admin/` | `admin/index.astro`：応募一覧・知った経路（大学／学生団体／施策）・紹介コード別人数・CSV |

共通部品：`src/components/zengaku/`（ZLayout＝head・ヘッダー・フッター・共通CSS、Head＝見出し、Field／FormKit＝フォーム）。改行は `src/components/gensou/J.astro`（BudouX）。

## 未確定の値（原稿 0.3 の `{{ }}`）
`src/lib/zengaku.ts` の `VARS` 1か所で入れる。null の間は原稿の「仮の表示」を出す。
- `CONTACT_EMAIL`・`OPERATOR`：**公開前に必須**。未設定の間は画面に「準備中／事業者名・所在地」＋赤い「未定」の印。自動返信メールの「■ お問い合わせ」と※の行は出さない。
- `SUPPORTERS`：空の間はトップの「ご協力いただいている皆さま」とミラノの「協力」行を出さない。掲載の確認が取れた名前だけ入れる。
- `MEMBERS`：代表以外。本人の確認が取れたものだけ。
- `SNS_INSTAGRAM`／`SNS_X`：無いものはアイコンごと出さない。
- `DEADLINE_TIME`（既定 23:59）：締切 2027-01-15 のこの時刻（日本時間）を過ぎると、応募ボタンすべてが「応募受付は終了しました」（非活性）、フォームの場所に終了の文、API も受け付けない。

## 応募の保存（Upstash Redis、`zg:` プレフィックス）
- ミラノ：`zg:milano:seq`（受付番号の連番）、`zg:milano:apps`（番号→応募 JSON）、`zg:milano:emails`（メール→番号。**同じメールの2回目は EVAL で弾く**）、`zg:milano:tokens`（完了ページ用トークン→番号）、`zg:milano:refs`（本人の紹介コード→番号）。
- 学内代表：`zg:rep:seq`／`zg:rep:apps`／`zg:rep:tokens`。
- 応募日時はサーバー側の時刻（秒まで）。項目9（知った経路）はキー（campus_friend 等）で保存。
- 紹介：`?ref=コード` で来た人の応募に `ref` を保存（sessionStorage でページ移動しても保持）。完了ページとメールに本人の紹介リンク `…/milano/?ref=本人のコード`。
- API：`src/pages/api/zengaku/milano.ts`、`representative.ts`（JSON。エラー文言は原稿 2.7 のまま）。
- 自動返信：`lib/yoyaku.ts` の `sendMail`（差出人の表示名を「全国学生 未来視察連盟」にする `fromName` を追加）。**送信アドレスは自社 SMTP（info@kabuexlabs.com）のまま**、返信先は CONTACT_EMAIL（未設定なら ex Labs の管理者アドレス）。運営への通知も notifyEmail に送る。

## 限定公開
- noindex（meta＋`X-Robots-Tag`）、`Cache-Control: private, no-store`、sitemap・llms.txt・ナビ非掲載。
- 環境変数 `ZENGAKU_PREVIEW_PASSWORD` で Basic 認証（未設定なら URL を知っていれば見られる）。
- 管理画面の合言葉は `ZENGAKU_ADMIN_KEY`（未設定なら `YOYAKU_ADMIN_KEY`）。

## 本公開の前に（原稿 7 のチェックリスト）
- 独自ドメインで出すか、このサイトの下で出すかを決める（決まったら移設し、旧 URL は 301）。
- `CONTACT_EMAIL`・`OPERATOR` を入れ、プライバシーポリシーを責任者が確認（特に「4. 第三者への提供」）。
- 自動返信の差出人アドレスを団体のものにするか（今は ex Labs の SMTP）。
- 活動報告の写真（1件1枚、`reports` の `photo`）は写っている人の許可を取ってから。11/21 味の素スタジアムの本文が実際と合っているか。
- 2026-12-01 の受付開始前でもフォームは送信できる（原稿に受付開始前の扱いの指定がないため）。

## 変更履歴
- 2026-11-27 初版（原稿＋参考スクリーンショットから仮実装）。
- 2026-11-27 本番（main）に反映。ユーザー指示でトップのファーストビュー右上のルート図（国会・最高裁判所・スタジアム・MILANO）を削除し、キャッチを大きく。
