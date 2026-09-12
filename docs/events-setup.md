# 公演検索サービス（/events/）運用メモ

今日・明日・今週末に遊べるマダミス・イマーシブ公演を、日付・人数・エリア・ジャンル・時間帯・終了時刻・予算から探せる無料サービス。運営者は株式会社ex Labs と明記し、他社公演も掲載条件を確認できたものを無料で掲載する。掲載料・予約手数料・決済は無し。予約は公式販売ページへ案内する。
「完全非営利」「永続的に広告なし」「第三者による中立ランキング」とは書かない（将来の広告・自社集客を想定）。

## URL と役割
- `/events/`：検索と一覧（SSR、毎リクエスト日本時間で判定。絞り込みはクエリ文字列、JS があれば即時反映）。canonical は常に `/events/`（絞り込み状態は別ページにしない）
- `/events/<slug>/`：作品詳細（公開作品ごとに1枚。終了後も「終了」を明示して残す）。Event 構造化データは表示している回だけ、受付中と確認できた回にだけ offers
- `/events/about/`：掲載基準・運営者・修正依頼
- 既存ガイド `/guide/immersive-tokyo/`・`/guide/madamis-tokyo/` は選び方・基礎知識。相互リンク済み

## ファイル
- データ（正本）：`src/data/events/`
  - `types.ts` 型、`areas.ts` 地域・エリア・ジャンル登録簿、`sources.ts` 情報源、`organizers.ts` 主催者、`venues.ts` 会場、`channels.ts` 公式販売先、`works.ts` 作品、`occurrences.ts` 公演回、`index.ts` 結合＋検証（不正ならビルド失敗）
  - `fixtures.ts` はテスト専用。公開ページから import すると検証で止まる
- 判定：`src/lib/events.ts`（日付窓・状態・適合・料金換算・検証）
- 表示：`src/pages/events/index.astro`、`[slug].astro`、`about.astro`、`src/components/EventCard.astro`、`src/styles/events.css`
- `src/data/shows.ts` は events データから「今週遊べる」欄用に変換するだけ（手で編集しない）
- テスト：`npm run test:events`（scripts/events-test.mjs）、検証：`npm run events:validate`（scripts/events-validate.mjs）。どちらも `npm run check` に含む

## データ更新手順
1. 公式サイトまたはチケットページで事実を確認し、`sources.ts` の該当情報源の `checkedAt`／`checkedBy` を更新（新しい情報源は追加。`terms` に利用条件を書く）
2. 作品の追加：`works.ts` に追加（`price.unit` は必ず per-person／per-group／charter のどれか。`party.max` が未確認なら省略）。画像は利用条件を確認できた場合だけ `image` に入れる（無ければ文字中心で出る）
3. 公演回の追加：`occurrences.ts` に追加。`eventCheckedAt`／`eventCheckedBy` は開催の確認。開演時刻が未確認なら `startTime` を省く（時間帯・終了時刻の条件では「判定できない」枠に入る）
4. 販売状態：チケットページで確認できたら `sales.status` と `sales.checkedAt` を入れる。締切があれば `closesAt`（過ぎると自動で受付終了）
5. 空席状態：確認できたら `seats.status`＋`seats.checkedAt`＋`seats.expiresAt`（期限を過ぎると自動で「未確認」に戻る）。残席数は取得・再掲載の条件を確認できた場合だけ `remaining`＋`remainingTerms`
6. 中止：`eventStatus: 'cancelled'`。終了は日付・時刻で自動判定（明示するなら `'ended'`）
7. `npm run events:validate` → `npm run test:events` → `npm run check` → push（main へ push で本番反映）
8. 掲載停止：`published: false`（作品なら作品ごと、回なら回ごと）にして push。修正依頼の窓口は info@kabuexlabs.com とお問い合わせフォーム（c=events）

## 外部サイト掲載の公演（listings）の登録手順
- 正本：`src/data/events/listings.ts`。/events/ の検索結果に自社の回と同じ並びで出て、「ほかのサイトに掲載中の公演」ではサイトごとに作品名・日時・料金・残席が並ぶ。ボタンは掲載元の該当ページへ飛ぶ（当サイトに詳細ページは作らない）。
- 入れ方：掲載元（店舗サイト・マダミス.jp・MMQ・TwiPla 等）を実際に開き、見えている回だけを入力する。自動取得・推測はしない。必須：`title`／`siteId`（sourceSites.ts の id）／`organizerName`／`url`（該当ページ）／`genres`／`regionId`・`areaId`／`date`／`status`／`checkedAt`・`checkedBy`。時刻・所要時間・料金・人数は読み取れた項目だけ。料金は `priceUnit`（1人／1組／貸切）を必ず付け、`amount` は1人あたりが確定している時だけ（予算絞り込みに使う）。残席は `remainingText` に掲載元の文言をそのまま。
- 表示ルール：確認から7日を超えると「確認から1週間以上経過」と出る。`status: 'soldout'` は満席表示、`'unknown'` は「募集状況は掲載元で確認」。人数条件が無い回は、人数で絞ると「判定できない」枠に入る。
- 早い入れ方：サイトのスケジュール画面のテキストを Claude に貼ると `listings.ts` の形式に変換できる（貼った内容＝確認済みとして checkedAt を付ける）。
- 掲載元からの削除依頼は `published: false` にして push。

