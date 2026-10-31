// ---------------------------------------------------------------------------
// 漢方体質チェック（/kampo/）のマスタデータ（2026-10-25 v3、2026-10-28 v3.1 で6タイプ＋寒熱）。
// 正本は src/data/kampo/*.json（薬剤師が直接編集する）。読込時に形を検証し、壊れていたら例外でページを落とす。
//   questions.json   … 設問（section：basic／category／complaint／primary／detail／constitution／safety／lifestyle／staff）
//   complaints.json  … 主訴カテゴリー A〜H と具体的な主訴（主訴の選択画面はここから作る）
//   findings.json    … 所見（回答から作る1つ1つの症状・状態。重み・五臓は草案）
//   safety_tags.json … 安全確認タグ（証のスコアとは別。薬剤師画面に確認事項を出す）
//   formulas.json    … 漢方薬（承認効能・使用目標・漢方の考え方は別の欄）
//   types.json       … 体質タイプの説明・養生
//   legacy.json      … 旧版のセッションを表示するための文言（判定には使わない）
// 回答は「選択肢ID」で保存し、選択肢の findings を所見に変換して判定に使う（flow.ts の walk）。
// 主訴・深掘りで答えた所見は、あとの設問では表示しない（回答の引き継ぎ）。
// ---------------------------------------------------------------------------
import questionsJson from '../../data/kampo/questions.json' with { type: 'json' };
import complaintsJson from '../../data/kampo/complaints.json' with { type: 'json' };
import findingsJson from '../../data/kampo/findings.json' with { type: 'json' };
import tagsJson from '../../data/kampo/safety_tags.json' with { type: 'json' };
import typesJson from '../../data/kampo/types.json' with { type: 'json' };
import formulasJson from '../../data/kampo/formulas.json' with { type: 'json' };
import legacyJson from '../../data/kampo/legacy.json' with { type: 'json' };

/** 体質タイプ（6つ。2026-10-28 修正依頼 1-1）：気虚・血虚・気滞・瘀血・水滞・水不足（陰虚）。レーダーの軸順（上から時計回り） */
export type TypeKey = 'qi_def' | 'blood_def' | 'qi_stag' | 'blood_stasis' | 'fluid' | 'yin_def';
export const TYPES: TypeKey[] = ['qi_def', 'blood_def', 'qi_stag', 'blood_stasis', 'fluid', 'yin_def'];
export const isTypeKey = (s: string): s is TypeKey => (TYPES as string[]).includes(s);
/** 寒熱（独立したタイプにしない）。陽虚は「気虚＋冷え」、湿熱は「水滞＋熱」として扱う */
export type ThermalKey = 'cold' | 'heat';
export const THERMALS: ThermalKey[] = ['cold', 'heat'];
/** 所見の重み・処方の対象に使う軸（6タイプ＋寒熱） */
export type AxisKey = TypeKey | ThermalKey;
export const AXES: AxisKey[] = [...TYPES, ...THERMALS];
export const isAxisKey = (s: string): s is AxisKey => (AXES as string[]).includes(s);

/** 五臓 */
export type OrganKey = 'liver' | 'heart' | 'spleen' | 'lung' | 'kidney';
export const ORGANS: OrganKey[] = ['liver', 'heart', 'spleen', 'lung', 'kidney'];
export const isOrganKey = (s: string): s is OrganKey => (ORGANS as string[]).includes(s);
export const ORGAN_LABEL: Record<OrganKey, string> = { liver: '肝', heart: '心', spleen: '脾', lung: '肺', kidney: '腎' };
/** 来店客向けの平易な言い換え */
export const ORGAN_PLAIN: Record<OrganKey, string> = {
  liver: '肝（自律神経・気分の安定・血をたくわえる働き）',
  heart: '心（心の落ち着き・睡眠・血のめぐり）',
  spleen: '脾（胃腸・消化吸収の働き）',
  lung: '肺（呼吸・皮膚・体の防御の働き）',
  kidney: '腎（成長・老化・水分代謝・足腰の働き）',
};

export type Section = 'basic' | 'category' | 'complaint' | 'primary' | 'detail' | 'constitution' | 'safety' | 'lifestyle' | 'tongue' | 'staff';
export const SECTION_LABEL: Record<Section, string> = {
  basic: '基本情報', category: 'お悩みのカテゴリー', complaint: '具体的なお悩み', primary: 'いちばん改善したいお悩み', detail: 'お悩みの詳細',
  constitution: '体質チェック', safety: '安全確認', lifestyle: '生活習慣', tongue: '舌の確認', staff: '薬剤師の観察',
};
/** 「特にない」「わからない」「回答しない」：ほかの選択肢と同時に選べない */
export type Exclusive = 'none' | 'unknown' | 'declined';
/** 進み具合の表示（STEP n / 5。2026-10-28 修正依頼 2-4：設問数の分母が動くので段階で出す） */
export const STEPS: { label: string; sections: Section[] }[] = [
  { label: '基本情報', sections: ['basic'] },
  { label: 'お悩み', sections: ['category', 'complaint', 'primary', 'detail'] },
  { label: '体質チェック', sections: ['constitution'] },
  { label: '安全確認', sections: ['safety'] },
  { label: '生活習慣・舌の確認', sections: ['lifestyle', 'tongue'] },
];
export const stepOfSection = (sec: Section) => Math.max(0, STEPS.findIndex((x) => x.sections.includes(sec)));

