# 漢方体質チェック 試験サイト 実装指示書 v0.1

Oct 21, 2026 · @株式会社ex Labs

「漢方体質ヒアリング項目 定義案 v0.1」と 10/21 のご判断をもとに、Claude Code（または社内開発）がそのまま実装に着手できる粒度で試験サイトの仕様をまとめたものです。

## 目的・スコープ・確定した要件

店頭（ESSENCE薬局 武蔵小杉店、1店舗・薬剤師2名）で iPad を使い、来店客の体質チェックと薬剤師による漢方選定を支える Web アプリの試験版を、自社実装で作ります。パスワードでログインする非公開の試験サイトとして公開し、店頭で試しながら設問・文面・処方マスタを調整します。

| 項目 | 確定内容 |
| --- | --- |
| 結果タイプ | 8タイプ（気虚・血虚・気滞・瘀血・水滞・陰虚・陽虚・陽盛）＋内部の補助軸（虚実・寒熱） |
| 設問 | 基本情報5問・体質13問・安全確認5問・生活習慆4問（所要5〜7分） |
| 入力者 | 来店客本人（iPadを渡す）とスタッフの聞き取り入力の両対応（同じ画面） |
| 来店客に見せる範囲 | レーダーチャートと体質カード、改善アドバイスまで。処方候補はスタッフ画面のみ |
| 舌チェック | セルフ（イラスト付き）／薬剤師（対面で入力）の2モード。触診（腹診・脈診）の入力欄は作らない |
| 処方候補 | 上位3件、絞り込みなし、おすすめ順。取扱商品一覧がないため、汎用の処方名マスタを初期データとし、薬剤師が編集する |
| 結果カードの文面 | こちらで草案（専門的なトーン）。本書第7節に収録。監修者表示は薬剤師名を設定で入れる |
| 急性症状 | 店頭利用が前提のため別フローは作らない。フラグをスタッフ画面に出すだけ |
| データ保存 | 保存する。保持期間3年。顧客の識別は会員番号・電話番号・LINEのいずれか。スタッフ全員が閲覧可 |
| 外部連携 | 初版は単独（会員管理・POS・EC・LINEとの連携なし） |
| 端末 | 店頭の iPad（Safari）。スタッフは PC ブラウザからも利用 |
| 認証 | 共通パスワードでログイン。スタッフ画面はさらに4桁PIN |
| 法規確認 | 当事者が薬剤師のため社内で確認。画面上は「診断」「処方」を使わず「体質チェック」「ご提案」 |
| 実装 | 自社。本書の第12節を Claude Code に渡して着手できる構成 |

**初版のスコープ外**: 管理画面での設問編集（JSONファイルで管理）、メール・LINEでの結果送信（初版は画面表示とA4印刷）、在庫・価格連携、複数店舗対応。

## 技術構成と環境

Next.js（App Router）＋TypeScript＋Tailwind CSS＋Prisma＋PostgreSQL の単一リポジトリで、Vercel にデプロイして共通パスワードで守る構成を推奨します。理由は、iPadのSafariとPCの両方で動き、サーバー管理が不要で、設問や文面のJSONを書き換えて再デプロイするだけで調整できるからです。

| 層 | 採用 | 補足 |
| --- | --- | --- |
| フレームワーク | Next.js 15（App Router）＋TypeScript | Server Actions で保存処理。API Routes は印刷用PDFとヘルスチェックのみ |
| UI | Tailwind CSS＋shadcn/ui | iPad横置き（1024×768）を基準に、縦置きとPCも対応。タップ領域は高さ56px以上 |
| レーダーチャート | Recharts（RadarChart） | 8軸、上から時計回りに 気虚・血虚・気滞・瘀血・水滞・陰虚・陽虚・陽盛 |
| DB | PostgreSQL（Neon または Supabase の無料枠）＋Prisma | ローカルは Docker Compose の Postgres。回答とスコアは JSONB 列に保存 |
| 認証 | iron-session（Cookieセッション） | 共通パスワードを環境変数 `APP_PASSWORD` に。スタッフ画面は `STAFF_PIN`（4桁）で再認証 |
| マスタデータ | `data/questions.json`、`data/types.json`、`data/formulas.json` | リポジトリ内のJSON。起動時に zod で検証。薬剤師が直接編集 |
| 印刷 | `@media print` のA4レイアウト | iPadの共有メニューからPDF保存・AirPrint。サーバー側PDF生成は初版では作らない |
| デプロイ | Vercel（Hobby） | `main` ブランチへの push で自動デプロイ。URLは非公開だが、ログインなしではどのページも見えない |
| テスト | Vitest（スコアリング・候補提示）、Playwright（主要導線1本） | スコアリングは純粋関数にして単体テストを必須にする |

**ディレクトリ構成**

```text
kampo-check/
  app/
    (public)/login/page.tsx          共通パスワードログイン
    (kiosk)/check/new/page.tsx       受付（顧客識別・舌モード選択）
    (kiosk)/check/[id]/q/[step]/page.tsx  設問（1画面1問）
    (kiosk)/check/[id]/result/page.tsx    来店客向け結果
    (kiosk)/check/[id]/advice/[type]/page.tsx  改善アドバイス
    (staff)/staff/pin/page.tsx       PIN入力
    (staff)/staff/page.tsx           本日のセッション一覧・検索
    (staff)/staff/session/[id]/page.tsx  担当者画面（警告・スコア・舌入力・処方候補・メモ）
    (staff)/staff/customer/[id]/page.tsx  顧客の履歴
    api/health/route.ts
  lib/
    scoring.ts        スコアリング（純粋関数）
    recommend.ts      処方候補（純粋関数）
    safety.ts         安全確認フラグ
    masters.ts        JSON読み込み＋zod検証
    session.ts        iron-session 設定
  data/
    questions.json  types.json  formulas.json
  prisma/schema.prisma
  tests/scoring.test.ts  recommend.test.ts
  .env.example
```

**環境変数**: `DATABASE_URL`、`APP_PASSWORD`（共通パスワード）、`STAFF_PIN`（4桁）、`SESSION_SECRET`（32文字以上）、`SUPERVISOR_NAME`（監修者表示用の薬剤師名）、`RETENTION_YEARS=3`。

## 画面一覧と遷移

来店客モードは「受付→設問→結果」の一本道、スタッフ画面はPINの後ろに置きます。

&#91;embedded content: 画面遷移 · 来店客モード4画面、スタッフ画面4画面\]

来店客に iPad を渡している間はスタッフ画面への導線が見えないようにし、結果画面の隠しボタン（右下を長押し）からPIN入力へ進みます。

| 画面 | パス | 内容と振る舞い |
| --- | --- | --- |
| ログイン | `/login` | 共通パスワードのみ。成功でCookieセッション（30日）。未ログインは全ページをここへリダイレクト |
| 受付 | `/check/new` | 顧客識別（会員番号／電話番号／LINE表示名のいずれか、または「識別なし」）、舌チェックのモード選択（ご自分で／スタッフが確認）、保存の同意文と同意ボタン。同意でセッション作成 |
| 設問 | `/check/[id]/q/[step]` | 1画面1問。上部に進捗ドット、「戻る」「次へ」。複数回答可の問は「どれもあてはまらない」を含めて1つ以上選ぶまで「次へ」を無効。「どれもあてはまらない」を押すと他の選択を解除。回答は1問ごとに保存（途中離脱しても再開できる）。性別が女性以外ならB11月経をスキップ、舌モードがスタッフならB13をスキップ |
| 結果 | `/check/[id]/result` | 8軸レーダー、タイプ別の点数と段階、主体質・副体質のカード（アイコン・体質名・読み・点数・状態の一言・説明・代表症状5つ・「改善アドバイスを見る」）、「薬剤師が詳しくご提案します」の案内、印刷ボタン。処方名・商品名は出さない |
| 改善アドバイス | `/check/[id]/advice/[type]` | 特徴／生活養生（心・食・動・休）／おすすめのツボ（位置・効果）／監修者。生活習慣（D）の回答に応じて「あなたへの一言」を出し分け |
| PIN入力 | `/staff/pin` | 4桁。成功でスタッフセッション（12時間）。結果画面から来た場合はそのセッションの担当者画面へ直行 |
| セッション一覧 | `/staff` | 本日のチェック一覧（時刻・識別子・主体質・警告の有無・提案済みか）、顧客検索（会員番号・電話・LINE名）、「新規チェックを始める」 |
| 担当者画面 | `/staff/session/[id]` | 上から: 安全確認フラグ（赤）、主訴・なりたい自分・期間、タイプ別スコアと虚実・寒熱指数、舌所見（スタッフモードならここで入力し再計算。セルフなら回答を表示し上書き可）、回答一覧（折りたたみ）、処方候補上位3件（根拠と注意生薬付き）、選定した処方とメモ、保存 |
| 顧客履歴 | `/staff/customer/[id]` | 同一識別子の過去セッションを新しい順に。スコアの推移と提案の履歴 |

## データモデル

DBに持つのは「顧客」「チェックセッション」「提案」の3テーブルだけで、設問・タイプ定義・処方マスタはリポジトリ内のJSONで管理します。回答とスコアはJSONBで保存し、設問を変えても過去データを壊さないように、セッションに設問マスタのバージョンを記録します。

```prisma
model Customer {
  id          String   @id @default(cuid())
  memberNo    String?  @unique      // 会員番号
  phone       String?  @unique      // 電話番号（ハイフンなしで正規化）
  lineName    String?               // LINE表示名（識別補助。一意ではない）
  displayName String?               // 店頭で呼ぶ名前（任意）
  sex         String?               // female / male / none
  ageBand     String?               // 10s..70s
  createdAt   DateTime @default(now())
  sessions    CheckSession[]
}

model CheckSession {
  id              String   @id @default(cuid())
  customerId      String?
  customer        Customer? @relation(fields: [customerId], references: [id])
  questionnaireVersion String            // 例 "2026-10-21"
  tongueMode      String                 // self / staff
  inputBy         String                 // customer / staff
  consentAt       DateTime               // 保存同意の時刻
  answers         Json                   // { "B1": ["B1-1","B1-4"], "C1": {"value":"yes","text":"…"} }
  scores          Json?                  // 第6節の ScoreResult
  safetyFlags     Json?                  // 第9節の SafetyFlag[]
  status          String   @default("in_progress") // in_progress / completed / proposed
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  expiresAt       DateTime               // startedAt + RETENTION_YEARS
  proposal        Proposal?
  @@index([customerId, startedAt])
}

model Proposal {
  id          String   @id @default(cuid())
  sessionId   String   @unique
  session     CheckSession @relation(fields: [sessionId], references: [id])
  staffName   String               // 担当薬剤師名（選択式）
  tongueOverride Json?             // スタッフが入力・上書きした舌所見
  candidates  Json                 // 表示した候補3件とスコア（監査用）
  selected    Json                 // [{ formulaCode, reason }]
  note        String?
  deliveredVia String?             // screen / print
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**JSONマスタの型（zodで検証）**

```ts
// data/questions.json
type TypeKey = "qi_def"|"blood_def"|"qi_stag"|"blood_stasis"|"fluid"|"yin_def"|"yang_def"|"yang_exc";
// 気虚 | 血虚 | 気滞 | 瘀血 | 水滞 | 陰虚 | 陽虚 | 陽盛

