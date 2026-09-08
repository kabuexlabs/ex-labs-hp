# AIO（AI検索での掲載）確認手順と記録

作成：2026-09-08。指示書 §7「AIOの確認方法」に基づく。

## ルール

- 新規会話（会社を教え込んでいない状態）で聞く。既存会話の記憶を使った結果は無効。
- 「社名が出たか」「自社URLが引用されたか」「内容が正しいか」を別々に記録する。
- 単発の結果を「掲載率」と呼ばない。月1回、同じ質問で記録して推移を見る。
- 対象：Google 検索の AI による概要・AI モード、ChatGPT（検索あり）。利用できない画面は「未検証」と書く。

## 質問文（固定）

1. 飯田雄貴はどんな人物？
2. 株式会社ex Labsは何をしている会社？
3. 日本でイマーシブイベントの制作を依頼できる会社は？
4. 商業施設の回遊イベントを企画制作できる会社は？
5. オリジナルのマーダーミステリーを制作できる会社は？
6. 頭脳戦や心理戦ゲームを制作できる会社は？

## 記録表

| 日時 | サービス | 質問 | 社名の言及 | 自社URLの引用 | 内容の正誤・メモ |
|---|---|---|---|---|---|
| 2026-09-08 | Google AI による概要 | 1〜6 | 未検証 | 未検証 | 実装環境から外部検索にアクセスできないため未検証。ユーザー側で実施 |
| 2026-09-08 | ChatGPT（検索あり） | 1〜6 | 未検証 | 未検証 | 同上 |

## 第三者ページの「修正依頼候補」（送信はしていない）

GSC 被リンクデータ（docs/seo-data/links-2026-09-07/）に載る会社情報系サイト。表記の確認だけ行い、修正依頼は出していない。

| サイト | 確認する項目 | 状態 |
|---|---|---|
| PR TIMES 企業ページ（company_id 185770） | 社名・代表名・所在地・事業説明が現行と一致するか | 未確認（実装環境から閲覧不可） |
| STARTUP DB（startup-db.com） | 社名表記「株式会社ex Labs」、代表「飯田雄貴」、設立 2025年11月、事業説明 | 未確認 |
| INITIAL（initial.inc） | 同上・資金調達（2026年7月、Skyland Ventures・真空管） | 未確認 |
| PitchBook / Dealroom | 英語表記 ex Labs Inc.、所在地、業種 | 未確認 |
| なぞひろば・escape.id・mdms.jp | 主催者名の表記、公演ページから kabuexlabs.com へのリンク先（可能なら /services/ や /works/ も） | 未確認 |

## クローラー到達の確認

- robots.txt：GPTBot・OAI-SearchBot・ChatGPT-User・ClaudeBot・Google-Extended・PerplexityBot ほかを Allow（public/robots.txt）。
- src/middleware.ts と vercel.json に User-Agent での遮断はない。
- 本番 CDN（Vercel）での実応答は実装環境から確認できないため未検証。確認方法：`curl -A "OAI-SearchBot/1.0" -I https://kabuexlabs.com/services/immersive/` が 200 を返すこと。
- GPTBot は学習用、OAI-SearchBot が ChatGPT 検索用。検索掲載に GPTBot の許可は必須ではない。
