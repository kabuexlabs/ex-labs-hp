# 漢方体質チェック 試験サイト（/kampo/）セットアップ・運用手順

ESSENCE薬局 武蔵小杉店の店頭 iPad で使う「体質チェック＋薬剤師のご提案支援」の試験版。
仕様の正本は `docs/kampo-spec.md`（実装指示書 v0.1）、仕様との差分は `docs/kampo-decisions.md`。

**既存の無料インフラ（Vercel + Upstash Redis）だけで動く。追加契約は不要。**
画面上では「診断」「処方」「治る」を使わず「体質チェック」「ご提案」と表記する。

## URL

| 用途 | URL | 誰が |
|---|---|---|
| ログイン（共通パスワード） | `/kampo/login/` | スタッフ |
| 受付（識別・舌モード・同意） | `/kampo/check/new/` | スタッフ → iPad を渡す |
| 設問（1画面1問） | `/kampo/check/<id>/q/<n>/` | 来店客（または聞き取り） |
| 結果（レーダー・体質カード） | `/kampo/check/<id>/result/` | 来店客と一緒に見る |
| 改善アドバイス | `/kampo/check/<id>/advice/<type>/` | 来店客 |
| 途中再開 | `/kampo/check/<id>/` | 最初の未回答へ飛ぶ |
| スタッフPIN | `/kampo/staff/pin/` | スタッフ |
| 本日の一覧・顧客検索・CSV | `/kampo/staff/` | スタッフ |
| 担当者画面（警告・スコア・舌・候補・提案） | `/kampo/staff/session/<id>/` | 薬剤師 |
| 顧客履歴 | `/kampo/staff/customer/<id>/` | 薬剤師 |

すべて noindex・no-store。未ログインでどの URL を開いても `/kampo/login/` に戻る。
結果画面の**右下を1.2秒長押し**すると PIN 入力 → その回の担当者画面へ直行する（来店客には導線を見せない）。

## 初回セットアップ（Vercel の環境変数）

1. **KV**：`KV_REST_API_URL` / `KV_REST_API_TOKEN` は /yoyaku と共用。設定済みなら追加作業なし（データは `kampo:` プレフィックス）。
2. **KAMPO_PASSWORD**：店頭 iPad・PC のログイン用の共通パスワード。未設定なら `YOYAKU_ADMIN_KEY` が使われる。
3. **KAMPO_STAFF_PIN**：スタッフ画面の4桁PIN。未設定のうちは共通パスワードで代用され、画面に注意が出る。
4. **KAMPO_SESSION_SECRET**：Cookie の署名鍵（`openssl rand -hex 32`）。未設定でも動く（パスワードから派生）が、設定を推奨。
5. **KAMPO_SUPERVISOR_NAME**（例 `薬剤師 ○○ ○○`）、**KAMPO_SUPERVISOR_BIO**（任意の一文）：改善アドバイスの監修者表示。
6. **KAMPO_STAFF_NAMES**：担当薬剤師の氏名をカンマ区切り（提案保存時に選択式になる）。
7. `KAMPO_RETENTION_YEARS`：保持年数（既定 3）。

環境変数は Preview 環境にも適用するよう設定する（試験中はプレビュー URL で使うため）。

## 試験サイトの公開方法（本公開はしない）

- 実装はブランチ `claude/jolly-mayer-khrsji` に push する。main には入れない。
- Vercel がブランチごとにプレビューデプロイ（`https://ex-labs-hp-git-<branch>-<team>.vercel.app` 形式）を作る。URL は GitHub の Deployments または Vercel ダッシュボードで確認する。
- プレビューにも共通パスワードが必要。Vercel 側の「Deployment Protection」が有効ならそのログインも挟まる（店頭 iPad で使うときは Vercel 側の保護を切るか、Bypass を設定する）。
- 本公開する場合は main にマージすれば `https://kabuexlabs.com/kampo/` で動く。

## 店頭での流れ