type Option = {
  id: string;                 // "B1-1"
  text: string;               // 画面に出す文
  weights?: Partial<Record<TypeKey, number>>; // 例 { qi_def: 1 } や { blood_def: 0.5, yin_def: 0.5 }
  flags?: string[];           // "refer"(受診勧奨) "none"(どれもあてはまらない) "menopause" など
  image?: string;             // 舌イラストのパス
  freeText?: boolean;         // 自由記入欄を付ける
};
type Question = {
  id: string;                 // "B1"
  block: "A"|"B"|"C"|"D";
  title: string;              // "体型・体力・声"
  type: "single"|"multi"|"text";
  scored: boolean;            // 体質スコアに入れるか
  showIf?: { sex?: "female"; tongueMode?: "self" };
  options: Option[];
};

// data/formulas.json
type Formula = {
  code: string;               // "TJ-41" など任意。商品が決まったら商品コードに
  name: string;               // 補中益気湯
  reading: string;            // ほちゅうえっきとう
  types: Partial<Record<TypeKey, number>>; // 対応タイプと重み 0〜1
  deficiency: "def"|"mid"|"exc";          // 虚証 / 虚実間 / 実証
  thermal: "warm"|"neutral"|"cool";       // 温める / 中間 / 冷ます
  complaints: string[];       // 主訴タグ "fatigue" "cold" "skin" "gi" "bowel" "edema" "sleep" "mood" "pain" "menstrual" "weight" "cold_prone"
  keySigns: string[];         // 選択肢ID。一致すると加点（例 "B5-4" のどのつかえ→半夏厚朴湯）
  cautionHerbs: string[];     // "甘草" "麻黄" "附子" "大黄" "山栩子" "柴胡"
  contraindications: string[];// "pregnancy" "interferon" "hypertension" "heart" "thyroid" "glaucoma_bph" "gi_weak"
  priority: number;           // おすすめ順（小さいほど上）。同点時の並び順
  note?: string;              // 担当者向けの一言
  active: boolean;
};
```

## 設問マスタ最終版

定義案の設問候補を、参考サイトと同じ「1問で8タイプを一巡させる」ルールで8〜10選択肢に絞ったものです。このまま `data/questions.json` にします（`weights` のキーは第4節の TypeKey。省略時は加点なし）。文言は薬剤師が後から自由に直せます。

**ブロックA 基本情報（5問・スコアなし）**

```json
{
  "version": "2026-10-21",
  "questions": [
    { "id": "A1", "block": "A", "title": "性別", "type": "single", "scored": false,
      "options": [
        { "id": "A1-1", "text": "女性" }, { "id": "A1-2", "text": "男性" }, { "id": "A1-3", "text": "回答しない" } ] },
    { "id": "A2", "block": "A", "title": "年代", "type": "single", "scored": false,
      "options": [
        { "id": "A2-1", "text": "10代" }, { "id": "A2-2", "text": "20代" }, { "id": "A2-3", "text": "30代" }, { "id": "A2-4", "text": "40代" },
        { "id": "A2-5", "text": "50代" }, { "id": "A2-6", "text": "60代" }, { "id": "A2-7", "text": "70代以上" } ] },
    { "id": "A3", "block": "A", "title": "今いちばん気になっていること", "type": "multi", "scored": false, "max": 3,
      "options": [
        { "id": "A3-1", "text": "疲れ・だるさ", "tag": "fatigue" }, { "id": "A3-2", "text": "冷え", "tag": "cold" },
        { "id": "A3-3", "text": "肌・髪", "tag": "skin" }, { "id": "A3-4", "text": "胃腸", "tag": "gi" },
        { "id": "A3-5", "text": "便通", "tag": "bowel" }, { "id": "A3-6", "text": "むくみ", "tag": "edema" },
        { "id": "A3-7", "text": "睡眠", "tag": "sleep" }, { "id": "A3-8", "text": "ストレス・気分", "tag": "mood" },
        { "id": "A3-9", "text": "痛み・こり", "tag": "pain" }, { "id": "A3-10", "text": "月経・更年期", "tag": "menstrual" },
        { "id": "A3-11", "text": "体重", "tag": "weight" }, { "id": "A3-12", "text": "風邪をひきやすい", "tag": "cold_prone" },
        { "id": "A3-13", "text": "その他", "freeText": true } ] },
    { "id": "A4", "block": "A", "title": "その症状はいつからですか", "type": "single", "scored": false,
      "options": [
        { "id": "A4-1", "text": "3日以内", "flags": ["acute"] }, { "id": "A4-2", "text": "1〜2週間" },
        { "id": "A4-3", "text": "1か月以内" }, { "id": "A4-4", "text": "半年以内" }, { "id": "A4-5", "text": "それ以上" } ],
      "sub": { "title": "日常生活への影響", "options": [
        { "id": "A4s-1", "text": "ほとんどない" }, { "id": "A4s-2", "text": "少しある" }, { "id": "A4s-3", "text": "大きい", "flags": ["severe"] } ] } },
    { "id": "A5", "block": "A", "title": "なりたい自分", "type": "multi", "scored": false,
      "options": [
        { "id": "A5-1", "text": "元気で体力のある自分でいたい", "goal": "energy" },
        { "id": "A5-2", "text": "肌や髪のツヤを保ちたい", "goal": "beauty" },
        { "id": "A5-3", "text": "気持ちを穏やかに保ちたい", "goal": "calm" },
        { "id": "A5-4", "text": "体を軽くすっきりさせたい", "goal": "light" },
        { "id": "A5-5", "text": "冷えやほてりを整えたい", "goal": "thermal" },
        { "id": "A5-6", "text": "年齢に負けない体を作りたい", "goal": "aging" } ] },
```

**ブロックB 体質チェック（13問・複数回答可・各問の末尾に「どれもあてはまらない」）**

各問の最後に `{ "id": "Bn-0", "text": "どれもあてはまらない", "flags": ["none"] }` を必ず付けます（以下では省略）。

```json
    { "id": "B1", "block": "B", "title": "体型・体力・声", "type": "multi", "scored": true, "options": [
      { "id": "B1-1", "text": "疲れやすく、少し動くと息切れする", "weights": { "qi_def": 1 } },
      { "id": "B1-2", "text": "風邪をひきやすく、声が小さくて聞き返される", "weights": { "qi_def": 1 } },
      { "id": "B1-3", "text": "やせていて、肌や髪が乾燥しやすい", "weights": { "blood_def": 0.5, "yin_def": 0.5 } },
      { "id": "B1-4", "text": "体重の増減が激しく、ストレスで食べ過ぎたり食べられなくなったりする", "weights": { "qi_stag": 1 } },
      { "id": "B1-5", "text": "お腹周りが太りやすく、下腹部を押すと痛いところがある", "weights": { "blood_stasis": 1 } },
      { "id": "B1-6", "text": "水太り気味で、体が重だるい", "weights": { "fluid": 1 } },
      { "id": "B1-7", "text": "夕方になると微熱っぽく、体がほてる", "weights": { "yin_def": 1 } },
      { "id": "B1-8", "text": "下半身が冷えて太りやすく、腰や膝がだるい", "weights": { "yang_def": 1 } },
      { "id": "B1-9", "text": "がっちりした体型で暑がり、声が大きく体力がある", "weights": { "yang_exc": 1 } } ] },

    { "id": "B2", "block": "B", "title": "顔色・肌・髪", "type": "multi", "scored": true, "options": [
      { "id": "B2-1", "text": "肌のたるみが気になる", "weights": { "qi_def": 1 } },
      { "id": "B2-2", "text": "顔色が白く血色がなく、肌にツヤがない", "weights": { "blood_def": 1 } },
      { "id": "B2-3", "text": "髪が細くパサつく、爪が薄く割れやすい", "weights": { "blood_def": 1 } },
      { "id": "B2-4", "text": "ストレスがたまると肌荒れやニキビが出やすい", "weights": { "qi_stag": 1 } },
      { "id": "B2-5", "text": "顔色が暗く、シミ・くすみ・目の下のクマが目立つ", "weights": { "blood_stasis": 1 } },
      { "id": "B2-6", "text": "唇の色が暗い、紫っぽい", "weights": { "blood_stasis": 1 } },
      { "id": "B2-7", "text": "湿疹やイボが出やすく、肌がジュクジュクしやすい", "weights": { "fluid": 1 } },
      { "id": "B2-8", "text": "肌が乾燥しやすく、同年代より白髪・抜け毛が多い", "weights": { "yin_def": 1 } },
      { "id": "B2-9", "text": "顔色が青白く、冷えると青くなる", "weights": { "yang_def": 1 } },
      { "id": "B2-10", "text": "肌が赤く、ニキビが化膿しやすい、目が充血しやすい", "weights": { "yang_exc": 1 } } ] },

    { "id": "B3", "block": "B", "title": "冷え・ほてり", "type": "multi", "scored": true, "options": [
      { "id": "B3-1", "text": "冷えるとお腹を壊す、疲れると冷えが強くなる", "weights": { "qi_def": 0.5, "yang_def": 0.5 } },
      { "id": "B3-2", "text": "手足の先が冷える", "weights": { "blood_def": 0.5, "yang_def": 0.5 } },
      { "id": "B3-3", "text": "冷えたりほてったり、日や気分で変わる", "weights": { "qi_stag": 1 } },
      { "id": "B3-4", "text": "上半身はのぼせるのに足は冷える、肩がこる", "weights": { "qi_stag": 0.5, "blood_stasis": 0.5 } },
      { "id": "B3-5", "text": "冷えるとむくみ、体が重くなる", "weights": { "fluid": 1 } },
      { "id": "B3-6", "text": "手のひらや足の裏がほてる、顔がのぼせる", "weights": { "yin_def": 1 } },
      { "id": "B3-7", "text": "手よりもお腹や腰が冷たい", "weights": { "yang_def": 1 } },
      { "id": "B3-8", "text": "全身が冷えて寒がり、温かい飲み物や食べ物を好む", "weights": { "yang_def": 1 } },
      { "id": "B3-9", "text": "暑がりで顔が赤くのぼせやすく、冷たい飲み物をよく飲む", "weights": { "yang_exc": 1 } } ] },

    { "id": "B4", "block": "B", "title": "汗", "type": "multi", "scored": true, "options": [
      { "id": "B4-1", "text": "少し動いただけで汗をかく、汗かき", "weights": { "qi_def": 1 } },
      { "id": "B4-2", "text": "動いていないのに汗が出て、汗のあと冷えてぐったりする", "weights": { "qi_def": 0.5, "yang_def": 0.5 } },
      { "id": "B4-3", "text": "緊張すると手のひらや脇に汗をかく、首から上だけ汗をかく", "weights": { "qi_stag": 1 } },
      { "id": "B4-4", "text": "汗をかきにくい", "weights": { "yang_def": 0.5, "fluid": 0.5 } },
      { "id": "B4-5", "text": "汗がべたつく", "weights": { "fluid": 1 } },
      { "id": "B4-6", "text": "寝汗をかく", "weights": { "yin_def": 1 } },
      { "id": "B4-7", "text": "汗の量が多く、においが強い", "weights": { "yang_exc": 1 } } ] },

    { "id": "B5", "block": "B", "title": "食欲・胃腸・口", "type": "multi", "scored": true, "options": [
      { "id": "B5-1", "text": "食が細く、食後に眠くなる・胃がもたれる", "weights": { "qi_def": 1 } },
      { "id": "B5-2", "text": "食欲にムラがある、ストレスで食欲が変わる", "weights": { "qi_stag": 1 } },
      { "id": "B5-3", "text": "お腹や脇腹が張る、ゲップやガスが出ると楽になる", "weights": { "qi_stag": 1 } },
      { "id": "B5-4", "text": "喉に何かつまった感じがする、みぞおちがつかえる", "weights": { "qi_stag": 0.5, "fluid": 0.5 } },
      { "id": "B5-5", "text": "口は渇くが水はあまり飲みたくない、唇が乾いて暗い", "weights": { "blood_stasis": 1 } },
      { "id": "B5-6", "text": "口の中が粘る、水分をとるとお腹がチャポチャポする・もたれる", "weights": { "fluid": 1 } },
      { "id": "B5-7", "text": "口や唇が乾くが、少量しか飲めない", "weights": { "yin_def": 1 } },
      { "id": "B5-8", "text": "冷たい物や生ものでお腹を壊す、薄いつばが口にたまる", "weights": { "yang_def": 1 } },
      { "id": "B5-9", "text": "口が渇いて冷たい物をごくごく飲みたい、食欲旺盛", "weights": { "yang_exc": 1 } },
      { "id": "B5-10", "text": "口臭が気になる、起床時に口が粘って苦い", "weights": { "yang_exc": 0.5, "qi_stag": 0.5 } } ] },

    { "id": "B6", "block": "B", "title": "便通・排尿", "type": "multi", "scored": true, "options": [
      { "id": "B6-1", "text": "軟便・下痢になりやすい、力まないと出ない", "weights": { "qi_def": 1 } },
      { "id": "B6-2", "text": "便が硬くコロコロしている", "weights": { "blood_def": 0.5, "yin_def": 0.5 } },
      { "id": "B6-3", "text": "便秘と下痢を繰り返す、出てもすっきりしない", "weights": { "qi_stag": 1 } },
      { "id": "B6-4", "text": "便が黒っぽい、痔がある", "weights": { "blood_stasis": 1 } },
      { "id": "B6-5", "text": "水っぽい下痢をする、尿の量が少なくむくむ", "weights": { "fluid": 1 } },
      { "id": "B6-6", "text": "尿の色が濃く量が少ない、便が乾いて出にくい", "weights": { "yin_def": 1 } },
      { "id": "B6-7", "text": "冷えると下痢する、朝起きてすぐ下痢する", "weights": { "yang_def": 1 } },
      { "id": "B6-8", "text": "トイレが近い、夜中に1回以上トイレに起きる、尿が薄く多い", "weights": { "yang_def": 1 } },
      { "id": "B6-9", "text": "便秘がちで便が硬く、においが強い", "weights": { "yang_exc": 1 } } ] },
```

```json
    { "id": "B7", "block": "B", "title": "むくみ・水分・天候", "type": "multi", "scored": true, "options": [
      { "id": "B7-1", "text": "夕方に足がむくみ、靴下の跡が残る", "weights": { "qi_def": 0.5, "fluid": 0.5 } },
      { "id": "B7-2", "text": "ストレスや月経前にむくみ、お腹が張る", "weights": { "qi_stag": 1 } },
      { "id": "B7-3", "text": "むくみと一緒に肩こりや頭痛が強くなる", "weights": { "blood_stasis": 1 } },
      { "id": "B7-4", "text": "朝、顔やまぶたがむくむ", "weights": { "fluid": 1 } },
      { "id": "B7-5", "text": "雨の日や低気圧が近づくと体調が悪くなる", "weights": { "fluid": 1 } },
      { "id": "B7-6", "text": "車酔いしやすい、ふわふわしためまいがする、朝に手がこわばる", "weights": { "fluid": 1 } },
      { "id": "B7-7", "text": "水をよく飲むのに喉が渇く、尿が濃く少ない", "weights": { "yin_def": 0.5, "yang_exc": 0.5 } },
      { "id": "B7-8", "text": "冷えるとむくみが強くなる、尿が薄く多い", "weights": { "yang_def": 1 } } ] },

    { "id": "B8", "block": "B", "title": "睡眠", "type": "multi", "scored": true, "options": [
      { "id": "B8-1", "text": "日中も眠くなることが多い、いくら寝ても眠い", "weights": { "qi_def": 1 } },
      { "id": "B8-2", "text": "夢が多く眠りが浅い、熟睡した感じがない", "weights": { "blood_def": 1 } },
      { "id": "B8-3", "text": "寝つきが悪い、考え事で眠れない、寝起きが悪い", "weights": { "qi_stag": 1 } },
      { "id": "B8-4", "text": "寝ても肩こりや頭痛が取れない、痛みで目が覚める", "weights": { "blood_stasis": 1 } },
      { "id": "B8-5", "text": "体が重くて起きられない、朝むくんでいる", "weights": { "fluid": 1 } },
      { "id": "B8-6", "text": "寝汗をかく、夜中や明け方に目が覚める", "weights": { "yin_def": 1 } },
      { "id": "B8-7", "text": "寒くて布団から出られない、夜中にトイレに起きる", "weights": { "yang_def": 1 } },
      { "id": "B8-8", "text": "暑くて眠れない、目が冒えて眠れない", "weights": { "yang_exc": 1 } } ] },

    { "id": "B9", "block": "B", "title": "気分・ストレス", "type": "multi", "scored": true, "options": [
      { "id": "B9-1", "text": "気力が出ない、ちょっとしたことで驚く", "weights": { "qi_def": 1 } },
      { "id": "B9-2", "text": "不安になりやすい、物忘れが多い、集中力が続かない", "weights": { "blood_def": 1 } },
      { "id": "B9-3", "text": "イライラしやすい、ため息が多い", "weights": { "qi_stag": 1 } },
      { "id": "B9-4", "text": "気分の浮き沈みが激しい、緊張すると具合が悪くなる", "weights": { "qi_stag": 1 } },
      { "id": "B9-5", "text": "気分が沈みがちで、肩こり・頭痛を伴う", "weights": { "blood_stasis": 1 } },
      { "id": "B9-6", "text": "頭がぼーっとして考えがまとまらない、体が重い", "weights": { "fluid": 1 } },
      { "id": "B9-7", "text": "落ち着かず焦りやすい、夜に気持ちが高ぶる", "weights": { "yin_def": 1 } },
      { "id": "B9-8", "text": "元気がなく寒がりで、何をするのも億劫", "weights": { "yang_def": 1 } },
      { "id": "B9-9", "text": "怒ると顔が赤くなり頭に血が上る、ふだんから怒りっぽい", "weights": { "yang_exc": 1 } } ] },

    { "id": "B10", "block": "B", "title": "痛み・こり", "type": "multi", "scored": true, "options": [
      { "id": "B10-1", "text": "動悸・息切れしやすく、疲れると症状が悪化する", "weights": { "qi_def": 1 } },
      { "id": "B10-2", "text": "手足のしびれ、こむら返りがある", "weights": { "blood_def": 1 } },
      { "id": "B10-3", "text": "張るような痛みで場所が移動する、ストレスで悪化する", "weights": { "qi_stag": 1 } },
      { "id": "B10-4", "text": "刺すような痛みがいつも同じ場所にある、肩こり・頭痛がひどい", "weights": { "blood_stasis": 1 } },
      { "id": "B10-5", "text": "過去に打撲・むち打ち・手術の経験がある、静脈瘤がある", "weights": { "blood_stasis": 1 } },
      { "id": "B10-6", "text": "雨の日や低気圧で痛みが強くなる、関節が重だるい", "weights": { "fluid": 1 } },
      { "id": "B10-7", "text": "夜に痛みや熱感が強くなる、乾燥でかゆい", "weights": { "yin_def": 1 } },
      { "id": "B10-8", "text": "腰や膝がだるく、冷えると痛む", "weights": { "yang_def": 1 } },
      { "id": "B10-9", "text": "患部が赤く熱をもって腫れる、化膿しやすい", "weights": { "yang_exc": 1 } } ] },

    { "id": "B11", "block": "B", "title": "月経", "type": "multi", "scored": true, "showIf": { "sex": "female" }, "options": [
      { "id": "B11-1", "text": "周期が早まりがち、だらだら長引く、不正出血がある", "weights": { "qi_def": 1 } },
      { "id": "B11-2", "text": "周期が遅れがちで量が少なく、色が薄い", "weights": { "blood_def": 1 } },
      { "id": "B11-3", "text": "月経前にイライラして胸が張る、周期が安定しない", "weights": { "qi_stag": 1 } },
      { "id": "B11-4", "text": "月経痛が強い、経血に塊が混じる、色が暗い", "weights": { "blood_stasis": 1 } },
      { "id": "B11-5", "text": "月経前に強くむくむ、おりものが多い", "weights": { "fluid": 1 } },
      { "id": "B11-6", "text": "閉経前後でほてり・のぼせ・発汗がある、経血量が減ってきた", "weights": { "yin_def": 1 } },
      { "id": "B11-7", "text": "月経痛は温めると楽になる、月経後に腰が冷えてだるい", "weights": { "yang_def": 1 } },
      { "id": "B11-8", "text": "鮮やかな赤色の出血が多い、周期が早い", "weights": { "yang_exc": 1 } },
      { "id": "B11-9", "text": "閉経している／月経はない", "flags": ["skip_max"] } ] },

    { "id": "B12", "block": "B", "title": "目・耳・鼻・頭", "type": "multi", "scored": true, "options": [
      { "id": "B12-1", "text": "疲れると頭がぼんやりし、声に力がない", "weights": { "qi_def": 1 } },
      { "id": "B12-2", "text": "めまい・立ちくらみ、目が疲れやすくかすむ", "weights": { "blood_def": 1 } },
      { "id": "B12-3", "text": "頭が張るように痛む、緊張で頭痛がする", "weights": { "qi_stag": 1 } },
      { "id": "B12-4", "text": "刺すような頭痛が同じ場所に出る、肩こりを伴う", "weights": { "blood_stasis": 1 } },
      { "id": "B12-5", "text": "頭が重い、鼻水・鼻づまり・痰が多い", "weights": { "fluid": 1 } },
      { "id": "B12-6", "text": "目が乾く、低い音の耳鳴りが続く、乾いた咳が出る", "weights": { "yin_def": 1 } },
      { "id": "B12-7", "text": "疲れると耳鳴りやめまいが出て、腰がだるい", "weights": { "yang_def": 1 } },
      { "id": "B12-8", "text": "目が充血しやすい、急にキーンと高い耳鳴りがする", "weights": { "yang_exc": 1 } } ] },

    { "id": "B13", "block": "B", "title": "舌の状態", "type": "multi", "scored": true, "showIf": { "tongueMode": "self" },
      "help": "明るい場所で力を抜いて舌を出し、鏡で見ながら選んでください。コーヒーやカレーなど色の濃い飲食の直後は苔が染まることがあります。",
      "options": [
      { "id": "B13-1", "text": "白っぽく、縁に歯の跡がある。大きさは普通", "image": "/img/tongue/qi_def.svg", "weights": { "qi_def": 1 } },
      { "id": "B13-2", "text": "淡く白っぽい色で、薄く小さい", "image": "/img/tongue/blood_def.svg", "weights": { "blood_def": 1 } },
      { "id": "B13-3", "text": "両縁が赤い、縁に赤い点々がある", "image": "/img/tongue/qi_stag.svg", "weights": { "qi_stag": 1 } },
      { "id": "B13-4", "text": "紫がかっている、黒や茶の点がある、裏側の静脈が太く紫色に浮き出ている", "image": "/img/tongue/blood_stasis.svg", "weights": { "blood_stasis": 1 } },
      { "id": "B13-5", "text": "大きくぼってりして縁に歯の跡、苔が厚くべったり・濡れている", "image": "/img/tongue/fluid.svg", "weights": { "fluid": 1 } },
      { "id": "B13-6", "text": "やや痩せて赤く、表面が乾燥してひび割れ、苔が少ない", "image": "/img/tongue/yin_def.svg", "weights": { "yin_def": 1 } },
      { "id": "B13-7", "text": "白っぽく大きく、苔が白く湿っている", "image": "/img/tongue/yang_def.svg", "weights": { "yang_def": 1 } },
      { "id": "B13-8", "text": "鮮やかに赤い、苔が黄色い、口内炎や舌炎ができやすい", "image": "/img/tongue/yang_exc.svg", "weights": { "yang_exc": 1 } },
      { "id": "B13-9", "text": "きれいなピンクで、薄く白い苔がある（健康的）", "image": "/img/tongue/normal.svg" },
      { "id": "B13-10", "text": "苔が灰色・黒い／苔がまったくなくつるつる光る／舌が曲がる・震える・戻しにくい", "flags": ["refer"] } ] },
```

**ブロックC 安全確認（5問・スコアなし。冒頭に「安心してご提案するための確認です」と表示）**

```json
    { "id": "C1", "block": "C", "title": "現在、病院の薬・市販薬・サプリメントを飲んでいますか", "type": "single", "scored": false,
      "options": [ { "id": "C1-1", "text": "はい", "freeText": true, "placeholder": "薬の名前（わかる範囲で）", "flags": ["meds"] }, { "id": "C1-2", "text": "いいえ" } ] },
    { "id": "C2", "block": "C", "title": "医師の治療を受けている病気はありますか", "type": "multi", "scored": false,
      "options": [
        { "id": "C2-1", "text": "高血圧", "flags": ["hypertension"] }, { "id": "C2-2", "text": "心臓の病気", "flags": ["heart"] },
        { "id": "C2-3", "text": "腎臓の病気", "flags": ["kidney"] }, { "id": "C2-4", "text": "肝臓の病気", "flags": ["liver"] },
        { "id": "C2-5", "text": "甲状腺の病気", "flags": ["thyroid"] }, { "id": "C2-6", "text": "緑内障・前立腺肥大", "flags": ["glaucoma_bph"] },
        { "id": "C2-7", "text": "糖尿病", "flags": ["diabetes"] }, { "id": "C2-8", "text": "胃腸の病気", "flags": ["gi_weak"] },
        { "id": "C2-9", "text": "がんの治療中", "flags": ["cancer"] }, { "id": "C2-10", "text": "その他", "freeText": true, "flags": ["other_disease"] },
        { "id": "C2-0", "text": "ない", "flags": ["none"] } ] },
    { "id": "C3", "block": "C", "title": "妊娠中・授乳中、または妊娠の可能性がありますか", "type": "single", "scored": false, "showIf": { "sex": "female" },
      "options": [
        { "id": "C3-1", "text": "妊娠中", "flags": ["pregnancy"] }, { "id": "C3-2", "text": "授乳中", "flags": ["lactation"] },
        { "id": "C3-3", "text": "妊娠の可能性がある", "flags": ["pregnancy"] }, { "id": "C3-4", "text": "いいえ" } ] },
    { "id": "C4", "block": "C", "title": "薬・食品・生薬でアレルギーが出た、または漢方で体調を崩したことがありますか", "type": "single", "scored": false,
      "options": [ { "id": "C4-1", "text": "はい", "freeText": true, "placeholder": "何で、どんな症状が出ましたか", "flags": ["allergy"] }, { "id": "C4-2", "text": "いいえ" } ] },
    { "id": "C5", "block": "C", "title": "これまでに飲んだ漢方があれば教えてください", "type": "text", "scored": false, "optional": true,
      "placeholder": "例: 補中益気湯を半年。元気は出たが胃がもたれた" },
```

**ブロックD 生活習慣（4問。D1のみスコアに加点。残りはアドバイスの出し分け用）**

```json
    { "id": "D1", "block": "D", "title": "食事の傾向", "type": "multi", "scored": true, "options": [
      { "id": "D1-1", "text": "食事を抜くことが多い、少食", "weights": { "qi_def": 0.5, "blood_def": 0.5 } },
      { "id": "D1-2", "text": "食欲にムラがある", "weights": { "qi_stag": 1 } },
      { "id": "D1-3", "text": "甘いもの・味の濃いもの・脂っこいものをよく食べる", "weights": { "fluid": 1 } },
      { "id": "D1-4", "text": "果物や冷たい飲み物をとることが多い", "weights": { "yang_def": 0.5, "fluid": 0.5 } },
      { "id": "D1-5", "text": "冷たいものは苦手", "weights": { "yang_def": 1 } },
      { "id": "D1-6", "text": "辛いものやお酒をよくとる", "weights": { "yang_exc": 1 } },
      { "id": "D1-7", "text": "外食・コンビニが多い", "weights": {} } ] },
    { "id": "D2", "block": "D", "title": "睡眠時間と就寝時刻", "type": "single", "scored": false,
      "options": [ { "id": "D2-1", "text": "6時間未満" }, { "id": "D2-2", "text": "6〜7時間" }, { "id": "D2-3", "text": "7時間以上" } ],
      "sub": { "title": "就寝は", "options": [ { "id": "D2s-1", "text": "24時前" }, { "id": "D2s-2", "text": "24時以降" } ] } },
    { "id": "D3", "block": "D", "title": "運動と入浴", "type": "single", "scored": false,
      "options": [ { "id": "D3-1", "text": "運動はほぼしない" }, { "id": "D3-2", "text": "週1〜2回" }, { "id": "D3-3", "text": "週3回以上" } ],
      "sub": { "title": "入浴は", "options": [ { "id": "D3s-1", "text": "シャワーのみ" }, { "id": "D3s-2", "text": "湯船につかる" } ] } },
    { "id": "D4", "block": "D", "title": "飲酒・喫煙・仕事", "type": "multi", "scored": false,
      "options": [ { "id": "D4-1", "text": "お酒を週3回以上飲む" }, { "id": "D4-2", "text": "タバコを吸う" }, { "id": "D4-3", "text": "デスクワークが多い" },
        { "id": "D4-4", "text": "立ち仕事が多い" }, { "id": "D4-5", "text": "目をよく使う" }, { "id": "D4-0", "text": "どれもあてはまらない", "flags": ["none"] } ] }
  ]
}
```

設問の表示順は A1→A2→A3→A4→A5→B1…B13→C1…C5→D1…D4。性別が女性以外なら B11とC3を、舌モードがスタッフなら B13をスキップします。進捗ドットは実際に表示される問数で数えます。

## スコアリング仕様

スコアリングは `lib/scoring.ts` の純粋関数 `score(answers, questions, context)` として実装し、単体テストで下の検算例を通します。等重み（選択肢1つ＝1点、跨るものは0.5）で始め、店頭の実データで調整します。

```ts
type TypeKey = "qi_def"|"blood_def"|"qi_stag"|"blood_stasis"|"fluid"|"yin_def"|"yang_def"|"yang_exc";
const TYPES: TypeKey[] = ["qi_def","blood_def","qi_stag","blood_stasis","fluid","yin_def","yang_def","yang_exc"]; // レーダーの軸順
const DEFICIENT: TypeKey[] = ["qi_def","blood_def","yin_def","yang_def"];   // 虚
const EXCESS:    TypeKey[] = ["qi_stag","blood_stasis","fluid","yang_exc"];  // 実
const HOT:  TypeKey[] = ["yang_exc","yin_def"];
const COLD: TypeKey[] = ["yang_def","qi_def","fluid"];

