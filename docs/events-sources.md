# 公演情報の取り込み候補サイト（2026-09-13 調査）

正本は `src/data/events/sourceSites.ts`（/events/ の「ほかのサイトで探す」と /events/about/ に表示）。
この一覧は「リンクして案内する」ためのもので、**自動取得・転載の許可ではない**。取り込みは各サイトの利用条件を確認し `terms: 'confirmed'` にしてから、対象・方法・頻度を docs/events-setup.md に書いて実装する。

## 調査方法と限界
- Web 検索（WebSearch）で公式 URL・予約導線・X アカウントを確認。実装環境から mdms.jp／twipla.jp／escape.id／hub.escape.id へは到達できず、利用規約・API・データ利用条件は未確認（全件 `terms: 'unverified'`、`urlCheck: 'search'`）。
- 公開後にブラウザで各 URL を開いて生存確認し、`urlCheck: 'visited'` に更新する。

## 一覧（分類ごと）
### チケット販売・予約プラットフォーム
| サイト | URL | 何が取れそうか | 当日募集 | 備考 |
|---|---|---|---|---|
| ESCAPE.ID | https://escape.id/ | 謎解き・イマーシブの公演・チケット。自社2公演の販売先 | – | 会員登録制。2026-09 公式リセール開始。hub.escape.id（Hub for Community）は到達不可で未確認 |
| マダミス.jp 募集中の公演一覧 | https://mdms.jp/bookingSlots | 店舗横断の公演募集・残席・予約リンク | ○ | ANAAKEY・マダミスハウス・Light and Geek・NAGAKUTSU 等が予約を集約 |
| MMQ | https://mmq.game/ | クインズワルツ各店の公演予約（2026-04 移行） | ○ | |
| PassMarket | https://passmarket.yahoo.co.jp/ | 主催者ページ単位の開催予定（例：ロストプロダクト） | – | |
| Peatix／teket／ZAIKO／カンフェティ | 各公式 | 小規模イマーシブ公演の販売 | – | 検索で拾う運用 |
| イープラス／ローチケ／ぴあ／アソビュー／楽天チケット | 各公式 | 劇場型・展示型イマーシブ、当日券 | ○（一部） | IMM THEATER はイープラスに会場ページ |

### マダミス専門店・劇場（東京中心）
| 店舗 | URL | 予約導線 | 当日募集 |
|---|---|---|---|
| クインズワルツ（大久保・高田馬場・大塚・大宮） | https://queenswaltz.jp/ | MMQ | ○（X @queens_waltz に🈳投稿） |
| Rabbithole（新宿・御苑・渋谷・新橋・池袋・水道橋・大阪十三） | https://rabbithole.jp/ | 公式オンライン予約 | ○（各店 X） |
| ANAAKEY（水道橋、2025-10 開店） | https://anaakey.com/ | マダミス.jp | ○（X @ANAAKEYinfo） |
| ジョルディーノ（吉祥寺・立川） | https://mdms.jp/joldeeno | マダミス.jp | ○ |
| ロストプロダクト（新宿御苑ほか、提携先） | https://www.lostproduct.jp/schedule/ | 公式・PassMarket | ○ |
| マダミスハウス（渋谷駅前） | https://werewolf-house.com/murder-mystery/ | マダミス.jp／Coubic | ○（毎週日曜の無料会、TwiPla に予定公演一覧） |
| 探偵キャンプ 東京新宿店 | https://mdms.jp/shops/tanteicamp_shinjyuku | マダミス.jp | ○ |
| ジョイマダ（新宿・舟町） | https://joymada.com/ | 公式 | ○ |
| IMM THEATER | https://imm.theater/archive | イープラス | – |
| 東京ミステリーサーカス | https://mysterycircus.jp/tokyo/ | 公式 | ○ |
| NAGAKUTSU（梅田ほか大阪・名古屋） | https://www.nagakutsu.com/ | マダミス.jp | ○ |
| Light and Geek（京都、提携先） | https://lightandgeek.yorozuyagakudan.com/ | マダミス.jp | ○ |
| apri la porta（広島、提携先） | https://apri-la-porta.com/ | 公式 | – |

除外：ワンルームマダミス高田馬場店（検索結果に閉店の記載あり。営業状況を確認できるまで掲載しない）。

### 情報ポータル・検索サイト
マダミス.jp（https://mdms.jp/）、マダミスch（https://mmch.jp/）、いまミス（https://imamis.jp/）、Murder.JP（https://www.murder.jp/）、マダミスマニア（https://mdms-mania.com/store/tokyo/）、ナゾ広場（https://nazohiroba.com/）、東京イマーシブシアター（https://tokyo-immersive.com/）、Immersive Info（https://immersive-info.com/events）、ステージナタリー イマーシブタグ（https://natalie.mu/stage/content_tag/388/play）、レッツエンジョイ東京 没入体験（https://www.enjoytokyo.jp/event/list/cat0311/）

### 当日募集・参加者募集
TwiPla（https://twipla.jp/ 「マダミス」検索。当日参加型の会、店舗の予定公演一覧）、X「#マダミス募集」（店舗・GM の🈳・当日募集）、X「#イマーシブシアター」、こくちーずプロ マダミス特集、ジモティー、Discord「マーダーミステリー オンラインセッション募集用」（DISBOARD）ほか Discoparty／ディス速のサーバー一覧

## 取り込みの優先順位（提案）
1. **マダミス.jp**：店舗横断で募集・残席があり、東京の専門店の多くが予約を集約している。運営（shop-lp.mdms.jp）に「公演の一覧表示・残席の再掲載」の可否と条件を確認するのが最短。
2. **ESCAPE.ID**：イマーシブ公演の販売が集まる。hub.escape.id（Hub for Community）の提供状況・認証・許可範囲を確認してから接続。
3. **店舗の公式サイト・X**：クインズワルツ／Rabbithole／ANAAKEY／ロストプロダクト等は当日の空席をX に投稿する。API 取得はせず、確認して `occurrences.ts` に手入力（確認日時つき）。
4. **TwiPla／#マダミス募集**：個人GM の募集が多く、主催者・料金・成立条件の確認が必要。掲載は主催者の同意が取れたものだけ。

## 主催者・サイトへの連絡（このセッションでは送信していない）
- マダミス.jp 運営：公演一覧・残席の再掲載条件
- ESCAPE.ID：Hub for Community の利用申請
- 各店舗：公演の掲載可否、画像・紹介文の利用条件、当日空席の共有方法