export interface Option {
  id: string;
  text: string;
  /** 選んだときに present になる所見 */
  findings?: string[];
  /** 主訴・深掘り：漢方薬の候補を抽出する症状コード（formulas.json の symptoms） */
  symptoms?: string[];
  /** 深掘り：随伴症状の症状コード（候補には加えず、効能に含まれていれば適合度に加点） */
  also?: string[];
  /** 安全確認タグ（safety_tags.json） */
  tags?: string[];
  /** 直ちに対応が必要な例外（改修指示 5-5） */
  urgent?: boolean;
  /** 性別が男性なら出さない */
  femaleOnly?: boolean;
  /** 月経に関わる選択肢：「閉経」「月経はない」なら出さない（修正依頼 3-1） */
  mensesOnly?: boolean;
  exclusive?: Exclusive;
  /** 主訴の深掘りの「その他」（所見なし。修正依頼 2-2） */
  other?: boolean;
  /** 選んだら短い記入欄を出す（任意。修正依頼 5-1・7-1） */
  note?: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
  /** 選ばれたら薬剤師画面の「口頭で確認する項目」に出すメモ（例：耳鳴りの音の高さ） */
  staffNote?: string;
  /** 漢方薬の候補（picker）の「見つからない（薬剤師に伝える）」 */
  notfound?: boolean;
  /** 選ばれたら患者画面・薬剤師画面に出す受診のおすすめ（2026-10-29 第3弾 3-1・11-2） */
  refer?: string;
  /** 同じ名前の選択肢はどれか1つ（舌の色の「ふつう・淡白・紅」など。所見の conflicts を持たない選択肢どうし。第3弾 10-4）。画面では別のものを選ぶと切り替わる */
  oneOf?: string;
  /** 設問の groups の小見出し（舌：色・色の追加・形・苔…。第4弾 2-8） */
  group?: string;
  /** 同じ group の中で「ふつう」など：選んだら同じ group のほかの選択肢は外れる（第4弾 2-8・3-5） */
  groupExclusive?: boolean;
  /** 同時に選べない選択肢のID（同じ設問の中。例：「淡紅色（ふつう）」と「舌の両縁が赤い」。所見の conflicts を持たない組み合わせ用） */
  excludes?: string[];
  /** これらの所見が present のとき、この選択肢を出さない（グレー。例：口の渇きを選んだ方に「特に渇かない」。第4弾 1-4） */
  blockedIf?: string[];
  /** 画面表示用：グレーにした理由（blocked のときの小さな説明。省略すると「ほかの回答と同時には選べません」） */
  blockedText?: string;
  /** 食品アレルギーの選択肢：含まれていたら候補から外す生薬（第4弾 2-9。患者画面には出さない） */
  herbs?: string[];
  /** 画面で選択肢のイラストを表示する（舌の項目別イラストなど。image と同じ。小さめ） */
  icon?: string;
  /** 画面内の小見出し（生活習慣。修正依頼 6-1） */
  heading?: string;
  /** 薬剤師の観察で「判断できない」：ご本人の回答を使う（修正依頼 4-10） */
  defer?: boolean;
  /** 画面表示用：前の回答で「あり」になった所見の選択肢（チェック済みで変えられない。修正依頼 4-7・第2弾 2-3） */
  locked?: boolean;
  /** 画面表示用：前の回答の所見と同時にあり得ない選択肢（グレーで押せない。第2弾 5-3） */
  blocked?: boolean;
  image?: string;
  /** 基本情報の値（A1 の female など） */
  value?: string;
  /** 安全確認のフラグ（C1〜C4） */
  flags?: string[];
  /** 漢方薬の選択肢（薬剤師の入力 X_kampo_current・X_kampo_adverse）の処方コード */
  formula?: string;
  /** 主訴の選択肢の主訴ID・カテゴリー */
  complaint?: string;
  category?: string;
}
export interface Trigger {
  sexNot?: 'male';
  /** 月経がある（周期一定・不規則）と答えたときだけ */
  menses?: boolean;
  mensesNot?: 'post';
  category?: string;
  minComplaints?: number;
  /** いちばん改善したい主訴の深掘りテンプレート */
  primaryDetail?: string;
  /** これらの所見のどれかが present なら */
  findingsPresent?: string[];
  /** これらの選択肢のどれかが選ばれていれば */
  chosen?: string[];
}
export interface Question {
  id: string;
  section: Section;
  title: string;
  type: 'single' | 'multi';
  trigger?: Trigger;
  options: Option[];
  /** 同じ画面に出す補助の単一選択（旧版の D2 就寝・D3 入浴） */
  sub?: { title: string; options: Option[] };
  /** 同じ画面に展開する追加の選択肢（when の選択肢を選んだときだけ。C1・C3 の漢方薬の候補、C3 の症状） */
  followups?: Followup[];
  /** 選択肢を選んだら出す任意の記入欄（設問全体で1つ。except の選択肢だけのときは出さない。C1 薬の名前・C2 病名と時期） */
  note?: { label: string; placeholder?: string; except?: string[] };
  /** 回答せずに次へ進める（A3P 妊娠・授乳。未回答は薬剤師が口頭で確認） */
  optional?: boolean;
  /** 1ページの中の小見出し（舌：色・形・苔・舌下静脈。第4弾 2-8）。選択肢の group と対応 */
  groups?: OptionGroup[];
  help?: string;
  /** 深掘りのテンプレート名 */
  template?: string;
  /** 主訴の設問のカテゴリー */
  category?: string;
}
export interface OptionGroup {
  id: string;
  title: string;
  /** 「1つ選んでください」「あてはまるものをすべて」などの小さな説明 */
  hint: string;
  /** 答えが必要な項目（なければ「あれば選ぶ」の追加項目） */
  required?: boolean;
}
export interface Followup {
  when: string;
  id: string;
  title: string;
  type: 'single' | 'multi';
  options: Option[];
  help?: string;
  /** 親の選択肢を選んだら1つ以上の選択が必要（耳鳴りの音の高さ。第4弾 2-10） */
  required?: boolean;
  /** formulas：漢方薬の候補から選ぶ（名前・読み・ツムラ番号・商品名で検索。選択肢は formulas.json から作る） */
  picker?: 'formulas';
}
export interface Finding {
  id: string;
  label: string;
  weights?: Partial<Record<AxisKey, number>>;
  organs?: Partial<Record<OrganKey, number>>;
  /** 意味の近い所見のまとまり。同じ group は同じタイプへ1回分しか加点しない */
  group?: string;
  /** present なら present にする所見 */
  implies?: string[];
  /** 重みを引き継いだ 2026-10-24 版の選択肢 */
  from?: string[];
  /** 同時にあり得ない所見（同じ画面では同時に選べず、前の回答で「あり」なら選択肢を出さない。修正依頼 2-3） */
  conflicts?: string[];
}
export interface Category { id: string; name: string; femaleOnly?: boolean }
export interface Complaint {
  id: string;
  name: string;
  categories: string[];
  findings: string[];
  symptoms: string[];
  detail: string;
  tags?: string[];
  femaleOnly?: boolean;
  mensesOnly?: boolean;
  /** 選ばれたら薬剤師画面に出す受診のおすすめ（息苦しさ・動悸。患者画面には出さない。第4弾 1-2） */
  refer?: string;
  /** 選んだらすぐ下に出す追加の選択（耳鳴りの音の高さ。第4弾 2-10） */
  followups?: Omit<Followup, 'when'>[];
}
export interface SafetyTagDef { id: string; label: string; checks: string[]; urgent?: boolean }
export interface Review { status: string; source?: string; reviewer?: string | null; reviewedAt?: string | null }

