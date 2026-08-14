import { timingSafeEqual, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// 下北沢 街歩き謎解きイベント（/shimokita）のデータ層。
//
// 設計の中心思想（要件定義書 §52）：
//   「物語上の役割」と「実際の店舗」を分離する。
//   STEP は店舗そのものではなく「店舗グループ＋必要訪問数」を参照し、
//   当日の営業状況に応じて表示店舗・必要訪問数が自動調整される。
//
// ストレージ: Upstash Redis（yoyaku と同じ REST fetch 方式・依存ゼロ）。
//   smk:content … ゲーム内容ぜんぶ（STEP・店舗・最終推理・エンディング・設定）
//                 1つのJSONドキュメント。管理画面から再デプロイなしで編集できる。
//   smk:players … プレイヤー進行状況（player_id → JSON のハッシュ）
//   smk:stats   … 分析用カウンター（HINCRBY）
//
// 正答・未解放ストーリーは常にサーバー側だけで保持し、プレイヤー向け API は
// 「現在見えてよいもの」だけを返す（§46）。
// ---------------------------------------------------------------------------

export type StoreStatus = 'OPEN' | 'CLOSED' | 'TEMPORARILY_UNAVAILABLE' | 'FULL';

export const STORE_STATUS_LABEL: Record<StoreStatus, string> = {
  OPEN: '営業中',
  CLOSED: '本日休業',
  TEMPORARILY_UNAVAILABLE: '一時利用停止',
  FULL: '混雑・受付停止',
};

export interface Store {
  id: string;
  name: string;
  image?: string;
  address: string;
  lat: number;
  lng: number;
  description?: string;
  hours?: string; // 営業時間の表記（例: '11:00〜19:00'）
  seatingAvailable: boolean;
  purchaseRequired: boolean;
  purchaseItem?: string;
  purchasePrice?: number;
  missionDescription: string; // この店舗ですること
  notes?: string; // 注意事項
  // 店舗訪問確認（§21）。MVP はキーワード / 店舗コードの入力式。
  // QR は「コードを埋め込んだURLを配る」運用で同じ仕組みに載る。
  verification: { type: 'keyword' | 'code'; code: string };
  // クリア時に解放される証拠（調査記録に残る）
  reward: { title: string; content: string; image?: string };
  // 通常営業スケジュール。index は曜日（0=日 … 6=土）。true=営業。
  weekly: boolean[];
  // 特定日の例外・当日変更（'YYYY-MM-DD' → 状態）。管理画面のワンタップ変更もここに書く。
  overrides: Record<string, StoreStatus>;
}

export interface Step {
  id: string;
  title: string;
  subtitle?: string;
  mission: string; // 「現在の目的」表示
  story: { text: string; image?: string };
  puzzle: {
    question: string;
    image?: string;
    answer: string;
    variations: string[]; // 表記ゆれの許容解答
    successText: string; // 正解時に表示する文章
    hints: string[]; // 段階ヒント（ヒント1→2→ほぼ答え）
  };
  // null なら店舗フェーズなし（謎だけのSTEP）
  storePhase: {
    prompt: string; // 例「3つの場所で情報を集めてください」
    storeIds: string[]; // 候補店舗グループ（代替店舗を含む）
    requiredVisitCount: number;
    skipped?: boolean; // 緊急スキップ（全プレイヤー対象・§31）
  } | null;
}

export interface FinalQuestion {
  question: string;
  answer: string;
  variations: string[];
}

export interface GameContent {
  settings: {
    title: string;
    tagline?: string;
    startCode?: string; // 参加コード。空なら誰でも開始できる
    playTime?: string; // 推奨プレイ時間の表記
    notes?: string; // 注意事項（TOPに表示）
  };
  steps: Step[];
  stores: Store[];
  final: { story: string; questions: FinalQuestion[]; successText: string };
  ending: { title: string; text: string; image?: string };
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  content: string;
  image?: string;
  storeName?: string;
  at: string;
}

export type PlayerPhase = 'story' | 'puzzle' | 'stores' | 'final' | 'ending';

export interface Player {
  id: string;
  startedAt: string;
  lastAccessAt: string;
  completedAt?: string;
  stepIndex: number; // steps 配列の添字。steps.length 到達で最終推理へ
  phase: PlayerPhase;
  visited: Record<string, string[]>; // stepId → クリア済み storeId
  evidence: EvidenceItem[];
  hintsUsed: Record<string, number>; // stepId → 開示済みヒント数
  wrongAnswers: number;
  adminNote?: string;
}

// --- env / Redis（yoyaku と同じ流儀） ----------------------------------------

function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
  return v?.trim() || undefined;
}

