# 漢方体質チェック 試験サイト — 実装上の判断メモ（docs/kampo-spec.md からの差分）

仕様書（docs/kampo-spec.md v0.1）に書いていないこと・書いてあるが変えたことを1行ずつ残す。
変える場合はここに日付つきで追記する。

## 2026-10-20 仮実装（本公開なし）

- **技術構成**：仕様書は「Next.js + Prisma + PostgreSQL の新規リポジトリ」を推奨しているが、仮実装は **既存サイト（Astro SSR + Vercel + Upstash Redis）の中に `/kampo/` として組み込んだ**。理由：新しい DB・Vercel プロジェクトの契約と設定なしに店頭で試せる、既存の合言葉ログイン・KV・デプロイの仕組みをそのまま使える。スコアリング・候補提示・安全確認は純粋関数、マスタは JSON のままなので、本番で独立リポジトリに移す場合もそのまま持ち出せる。
- **URL**：`/kampo/login/`（ログイン）→ `/kampo/check/new/`（受付）→ `/kampo/check/<id>/q/<n>/` → `/kampo/check/<id>/result/` → `/kampo/check/<id>/advice/<type>/`。スタッフは `/kampo/staff/pin/` → `/kampo/staff/` → `/kampo/staff/session/<id>/` → `/kampo/staff/customer/<id>/`。仕様書のパスに `/kampo` を前置しただけ。
- **保存先**：PostgreSQL ではなく Upstash Redis。顧客・セッション（提案を内包）・監査記録を `kampo:` プレフィックスで保存。提案（Proposal）は別テーブルにせずセッション JSON の中に持つ。
- **保持期限 3年**：セッション本体は Redis の TTL（EXPIREAT）で自動削除。索引側は `/kampo/staff/` を開いたときと `/api/kampo/purge`（CRON_SECRET）で掃除する。**Vercel Cron は登録していない**（Hobby プランの cron 枠 1日1回×2本を /api/yoyaku/reminder と /api/hacktale/reminder で使い切っているため）。
- **環境変数名**：他機能との衝突を避けて `KAMPO_` を前置（`KAMPO_PASSWORD`／`KAMPO_STAFF_PIN`／`KAMPO_SESSION_SECRET`／`KAMPO_SUPERVISOR_NAME`／`KAMPO_SUPERVISOR_BIO`／`KAMPO_STAFF_NAMES`／`KAMPO_RETENTION_YEARS`）。`KAMPO_PASSWORD` 未設定時は `YOYAKU_ADMIN_KEY` を流用、`KAMPO_STAFF_PIN` 未設定時は共通パスワードで代用（画面に注意表示）。
- **認証の Cookie**：iron-session ではなく、HMAC 署名つきの期限トークン（`kampo_s` 30日／`kampo_staff` 12時間、path=/kampo、httpOnly）。パスワードそのものは Cookie に入れない。ログイン失敗は同一IPから5回で10分ロック（既存の `login:rl:` を共用）。
- **レーダーチャート**：Recharts ではなくサーバー側で描く SVG（JS 不要・印刷でも同じ見え方）。
- **zod**：依存を増やさず手書きの検証（`src/lib/kampo/masters.ts`）。起動時に失敗したら例外でページを落とす。検証内容は仕様書どおり（B 全問に none、選択肢ID一意、keySigns 実在、weights のキー・範囲、タイプ8件、tips の参照）。
- **テスト**：Vitest/Playwright ではなく既存方式（`node --experimental-strip-types scripts/kampo-test.mjs`、`npm run check` に含む）。仕様書 第6節の検算例6件を含む。E2E は curl で主要導線を手動確認（Playwright は未導入）。
- **タイプ定義 JSON の形**：`data/types.json` は `{ "types": {8タイプ}, "tips": [条件つきの一言] }`。tips は `{ when: 選択肢ID, types: [TypeKey], text }`。
- **安全確認の「2週間以上」**：A4 の「1〜2週間」は含めず、「1か月以内・半年以内・それ以上」を2週間以上とみなす。「半年以上」は「それ以上」のみ。
- **誤字の修正**：仕様書の「山栩子」→「山梔子」、「目が冒えて」→「目が冴えて」、「苋類」→「芋類」、「涯しい」→「涼しい」、「捕き」→「取り除き」、「太溪」→「太渓」。文面はすべて JSON で薬剤師が直せる。
- **ロゴ・ブランド色**：`pharmacy.essence.fan` にこの環境から到達できず、ロゴは未取得。文字ロゴ「ESSENCE薬局」とアクセント色 `#2E7D6B`（仮）で実装。ロゴ画像とブランド色が分かれば `src/layouts/KampoLayout.astro` の `:root` と `.kp-brand` を差し替える。
- **アイコン・舌イラスト**：自作の簡素な SVG（`src/lib/kampo/icons.ts`、`public/assets/kampo/tongue/*.svg`）。参考サイトの素材は使っていない。
- **印刷**：`@media print` の A4 縦。結果画面の印刷では1ページ目にレーダーとカード、2ページ目以降に主体質の改善アドバイスを自動で付ける。
- **スタッフ名**：ユーザーアカウントは作らず、提案保存時に `KAMPO_STAFF_NAMES` の候補から選ぶ（未設定なら自由入力）。
- **監査記録**：`kampo:audit` に閲覧・保存・CSV書き出しを記録（最大5000件）。表示画面は未実装（仕様どおり初版なし）。
- **顧客の sex / ageBand**：A1・A2 の回答時に顧客レコードへ控える（履歴画面の表示用）。
- **性別を変更したとき**：B11・C3 の回答は捨てる（表示されなくなった設問の回答が採点・安全確認に混ざらないように）。
- **試験サイトの公開方法**：main には入れず、ブランチ `claude/jolly-mayer-khrsji` に push。Vercel のプレビューデプロイ URL（`*.vercel.app`）で試す。本公開（main へのマージ）はユーザー判断。