export interface TypeDef {
  name: string;
  reading: string;
  color: string;
  headline: string;
  summary: string;
  symptoms: string[];
  advice: { mind: string; food: string; move: string; rest: string };
  tsubo: { name: string; reading: string; position: string; effect: string };
}
export interface Tip { when: string; types: AxisKey[]; text: string }
export interface Foundation { title: string; lead: string; items: { label: string; text: string }[] }
export interface TypesData { types: Record<TypeKey, TypeDef>; thermal: Record<ThermalKey, TypeDef>; tips: Tip[]; foundation: Foundation }

export type Strength = 'def' | 'mid' | 'exc';
export type Thermal = 'warm' | 'neutral' | 'cool';
export type HeatKind = 'excess' | 'deficient';
export interface Indication {
  symptom: string;
  term: string;
  /** 条件つきの効能（例:「高血圧や肥満に伴う便秘」）。所見ID・選択肢IDのどれかがあるときだけ候補にする */
  requires?: string[];
}
export interface SymptomDef { label: string }
export interface Formula {
  code: string;
  name: string;
  reading: string;
  efficacy: string;
  indications: Indication[];
  useTarget: string;
  strength: Strength[];
  action: string;
  targetLabel: string;
  types: Partial<Record<AxisKey, number>>;
  thermal: Thermal;
  heat?: HeatKind;
  organs: OrganKey[];
  /** 使用目標・随伴症状・症状の性質に当たる所見ID（または選択肢ID） */
  signs: string[];
  cautionHerbs: string[];
  contraindications: string[];
  priority: number;
  verified: boolean;
  note?: string;
  active: boolean;
  /** ツムラの製品番号（参考値。tsumuraNoVerified: false は未確認） */
  tsumuraNo?: number;
  /** 市販品の商品名など、検索に使う別名（未登録。いただいたら追加する） */
  aliases?: string[];
  tsumuraNoVerified?: boolean;
  /** 構成生薬と1日量(g)（ツムラの添付文書などで確認したもの。confidence C は未確認。第4弾 2-9・3-8） */
  herbs?: { herb: string; g: number }[];
  /** 食品アレルギーの対応生薬のうち、この処方に含まれるもの */
  foodHerbs?: string[];
  /** 甘草・麻黄・附子・大黄・芒硝の1日量(g) */
  amounts?: Record<string, number>;
  /** A=ツムラ添付文書(PMDA)で直接確認／B=ほかの信頼できる資料／C=未確認 */
  compositionConfidence?: 'A' | 'B' | 'C';
  compositionSource?: string;
}
export interface FormulasData { version: string; source?: string; symptoms: Record<string, SymptomDef>; formulas: Formula[] }

export const CONTRA_CODES = ['pregnancy', 'lactation', 'interferon', 'hypertension', 'heart', 'kidney', 'thyroid', 'glaucoma_bph', 'gi_weak'] as const;
const SECTIONS: Section[] = ['basic', 'category', 'complaint', 'primary', 'detail', 'constitution', 'safety', 'lifestyle', 'tongue', 'staff'];

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

// --- 主訴の設問を complaints.json から作る ------------------------------------

