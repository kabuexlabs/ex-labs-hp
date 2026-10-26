# 公演の予約導線 計測メモ（2026-10-22 改修分）

購入完了は予約サービス（escape.id）側にしかなく、このサイトでは計測できない。ここで数えるのは「予約サイトへのリンクをクリックした回数」までで、購入件数・販売枚数は escape.id の管理画面で確認する。

## 1. 仕組み（既存の計測を流用。新しい解析アカウント・外部サービスはなし）

- クリックは `src/components/SiteGuard.astro` が `/api/track` にビーコン送信し、`src/lib/contact.ts` の `recordMetric()` が Upstash KV に日別で数える（氏名・メールなどの個人情報は送らない。値はイベント名・ページパス・カテゴリの3つ）
- 予約リンクは `data-track="ticket"` を付けたリンク。イベント名 `ticket` の値（カテゴリ）は 2026-10-22 から **`公演-掲載位置-リンク先ドメイン`**（例 `gensou-yumenoshima-sticky-escape-id`）。それ以前の値は `公演-掲載位置`
  - 公演識別子: `gensou`（夢の島）、`7th-composition`（京都）、ほか公演データの id
  - 掲載位置: `data-place`。末尾の語が位置を表す（`top`＝冒頭／`body`＝本文（料金・日程の直後）／`bottom`＝末尾／`sticky`＝スマホの固定ボタン）。改修前からある位置名はそのまま（下表）
  - リンク先: ドメインのドット→ハイフン（`escape-id`）。公演ごとのリンク先 URL は固定（夢の島 https://escape.id/gensou-org/e-ichi/ 、京都 https://escape.id/kyoukaiart-org/e-7th/ ）
- 自社の公演ページへの移動は `show` イベント（値は `公演-掲載位置`）。閲覧数は `view` イベント（ページパス）
- `data-track` の無いリンクで escape.id 等へ飛んだ場合も `ticket`（値 `link-escape-id`）として数える（重複はしない：`data-track` があればそちらだけ送る）
- 新しいイベント名 `ticket_click` は作らない（既存の `ticket` と二重計上になるため）

### 掲載位置（data-place）の対応表

| ページ | 冒頭 | 本文 | 末尾 | 固定表示（スマホ） |
|---|---|---|---|---|
| `/guide/immersive-tokyo/` | `immersive-tokyo-top`（11月の案内枠） | `guide-cal*`（カレンダー）、`guide-compare-now`、`guide-compare`、`guide-card` | — | — |
| `/gensou/` | `gensou-top`（基本情報の帯）、`gensou-header`、`gensou-side`、`gensou-menu` | `gensou-body`（会期・会場の直後）、`gensou-ticket`（チケット欄） | `gensou-final` | `gensou-sticky` |
| `/guide/yumenoshima-night/` | `yumenoshima-hero` | `yumenoshima-body`（人数別料金の直後） | `yumenoshima-bottom` | `yumenoshima-sticky` |
| `/taikenbizyutu/7th-composition/` | `top`（基本情報の帯） | `ticket`、`info` | — | `float`（既存の右下固定ボタン） |
| `/guide/kyoto-kyocera-museum-7th/` | `kyoto7-hero` | `kyoto7-body`（料金表の直後） | `kyoto7-bottom` | `kyoto7-sticky` |
| `/guide/kyoto-november-experience/` | `kyoto-nov-top` | `kyoto-nov-body`（各回の時間の直後） | `kyoto-nov-bottom` | `kyoto-nov-sticky` |
| `/guide/tokyo-night-botanical-garden/`（2026-10-27） | `night-garden-top` | `night-garden-body`（チケット予約の節） | `night-garden-bottom` | `night-garden-sticky` |
| `/guide/tokyo-night-immersive/`（2026-10-27） | `night-immersive-top` | `night-immersive-body`・`night-immersive-check`（開催日・予約先の確認の節） | `night-immersive-bottom` | `night-immersive-sticky` |
| `/guide/kyoto-art-experience-november/`（2026-10-27） | `kyoto-art-top` | `kyoto-art-body`（チケット予約の節） | `kyoto-art-bottom` | `kyoto-art-sticky` |
| `/guide/botsunyukan/` `/guide/immersive/` | — | `botsunyukan-picks-body` `immersive-picks-body` | — | — |
| `/` | — | `home-body`（公演欄の「日程・空席を見る」） | — | — |
| デート・一人参加記事 | `*-pickup`（幻想集の紹介枠） | — | — | — |

## 2. 週次で確認する指標（毎週同じ曜日に、直近7日と前の7日を比べる）

| 指標 | 取り方 | 分母・集計方法 |
|---|---|---|
| 公演別の検索クリック数 | Search Console → ページ → 対象URL（公式ページ・案内記事・新規記事）のクリック数 | 7日間の合計。URL ごと |
| 記事から公演ページへの移動数 | 管理画面（/contact/admin/）の `show` イベント。値の先頭が `gensou` / `7th-composition` / `guide-yumenoshima` / `guide-kyoto7` のもの | 7日間の合計。発生ページ別 |
| 公演別の予約リンククリック数 | `ticket` イベント。値の先頭が `gensou` / `7th-composition` | 7日間の合計。掲載位置（値の2番目以降）別にも出す |
| 予約リンククリック率 | 上の値 ÷ 対象ページの `view`（閲覧数） | **分母は同じ7日間の対象ページの閲覧数**。ページごとに算出し、合算するときは分子・分母をそれぞれ合計してから割る |
| 購入件数・販売枚数 | escape.id の管理画面（取得できる場合） | 公演別・7日間 |

- 管理画面は直近28日分を表示する。週次比較は、各週の数字を手で控える（`docs/event-weekly-log.md` に追記する運用を推奨）
- 改修日は 2026-10-22（公開日時は changelog）。公開から7日間と、その前の7日間を比較できる

## 3. 制約
- 購入完了・購入金額は escape.id にしかない。escape.id 側にコンバージョン計測（外部タグ等）が用意されているかは未確認 → 確認できるまで「予約リンククリック」までを指標にする
- 空席数は取得していないため、サイト上に「空席あり」「残りわずか」は表示しない
