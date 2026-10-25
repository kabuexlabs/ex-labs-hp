# 「夢の島熱帯植物館」検索での露出強化（2026-10-25）

依頼: 「夢の島熱帯植物館」で検索したときに「午前零時の幻想集 第一夜『草陰の夢』」が出るようにしたい。

## 現実的な目標の置き方
- 会場名だけの検索（`夢の島熱帯植物館`）は、植物館の公式サイト・Wikipedia・観光ガイド・施設紹介サイトが上位を占める。自社サイトが開催中のイベントとしてそこに入るのは、サイト側の施策だけでは難しい（会場そのものの情報を求める検索のため）
- 取れる見込みがある検索: `夢の島熱帯植物館 夜`、`夢の島熱帯植物館 イベント（11月）`、`夢の島熱帯植物館 夜間`、`午前零時の幻想集`、`草陰の夢`、`夢の島熱帯植物館 午前零時の幻想集`
- 確認方法: Search Console の「検索パフォーマンス」でページ `/guide/yumenoshima-night/` `/gensou/` `/events/gensou/` を絞り、クエリ別の表示回数・平均掲載順位を見る（上の検索語が出てくるか）。本ツールからは Google の実際の検索結果・Search Console は見られない

## 今回のサイト側の変更（2026-10-25）
1. **会場名・公演名が本文中で途中分断されていた**: 改行調整の仕組み（`src/lib/jpbreak.ts`）が `夢の<wbr>島熱帯植物館` のように分けていた（案内記事で17回中12回）。「夢の島熱帯植物館」「午前零時の幻想集」「7枚目のコンポジション」を分断対象から外し（京都市京セラ美術館は従来どおり）、全ページで連続した1つの語として出力
2. **公式ページ（/gensou/）↔案内記事の相互リンク**: これまで案内記事から公式ページへのリンクのみで、公式ページ・公演検索ページ（/events/gensou/）から案内記事へのリンクがなかった。`/gensou/`（チケット欄・会場欄）、`/events/gensou/`・`/events/7th-composition/`（「案内記事」行）、`/taikenbizyutu/7th-composition/`（チケット欄）に追加
3. **会場の構造化データ**: Event／EventSeries／Article の会場（Place）に会場の公式サイト（`url`）と同一性を示す外部ページ（`sameAs`: 公式サイト・Wikipedia・Tokyo Art Beat。京都は公式サイト・Tokyo Art Beat）を追加。データは `src/data/events/venues.ts`（`url`／`sameAs`）
4. **`/events/gensou/` `/events/7th-composition/` の title・description に会場名**: 「（東京・新木場・夢の島）」→「（東京・夢の島熱帯植物館）」、「（京都・京都市・岡崎）」→「（京都・京都市京セラ美術館）」（`src/data/events/works.ts` の `seoPlace`。他の公演ページの title は変えていない）
5. 案内記事の `dateModified`・sitemap の lastmod を 2026-10-25 に

## 確認結果
- `npm run check` 成功、内部リンク切れ 0
- 会場名・公演名の連続一致数＝全出現数（案内記事 17/17、公式ページ 15/15、トップ 8/8 ほか）
- 構造化データ: Event／EventSeries／Article の会場に `url`・`sameAs` が出力されている
- スマホ幅（320／390px）の表示確認。既存の問題として、`/events/7th-composition/`・`/events/kotohogi/` は 320px 幅だけ横にはみ出す（今回の変更前から。360px 以上は問題なし）

## 人がやること（効果が大きい順）
1. Search Console で `/guide/yumenoshima-night/` `/gensou/` `/events/gensou/` の URL 検査 → インデックス登録をリクエスト（今回の変更を再クロールさせる）
2. **夢の島熱帯植物館に掲載を依頼**: 公式サイトのイベントページ、月間チラシ、X（@yumenetsu）、Google マップの「イベント」投稿。会場名検索の1位は植物館公式サイトなので、そこから公演へリンクしてもらうのが最も効く（原稿: `docs/event-listings/gensou.md`）
3. **PR TIMES で配信**（原稿: `docs/press/gensou-prtimes.md`）。タイトルに「夢の島熱帯植物館」を入れてあり、配信後の転載で会場名検索に載るサイトが増える
4. note・X など外部に、公演ページ（`/gensou/`）か案内記事（`/guide/yumenoshima-night/`）へのリンク付きで「夢の島熱帯植物館」「午前零時の幻想集」を含む投稿を出す（早く検索に載りやすい）
5. 江東区観光協会・レッツエンジョイ東京・Walkerplus への掲載依頼（窓口は `docs/event-listings/gensou.md` に記載）