/** questions.json の generated（categories／complaints／primary）を実際の設問に展開する */
export function expandQuestions(rawQuestions: Raw[], cj: { categories: Category[]; complaints: Complaint[] }, formulas: { code: string; name: string }[] = []): Raw[] {
  const out: Raw[] = [];
  const sorted = [...formulas].sort((a, b) => ((a as { reading?: string }).reading ?? a.name).localeCompare((b as { reading?: string }).reading ?? b.name, 'ja'));
  const withPickers = (q: Raw): Raw => (Array.isArray(q.followups)
    ? { ...q, followups: (q.followups as Raw[]).map((fu) => (fu.picker === 'formulas'
      ? { ...fu, options: [...sorted.map((f) => ({ id: `${String(fu.id)}-${f.code}`, text: f.name, formula: f.code })), { id: `${String(fu.id)}-notfound`, text: '見つからない（薬剤師に伝える）', notfound: true }] }
      : fu)) }
    : q);
  for (const q0 of rawQuestions) {
    const q = withPickers(q0);
    if (q.generated === 'categories') {
      out.push({ ...q, options: cj.categories.map((c) => ({ id: `K1-${c.id}`, text: c.name, category: c.id, ...(c.femaleOnly ? { femaleOnly: true } : {}) })) });
    } else if (q.generated === 'complaints') {
      for (const c of cj.categories) {
        out.push({
          ...q, id: `K_${c.id}`, category: c.id, title: String(q.title).replace('{category}', c.name), trigger: { category: c.id },
          options: cj.complaints.filter((x) => x.categories.includes(c.id)).map((x) => ({
            id: `K${c.id}-${x.id}`, text: x.name, complaint: x.id, category: c.id, findings: x.findings, symptoms: x.symptoms,
            ...(x.tags?.length ? { tags: x.tags } : {}), ...(x.femaleOnly ? { femaleOnly: true } : {}), ...(x.mensesOnly ? { mensesOnly: true } : {}),
            ...(x.refer ? { refer: x.refer } : {}),
          })),
          followups: cj.complaints.filter((x) => x.categories.includes(c.id) && x.followups?.length)
            .flatMap((x) => (x.followups ?? []).map((fu) => ({ ...fu, when: `K${c.id}-${x.id}` }))),
        });
      }
    } else out.push(q);
  }
  return out;
}

// --- 検証 ------------------------------------------------------------------