1. スタッフが iPad でログイン → `/kampo/check/new/` で識別（会員番号／電話／LINE表示名／識別なし）・舌チェックのモード・入力者を選び、同意文を確認して「同意して始める」→ 来店客に渡す（または聞き取り入力）。
2. 設問 27問（女性・セルフ舌）／24問（男性・スタッフ舌）。回答は1問ごとに保存され、ブラウザを閉じても同じ URL で続きから答えられる。
3. 結果画面（レーダー・点数と段階・主体質／副体質カード）を一緒に見ながら説明。処方名は出ない。
4. 右下を長押し → PIN → 担当者画面。安全確認フラグ（受診勧奨は濃い赤の帯）、スコアと虚実・寒熱指数、舌所見（スタッフモードはここで入力、セルフは上書き可。保存で再計算し来店客向け結果にも反映）、候補3件（根拠・注意生薬・禁忌該当）、選定とメモを保存 → 一覧で「提案済み」。
5. 必要なら結果画面の「印刷」（A4 縦。1ページ目レーダー＋カード、2ページ目に主体質の改善アドバイス）。iPad の共有メニューから PDF 保存・AirPrint。
6. **お客様に iPad を渡す前に「来店客モードへ戻る」を押す**（スタッフ Cookie が消える。放置しても12時間で失効）。
7. 違和感のあった設問・文面・候補は `docs/kampo-feedback.md` に書きため、JSON を直して再デプロイ。

## マスタの編集（薬剤師が直接編集 → 再デプロイ）

| ファイル | 内容 |
|---|---|
| `src/data/kampo/questions.json` | 設問 27問（A 基本5・B 体質13・C 安全5・D 生活4）。`weights` が体質スコア、`flags` が安全確認、B の各問末尾に `none`（どれもあてはまらない）必須 |
| `src/data/kampo/types.json` | 8タイプの文面（状態の一言・説明・代表症状5・心食動休・ツボ）と `tips`（生活習慣の回答に応じた「あなたへの一言」） |
| `src/data/kampo/formulas.json` | 処方 36件。扱わないものは `active: false`、商品が決まったら `code` を商品コードに。`priority` は同点時の並び順 |
| `src/data/kampo/consent.md` | 受付画面の同意文 |

編集後は `npm run test:kampo`（`npm run check` に含む）で形式チェックが走る。選択肢IDの重複・存在しない keySigns・B の none 欠落はエラーになる。
設問を変えたら `questions.json` の `version` を日付に更新する（セッションに記録され、過去データと区別できる）。

## スコアリングと候補提示（概要。詳細は docs/kampo-spec.md 第6・8・9節）

- 等重み（選択肢1つ＝1点、2タイプにまたがるものは0.5）。表示されなかった設問と「閉経している」の B11 は理論最大点から除く。pct = raw/max。
- 段階：20%未満 バランス／20〜 傾向あり／40〜 注意／60〜 強い。主体質＝最高（同点は複数）、副体質＝主体質の70%以上または60%以上かつ20%以上、最大2つ。全タイプ20%未満は「バランス良好」。
- 虚実指数・寒熱指数はスタッフ画面と候補提示だけに使う。
- 候補スコア＝体質一致（主体質×1.5）＋虚実±0.3＋寒熱±0.2〜0.3＋主訴+0.25×n（上限0.5）＋キー所見+0.3×n（上限0.6）−禁忌該当1.0。禁忌も除外せず警告つきで残す。
- 安全確認は `src/lib/kampo/safety.ts`。refer（受診勧奨）・warn・info の3段階。

## データ

- Upstash Redis：`kampo:s:<id>`（セッション。TTL 3年）、`kampo:sessions`（索引）、`kampo:c:<id>`（顧客）、`kampo:idx:member:*` / `kampo:idx:phone:*`、`kampo:customers`、`kampo:audit`（閲覧・保存の記録、最大5000件）。
- 保持期限切れの掃除は `/kampo/staff/` を開いたときに自動で走る。手動なら `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/kampo/purge`。
- バックアップ：スタッフ画面の「CSV書き出し」（全セッション・回答・提案）を週次で保存する。Upstash 側の自動バックアップにも依存。
- 削除依頼：現状は Upstash コンソールで `kampo:s:<id>` と索引を手で消す（管理画面からの削除は次版）。

## 開発・テスト

- ロジックのテスト：`npm run test:kampo`
- ローカル動作確認：`.env` に KV と KAMPO_* を入れて `npx astro dev --port 4322 --host 127.0.0.1`。KV が無い環境では scratchpad の Upstash 互換モックで代用した（2026-10-20）。
- 主な実装：`src/lib/kampo/`（masters / scoring / safety / recommend / flow / compute / store / auth / icons）、`src/pages/kampo/`、`src/layouts/KampoLayout.astro`、`src/components/kampo/`。ルート保護は `src/middleware.ts` → `kampoGuard`。

## 未実装・次版

- メール・LINE での結果送信、管理画面での設問編集、在庫・価格連携、複数店舗、監査記録の閲覧画面、管理画面からの顧客データ削除、Playwright の E2E。
- ESSENCE薬局のロゴ画像とブランド色の反映（`KampoLayout.astro` の `:root` を差し替え）。