type ScoreResult = {
  raw: Record<TypeKey, number>;        // 獲得点
  max: Record<TypeKey, number>;        // 理論最大点（表示された設問のみ）
  pct: Record<TypeKey, number>;        // 0〜100、整数に丸め
  level: Record<TypeKey, "balanced"|"tendency"|"caution"|"strong">;
  mainTypes: TypeKey[];                // 同点は複数
  subTypes: TypeKey[];                 // 最大2つ、pct降順
  defExcIndex: number;                 // -1〜+1。正が実証寄り
  defExcLabel: "def"|"mid"|"exc";
  thermalIndex: number;                // -1〜+1。正が熱寄り
  thermalLabel: "cold"|"neutral"|"hot";
  isBalanced: boolean;                 // 全タイプ 20% 未満
};

function score(answers: Answers, questions: Question[], ctx: { sex?: string; tongueMode: "self"|"staff"; tongueOverride?: string[] }): ScoreResult {
  const raw = zero(), max = zero();
  const visible = questions.filter(q => q.scored && isVisible(q, ctx));
  for (const q of visible) {
    // 理論最大点: その問の全選択肢の重みをタイプごとに合算（「どれもあてはまらない」と flags のみの選択肢は0）
    for (const o of q.options) for (const [t, w] of entries(o.weights ?? {})) max[t] += w;
    // B11 で「閉経している／月経はない」を選んだら、その問は max から除く（skip_max）
    const chosen = q.id === "B13" && ctx.tongueMode === "staff" ? (ctx.tongueOverride ?? []) : (answers[q.id] ?? []);
    if (chosen.some(id => optionById(q, id)?.flags?.includes("skip_max"))) { subtractQuestionMax(q, max); continue; }
    for (const id of chosen) for (const [t, w] of entries(optionById(q, id)?.weights ?? {})) raw[t] += w;
  }
  // B13 はスタッフモードでも所見が入力されたら加算する（未入力なら max からも除く）

  const pct = mapTypes(t => max[t] === 0 ? 0 : Math.round(100 * raw[t] / max[t]));
  const level = mapTypes(t => pct[t] >= 60 ? "strong" : pct[t] >= 40 ? "caution" : pct[t] >= 20 ? "tendency" : "balanced");
  const top = Math.max(...TYPES.map(t => pct[t]));
  const isBalanced = top < 20;
  const mainTypes = isBalanced ? [] : TYPES.filter(t => pct[t] === top);
  const subTypes = isBalanced ? [] : TYPES.filter(t => !mainTypes.includes(t) && (pct[t] >= 0.7 * top || pct[t] >= 60) && pct[t] >= 20)
                                      .sort((a, b) => pct[b] - pct[a]).slice(0, 2);
  const sum = (ks: TypeKey[]) => ks.reduce((s, k) => s + pct[k], 0);
  const idx = (pos: TypeKey[], neg: TypeKey[]) => (sum(pos) + sum(neg)) === 0 ? 0 : (sum(pos) - sum(neg)) / (sum(pos) + sum(neg));
  const defExcIndex = idx(EXCESS, DEFICIENT);
  const thermalIndex = idx(HOT, COLD);
  return { raw, max, pct, level, mainTypes, subTypes, isBalanced,
    defExcIndex, defExcLabel: defExcIndex < -0.2 ? "def" : defExcIndex > 0.2 ? "exc" : "mid",
    thermalIndex, thermalLabel: thermalIndex < -0.2 ? "cold" : thermalIndex > 0.2 ? "hot" : "neutral" };
}
```

**ルールの要点**

- 「どれもあてはまらない」は0点。表示されなかった設問（B11・B13のスキップ）と「閉経している」を選んだB11は理論最大点から除く。
- 主体質＝最高スコア（同点は複数）。副体質＝主体質の70%以上または単独で60%以上、かつこれらは20%以上、最大2つ。全タイプ20%未満は「バランス良好」でカードなし。
- 虚実指数・寒熱指数はスタッフ画面と候補提示にだけ使い、来店客には見せない。
- 主訴（A3）・なりたい自分（A5）・年代はスコアに入れない。
- D1（食事）はスコアに入れる。D2〜D4は入れない。

**単体テストに入れる検算例**

| ケース | 入力 | 期待する結果 |
| --- | --- | --- |
| 全問「どれもあてはまらない」 | — | 全タイプ0%、isBalanced＝true、mainTypes＝\[\]、両指数＝0（ゼロ除算なし） |
| 気虚の選択肢を全問で選ぶ | B1-1,B1-2,B2-1,B3-1,B4-1,B4-2,B5-1,B6-1,B7-1,B8-1,B9-1,B10-1,B12-1,B13-1,D1-1 | qi\_def＝100%、mainTypes＝\[qi\_def\]、defExcLabel＝def、thermalLabel＝cold |
| 参考サイトの結果例を再現 | pct を 血虚60・気滞100・瘀血80・陰虚100 に固定して後半の関数だけテスト | mainTypes＝\[qi\_stag, yin\_def\]、subTypes＝\[blood\_stasis, blood\_def\]、defExcIndex＝+0.06（mid）、thermalIndex＝+1.0（hot） |
| 男性・スタッフ舌モード・舌未入力 | sex＝male, tongueMode＝staff | B11とB13の重みが max に含まれない |
| B11で「閉経している」 | B11-9 のみ | B11の重みが max から除かれ、raw は増えない |
| 2タイプにまたがる選択肢 | B1-3 のみ | blood\_defとyin\_defに各0.5。max も各0.5ずつ積まれている |

## 結果タイプ定義と結果カード文面

8タイプそれぞれに「状態の一言・説明・代表症状5つ・生活養生（心・食・動・休）・おすすめのツボ」を用意し、`data/types.json` に入れます。文面は専門的なトーンで、教材の考え方を自社の言葉で書き起こした草案です。商品名や効能の断定は入れていません。アイコンは8つを新規に作成し（参考サイトのアイコンは使わない）、色は第11節のパレットを使います。

```json
{
  "qi_def": {
    "name": "気虚", "reading": "ききょ", "color": "#C9B98A",
    "headline": "「気」が不足している状態",
    "summary": "「気」は体を動かし、温め、外邪から守るエネルギーです。過労や睡眠不足、朝食抜き、胃腸の弱りで消耗し、不足すると疲労感や風邪のひきやすさとして現れます。気は朝に作られると考えられ、早寝早起きと温かい朝食が回復の土台になります。",
    "symptoms": ["疲れやすく、少し動くと息切れする", "風邪をひきやすく治りにくい", "食後に眠くなり、胃がもたれる", "汗をかきやすく、汗のあと冷える", "軟便・下痢になりやすく、肌にハリがない"],
    "advice": {
      "mind": "頑張りすぎが気を消耗します。予定に「何もしない時間」を先に入れ、課題は小さく分けて取り組みます。",
      "food": "朝食は抜かず、穀類・苋類・豆類をよく噛んで。お粥や温かい汁物が胃腸の働きを助けます。生もの・冷たいもの・脂っこいものは控えます。",
      "move": "激しい運動は逆効果です。10分のウォーキングから始め、呼吸を意識したストレッチや気功で少しずつ体力をつけます。",
      "rest": "気は睡眠中に補われます。夜更かしを避け、汗をかきすぎる長風呂やサウナは控えめに。"
    },
    "tsubo": { "name": "足三里", "reading": "あしさんり", "position": "膝のお皿の外側のくぼみから指幅4本分下、すねの骨の外側。", "effect": "胃腸の働きを整えて気を補う代表的なツボです。疲労感や食後のだるさに。" }
  },
  "blood_def": {
    "name": "血虚", "reading": "けっきょ", "color": "#D9B8BF",
    "headline": "「血」が不足している状態",
    "summary": "「血」は全身に栄養と潤いを運び、精神を安定させる働きを持ちます。目や脳の使いすぎ、夜更かし、無理な減量、月経で消耗され、不足すると乾燥・めまい・浅い眠りとして現れます。血は夜に補われるため、早めの就寝が最も効率のよい養生です。",
    "symptoms": ["めまい・立ちくらみが起こりやすい", "夢が多く、熟睡した感じがない", "肌・髪・爪が乾燥してツヤがない", "手足の先が冷え、しびれやこむら返りがある", "目が疲れ、集中力や記憶力が落ちる"],
    "advice": {
      "mind": "目と脳の使いすぎは血を消耗します。1時間に一度は画面から離れ、目を閉じて数分休む習慣を。",
      "food": "赤い食材と黒い食材（赤身の肉・魚、レバー、黒ごま、黒豆、プルーン、なつめ）を意識的に。甘味と酸味を組み合わせると潤いを補います。欠食と辛味のとりすぎは避けます。",
      "move": "座ったままできる体操や、入浴後の軽いストレッチが向いています。急に立ち上がる動作は避けます。",
      "rest": "日付が変わる前に就寝します。寝る前のスマホは血を消耗し眠りを浅くするため、寝室に持ち込まないのが理想です。"
    },
    "tsubo": { "name": "三陰交", "reading": "さんいんこう", "position": "内くるぶしの上端から指幅4本分上、すねの骨の後ろのくぼみ。", "effect": "血を補い巡らせるツボ。冷え、めまい、月経の不調に幅広く使われます。" }
  },
  "qi_stag": {
    "name": "気滞", "reading": "きたい", "color": "#D6B36A",
    "headline": "「気」の巡りが滞っている状態",
    "summary": "「気」は巡っていることで働きます。ストレスや緊張、不規則な生活で巡りが滞ると、張り・つかえ・イライラ・気分の浮き沈みとして現れ、症状は時間や気分で変わります。香りと深い呼吸、体を大きく動かすことが巡りを戻す鍵です。",
    "symptoms": ["イライラしやすく、ため息が多い", "喉のつかえ、胸や脇腹・お腹の張り", "ゲップやガスが出ると楽になる", "便秘と下痢を繰り返す", "月経前のイライラや胸の張り"],
    "advice": {
      "mind": "気持ちをため込まないことが第一です。趣味や人との会話で意識を切り替え、深く長い呼気を意識した呼吸を。",
      "food": "香りのよい食材（セロリ、春菊、シソ、柑橘類、ミントやジャスミンのお茶）が気を巡らせます。少量ずつ品数を多く。辛いものや脂っこいもののとりすぎに注意。",
      "move": "胸や脇を大きく伸ばすストレッチ、ウォーキングや軽いジョギング。気虚がなければしっかり動いて構いません。",
      "rest": "就寝・起床の時刻を揃え、寝る前にその日の心配事を書き出して頭から出しておくと寝つきが改善します。"
    },
    "tsubo": { "name": "太衝", "reading": "たいしょう", "position": "足の甲、親指と人差し指の骨が交わる手前のくぼみ。", "effect": "気の巡りを整え、イライラや張り、緊張性の頭痛を和らげるツボです。" }
  },
  "blood_stasis": {
    "name": "瘀血", "reading": "おけつ", "color": "#A98AA3",
    "headline": "「血」の巡りが滞っている状態",
    "summary": "冷え・ストレス・長時間の同じ姿勢・過去の打撲や手術などで「血」の流れが滞ると、固定した痛み、色のくすみ、月経の塊として現れます。滞りは次の不調を生む二次的な要因にもなるため、体を温めて動かし、巡りを回復させることが大切です。",
    "symptoms": ["肩こり・頭痛が慢性的で、刺すような痛みが同じ場所にある", "シミ・くすみ・目の下のクマ、唇の色が暗い", "月経痛が強く、経血に塊が混じる", "冷えのぼせ（上半身はのぼせて足は冷える）", "静脈瘤や痔、毛細血管が浮き出ている"],
    "advice": {
      "mind": "ストレスと冷えは瘀血の二大要因です。月経前・月経中は特に予定を詰めすぎず、腰を冷やさない服装を。",
      "food": "血の巡りを助ける辛味野菜（生姜、ニンニク、タマネギ、ニラ、ラッキョウ）と青魚、黒きくらげ、黒酢を。冷たいもの、動物性脂肪、甘いもののとりすぎは控えます。",
      "move": "足腰の血行をよくする運動が最適です。腰回し、スクワット、ウォーキング。デスクワークで1時間に一度は立って動きます。",
      "rest": "シャワーで済ませず湯船につかり、腰から下を温めます。喫煙は巡りを妨げるため、減らすだけでも効果があります。"
    },
    "tsubo": { "name": "血海", "reading": "けっかい", "position": "膝のお皿の内側上端から指幅3本分上。太ももの内側の筋肉の盛り上がり。", "effect": "血の巡りを改善し、月経痛や冷えのぼせに使われるツボです。" }
  },
```

```json
  "fluid": {
    "name": "水滞", "reading": "すいたい", "color": "#9FB7B0",
    "headline": "「水」が滞って余分にたまっている状態",
    "summary": "体内の水分代謝が落ち、余分な「水」がとどまっています。胃腸の冷えや弱り、水分・生もの・甘いもののとりすぎ、湿気の多い環境が背景にあり、むくみ・重だるさ・天候による不調として現れます。体を温めて水を動かし、入る水分を整えることが基本です。",
    "symptoms": ["むくみやすく、体が重だるい", "雨の日や低気圧で体調が崩れる", "めまい・車酔い・頭重感", "軟便や胃のもたれ、お腹のチャポチャポ音", "鼻水・痰が多く、舌の苔が厚い"],
    "advice": {
      "mind": "天候に左右されやすい体質です。天気が崩れる日は予定を軽めにし、体を温めて過ごすと決めておくと楽になります。",
      "food": "水分は「温かく、少しずつ」。果物・生野菜・冷たい飲み物・お酒のとりすぎに注意し、豆類・ウリ科（冬瓜、キュウリ）・ハトムギ・生姜を。",
      "move": "じわっと汗をかく有酸素運動を習慣に。ウォーキング20〜30分、あるいは湯船で発汗するだけでも水の巡りが変わります。",
      "rest": "寝室の湿気を溜めない。布団をこまめに干し、腰と足首を冷やさずに眠ります。"
    },
    "tsubo": { "name": "陰陵泉", "reading": "いんりょうせん", "position": "すねの内側、膝下の太い骨の出っ張りのすぐ下のくぼみ。", "effect": "余分な水を捕き、むくみや重だるさを和らげるツボです。" }
  },
  "yin_def": {
    "name": "陰虚", "reading": "いんきょ", "color": "#C98F7A",
    "headline": "潤いが不足し、熱がこもっている状態",
    "summary": "体を潤し冷やす「陰」が不足すると、相対的に熱が勝ってほてり・寝汗・乾燥として現れます。夜更かし、過労、加齢、更年期、辛味やアルコールのとりすぎが陰を消耗します。余分な熱があるわけではないので、冷やすのではなく潤いを補うことが養生の軸です。",
    "symptoms": ["手のひら・足の裏がほてる、夕方から熱っぽい", "寝汗をかく、寝つきが悪い", "口や喉が乾くが、少量しか飲めない", "肌・目の乾燥、コロコロ便", "白髪・耳鳴り・乾いた咳"],
    "advice": {
      "mind": "頑張り屋に多い体質です。夜に頑張るほど潤いを削るため、仕事は午前に寄せ、夜は予定を入れない日を作ります。",
      "food": "潤いを補う白い食材（白きくらげ、白ごま、豆乳、ゆり根、梨）と、甘味＋酸味の組み合わせ。唐辛子などの辛味、香辛料、アルコール、コーヒーのとりすぎは控えます。",
      "move": "大量に汗をかく運動やサウナ・長風呂は潤いを失います。ヨガや太極拳のようなゆっくりした運動を涯しい時間帯に。",
      "rest": "23時までに就寝します。陰は夜に補われるため、睡眠時間の確保が最も効く養生です。"
    },
    "tsubo": { "name": "太溪", "reading": "たいけい", "position": "内くるぶしとアキレス腱の間のくぼみ。", "effect": "腎の潤いを補うツボ。ほてり、耳鳴り、腰のだるさに使われます。" }
  },
  "yang_def": {
    "name": "陽虚", "reading": "ようきょ", "color": "#8FA3C2",
    "headline": "体を温める力が不足している状態",
    "summary": "体を温め動かす「陽」の力が不足し、冷えが体の奥まで及んでいます。気虚が進んだ状態で、下半身・腰・お腹の冷え、夜間尿、冷えによる下痢として現れます。冷やすものを徹底して避け、外からも中からも温めて陽を補います。",
    "symptoms": ["寒がりで、手よりもお腹や腰が冷たい", "トイレが近く、夜中に起きる、尿が薄く多い", "冷えると下痢する、温かいものを好む", "腰や膝がだるく、冷えると痛む", "顔色が青白く、元気が出ない"],
    "advice": {
      "mind": "「冷えは慢性の消耗」と考え、我慢しないこと。冷房の効いた場所では腰と足首を守るものを常備します。",
      "food": "温める食材（生姜、ネギ、ニラ、シナモン、羊肉、エビ）を加熱して。生もの・冷たい飲み物・夏野菜のとりすぎは避け、飲み物は常温以上に。",
      "move": "下半身の筋肉が熱を生みます。スクワットや階段の昇降など、足腰を使う運動を毎日少しずつ。",
      "rest": "湯船で40度前後のお湯に10分以上つかり、寝るときは腹巻きやレッグウォーマーでお腹と足首を温めます。"
    },
    "tsubo": { "name": "関元", "reading": "かんげん", "position": "へそから指幅4本分下、体の中心線上。", "effect": "下腹部を温めて陽を補うツボ。温灸やカイロで温めるのも有効です。" }
  },
  "yang_exc": {
    "name": "陽盛", "reading": "ようせい", "color": "#C97C6A",
    "headline": "余分な熱がこもっている状態",
    "summary": "体力があり代謝が活発な一方で、熱が余っています。辛味・脂・アルコールのとりすぎ、ストレスによる気のこもりが熱を生み、のぼせ・赤ら顔・便秘・化膿しやすい肌として現れます。熱を冷ます性質の食材を選び、熱の出口（便通・発汗）を確保することが養生の要です。",
    "symptoms": ["暑がりで顔が赤く、のぼせやすい", "口が渇いて冷たいものをごくごく飲む", "便秘がちで便が硬く、においが強い", "肌が赤くニキビが化膿しやすい、目が充血する", "イライラして怒りっぽく、暑くて眠れない"],
    "advice": {
      "mind": "ストレスは熱に変わります。怒りを感じたらその場を離れて深呼吸を。予定を詰めすぎないことも熱をためない工夫です。",
      "food": "熱を冷ます性質の食材（トマト、キュウリ、セロリ、豆腐、緑豆、苦味のある野菜）を。辛味・揚げ物・アルコール・味の濃いものは控え、氷で冷やしたものではなく食材の性質で冷まします。",
      "move": "しっかり汗をかいて熱を発散させます。ランニングや球技など強度のある運動も向いています。",
      "rest": "寝室は涯しく保ち、就寝前の飲酒と夕食のとりすぎを避けます。便通を毎日整えることが熱をためない近道です。"
    },
    "tsubo": { "name": "合谷", "reading": "ごうこく", "position": "手の甲、親指と人差し指の骨が交わる手前のくぼみ。", "effect": "熱を発散させ、のぼせ・頭痛・便秘に幅広く使われるツボです。" }
  }
}
```

**表示ルール**

- 結果画面のカードは 主体質 → 副体質 の順。カードには `headline`、`summary`、`symptoms`、点数と段階ラベル、「改善アドバイスを見る」。
- 改善アドバイス画面は 特徴（summary）→ 生活養生（心・食・動・休）→ おすすめのツボ → 「薬剤師があなたに合う漢方をご提案します」→ 監修者（`SUPERVISOR_NAME`）。
- 生活習慣（D）の回答に応じて「あなたへの一言」を1文追加する（例: D2が24時以降で血虚・陰虚なら「就寝時刻を23時に前倒しするだけで変化が出ます」。D3がシャワーのみで瘀血・陽虚・水滞なら「湯船につかることから始めてください」。ルールは `data/types.json` の `tips` 配列に条件付きで持つ）。
- 「バランス良好」のときはカードの代わりに「大きな偏りは見られません。今の生活を維持し、季節の変わり目に再度チェックを」を表示。

## 処方マスタの初期データと候補提示ロジック

取扱商品の一覧がないため、一般的に市販されている処方名で初期データ（36処方）を用意します。薬剤師が `data/formulas.json` を直接編集し、扱わないものは `active: false`、商品が決まったら `code` を商品コードに置き換えます。候補提示は `lib/recommend.ts` の純粋関数で、最終判断は薬剤師が行います。

**候補スコアの計算**

```ts
function recommend(result: ScoreResult, answers: Answers, safety: SafetyFlag[], formulas: Formula[]): Candidate[] {
  const complaintTags = tagsOf(answers.A3);                 // 主訴タグ
  const chosenIds = new Set(allChosenOptionIds(answers));   // 選んだ選択肢ID
  return formulas.filter(f => f.active).map(f => {
    // 1. 体質一致: Σ (処方のタイプ重み × そのタイプのpct/100)。主体質は×1.5
    let s = 0;
    for (const [t, w] of entries(f.types)) s += w * (result.pct[t] / 100) * (result.mainTypes.includes(t) ? 1.5 : 1);
    // 2. 虚実の一致: 同じ区分 +0.3、隣接（def↔mid、mid↔exc）+0.1、逆（def↔exc）-0.3
    s += defExcMatch(f.deficiency, result.defExcLabel);
    // 3. 寒熱の一致: warm×cold / cool×hot は +0.2、warm×hot / cool×cold は -0.3、neutral は 0
    s += thermalMatch(f.thermal, result.thermalLabel);
    // 4. 主訴タグが一致: タグ1つにつき +0.25（上限 +0.5）
    s += Math.min(0.5, 0.25 * f.complaints.filter(c => complaintTags.has(c)).length);
    // 5. キー所見（処方を特定する選択肢）が一致: 1つにつき +0.3（上限 +0.6）
    s += Math.min(0.6, 0.3 * f.keySigns.filter(id => chosenIds.has(id)).length);
    // 6. 安全確認: 禁忌に該当するものは除外せず「警告つき」で残し、スコアを -1.0（薬剤師が判断するため見える状態にしておく）
    const warnings = f.contraindications.filter(c => safety.some(fl => fl.code === c));
    if (warnings.length) s -= 1.0;
    return { formula: f, score: round2(s), warnings, reasons: explain(f, result, complaintTags, chosenIds) };
  }).sort((a, b) => b.score - a.score || a.formula.priority - b.formula.priority).slice(0, 3);
}
```

表示する「根拠」は、一致したタイプ名、虚実・寒熱の一致、一致した主訴タグとキー所見の文言をそのまま箇条書きにします（例: 「気滞 100%・虚実間・喉のつかえあり」）。候補とスコアは Proposal.candidates に保存し、後で重みを調整する材料にします。

**初期データ（教科書・事典の虚実区分に準拠。重みは初期値で、薬剤師が調整する前提）**

| code | 処方 | types（重み） | 虚実 | 寒熱 | 主訴 | キー所見 | 注意生薬 | 禁忌フラグ | 優先 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 補中益気湯 | qi\_def 1.0 | def | warm | fatigue, cold\_prone | B1-1, B2-1, B4-1 | 甘草 | — | 1 |
| F02 | 六君子湯 | qi\_def 0.9, fluid 0.4 | def | warm | gi, fatigue | B5-1, B5-6 | 甘草 | — | 2 |
| F03 | 四君子湯 | qi\_def 0.8 | def | neutral | gi, fatigue | B5-1 | 甘草 | — | 5 |
| F04 | 十全大補湯 | qi\_def 0.7, blood\_def 0.7 | def | warm | fatigue, cold, skin | B2-2, B3-2 | 甘草 | — | 3 |
| F05 | 人参養栄湯 | qi\_def 0.6, blood\_def 0.6, yin\_def 0.3 | def | warm | fatigue, sleep | B8-2, B9-1 | 甘草 | — | 6 |
| F06 | 四物湯 | blood\_def 1.0 | def | neutral | skin, menstrual | B2-2, B2-3 | — | — | 4 |
| F07 | 当帰芍薬散 | blood\_def 0.8, fluid 0.6, yang\_def 0.3 | def | warm | cold, menstrual, edema | B3-2, B11-2, B7-1 | — | — | 1 |
| F08 | 帰脾湯 | blood\_def 0.8, qi\_def 0.5 | def | neutral | sleep, mood | B8-2, B9-2 | 甘草 | — | 2 |
| F09 | 酸棗仁湯 | blood\_def 0.6, yin\_def 0.4 | def | neutral | sleep | B8-2, B8-3 | 甘草 | — | 7 |
| F10 | 半夏厚朴湯 | qi\_stag 1.0, fluid 0.3 | mid | neutral | mood, gi | B5-4, B9-3 | — | — | 1 |
| F11 | 加味逍遥散 | qi\_stag 0.9, blood\_def 0.4, yang\_exc 0.3 | mid | cool | mood, menstrual, cold | B3-3, B3-4, B11-3 | 甘草, 山栩子 | — | 1 |
| F12 | 香蘇散 | qi\_stag 0.8, qi\_def 0.3 | mid | warm | mood, gi | B9-5, B5-4 | 甘草 | — | 6 |
| F13 | 四逆散 | qi\_stag 0.9 | mid | neutral | mood, pain, cold | B3-2, B9-4 | 甘草, 柴胡 | interferon | 5 |
| F14 | 柴胡加竜骨牡蛎湯 | qi\_stag 0.9, yang\_exc 0.4 | exc | cool | mood, sleep | B8-3, B9-1, B6-9 | 柴胡 | interferon | 3 |
| F15 | 大柴胡湯 | qi\_stag 0.6, yang\_exc 0.8 | exc | cool | weight, bowel, gi | B5-10, B6-9, B1-9 | 大黄, 柴胡 | pregnancy, interferon, gi\_weak | 7 |
| F16 | 桂枝茯苓丸 | blood\_stasis 1.0 | exc | neutral | menstrual, pain, skin | B1-5, B11-4, B3-4 | 牡丹皮, 桃仁 | pregnancy | 1 |
| F17 | 桃核承気湯 | blood\_stasis 0.9, yang\_exc 0.6 | exc | cool | bowel, menstrual, pain | B6-9, B3-4, B11-4 | 大黄, 桃仁 | pregnancy, gi\_weak | 4 |
| F18 | 芎帰調血飲 | blood\_stasis 0.6, blood\_def 0.6 | def | warm | menstrual, fatigue | B11-2, B11-4 | 甘草 | — | 8 |
| F19 | 温経湯 | blood\_def 0.6, yang\_def 0.5, yin\_def 0.4, blood\_stasis 0.3 | def | warm | menstrual, cold, skin | B11-7, B3-6, B3-7 | 甘草 | — | 5 |
| F20 | 通導散 | blood\_stasis 0.9, yang\_exc 0.4 | exc | cool | pain, bowel, menstrual | B10-4, B6-9 | 大黄, 紅花 | pregnancy, gi\_weak | 9 |
| F21 | 五苓散 | fluid 1.0 | mid | neutral | edema, gi | B7-5, B7-6, B5-6 | — | — | 1 |
| F22 | 苓桂朮甘湯 | fluid 0.9, qi\_def 0.3 | def | warm | edema, pain | B7-6, B12-5 | 甘草 | — | 3 |
| F23 | 防已黄耆湯 | fluid 0.8, qi\_def 0.6 | def | neutral | edema, weight, pain | B1-6, B4-1, B7-1 | 甘草 | — | 2 |
| F24 | 真武湯 | fluid 0.7, yang\_def 0.8 | def | warm | cold, edema, gi | B6-7, B7-8, B3-7 | 附子 | heart | 6 |
| F25 | 二陳湯 | fluid 0.8 | mid | neutral | gi, edema | B5-6, B12-5 | 甘草 | — | 8 |
| F26 | 防風通聖散 | yang\_exc 0.8, fluid 0.5 | exc | cool | weight, bowel, skin | B1-9, B6-9, B2-10 | 大黄, 麻黄, 甘草, 山栩子 | pregnancy, hypertension, heart, thyroid, glaucoma\_bph, gi\_weak | 5 |
| F27 | 六味丸 | yin\_def 1.0 | def | neutral | fatigue, skin | B3-6, B6-8, B12-6 | — | — | 1 |
| F28 | 麦門冬湯 | yin\_def 0.8 | def | neutral | cold\_prone | B12-6, B5-7 | 甘草 | — | 4 |
| F29 | 滋陰降火湯 | yin\_def 0.9, yang\_exc 0.3 | def | cool | skin, bowel | B6-6, B5-7 | 甘草 | — | 7 |
| F30 | 知柏地黄丸 | yin\_def 0.9, yang\_exc 0.4 | mid | cool | sleep, fatigue | B4-6, B8-6 | — | — | 5 |
| F31 | 八味地黄丸 | yang\_def 1.0, yin\_def 0.3 | def | warm | cold, pain, edema | B6-8, B10-8, B3-7 | 附子 | heart | 1 |
| F32 | 牛車腎気丸 | yang\_def 0.9, fluid 0.5 | def | warm | edema, cold, pain | B7-8, B10-8, B6-8 | 附子 | heart | 3 |
| F33 | 人参湯 | yang\_def 0.8, qi\_def 0.6 | def | warm | gi, cold | B5-8, B6-7 | 甘草 | — | 2 |
| F34 | 当帰四逆加呉茱萸生姜湯 | yang\_def 0.8, blood\_def 0.5 | def | warm | cold, pain | B3-2, B3-8 | 甘草 | — | 4 |
| F35 | 黄連解毒湯 | yang\_exc 1.0 | exc | cool | mood, skin, sleep | B9-9, B2-10, B8-8 | 山栩子 | — | 1 |
| F36 | 清上防風湯 | yang\_exc 0.9 | exc | cool | skin | B2-10 | 甘草, 山栩子 | — | 2 |

後で追加しやすい候補: 三黄瀉心湯、白虎加人参湯、温清飲、大黄牡丹皮湯、折衝飲、当帰飲子、聥跟湯や小青竜湯など急性症状向けは体質チェックの対象外。

## 安全確認・警告・受診勧奨のロジック

安全確認はスコアと切り離し、`lib/safety.ts` が回答から `SafetyFlag[]` を作ってスタッフ画面の最上部に赤で出します。来店客画面には警告の内容を出さず、「薬剤師が確認したうえでご提案します」とだけ表示します。

```ts
type SafetyFlag = { code: string; level: "refer"|"warn"|"info"; label: string; detail?: string; source: string };
```

| code | level | 発生条件 | スタッフ画面の表示 |
| --- | --- | --- | --- |
| meds | warn | C1＝はい | 「服用中の薬: （自由記入）」。候補の注意生薬と並べて表示 |
| interferon | warn | C1の自由記入に「インターフェロン」を含む | 「小柴胡湯および柴胡剤との併用禁忌」。柴胡を含む候補に警告 |
| hypertension / heart / thyroid / glaucoma\_bph | warn | C2で該当 | 「麻黄・附子・甘草を含む処方に注意」。該当する候補に警告 |
| kidney / liver / diabetes / cancer / other\_disease | info | C2で該当 | 病名を表示。候補の除外はしない |
| gi\_weak | warn | C2で胃腸の病気、または B6-1とB5-1の両方 | 「大黄・石膏・地黄を含む処方は胃腸障害に注意」 |
| pregnancy | warn | C3＝妊娠中または可能性あり | 「大黄・芒硝・牡丹皮・桃仁・紅花・牛膝・附子を含む処方は避ける。麻黄は慎重」 |
| lactation | info | C3＝授乳中 | 「授乳中。大黄含有処方は乳児の下痢に注意」 |
| allergy | warn | C4＝はい | 自由記入を表示 |
| acute | info | A4＝3日以内 | 「急性症状。体質より現在の症状を優先して対応」 |
| severe | refer | A4の影響＝大きい かつ 期間が2週間以上 | 「日常生活に大きな支障が2週間以上。医療機関の受診も案内」 |
| tongue\_refer | refer | B13-10 を選択、またはスタッフが同所見を入力 | 「舌の所見に重症のサイン（灰黒苔・鏡面舌・運動異常）。受診を案内」 |
| long\_mood | refer | B9-2とB8-3の両方 かつ A4＝半年以上 | 「抑うつ・不眠が長期。必要に応じて受診を案内」 |

**表示と振る舞い**

- `refer` が1つでもあれば、スタッフ画面の冒頭に「受診勧奨の対象」の帯を出し、候補リストの上に「提案は薬剤師の判断で」の注記を置く。候補自体は出す。
- `warn` は候補カードごとに該当する注意生薬を赤文字で並べる（例: 「甘草 — 高血圧」）。
- 自由記入の薬名はそのまま表示するだけで、薬名からの自動判定は「インターフェロン」の部分一致だけにとどめる（誤判定を避け、薬剤師が読む）。
- 来店客画面の安全確認ブロック冒頭に「安心してご提案するための確認です」と表示し、回答はすべて必須（C5のみ任意）。

## 認証・データ保存・権限

認証は「共通パスワードでサイト全体を守り、スタッフ画面だけPINを足す」の2段です。スタッフ全員が全データを見られる前提なので、ユーザーアカウントは作らず、担当者名は提案保存時に選択します。

| 項目 | 仕様 |
| --- | --- |
| ログイン | `/login` で `APP_PASSWORD` と比較（タイミング攻撃対策に定時間比較）。成功で iron-session の Cookie（httpOnly, secure, sameSite=lax, 30日）。失敗は同一IPから5回で10分ロック |
| スタッフPIN | `/staff/*` はセッションに `staffUntil`（PIN入力から12時間）がなければ `/staff/pin` へ。来店客モードへ戻るボタンで `staffUntil` を消す（iPadを渡す前に押す） |
| ルート保護 | `middleware.ts` で `/login` と `/api/health` 以外の全パスをセッション必須に。未ログインはリダイレクト、APIは401 |
| 顧客の識別 | 受付で 会員番号／電話番号／LINE表示名 のいずれかを入力。会員番号・電話番号は完全一致で既存顧客に紐づけ、LINE表示名は候補を出してスタッフが選ぶ。「識別なし」でもチェックはできる（履歴には紐づかない） |
| 同意 | 受付画面に同意文を表示し、タップで `consentAt` を記録。文案は `data/consent.md` で管理 |
| 保持期間 | `expiresAt = startedAt + 3年`。毎日の定期処理（Vercel Cron、`/api/cron/purge`、Bearerトークン保護）で期限切れのセッションと提案を削除。セッションが0になった顧客も削除 |
| アクセス記録 | スタッフ画面の閲覧・保存を `AuditLog`（時刻・操作・対象ID・担当者名）に記録。初版は表示画面なし |
| データの出し方 | スタッフ画面から CSV 書き出し（セッション一覧と回答）。他システム連携は行わない |
| バックアップ | DBサービス側の自動バックアップに依存。週次で `pg_dump` を手動取得する手順を README に |

**同意文の草案（`data/consent.md`）**

> この体質チェックの回答と結果は、当薬局があなたに合ったご提案を行うために使用し、次回ご来店時の参考として3年間保管します。当薬局のスタッフ以外が閲覧することはありません。削除をご希望の場合は店頭でお申し出ください。このチェックは体質の傾向を知るためのもので、病気の診断を行うものではありません。

## デザイン指針

現行HP（ESSENCE薬局 武蔵小杉店。写真中心・角丸のカード・ですます調の温かいトーン。ロゴは `https://pharmacy.essence.fan/img/logo.png`）の雰囲気を引き継ぎつつ、来店客が iPad で迷わず答えられる「1画面1問・大きなタップ領域」の設計にします。HPのCSSはこちらの環境から取得できなかったため、ブランドカラーの正確な値はロゴから拾って置き換えてください。

| 項目 | 指針 |
| --- | --- |
| トーン | 清潔で落ち着いた薬局らしさ。参考サイトのベージュ×ゴールドをそのまま写さず、オフホワイトの背景にロゴの色をアクセントとして使う |
| カラートークン | `--bg #F7F5F0`、`--surface #FFFFFF`、`--ink #2B2B2B`、`--muted #6B6B6B`、`--accent`（ロゴ色。仮に `#2E7D6B`）、`--line #E6E1D8`。体質8色は第7節の `color` を使い、カードの左帯とレーダーの塗りにだけ使う |
| フォント | 本文 Noto Sans JP（400/500/700）。見出しも同じファミリーでウェイト差だけ。最小文字サイズ 16px、選択肢は 18px |
| 設問画面 | 上部に進捗ドット（表示される問数分）、中央に Q番号とタイトル、「※複数回答可」。選択肢は2列グリッド（縦置き・スマホは1列）、高さ72px以上、選択時はアクセント色の淡い塗りと左のチェック。下部に「戻る」（輪郭）と「次へ」（塗り）を常に固定 |
| 舌の設問 | 各選択肢にイラスト（SVG、9枚を新規作成。淡いピンク、白っぽい、赤、紫、歯痕、裂紋の差が分かる簡素な図）。参考サイトのイラストは使わない |
| 結果画面 | レーダーチャートを最上部に、点数と段階をその下に、体質カードを縦に。カードは左に色帯＋アイコン＋体質名＋点数、右に見出し・説明・代表症状・ボタン。印刷時はA4縦でレーダーとカードが1ページ、改善アドバイスが2ページ目 |
| スタッフ画面 | 装飾を減らし、情報密度を上げる（本文 14px、テーブル中心）。警告は赤、受診勧奨は濃い赤の帯。来店客画面とはヘッダー色を変えて、どちらのモードか一目で分かるように |
| 文言 | 来店客画面はですます調、専門用語にはふりがな（体質名の読み）。「診断」「処方」「治る」は使わない。ボタンは「次へ」「戻る」「結果を見る」「改善アドバイスを見る」 |
| アクセシビリティ | 選択状態を色だけで示さない（チェックアイコンを併用）。コントラスト比 4.5:1 以上。iPadの拡大表示でも崩れないよう rem 基準 |

## Claude Code への実装指示

この文書を Markdown で書き出して `docs/SPEC.md` としてリポジトリに置き、下のプロンプトを Claude Code に渡します。タスクは8段階に分け、各段階の終わりに動作確認を挟むと、途中で方向修正しやすくなります。

**貼り付け用プロンプト（最初の1回）**

```text
あなたはこのリポジトリで「漢方体質チェック試験サイト」を実装します。仕様は docs/SPEC.md にすべて書いてあります。まず全文を読んでから着手してください。

前提:
- Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Prisma + PostgreSQL + iron-session + Recharts + Vitest + Playwright
- マスタデータは data/questions.json, data/types.json, data/formulas.json, data/consent.md。SPEC.md の JSON をそのまま使い、zod で起動時に検証する
- スコアリング (lib/scoring.ts)、候補提示 (lib/recommend.ts)、安全確認 (lib/safety.ts) は純粋関数にし、SPEC.md の検算例を単体テストにする
- 画面に「診断」「処方」「治る」という語を使わない。来店客向け画面に処方名を出さない
- iPad Safari (1024x768 横・縦) と PC Chrome で崩れないこと

進め方:
- 下のタスクを順番に。各タスクの最後に `npm run typecheck && npm run test` を通し、何を作ったかと次にやることを短く報告してから次へ進む
- 仕様に書いていないことを決める必要があったら、最も単純な選択をして docs/DECISIONS.md に一行記録する
- 外部サービスのキーはすべて環境変数。.env.example を必ず更新する

タスク:
1. プロジェクト初期化、Prisma スキーマ (SPEC 第4節)、docker-compose の Postgres、.env.example、README（起動手順）
2. マスタデータの JSON と zod スキーマ (lib/masters.ts)。JSON の検証テスト（全設問に「どれもあてはまらない」がある、選択肢IDが一意、formulas.keySigns が実在する選択肢ID）
3. lib/scoring.ts, lib/safety.ts, lib/recommend.ts と単体テスト (SPEC 第6・8・9節)
4. 認証: /login, middleware, iron-session, /staff/pin (SPEC 第10節)
5. 来店客モード: /check/new → /check/[id]/q/[step] → /check/[id]/result → /check/[id]/advice/[type] (SPEC 第3・7・11節)。回答は Server Action で1問ごとに保存。舌のイラストは簡素な SVG を自作
6. スタッフ画面: /staff, /staff/session/[id], /staff/customer/[id]。舌所見の入力と再計算、候補3件と根拠・警告、選定とメモの保存、CSV書き出し
7. A4印刷レイアウト、保持期限の削除 Cron (/api/cron/purge)、AuditLog
8. Playwright で「ログイン→受付→全問回答→結果→PIN→担当者画面で保存」のE2Eを1本。Vercel デプロイ手順を README に追記

まず docs/SPEC.md を読み、タスク1から始めてください。
```

**受け入れ条件（これが全部通れば試験サイトとして完成）**

- [ ] 未ログインでどのURLを開いても `/login` に戻る。共通パスワードで入れる
- [ ] 受付で同意をタップしないと設問に進めない。識別なしでも進める
- [ ] 設問は1画面1問。複数回答の問で「どれもあてはまらない」を押すと他の選択が外れる。未選択だと「次へ」が押せない
- [ ] 性別が女性以外なら B11 と C3 が出ない。舌モードがスタッフなら B13 が出ない。進捗ドットの数がそれに合う
- [ ] 途中でブラウザを閉じても、同じ URL を開けば続きから答えられる
- [ ] 結果画面に8軸レーダー、点数と段階、主体質・副体質のカードが出る。処方名はどこにも出ない
- [ ] 全問「どれもあてはまらない」で「バランス良好」が出てエラーにならない
- [ ] 改善アドバイスに特徴・心食動休・ツボ・監修者名が出る
- [ ] 結果画面の隠しボタン→PINで担当者画面に入れる。PINなしでは `/staff/*` を開けない
- [ ] 担当者画面に安全確認フラグ、スコアと指数、候補3件（根拠・警告付き）が出る。妊娠を選ぶと桂枝茯苓丸に警告が付く
- [ ] スタッフモードで舌所見を入力するとスコアが変わり、来店客向け結果にも反映される
- [ ] 選定とメモを保存するとセッション一覧で「提案済み」になり、顧客履歴から過去の結果を開ける
- [ ] 印刷プレビューでA4縦に収まる
- [ ] `npm run test` が通る（SPEC 第6節の検算例を含む）。E2E が通る
- [ ] Vercel の URL で iPad から一通り操作できる

**店頭での試験運用の流れ**

1. スタッフが iPad でログインし、「新規チェック」から受付を済ませて来店客に渡す（または聞き取り入力）
2. 結果画面を一緒に見ながら体質の説明をする
3. 隠しボタン→PINで担当者画面を開き、必要なら舌を見て所見を入力、候補を見て提案を決め、選定とメモを保存
4. 必要に応じて結果をA4印刷して渡す
5. 違和感のあった設問・文面・候補は docs/FEEDBACK.md に書きため、JSON を直して再デプロイ

## 前提の仮置きと未決事項

こちらで仮置きした点です。違う場合はこの文書に直接書き込んでください。

| # | 項目 | 仮置き |
| --- | --- | --- |
| 1 | 結果の渡し方 | 画面表示＋A4印刷（iPadのAirPrint／PDF保存）。メール・LINE送信は次版 |
| 2 | 設問の編集方法 | JSONを直接編集して再デプロイ。管理画面は次版 |
| 3 | 来店客の傾向 | 未回答のため、女性・30〜50代中心と想定して文面を書いている。男性向けの表現は店頭のフィードバックで調整 |
| 4 | ブランドカラー | ロゴから拾う前提で仮のアクセント色を置いている |
| 5 | 処方マスタ | 市販の代表的36処方。実際の品揃えで `active` と `priority` を調整。価格・在庫は持たない |
| 6 | スコアの重み | 等重み。候補提示の係数（主体質×1.5、虚実±0.3、寒熱±0.2〜0.3、主訴+0.25、キー所見+0.3、禁忌−1.0）は初期値 |
| 7 | 舌のイラスト | 自作の簡素なSVG。写真を使う場合は薬剤師が用意 |
| 8 | 監修者表示 | `SUPERVISOR_NAME` に「薬剤師 ○○ ○○」を設定。経歴文は `data/types.json` ではなく環境変数 `SUPERVISOR_BIO` に |
| 9 | 試験サイトのURL | Vercel の自動ドメイン。独自ドメインは本番時に |
| 10 | 指示の渡し方 | この文書を Markdown 書き出しして `docs/SPEC.md` に置く。文書が更新されたら同じ手順で差し替える |