/** 検証エラーを集めて返す（空配列なら合格）。テストからも呼ぶ。 */
export function validateMasters(qj: unknown, cj: unknown, fj: unknown, tj: unknown, ty: unknown, fo: unknown): string[] {
  const errs: string[] = [];
  const symptomKeys = new Set<string>(isObj(fo) && isObj(fo.symptoms) ? Object.keys(fo.symptoms) : []);
  // 所見
  const findingIds = new Set<string>();
  if (!isObj(fj) || !Array.isArray(fj.findings)) errs.push('findings.json: findings が必要');
  else {
    for (const f of fj.findings as unknown[]) {
      if (!isObj(f) || !isStr(f.id) || !isStr(f.label)) { errs.push('findings.json: id/label のない所見'); continue; }
      if (findingIds.has(f.id)) errs.push(`findings.json: 所見ID重複 ${f.id}`);
      findingIds.add(f.id);
      for (const key of ['weights', 'organs'] as const) {
        if (f[key] === undefined) continue;
        if (!isObj(f[key])) { errs.push(`${f.id}: ${key} がオブジェクトでない`); continue; }
        for (const [k, v] of Object.entries(f[key] as Raw)) {
          if (key === 'weights' ? !isAxisKey(k) : !isOrganKey(k)) errs.push(`${f.id}: ${key} のキー ${k} が不正`);
          if (typeof v !== 'number' || v < 0 || v > 1) errs.push(`${f.id}: ${key}.${k} は 0〜1 の数値`);
        }
      }
    }
    for (const f of fj.findings as Raw[]) {
      for (const i of strArr(f.implies)) if (!findingIds.has(i)) errs.push(`${String(f.id)}: implies の ${i} がない`);
      for (const i of strArr(f.conflicts)) {
        if (!findingIds.has(i)) errs.push(`${String(f.id)}: conflicts の ${i} がない`);
        else if (!strArr((fj.findings as Raw[]).find((x) => x.id === i)?.conflicts).includes(String(f.id))) errs.push(`${String(f.id)}: conflicts は両方向に書く（${i} 側にない）`);
      }
    }
  }
  // タグ
  const tagIds = new Set<string>();
  if (!isObj(tj) || !Array.isArray(tj.tags)) errs.push('safety_tags.json: tags が必要');
  else for (const t of tj.tags as unknown[]) {
    if (!isObj(t) || !isStr(t.id) || !isStr(t.label) || !Array.isArray(t.checks) || !t.checks.length) { errs.push('safety_tags.json: id/label/checks が必要'); continue; }
    if (tagIds.has(t.id)) errs.push(`safety_tags.json: タグ重複 ${t.id}`);
    tagIds.add(t.id);
  }
  // 主訴
  const complaintIds = new Set<string>();
  const templatesUsed = new Set<string>();
  let categories: Category[] = [];
  if (!isObj(cj) || !Array.isArray(cj.categories) || !Array.isArray(cj.complaints)) errs.push('complaints.json: categories と complaints が必要');
  else {
    categories = cj.categories as Category[];
    const catIds = new Set(categories.map((c) => c.id));
    for (const c of cj.complaints as unknown[]) {
      if (!isObj(c) || !isStr(c.id) || !isStr(c.name) || !isStr(c.detail)) { errs.push('complaints.json: id/name/detail のない主訴'); continue; }
      if (complaintIds.has(c.id)) errs.push(`complaints.json: 主訴ID重複 ${c.id}`);
      complaintIds.add(c.id);
      if (c.detail !== 'none') templatesUsed.add(c.detail);
      if (!strArr(c.categories).length || !strArr(c.categories).every((x) => catIds.has(x))) errs.push(`主訴 ${c.id}: categories が不正`);
      for (const f of strArr(c.findings)) if (!findingIds.has(f)) errs.push(`主訴 ${c.id}: 所見 ${f} がない`);
      for (const s of strArr(c.symptoms)) if (!symptomKeys.has(s)) errs.push(`主訴 ${c.id}: 症状コード ${s} がない`);
      for (const t of strArr(c.tags)) if (!tagIds.has(t)) errs.push(`主訴 ${c.id}: タグ ${t} がない`);
    }
  }
  // 設問
  const optionIds = new Set<string>();
  const templates = new Set<string>();
  const chosenRefs: [string, string][] = [];
  const excludeRefs: [string, string][] = [];
  if (!isObj(qj) || !isStr(qj.version) || !Array.isArray(qj.questions)) errs.push('questions.json: version と questions が必要');
  else {
    const expanded = isObj(cj) && Array.isArray(cj.complaints) ? expandQuestions(qj.questions as Raw[], cj as { categories: Category[]; complaints: Complaint[] }, isObj(fo) && Array.isArray(fo.formulas) ? (fo.formulas as { code: string; name: string }[]) : []) : [];
    const qIds = new Set<string>();
    for (const q of expanded) {
      const id = String(q.id);
      if (qIds.has(id)) errs.push(`設問ID重複 ${id}`);
      qIds.add(id);
      if (!SECTIONS.includes(q.section as Section)) errs.push(`${id}: section が不正`);
      if (!isStr(q.title)) errs.push(`${id}: title がない`);
      if (!['single', 'multi'].includes(String(q.type))) errs.push(`${id}: type は single/multi`);
      if (q.section === 'detail') { if (!isStr(q.template)) errs.push(`${id}: 深掘りに template がない`); else templates.add(q.template); }
      const opts = Array.isArray(q.options) ? (q.options as unknown[]) : [];
      if (!opts.length && q.generated !== 'primary') errs.push(`${id}: 選択肢がない`);
      if ((q.section === 'detail' || q.section === 'constitution') && q.type === 'multi' && !opts.some((o) => isObj(o) && (o.exclusive || o.other))) {
        errs.push(`${id}: 「特にない」（exclusive）か「その他」（other）がない`);
      }
      if ((q.section === 'detail' || q.section === 'constitution') && id !== 'Sspots3' && opts.some((o) => isObj(o) && o.exclusive === 'unknown')) {
        errs.push(`${id}: 体質・深掘りの設問に「わからない」を置かない（修正依頼 2-1。例外はシミが濃くなる条件）`);
      }
      const trig = q.trigger;
      if (trig !== undefined) {
        if (!isObj(trig)) errs.push(`${id}: trigger がオブジェクトでない`);
        else {
          for (const c of strArr(trig.chosen)) chosenRefs.push([id, c]);
          for (const f of strArr(trig.findingsPresent)) if (!findingIds.has(f)) errs.push(`${id}: trigger.findingsPresent の ${f} がない`);
        }
      }
      const checkOpt = (o: unknown) => {
        if (!isObj(o) || !isStr(o.id) || !isStr(o.text)) { errs.push(`${id}: id/text のない選択肢`); return; }
        if (optionIds.has(o.id)) errs.push(`選択肢ID重複 ${o.id}`);
        optionIds.add(o.id);
        for (const f of strArr(o.findings)) if (!findingIds.has(f)) errs.push(`${o.id}: 所見 ${f} がない`);
        for (const s of [...strArr(o.symptoms), ...strArr(o.also)]) if (!symptomKeys.has(s)) errs.push(`${o.id}: 症状コード ${s} がない`);
        for (const t of strArr(o.tags)) if (!tagIds.has(t)) errs.push(`${o.id}: タグ ${t} がない`);
        if (o.exclusive !== undefined && !['none', 'unknown', 'declined'].includes(String(o.exclusive))) errs.push(`${o.id}: exclusive が不正`);
        if (o.exclusive && strArr(o.findings).length) errs.push(`${o.id}: exclusive の選択肢に所見を付けない`);
        if (o.urgent && !strArr(o.tags).length) errs.push(`${o.id}: urgent の選択肢にタグがない`);
        if ((o.other || o.defer) && (o.exclusive || strArr(o.findings).length)) errs.push(`${o.id}: other／defer の選択肢に所見・exclusive を付けない`);
        if (o.refer !== undefined && !isStr(o.refer)) errs.push(`${o.id}: refer は受診のおすすめの文言`);
        if (o.oneOf !== undefined && (!isStr(o.oneOf) || o.exclusive)) errs.push(`${o.id}: oneOf は名前（exclusive と併用しない）`);
        if (o.group !== undefined && !(Array.isArray(q.groups) && (q.groups as unknown[]).some((g) => isObj(g) && g.id === o.group))) errs.push(`${o.id}: group ${String(o.group)} が設問の groups にない`);
        for (const f of strArr(o.blockedIf)) if (!findingIds.has(f)) errs.push(`${o.id}: blockedIf の ${f} がない`);
        for (const x of strArr(o.excludes)) excludeRefs.push([String(o.id), x]);
        if (o.herbs !== undefined && !(Array.isArray(o.herbs) && (o.herbs as unknown[]).every(isStr))) errs.push(`${o.id}: herbs は生薬名の配列`);
      };
      for (const o of opts) checkOpt(o);
      if (isObj(q.sub)) for (const o of (q.sub.options as unknown[]) ?? []) checkOpt(o);
      if (q.followup !== undefined) errs.push(`${id}: followup は followups（配列）に`);
      if (q.followups !== undefined) {
        for (const fu of Array.isArray(q.followups) ? (q.followups as unknown[]) : [null]) {
          if (!isObj(fu) || !isStr(fu.when) || !isStr(fu.id) || !isStr(fu.title) || !Array.isArray(fu.options)) { errs.push(`${id}: followups は when/id/title/options`); continue; }
          if (!opts.some((o) => isObj(o) && o.id === fu.when)) errs.push(`${id}: followups.when=${fu.when} がこの設問の選択肢にない`);
          if (fu.picker !== undefined && fu.picker !== 'formulas') errs.push(`${id}: followups.picker は formulas だけ`);
          for (const o of fu.options as unknown[]) checkOpt(o);
        }
      }
      if (q.note !== undefined && (!isObj(q.note) || !isStr(q.note.label))) errs.push(`${id}: note は label を持つ`);
      if (q.groups !== undefined && !(Array.isArray(q.groups) && (q.groups as unknown[]).every((g) => isObj(g) && isStr(g.id) && isStr(g.title) && isStr(g.hint)))) errs.push(`${id}: groups は id/title/hint の配列`);
      if (q.prefill !== undefined) errs.push(`${id}: prefill は廃止（体質チェックは全設問でお悩みの所見をチェック済みで出す）`);
    }
    for (const [qid, c] of chosenRefs) if (!optionIds.has(c)) errs.push(`${qid}: trigger.chosen の ${c} は存在しない選択肢ID`);
    for (const [oid, x] of excludeRefs) if (!optionIds.has(x)) errs.push(`${oid}: excludes の ${x} は存在しない選択肢ID`);
    for (const t of templatesUsed) if (!templates.has(t)) errs.push(`深掘りテンプレート ${t} の設問がない`);
    for (const t of templates) if (!templatesUsed.has(t)) errs.push(`深掘りテンプレート ${t} を使う主訴がない`);
  }
  // タイプ
  if (!isObj(ty) || !isObj(ty.types) || !isObj(ty.thermal)) errs.push('types.json: types と thermal が必要');
  else {
    for (const k of Object.keys(ty.types)) if (!isTypeKey(k)) errs.push(`types.json: types のキー ${k} は6タイプにない（寒熱は thermal に）`);
    for (const key of AXES) {
      const d = ((isTypeKey(key) ? ty.types : ty.thermal) as Raw)[key];
      if (!isObj(d)) { errs.push(`types.json: ${key} がない`); continue; }
      for (const k of ['name', 'reading', 'color', 'headline', 'summary']) if (!isStr(d[k])) errs.push(`types.${key}.${k} がない`);
      if (!Array.isArray(d.symptoms) || d.symptoms.length !== 5) errs.push(`types.${key}.symptoms は5つ`);
      if (!isObj(d.advice) || !['mind', 'food', 'move', 'rest'].every((k) => isStr((d.advice as Raw)[k]))) errs.push(`types.${key}.advice は mind/food/move/rest`);
      if (!isObj(d.tsubo) || !['name', 'reading', 'position', 'effect'].every((k) => isStr((d.tsubo as Raw)[k]))) errs.push(`types.${key}.tsubo は name/reading/position/effect`);
    }
    if (!isObj(ty.foundation) || !isStr(ty.foundation.title) || !isStr(ty.foundation.lead) || !Array.isArray(ty.foundation.items) || !(ty.foundation.items as unknown[]).every((x) => isObj(x) && isStr(x.label) && isStr(x.text))) errs.push('types.json: foundation（title/lead/items）が必要');
    for (const [i, tip] of ((Array.isArray(ty.tips) ? ty.tips : []) as unknown[]).entries()) {
      if (!isObj(tip) || !isStr(tip.when) || !Array.isArray(tip.types) || !isStr(tip.text)) { errs.push(`tips[${i}]: when/types/text が必要`); continue; }
      if (!optionIds.has(tip.when)) errs.push(`tips[${i}]: when=${tip.when} は存在しない選択肢ID`);
      for (const t of tip.types as unknown[]) if (!isAxisKey(String(t))) errs.push(`tips[${i}]: types に不正な値 ${String(t)}`);
    }
  }
  // 処方
  const ref = (x: string) => findingIds.has(x) || optionIds.has(x);
  if (!isObj(fo) || !Array.isArray(fo.formulas) || !isObj(fo.symptoms)) errs.push('formulas.json: symptoms と formulas が必要');
  else {
    for (const [k, v] of Object.entries(fo.symptoms)) if (!isObj(v) || !isStr(v.label)) errs.push(`symptoms.${k}: label がない`);
    const codes = new Set<string>();
    const names = new Set<string>();
    for (const raw of fo.formulas as unknown[]) {
      if (!isObj(raw) || !isStr(raw.code)) { errs.push('formulas.json: code のない処方'); continue; }
      const c = raw.code;
      if (codes.has(c)) errs.push(`formulas.json: code 重複 ${c}`);
      codes.add(c);
      if (!isStr(raw.name) || !isStr(raw.reading)) errs.push(`${c}: name/reading がない`);
      if (isStr(raw.name)) { if (names.has(raw.name)) errs.push(`formulas.json: 名前の重複 ${raw.name}`); names.add(raw.name); }
      for (const k of ['efficacy', 'useTarget', 'action', 'targetLabel']) if (!isStr(raw[k])) errs.push(`${c}: ${k} がない`);
      if (isStr(raw.action) && /診断|治る|治り|治す|処方/.test(raw.action)) errs.push(`${c}: action に「診断」「治る」「処方」を使わない`);
      if (!Array.isArray(raw.indications) || raw.indications.length === 0) errs.push(`${c}: indications（効能・効果の諸症）が空`);
      else for (const ind of raw.indications as unknown[]) {
        if (!isObj(ind) || !isStr(ind.symptom) || !isStr(ind.term)) { errs.push(`${c}: indications は symptom と term を持つ`); continue; }
        if (!symptomKeys.has(ind.symptom)) errs.push(`${c}: indications の症状コード ${ind.symptom} が symptoms にない`);
        if (isStr(raw.efficacy) && !raw.efficacy.includes(ind.term)) errs.push(`${c}: 効能の語「${ind.term}」が efficacy の本文にない`);
        if (ind.requires !== undefined) {
          if (!Array.isArray(ind.requires) || ind.requires.length === 0) errs.push(`${c}: requires は所見IDまたは選択肢IDの配列`);
          else for (const r of ind.requires as unknown[]) if (!ref(String(r))) errs.push(`${c}: requires の ${String(r)} は存在しない所見・選択肢`);
        }
      }
      if (!Array.isArray(raw.strength) || raw.strength.length === 0 || !(raw.strength as unknown[]).every((s) => ['def', 'mid', 'exc'].includes(String(s)))) errs.push(`${c}: strength は def/mid/exc の配列`);
      if (!isObj(raw.types) || Object.keys(raw.types).length === 0) errs.push(`${c}: types が空`);
      else for (const [k, v] of Object.entries(raw.types)) {
        if (!isAxisKey(k)) errs.push(`${c}: types のキー ${k} が6タイプ・寒熱でない`);
        if (typeof v !== 'number' || v < 0 || v > 1) errs.push(`${c}: types.${k} は 0〜1`);
      }
      if (!['warm', 'neutral', 'cool'].includes(String(raw.thermal))) errs.push(`${c}: thermal が warm/neutral/cool でない`);
      if (raw.heat !== undefined && !['excess', 'deficient'].includes(String(raw.heat))) errs.push(`${c}: heat は excess/deficient`);
      if (!Array.isArray(raw.organs) || raw.organs.length === 0 || !(raw.organs as unknown[]).every((o) => isOrganKey(String(o)))) errs.push(`${c}: organs は五臓の配列`);
      for (const k of ['signs', 'cautionHerbs', 'contraindications']) if (!Array.isArray(raw[k])) errs.push(`${c}: ${k} が配列でない`);
      for (const s of strArr(raw.signs)) if (!ref(s)) errs.push(`${c}: signs の ${s} は存在しない所見・選択肢`);
      for (const ct of strArr(raw.contraindications)) if (!(CONTRA_CODES as readonly string[]).includes(ct)) errs.push(`${c}: 除外フラグ ${ct} が不明`);
      if (typeof raw.priority !== 'number') errs.push(`${c}: priority が数値でない`);
      if (typeof raw.verified !== 'boolean') errs.push(`${c}: verified が真偽値でない`);
      if (typeof raw.active !== 'boolean') errs.push(`${c}: active が真偽値でない`);
      if (raw.tsumuraNo !== undefined && (!Number.isInteger(raw.tsumuraNo) || typeof raw.tsumuraNoVerified !== 'boolean')) errs.push(`${c}: tsumuraNo は整数、tsumuraNoVerified は真偽値`);
      if (raw.aliases !== undefined && (!Array.isArray(raw.aliases) || !(raw.aliases as unknown[]).every(isStr))) errs.push(`${c}: aliases は文字列の配列`);
      if (raw.herbs !== undefined && !(Array.isArray(raw.herbs) && (raw.herbs as unknown[]).every((h) => isObj(h) && isStr(h.herb) && typeof h.g === 'number'))) errs.push(`${c}: herbs は herb と g の配列`);
      if (raw.foodHerbs !== undefined && !(Array.isArray(raw.foodHerbs) && (raw.foodHerbs as unknown[]).every(isStr))) errs.push(`${c}: foodHerbs は生薬名の配列`);
      if (raw.compositionConfidence !== undefined && !['A', 'B', 'C'].includes(String(raw.compositionConfidence))) errs.push(`${c}: compositionConfidence は A/B/C`);
    }
  }
  return errs;
}