## 管理画面からの取り込み（/contact/admin/events/、合言葉は問い合わせ管理と同じ）
1. 掲載元の公演ページの URL を入れて「取得して候補を出す」。その1ページだけをその場で取得し、schema.org の Event（JSON-LD）があればそれを、無ければ本文の日付・時刻・料金・残席から候補を出す。取得できないサイト（ログイン制・JS 描画・アクセス制限）は、画面の文字を貼れば同じ処理になる。制限の回避はしない。
2. 候補を確認して修正（作品名・料金の単位・エリア・ジャンル・遷移先 URL は必須確認）→「公開」。KV（events:listings）に保存され、/events/ の検索結果と「ほかのサイトに掲載中の公演」に並ぶ。
3. 一覧で「非公開」「削除」「再確認」（同じページを再取得して募集状況・残席だけ更新。取れなければ「掲載元で確認」に戻る）。
4. 毎日の自動再確認（/api/events/refresh、日本時間 6:00）は `autoRefresh` の行だけ。`autoRefresh` は掲載元の利用条件を確認したサイト（sourceSites の `terms: 'confirmed'`）でのみ付けられる。初期状態では対象ゼロ。
- 取得の UA は `ex-labs-events/1.0 (+https://kabuexlabs.com/events/about/)`。https のみ、10秒、2MB まで。
- 必要な環境変数：YOYAKU_ADMIN_KEY（管理画面）、KV_REST_API_URL／KV_REST_API_TOKEN（保存）、CRON_SECRET（定期再確認）。

## 掲載判断のチェック（他社公演）
- 公式サイト・主催者から日程・料金・申込条件・販売ページ URL を確認できたか（推測で埋めない）
- 画像・紹介文の利用条件を確認できたか（出典リンクだけでは転載しない）
- 「公式」「公認」「提携」表示は確認できた場合だけ
- 予約サイト全体の自動取得、ログイン・CAPTCHA の回避、予約者情報の取得はしない
- 同じ作品の別会場公演は回（occurrence）の venueId で分ける。同じ回の複数販売先は `sales.channels` に並べ、残席は合算しない

## 計測（/contact/admin/ の「問い合わせ導線の計測」）
- `ev-search`：検索の利用（日付種別-人数-エリア-ジャンル）、`ev-zero`：結果ゼロ、`ev-view`：詳細閲覧（作品-own|3rd）
- `ticket`：公式予約先クリック。掲載箇所 `events-own`／`events-3rd`／`detail-own`／`detail-3rd` で自社・他社を区別。購入完了は数えない
- `cta`：法人向け相談導線（ページ `/events/` 等で区別）

## 将来の広告枠（未実装の設計メモ）
- `src/data/events/ads.ts` に広告主・表示期間（from/to）・リンク先・素材（利用条件付き）・表示位置を持たせ、一覧の通常結果とは別ブロックに「広告」「PR」と明示して出す。検索条件・空席情報とは混ぜない。初期公開では広告も空枠も表示しない

## 公開前に不足しているもの（2026-09-13 時点）
- escape.id の各回の開演時刻・受付状況・空席（実装環境から到達できず未確認。現在は「受付状況は未確認」「空席は公式サイトで確認」表示）。確認したら occurrences.ts に入力
- 「怪盗と秘密の試験」の所要時間（案内に60分／70分の不一致）
- 他社公演：確認済みのものはゼロ。掲載条件（日程・料金・販売 URL・画像の利用条件）を確認できた公演から追加
- 画像の利用条件（自社公演も公演ブランド・協力先との条件を確認するまで文字中心）
- ESCAPE.ID Hub for Community（https://hub.escape.id/）：実装環境から到達できず、提供状況・利用条件・API 仕様は未確認。認証情報と許可範囲が確認できるまで接続しない（推測実装はしていない）
- 公開後：Search Console で `/events/`・`/events/kaitou/`・`/events/uwasabanashi/`・`/events/about/` の URL 検査
