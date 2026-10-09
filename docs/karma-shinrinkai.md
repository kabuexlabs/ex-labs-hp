# 真凜会（/karma/shinrinkai/）会員限定書庫の運用メモ

「臓腑、或いはカルマ」の劇中団体「真凜会」のページ。パンフレット（グッズ）購入者向けの特典サイト。
すべて noindex。sitemap・llms.txt・他ページからはリンクしない。

## 会員限定書庫（2026-10-09 HIGE さん指示）

| カード | ページ | パスワード | 素材の置き場所 |
|---|---|---|---|
| 解説 | /karma/shinrinkai/commentary/ | なし | `src/data/karma/commentary.ts`（本文を入れるとカードがつながる） |
| 特典ショートストーリー（旧「裏設定資料」の枠） | /karma/shinrinkai/story/ | あり | 暗号化して `public/assets/karma/sealed/story.json` |
| 特別肖像集 | /karma/shinrinkai/portraits/ | あり | 暗号化して `public/assets/karma/sealed/portraits/`（サムネイル一覧→押すとポップアップ。表示名＝ファイル名の役と名前） |
| 捜査資料 | /karma/shinrinkai/files/ | なし | PDF を `public/assets/karma/files/` に置くだけ（リンク名＝ファイル名） |

素材がまだのカードは押すと「準備中」のお知らせ（解説は「ただいま準備中」の枠）。素材を入れてビルドすれば自動でページにつながる。

パスワード：ショートストーリー・特別肖像集とも「rin」（2026-10-09 指示）。3文字なので総当たりには弱く、購入者向けの合言葉（目隠し）程度の強さ。

## パスワード付き特典の仕組み

リポジトリは公開なので、小説本文や写真の原本・パスワードはコミットしない。
`scripts/karma-seal.mjs` が パスワード→PBKDF2-SHA256（60万回）→AES-GCM で暗号化し、暗号文だけを `public/assets/karma/sealed/` に置く。
閲覧者がパスワードを入れるとブラウザ（`src/scripts/karmaSeal.ts`）で復号する。違うパスワードでは復号できない。
同じタブでは鍵を sessionStorage に覚え、再入力不要（パスワード自体は保存しない）。全角・半角と大文字・小文字の違いは吸収（NFKC＋小文字化）。

注意：暗号文は公開されているので、短い・推測しやすいパスワードだと総当たりで解かれ得る。英数字10文字以上を推奨。

### 更新手順

1. 原本を `private/karma/`（.gitignore 済み）に置く。
   - 小説：`private/karma/story.txt`（1行目＝タイトル、2行目以降＝本文、空行で段落）
   - 写真：`private/karma/portraits/`（表示名＝ファイル名。長辺1600px程度に縮小しておく）
     サムネイルは同名で `private/karma/portraits/_thumbs/`（長辺600px程度）
2. 暗号化：
   ```
   KARMA_STORY_PASS='合言葉' node scripts/karma-seal.mjs story private/karma/story.txt
   KARMA_PORTRAIT_PASS='合言葉' node scripts/karma-seal.mjs portraits private/karma/portraits
   ```
3. `npm run check` → `public/assets/karma/sealed/` をコミットして push。
   パスワードを変えるときは同じコマンドを新しいパスワードで実行し直す（前の暗号文は上書き）。