const problems = validateMasters(questionsJson, complaintsJson, findingsJson, tagsJson, typesJson, formulasJson);
if (problems.length) {
  throw new Error(`[kampo] マスタデータの検証に失敗:\n  - ${problems.join('\n  - ')}`);
}

const cj = complaintsJson as unknown as { categories: Category[]; complaints: Complaint[] };
const qj = questionsJson as unknown as { version: string; review: Review; questions: Raw[] };
const allQuestions = expandQuestions(qj.questions, cj, (formulasJson as unknown as FormulasData).formulas) as unknown as Question[];
/** 患者の問診に出す設問（表示順） */
export const QUESTIONS: Question[] = allQuestions.filter((q) => q.section !== 'staff');
/** 薬剤師が入力する設問（舌・体格・声） */
export const STAFF_QUESTIONS: Question[] = allQuestions.filter((q) => q.section === 'staff');
export const QUESTIONNAIRE = { version: qj.version, review: qj.review, questions: QUESTIONS };
export const CATEGORIES: Category[] = cj.categories;
export const COMPLAINTS: Complaint[] = cj.complaints;
export const FINDINGS: Finding[] = (findingsJson as unknown as { findings: Finding[] }).findings;
export const SAFETY_TAGS: SafetyTagDef[] = (tagsJson as unknown as { tags: SafetyTagDef[] }).tags;
export const TYPE_DEFS: Record<TypeKey, TypeDef> = (typesJson as unknown as TypesData).types;
/** 寒熱（冷え・熱）の説明。体質タイプとは別に出す */
export const THERMAL_DEFS: Record<ThermalKey, TypeDef> = (typesJson as unknown as TypesData).thermal;
export const axisDef = (k: AxisKey): TypeDef => (isTypeKey(k) ? TYPE_DEFS[k] : THERMAL_DEFS[k]);
export const TIPS: Tip[] = (typesJson as unknown as TypesData).tips;
/** 全員共通の養生の土台（胃腸・睡眠・冷やさない。第4弾 3-9） */
export const FOUNDATION: Foundation = (typesJson as unknown as TypesData).foundation;
const formulasData = formulasJson as unknown as FormulasData;
export const FORMULAS: Formula[] = formulasData.formulas;
export const SYMPTOMS: Record<string, SymptomDef> = formulasData.symptoms;
export const FORMULAS_SOURCE = formulasData.source ?? '';
export const LEGACY = legacyJson as unknown as { types: Record<string, string>; versions: Record<string, { id: string; title: string; options: Record<string, string> }[]> };