function kvConfig(): { url: string; token: string } | null {
  const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
  const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function isKvConfigured(): boolean {
  return kvConfig() !== null;
}

async function redis(...command: string[]): Promise<unknown> {
  const cfg = kvConfig();
  if (!cfg) throw new Error('KV is not configured');
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`[shimokita] KV request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(`[shimokita] KV command failed: ${data.error}`);
  return data.result;
}

const CONTENT_KEY = 'smk:content';
const PLAYERS_KEY = 'smk:players';
const STATS_KEY = 'smk:stats';

const randHex = (bytes: number) => randomBytes(bytes).toString('hex');

// --- 日付（JST） --------------------------------------------------------------

function jstDateString(offsetDays = 0): string {
  const d = new Date(Date.now() + (9 * 3600 + offsetDays * 86400) * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export const jstToday = () => jstDateString(0);

/** 'YYYY-MM-DD' の曜日（0=日 … 6=土）。文字列自体がJST日付なのでUTC解釈でよい。 */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

// --- 店舗の営業状態解決（§26〜§28, §35〜§36） --------------------------------

/**
 * その日の実効ステータス。優先順位：
 *   1) 特定日の例外・当日変更（overrides）
 *   2) 週間スケジュール（weekly）
 */
export function effectiveStatus(store: Store, dateStr: string): StoreStatus {
  const ov = store.overrides?.[dateStr];
  if (ov) return ov;
  const open = store.weekly?.[weekdayOf(dateStr)];
  return open === false ? 'CLOSED' : 'OPEN';
}

export function isPlayable(store: Store, dateStr: string): boolean {
  return effectiveStatus(store, dateStr) === 'OPEN';
}

// --- 回答の正規化と照合 --------------------------------------------------------

/**
 * 表記ゆれ吸収：NFKC（全角→半角など）→ 小文字化 → 空白除去 → カタカナ→ひらがな。
 * 「シモキタ」「しもきた」「ｼﾓｷﾀ」をすべて同一視する。
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function answerMatches(input: string, answer: string, variations: string[] = []): boolean {
  const n = normalizeAnswer(input);
  if (!n) return false;
  return [answer, ...variations].some((a) => a && normalizeAnswer(a) === n);
}

// --- コンテンツ ---------------------------------------------------------------

export async function getContent(): Promise<GameContent> {
  const raw = await redis('GET', CONTENT_KEY);
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as GameContent;
    } catch {
      // 壊れていたら初期データで再生成
    }
  }
  const seeded = defaultContent();
  await saveContent(seeded);
  return seeded;
}

export async function saveContent(content: GameContent): Promise<void> {
  content.updatedAt = new Date().toISOString();
  await redis('SET', CONTENT_KEY, JSON.stringify(content));
}

// --- プレイヤー ---------------------------------------------------------------

export async function createPlayer(): Promise<Player> {
  const now = new Date().toISOString();
  const player: Player = {
    id: randHex(8), // 16文字・推測不可能
    startedAt: now,
    lastAccessAt: now,
    stepIndex: 0,
    phase: 'story',
    visited: {},
    evidence: [],
    hintsUsed: {},
    wrongAnswers: 0,
  };
  await savePlayer(player);
  await bumpStat('start');
  await bumpStat('reach:step:0');
  return player;
}

export async function getPlayer(id: string): Promise<Player | null> {
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  const raw = await redis('HGET', PLAYERS_KEY, id);
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as Player;
  } catch {
    return null;
  }
}

export async function savePlayer(player: Player): Promise<void> {
  await redis('HSET', PLAYERS_KEY, player.id, JSON.stringify(player));
}

export async function deletePlayer(id: string): Promise<void> {
  await redis('HDEL', PLAYERS_KEY, id);
}

export async function getAllPlayers(): Promise<Player[]> {
  const flat = await redis('HGETALL', PLAYERS_KEY);
  const out: Player[] = [];
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    try {
      out.push(JSON.parse(String(flat[i + 1])) as Player);
    } catch {
      // 壊れたレコードは無視
    }
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

// --- 進行ロジック -------------------------------------------------------------

/** その日プレイ可能な候補店舗（§28: 休業店舗は候補から自動除外）。 */
export function openStoresForStep(step: Step, content: GameContent, dateStr: string): Store[] {
  if (!step.storePhase) return [];
  const byId = new Map(content.stores.map((s) => [s.id, s]));
  return step.storePhase.storeIds
    .map((id) => byId.get(id))
    .filter((s): s is Store => !!s && isPlayable(s, dateStr));
}

/**
 * 実効必要訪問数（§30 進行不能防止）。
 * 営業店舗数が必要数を下回ったら自動的に営業店舗数まで引き下げる。
 * 営業店舗が0・またはスキップ指定なら 0（＝店舗フェーズを通過扱いにできる）。
 */
export function effectiveRequiredVisits(step: Step, content: GameContent, dateStr: string): number {
  if (!step.storePhase || step.storePhase.skipped) return 0;
  const open = openStoresForStep(step, content, dateStr).length;
  return Math.min(step.storePhase.requiredVisitCount, open);
}

/** store フェーズ完了判定。visited には過去の休業店舗クリア分も数える。 */
export function storePhaseCleared(player: Player, step: Step, content: GameContent, dateStr: string): boolean {
  if (!step.storePhase) return true;
  const done = (player.visited[step.id] ?? []).length;
  return done >= effectiveRequiredVisits(step, content, dateStr);
}

/** stores フェーズ完了後、次のSTEPまたは最終推理へ進める。 */
export function advanceToNextStep(player: Player, content: GameContent): void {
  if (player.stepIndex + 1 < content.steps.length) {
    player.stepIndex += 1;
    player.phase = 'story';
  } else {
    player.phase = 'final';
  }
}

// --- 分析カウンター（§49） ----------------------------------------------------

export async function bumpStat(field: string): Promise<void> {
  try {
    await redis('HINCRBY', STATS_KEY, field, '1');
  } catch (e) {
    // 分析はベストエフォート。ゲーム進行を止めない。
    console.error('[shimokita] stat failed:', e);
  }
}

export async function getStats(): Promise<Record<string, number>> {
  const flat = await redis('HGETALL', STATS_KEY);
  const out: Record<string, number> = {};
  if (!Array.isArray(flat)) return out;
  for (let i = 0; i + 1 < flat.length; i += 2) out[String(flat[i])] = Number(flat[i + 1]) || 0;
  return out;
}

// --- 管理者認証（yoyaku と同じ合言葉方式） ------------------------------------

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** SMK_ADMIN_KEY を優先し、未設定なら既存の YOYAKU_ADMIN_KEY を流用できる。 */
export function checkAdminKey(key: string | undefined | null): boolean {
  const expected = readEnv('SMK_ADMIN_KEY') ?? readEnv('YOYAKU_ADMIN_KEY');
  return !!expected && !!key && safeEqual(key, expected);
}

export function checkStartCode(content: GameContent, code: string): boolean {
  const expected = content.settings.startCode?.trim();
  if (!expected) return true; // コード未設定なら誰でも開始できる
  return normalizeAnswer(code) === normalizeAnswer(expected);
}

// --- ID採番 -------------------------------------------------------------------

export const newId = (prefix: string) => `${prefix}_${randHex(4)}`;

// --- 初期データ ---------------------------------------------------------------
// 下北沢を舞台にしたサンプルシナリオ。店舗・謎・答えはすべて管理画面から
// 差し替える前提のプレースホルダー（座標は下北沢駅周辺のダミー値）。

export function defaultContent(): GameContent {
  const stores: Store[] = [
    {
      id: 'store_cafe_a',
      name: '喫茶マチネ（サンプル）',
      address: '東京都世田谷区北沢2丁目（サンプル住所）',
      lat: 35.6622,
      lng: 139.6674,
      description: '昭和の面影を残す老舗喫茶。壁一面のレコードが目印。',
      hours: '11:00〜19:00',
      seatingAvailable: true,
      purchaseRequired: true,
      purchaseItem: '探偵のクリームソーダ',
      purchasePrice: 700,
      missionDescription: '指定商品を注文し、コースターの裏に書かれたキーワードを確認してください。',
      notes: '混雑時は席の利用を店員の案内に従ってください。',
      verification: { type: 'keyword', code: 'れこーど' },
      reward: {
        title: '証拠01：マスターの証言',
        content: '「あの晩、彼は窓際の席で誰かを待っていたよ。テーブルには古い台本が置いてあった」',
      },
      weekly: [true, true, true, true, true, true, true],
      overrides: {},
    },
    {
      id: 'store_books_b',
      name: '古書ハコブネ（サンプル）',
      address: '東京都世田谷区北沢3丁目（サンプル住所）',
      lat: 35.6635,
      lng: 139.6668,
      description: '演劇・戯曲の古書が並ぶ小さな書店。',
      hours: '12:00〜20:00',
      seatingAvailable: false,
      purchaseRequired: false,
      missionDescription: '店頭のガラスケースに展示された「ある戯曲の初版本」の帯に書かれた言葉を確認してください。',
      notes: '店内は静かにご覧ください。商品購入は不要です。',
      verification: { type: 'keyword', code: 'はこぶね' },
      reward: {
        title: '証拠02：初版本の帯',
        content: '帯にはこう書かれていた。「すべての幕は、開いた場所で閉じる」',
      },
      weekly: [true, true, false, true, true, true, true],
      overrides: {},
    },
    {
      id: 'store_zakka_c',
      name: '雑貨ヨルノマド（サンプル）',
      address: '東京都世田谷区北沢2丁目（サンプル住所）',
      lat: 35.6608,
      lng: 139.6689,
      description: '路地裏の小さな雑貨店。アンティークの鍵が名物。',
      hours: '13:00〜19:00',
      seatingAvailable: false,
      purchaseRequired: false,
      missionDescription: '店内に飾られた「開かない鍵」のタグに書かれた番号を店員に伝え、カードを受け取ってください。',
      verification: { type: 'code', code: '404' },
      reward: {
        title: '証拠03：謎のカード',
        content: 'カードには一行だけ。「劇場の楽屋口は、月曜日だけ開いている」',
      },
      weekly: [true, false, true, true, true, true, true],
      overrides: {},
    },
    {
      id: 'store_record_d',
      name: 'レコード店ヴィニル（サンプル）',
      address: '東京都世田谷区北沢2丁目（サンプル住所）',
      lat: 35.6617,
      lng: 139.6659,
      description: '中古レコードの聖地。試聴機が3台ある。',
      hours: '12:00〜21:00',
      seatingAvailable: false,
      purchaseRequired: false,
      missionDescription: '「1975年のミュージカル」のコーナーに挟まれたメモを探してください。',
      verification: { type: 'keyword', code: 'ふぃなーれ' },
      reward: {
        title: '証拠04：挟まれたメモ',
        content: 'メモには走り書きで「フィナーレの曲は差し替えられた。原曲を知る者を探せ」',
      },
      weekly: [true, true, true, true, true, true, true],
      overrides: {},
    },
    {
      id: 'store_bakery_e',
      name: 'ベーカリー ツキノワ（サンプル）',
      address: '東京都世田谷区北沢1丁目（サンプル住所）',
      lat: 35.6601,
      lng: 139.6671,
      description: '月替わりのあんぱんで知られる街のパン屋。',
      hours: '8:00〜17:00',
      seatingAvailable: true,
      purchaseRequired: true,
      purchaseItem: '三日月あんぱん',
      purchasePrice: 300,
      missionDescription: '商品を購入すると、袋に調査メモが同封されています。',
      verification: { type: 'keyword', code: 'みかづき' },
      reward: {
        title: '証拠05：同封の調査メモ',
        content: '「彼が最後に目撃されたのは、駅の南西。古い劇場の前だった」',
      },
      weekly: [true, true, true, false, true, true, true],
      overrides: {},
    },
  ];

  const steps: Step[] = [
    {
      id: 'step_1',
      title: 'STEP 1　事件発生',
      subtitle: '消えた劇作家',
      mission: '依頼書を読み、最初の手がかりの謎を解いてください',
      story: {
        text:
          'あなたのもとに一通の依頼書が届いた。\n\n「下北沢で新作の稽古中だった劇作家・真行寺蓮が、初日を一週間後に控えた夜、忽然と姿を消しました。稽古場に残されていたのは、破られた台本の最後のページだけ。警察は事件性なしと判断しましたが、私はそうは思いません。——劇団『真夜中の帆』主宰」\n\n同封された台本の切れ端には、奇妙な暗号が記されていた。',
      },
      puzzle: {
        question:
          '台本の切れ端にはこう書かれている。\n\n「最初の手がかりは、コーヒーの香りとともに。\n　し・た・き・も・ざ・わ・こ・ん — 並べ替えて、いらない文字を捨てろ」\n\n手がかりが待つ街の名前は？（ひらがな4文字）',
        answer: 'しもきた',
        variations: ['シモキタ', '下北', 'しもきたざわ', '下北沢'],
        successText:
          '正解です。\n切れ端の裏に、うっすらと喫茶店の名刺の跡が浮かび上がった。\nどうやら彼は失踪の夜、駅近くの喫茶店に立ち寄っていたようだ。\n\n調査可能な場所がマップに追加されました。',
        hints: [
          'ヒント1：文字を並べ替えると、この街の呼び名になります。',
          'ヒント2：「こ」と「ん」は使いません。',
          'ほぼ答え：この街の愛称をひらがな4文字で。「しも」から始まります。',
        ],
      },
      storePhase: {
        prompt: '劇作家が立ち寄った店を訪ね、目撃情報を集めてください（1か所）',
        storeIds: ['store_cafe_a', 'store_bakery_e'],
        requiredVisitCount: 1,
      },
    },
    {
      id: 'step_2',
      title: 'STEP 2　街に残された痕跡',
      subtitle: '目撃者たち',
      mission: '謎を解き、証言を裏付ける情報を街で集めてください',
      story: {
        text:
          '目撃者の証言によれば、失踪の夜、真行寺は「古い台本」を持ち歩き、誰かを待っていた。\n\nテーブルに残されていたナプキンには、彼の筆跡でこう書かれていたという。\n\n「初版に真実。鍵は開かずとも、番号は語る」\n\n彼が探していた"何か"は、この街の店々に散らばっているようだ。',
      },
      puzzle: {
        question:
          'ナプキンの裏には3つの絵が描かれていた。\n\n📖 本　🔑 鍵　🎵 音符\n\nそして一言、「三つのうち、二つを訪ねよ」。\n\n絵が指す場所を式にすると：本＋鍵＋音符＝？\n「しょてん」「ざっか」「れこーど」——3つの言葉の頭文字をつなげると？（ひらがな3文字）',
        answer: 'しざれ',
        variations: [],
        successText:
          '正解です。\n「し・ざ・れ」——書店、雑貨店、レコード店。\n彼の足取りは3つの店に分かれている。すべてを回る必要はない。2か所で十分だ。\n\n候補地点がマップに追加されました。',
        hints: [
          'ヒント1：絵はそれぞれ「お店の種類」を表しています。',
          'ヒント2：「しょてん」の頭文字は「し」です。残り2つも同じように。',
          'ほぼ答え：し＋ざ＋れ を続けて読んでください。',
        ],
      },
      storePhase: {
        prompt: '3つの候補のうち2か所を訪ね、証拠を集めてください',
        storeIds: ['store_books_b', 'store_zakka_c', 'store_record_d'],
        requiredVisitCount: 2,
      },
    },
    {
      id: 'step_3',
      title: 'STEP 3　最後の推理へ',
      subtitle: '楽屋口の秘密',
      mission: '集めた証拠を読み返し、最後の謎を解いてください',
      story: {
        text:
          '集まった証拠が一つの絵を描き始めた。\n\n「すべての幕は、開いた場所で閉じる」\n「劇場の楽屋口は、月曜日だけ開いている」\n「フィナーレの曲は差し替えられた」\n\n真行寺は消えたのではない。自らの意思で"幕の裏側"へ戻ったのだ。彼が向かった場所——それは、彼のデビュー作が初演された、今はもう使われていない小さな劇場。',
      },
      puzzle: {
        question:
          '調査記録を見返してください。\n\n証拠の中に「彼が最後に目撃された方角」と「楽屋口が開く曜日」が隠れています。\n\n最後の問い：真行寺が待ち合わせていた相手は、彼の戯曲の中で必ず同じ名前で登場する。\n「月」を含むその登場人物の名は？（漢字またはひらがな）\n\n※サンプル問題です。答えは「つきしろ」',
        answer: 'つきしろ',
        variations: ['月白', 'ツキシロ'],
        successText:
          '正解です。\n月白——彼の全作品に登場する、姿を見せない語り手。\nそして劇団『真夜中の帆』の主宰が、かつて名乗っていた芸名。\n\nすべての証拠が一点を指している。最終推理の時間だ。',
        hints: [
          'ヒント1：依頼書の差出人を思い出してください。',
          'ヒント2：「月」＋「白」。',
          'ほぼ答え：ひらがな4文字、「つき」から始まります。',
        ],
      },
      storePhase: null,
    },
  ];

  const content: GameContent = {
    settings: {
      title: '下北沢クロニクル　消えた劇作家',
      tagline: '街全体が、事件の舞台になる。',
      playTime: '約2〜3時間（移動含む）',
      notes:
        '・実際の店舗を訪れるイベントです。交通ルールを守り、店舗や近隣のご迷惑にならないようご参加ください。\n・店舗の営業状況により、訪問先が変わる場合があります。\n・歩きスマホにご注意ください。',
      startCode: '',
    },
    steps,
    stores,
    final: {
      story:
        'すべての証拠が揃った。\n\n消えた劇作家・真行寺蓮。破られた台本。月曜日だけ開く楽屋口。差し替えられたフィナーレ。そして「月白」という名。\n\n真相を、あなたの言葉で示してほしい。',
      questions: [
        {
          question: '問1：真行寺の失踪を仕組んだ（依頼した）人物は誰か？（ひらがな・漢字どちらでも）',
          answer: 'つきしろ',
          variations: ['月白', '主宰', 'しゅさい', '劇団主宰'],
        },
        {
          question:
            '問2：真行寺が姿を消してまで取り戻そうとしたものは？（ひらがな）\nヒント：証拠04「挟まれたメモ」を見返してください。',
          answer: 'げんきょく',
          variations: ['原曲', 'フィナーレの原曲', 'ふぃなーれのげんきょく'],
        },
      ],
      successText:
        'その通り。\n\n真行寺は、盗まれ差し替えられた原曲——親友が遺した未発表のフィナーレ——を取り戻すため、自ら"消えた"。そのすべてを知っていたのは、かつて月白と名乗った劇団主宰、ただ一人。',
    },
    ending: {
      title: 'CASE CLOSED',
      text:
        'あなたは下北沢の街に散らばった証拠をつなぎ、消えた劇作家の真意にたどり着いた。\n\n一週間後。小さな古い劇場で、新作の幕が上がる。\n差し替えられていたフィナーレは、本来の曲に戻されていた。\n\n客席の最後列に、台本を抱えた男の姿があったという。\n\n——事件解決。ご参加ありがとうございました。',
    },
    updatedAt: new Date().toISOString(),
  };
  return content;
}