const QUESTION_BY_ID = new Map(allQuestions.map((q) => [q.id, q]));
const OPTION_BY_ID = new Map<string, { q: Question; o: Option }>();
for (const q of allQuestions) for (const o of [...q.options, ...(q.sub?.options ?? []), ...(q.followups ?? []).flatMap((f) => f.options)]) OPTION_BY_ID.set(o.id, { q, o });
const FINDING_BY_ID = new Map(FINDINGS.map((f) => [f.id, f]));
const COMPLAINT_BY_ID = new Map(COMPLAINTS.map((c) => [c.id, c]));
const TAG_BY_ID = new Map(SAFETY_TAGS.map((t) => [t.id, t]));
export const questionById = (id: string) => QUESTION_BY_ID.get(id);
export const optionById = (id: string) => OPTION_BY_ID.get(id)?.o;
export const questionOfOption = (id: string) => OPTION_BY_ID.get(id)?.q;
export const optionText = (id: string) => OPTION_BY_ID.get(id)?.o.text ?? id;
export const findingById = (id: string) => FINDING_BY_ID.get(id);
export const findingLabel = (id: string) => FINDING_BY_ID.get(id)?.label ?? optionText(id);
export const complaintById = (id: string) => COMPLAINT_BY_ID.get(id);
export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);
export const tagById = (id: string) => TAG_BY_ID.get(id);
export const formulaByCode = (code: string) => FORMULAS.find((f) => f.code === code);
export const symptomLabel = (code: string) => SYMPTOMS[code]?.label ?? code;
/** タイプ・寒熱の名前（旧版のセッションの陽虚・陽盛なども表示できるように legacy.json の名前で補う） */
export const axisName = (k: string): string => (isAxisKey(k) ? axisDef(k).name : LEGACY.types[k] ?? k);
export const axisColor = (k: string): string => (isAxisKey(k) ? axisDef(k).color : '#999');
/** 旧版のセッションの選択肢ID → 文言（版ごとに探し、なければ全版から） */
export function legacyOptionText(version: string, id: string): string {
  for (const q of LEGACY.versions[version] ?? []) if (q.options[id]) return q.options[id];
  for (const qs of Object.values(LEGACY.versions)) for (const q of qs) if (q.options[id]) return q.options[id];
  return id;
}

export const STRENGTH_LABEL: Record<Strength, string> = { def: '虚証（体力虚弱）', mid: '虚実間（体力中等度）', exc: '実証（体力充実）' };
export const THERMAL_LABEL: Record<Thermal, string> = { warm: '温める', neutral: '中間', cool: '冷ます' };
export const HEAT_LABEL: Record<HeatKind, string> = { excess: '実熱', deficient: '虚熱' };
/** 処方の適応体力の範囲を承認基準の言い方に近い語で */
export function strengthRangeLabel(s: Strength[]): string {
  const k = [...s].sort().join(',');
  if (k === 'def') return '体力虚弱';
  if (k === 'def,mid') return '体力中等度以下';
  if (k === 'mid') return '体力中等度';
  if (k === 'exc,mid') return '体力中等度以上';
  if (k === 'exc') return '体力充実';
  return '体力に関わらず';
}
