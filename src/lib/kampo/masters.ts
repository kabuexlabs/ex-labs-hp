// ---------------------------------------------------------------------------
// 漢方体質診断（/kampo/）v2 のマスタデータ。正本は src/data/kampo/*.json（薬剤師が直接編集する）。
// 仕様書 docs/kampo-spec-v2.md・設計 docs/kampo-v2-design.md。
// このモジュールは JSON を読み込み、モジュール読込時に形と参照を検証する（壊れたマスタで店頭運用しない）。
//   findings.json            … 所見（Finding）と相関グループ（FindingGroup）
//   complaints.json          … 主訴カテゴリーと具体的主訴（主訴の一覧画面はここから作る）
//   questions.json           … 設問（基本情報・安全性・主訴別詳細・安全上の確認・経過・共通体質・生活習慣・薬剤師の追加質問）
//   patterns.json            … 気血水6証・寒熱・虚実の所見重み、暫定カットオフ、判定規則、整合性の確認規則
//   formulas.json            … ①処方基本
//   products.json            … ②製品情報（公式資料で確認できたものだけ。現在0件）
//   herbs.json               … ③生薬と構成生薬
//   formula_evaluations.json … ④漢方医学的評価
//   complaint_formulas.json  … ⑤主訴・症状対応
//   safety_rules.json        … 安全性の確認規則（草案）
//   types.json               … 体質の説明と養生（説明用画面）
// 医学的な重み・カットオフ・対応・構成はすべて「草案」。検証済みとして扱わない（仕様書 §22・§25）。
// ---------------------------------------------------------------------------
import findingsJson from '../../data/kampo/findings.json' with { type: 'json' };
import complaintsJson from '../../data/kampo/complaints.json' with { type: 'json' };
import questionsJson from '../../data/kampo/questions.json' with { type: 'json' };
import patternsJson from '../../data/kampo/patterns.json' with { type: 'json' };
import formulasJson from '../../data/kampo/formulas.json' with { type: 'json' };
import productsJson from '../../data/kampo/products.json' with { type: 'json' };
import herbsJson from '../../data/kampo/herbs.json' with { type: 'json' };
import evaluationsJson from '../../data/kampo/formula_evaluations.json' with { type: 'json' };
import complaintFormulasJson from '../../data/kampo/complaint_formulas.json' with { type: 'json' };
import safetyRulesJson from '../../data/kampo/safety_rules.json' with { type: 'json' };
import typesJson from '../../data/kampo/types.json' with { type: 'json' };
import legacyJson from '../../data/kampo/legacy-v1.json' with { type: 'json' };

// --- 確認状態 -----------------------------------------------------------------

export type ReviewStatus = 'draft' | 'source_checked' | 'expert_checked' | 'validated' | 'needs_update';
export const REVIEW_STATUSES: ReviewStatus[] = ['draft', 'source_checked', 'expert_checked', 'validated', 'needs_update'];
export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  draft: '草案', source_checked: '資料確認済み', expert_checked: '専門家確認済み', validated: '検証済み', needs_update: '更新確認待ち',
};
/** 臨床で使ってよい確認状態か（専門家確認済み以上。草案・資料確認のみ・更新確認待ちは不可） */
export const isConfirmed = (s: ReviewStatus | undefined) => s === 'expert_checked' || s === 'validated';
export interface Review { status: ReviewStatus; note?: string; source?: string; reviewer?: string | null; reviewedAt?: string | null; history?: unknown[] }

// --- 所見 ---------------------------------------------------------------------

export type Zang = 'liver' | 'heart' | 'spleen' | 'lung' | 'kidney';
export const ZANGS: Zang[] = ['liver', 'heart', 'spleen', 'lung', 'kidney'];
export const ZANG_LABEL: Record<Zang, string> = { liver: '肝', heart: '心', spleen: '脾', lung: '肺', kidney: '腎' };
export type FindingKind = 'symptom' | 'modifier' | 'tongue' | 'safety' | 'context';
export interface Finding { id: string; name: string; kind: FindingKind; group?: string; zang?: Zang[] }

// --- 主訴 ---------------------------------------------------------------------

export interface Category { id: string; name: string }
export interface Complaint { id: string; category: string; name: string; finding: string; detailQuestion: string; redFlags?: string[] }

// --- 設問 ---------------------------------------------------------------------

export type Section = 'basic' | 'safety' | 'complaint' | 'detail' | 'redflag' | 'course' | 'constitution' | 'lifestyle' | 'staff';
export const SECTION_LABEL: Record<Section, string> = {
  basic: '基本情報', safety: '安全性の確認', complaint: 'お悩み', detail: 'お悩みの詳細', redflag: '安全性の確認', course: 'お悩みの経過',
  constitution: '体質', lifestyle: '生活習慣', staff: '薬剤師の確認',
};
export type Exclusive = 'none' | 'unknown' | 'declined';
export type Alert = 'emergency' | 'refer' | 'consult';
export interface Option {
  id: string;
  text: string;
  /** この選択肢が表す所見（選ぶと present） */
  findings?: string[];
  /** 修飾情報（kind: modifier の所見）が紐づく対象症状の所見ID */
  target?: string;
  /** 基本情報・生活習慣の値（例: female、20s） */
  value?: string;
  /** ほかの選択肢と同時に選べない選択肢（特にない／わからない／回答しない） */
  exclusive?: Exclusive;
  femaleOnly?: boolean;
  /** 舌のイラスト（public/assets/kampo/tongue/<image>.svg。未登録はプレースホルダー） */
  image?: string;
  /** 選んだときに出す注意（緊急・受診勧奨・相談） */
  alert?: Alert;
  /** 漢方薬の一覧：処方ID・読み・別名（検索用） */
  formula?: string;
  kana?: string;
  aliases?: string[];
  /** 主訴の一覧：主訴ID */
  complaint?: string;
}
export interface Trigger {
  /** 性別がこれでなければ表示 */
  sexNot?: 'male';
  /** 月経がある（周期的・不規則）と答えたときだけ表示 */
  menses?: boolean;
  tongueMode?: 'self' | 'staff';
  /** 主訴カテゴリーを選んでいれば表示 */
  category?: string;
  /** これらの主訴のどれかを選んでいれば表示（優先かどうかは問わない） */
  complaintSelected?: string[];
  /** 優先主訴がこれなら表示 */
  primary?: string[];
  /** 具体的主訴をこの数以上選んでいれば表示 */
  minComplaints?: number;
  /** 優先主訴が決まっていれば表示 */
  hasPrimary?: boolean;
  /** これらの所見のどれかが present なら表示 */
  findingsPresent?: string[];
  /** これらの選択肢のどれかが選ばれていれば表示 */
  chosen?: string[];
}
export interface Question {
  id: string;
  section: Section;
  title: string;
  type: 'single' | 'multi';
  options: Option[];
  trigger?: Trigger;
  help?: string;
  /** 文字入力で選択肢を絞り込める（医薬品の一覧） */
  searchable?: boolean;
  /** 共通体質問診の領域（B1〜B13） */
  domain?: string;
  /** 主訴別詳細問診の主訴 */
  complaintId?: string;
  /** 同じ画面に出す補助の単一選択（経過の生活への影響・就寝時刻・入浴） */
  sub?: { title: string; options: Option[] };
  /** 薬剤師の追加質問：情報源と優先区分（安全性 → 処方候補の鑑別 → 証の鑑別 → 五臓） */
  staff?: { source: 'pharmacist_observation' | 'pharmacist_question'; category: StaffCategory };
  priority?: number;
  review?: Review;
  /** 主訴の一覧画面：カテゴリー／具体的主訴／優先主訴 */
  role?: 'category' | 'complaints' | 'primary';
}
export type StaffCategory = 'safety' | 'formula' | 'pattern' | 'zang';
export const STAFF_CATEGORY_LABEL: Record<StaffCategory, string> = { safety: '安全性の確認', formula: '処方候補の鑑別', pattern: '証の鑑別', zang: '五臓の確認' };

// --- 証・軸 -------------------------------------------------------------------

export type PatternId = 'qi_def' | 'blood_def' | 'qi_stag' | 'blood_stasis' | 'fluid' | 'yin_def';
export const PATTERN_IDS: PatternId[] = ['qi_def', 'blood_def', 'qi_stag', 'blood_stasis', 'fluid', 'yin_def'];
export interface Pattern { id: PatternId; name: string; reading: string; cutoff: { candidate: number; strong: number }; weights: Record<string, number>; keyFindings: string[] }
export type AxisId = 'cold' | 'heat' | 'def' | 'exc';
export interface Axis { name: string; cutoff?: number; weights: Record<string, number> }
export interface PatternRules {
  primary: { minGroups: number; requireStrongFinding: boolean; tieMargin: number };
  coexisting: { minGroups: number; requireStrongFinding: boolean };
  complaintRelated: { minScore: number; minGroups: number };
  axisMinGroups: number;
  zangMinGroups: number;
}
export interface ConsistencyRule { id: string; pattern: PatternId; coldHeat?: 'cold' | 'heat'; defExc?: 'def' | 'exc'; message: string; needs: string[] }

// --- 処方（5種類） -------------------------------------------------------------

export interface Formula {
  id: string; name: string; kana: string; aliases: string[];
  /** candidate＝候補になる処方／reference＝服用中・副作用歴の照合用（候補にしない） */
  role: 'candidate' | 'reference';
  status: 'active' | 'inactive';
  scopeNote?: string;
  /** 一般用漢方製剤承認基準の記載（参考。医療用製品の効能・効果ではない） */
  otcReference?: { efficacy: string; useTarget: string };
  review?: Review;
}
export interface Product {
  id: string; formulaId: string; manufacturer: string; product_name: string;
  approved_indications: string; dosage: string; contraindications: string[]; precautions: string[]; interactions: string[]; adverse_reactions: string[];
  /** 禁忌に当たる所見（あれば除外）・相互作用の確認が必要な所見（あれば薬剤師確認） */
  contraindication_findings?: string[]; interaction_findings?: string[];
  herbs?: { herbId: string; quantity: number | null }[];
  source: string; source_version: string; last_verified: string;
  review: Review;
}
export interface Herb { id: string; name: string; aliases: string[] }
export interface Composition { formulaId: string; productId: string | null; herbs: { herbId: string; quantity: number | null }[]; source: string; verification_status: ReviewStatus }
export type Range = 'def' | 'mid' | 'exc';
export interface Evaluation {
  formulaId: string;
  qi_blood_fluid: { primary: PatternId[]; secondary: PatternId[] };
  /** 対象とする寒熱（cold＝冷えに用いる温める処方／heat＝熱に用いる冷ます処方） */
  cold_heat: 'cold' | 'heat' | 'neutral';
  heat_kind?: 'excess' | 'deficient';
  deficiency_excess: Range[];
  zang: Zang[];
  key_findings: string[]; supporting_findings: string[]; conflicting_findings: string[];
  use_target: string; action: string; targetLabel: string; reference: string;
  review?: Review;
}
export type Match = 'efficacy' | 'partial' | 'use_target';
export const MATCH_LABEL: Record<Match, string> = { efficacy: '効能の語が主訴と一致', partial: '効能の語が主訴と一部一致', use_target: '使用目標に記載' };
export interface CFTerm { term: string; match: Match; requires?: string[] }
export interface ComplaintFormula {
  complaintId: string; formulaId: string; productId: string | null; terms: CFTerm[]; indication_match: Match;
  key_findings?: string[]; supporting_findings?: string[]; conflicting_findings?: string[]; required_questions: string[];
  source?: string; review?: Review;
}
export interface SafetyRules {
  herbChecks: { herb: string; when: string[]; text: string }[];
  pregnancyExcludeHerbs: string[];
  pregnancyCheckHerbs: string[];
  medChecks: { when: string; text: string }[];
  formulaRules: { formulas: string[]; when: string[]; state: 'check' | 'excluded'; text: string }[];
}

// --- 説明用（養生） -------------------------------------------------------------

export type AdviceKey = PatternId | 'cold' | 'heat';
export const ADVICE_KEYS: AdviceKey[] = [...PATTERN_IDS, 'cold', 'heat'];
export const isAdviceKey = (s: string): s is AdviceKey => (ADVICE_KEYS as string[]).includes(s);
export interface TypeDef {
  name: string; reading: string; color: string; headline: string; summary: string; symptoms: string[];
  advice: { mind: string; food: string; move: string; rest: string };
  tsubo: { name: string; reading: string; position: string; effect: string };
}
export interface Tip { when: string; types: AdviceKey[]; text: string }

// --- 検証 ---------------------------------------------------------------------

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface MasterSet {
  findings: unknown; complaints: unknown; questions: unknown; patterns: unknown; formulas: unknown; products: unknown;
  herbs: unknown; evaluations: unknown; complaintFormulas: unknown; safetyRules: unknown; types: unknown;
}

/** 検証エラーを集めて返す（空配列なら合格）。テストからも呼ぶ。 */
export function validateMasters(m: MasterSet): string[] {
  const errs: string[] = [];
  const checkReview = (r: unknown, where: string) => {
    if (r === undefined) return;
    if (!isObj(r) || !REVIEW_STATUSES.includes(r.status as ReviewStatus)) { errs.push(`${where}: review.status が不正`); return; }
    // 草案以外は情報源・確認者・確認日時が必須（仕様書 §22）
    if (r.status !== 'draft' && (!isStr(r.source) || !isStr(r.reviewer) || !isStr(r.reviewedAt))) errs.push(`${where}: 確認状態が「${REVIEW_LABEL[r.status as ReviewStatus]}」なのに source・reviewer・reviewedAt がない`);
  };
  for (const [k, v] of Object.entries(m)) if (isObj(v)) checkReview(v.review, `${k}.json`);

  // 所見
  const F = new Map<string, J>();
  const groups = isObj(m.findings) && isObj(m.findings.groups) ? m.findings.groups : {};
  for (const x of arr(isObj(m.findings) ? m.findings.findings : undefined)) {
    if (!isObj(x) || !isStr(x.id) || !isStr(x.name)) { errs.push('findings: id/name のない所見'); continue; }
    if (F.has(x.id)) errs.push(`findings: 所見ID重複 ${x.id}`);
    F.set(x.id, x);
    if (!['symptom', 'modifier', 'tongue', 'safety', 'context'].includes(String(x.kind))) errs.push(`${x.id}: kind が不正`);
    if (x.group !== undefined && !(String(x.group) in groups)) errs.push(`${x.id}: グループ ${String(x.group)} が未定義`);
    for (const z of arr(x.zang)) if (!ZANGS.includes(z as Zang)) errs.push(`${x.id}: zang ${String(z)} が五臓でない`);
  }
  if (F.size === 0) errs.push('findings.json: 所見がない');
  const needF = (id: unknown, where: string) => { if (!F.has(String(id))) errs.push(`${where}: 所見 ${String(id)} が findings.json にない`); };

  // 主訴
  const C = new Map<string, J>();
  const cats = new Set<string>();
  for (const c of arr(isObj(m.complaints) ? m.complaints.categories : undefined)) if (isObj(c) && isStr(c.id) && isStr(c.name)) cats.add(c.id); else errs.push('complaints: カテゴリーに id/name がない');
  for (const c of arr(isObj(m.complaints) ? m.complaints.complaints : undefined)) {
    if (!isObj(c) || !isStr(c.id) || !isStr(c.name)) { errs.push('complaints: id/name のない主訴'); continue; }
    if (C.has(c.id)) errs.push(`complaints: 主訴ID重複 ${c.id}`);
    C.set(c.id, c);
    if (!cats.has(String(c.category))) errs.push(`${c.id}: カテゴリー ${String(c.category)} がない`);
    needF(c.finding, `主訴 ${c.id}`);
  }

  // 設問
  const Q = new Map<string, J>();
  const O = new Set<string>();
  const triggers: [string, J][] = [];
  for (const q of arr(isObj(m.questions) ? m.questions.questions : undefined)) {
    if (!isObj(q) || !isStr(q.id)) { errs.push('questions: id のない設問'); continue; }
    if (Q.has(q.id)) errs.push(`questions: 設問ID重複 ${q.id}`);
    Q.set(q.id, q);
    if (!(String(q.section) in SECTION_LABEL) || q.section === 'complaint') errs.push(`${q.id}: section が不正（主訴の一覧は complaints.json から作る）`);
    if (!isStr(q.title)) errs.push(`${q.id}: title がない`);
    if (!['single', 'multi'].includes(String(q.type))) errs.push(`${q.id}: type が single/multi でない`);
    checkReview(q.review, q.id);
    const opts = [...arr(q.options), ...(isObj(q.sub) ? arr(q.sub.options) : [])];
    if (arr(q.options).length === 0) errs.push(`${q.id}: 選択肢がない`);
    for (const o of opts) {
      if (!isObj(o) || !isStr(o.id) || !isStr(o.text)) { errs.push(`${q.id}: id/text のない選択肢`); continue; }
      if (O.has(o.id)) errs.push(`選択肢ID重複 ${o.id}`);
      O.add(o.id);
      for (const f of arr(o.findings)) needF(f, o.id);
      if (o.target !== undefined) needF(o.target, `${o.id}.target`);
      if (o.exclusive !== undefined && !['none', 'unknown', 'declined'].includes(String(o.exclusive))) errs.push(`${o.id}: exclusive が不正`);
      if (o.alert !== undefined && !['emergency', 'refer', 'consult'].includes(String(o.alert))) errs.push(`${o.id}: alert が不正`);
      if (o.exclusive !== undefined && arr(o.findings).length) errs.push(`${o.id}: exclusive の選択肢に所見を付けない`);
      const mods = arr(o.findings).filter((f) => F.get(String(f))?.kind === 'modifier');
      if (mods.length && q.section === 'detail' && !isStr(o.target)) errs.push(`${o.id}: 修飾情報に対象症状（target）がない`);
    }
    if (['detail', 'redflag', 'constitution'].includes(String(q.section))) {
      const ex = arr(q.options).filter((o) => isObj(o) && o.exclusive);
      if (!ex.some((o) => isObj(o) && o.exclusive === 'none') || !ex.some((o) => isObj(o) && o.exclusive === 'unknown')) errs.push(`${q.id}: 「特にない」と「わからない」（exclusive）が必要`);
    }
    if (q.section === 'staff' && (!isObj(q.staff) || !['safety', 'formula', 'pattern', 'zang'].includes(String(q.staff.category)) || !['pharmacist_observation', 'pharmacist_question'].includes(String(q.staff.source)))) errs.push(`${q.id}: staff.source／category が不正`);
    if (isObj(q.trigger)) triggers.push([q.id, q.trigger]);
  }
  for (const [qid, t] of triggers) {
    for (const c of arr(t.chosen)) if (!O.has(String(c))) errs.push(`${qid}: trigger.chosen ${String(c)} がない`);
    for (const c of [...arr(t.primary), ...arr(t.complaintSelected)]) if (!C.has(String(c))) errs.push(`${qid}: trigger の主訴 ${String(c)} がない`);
    for (const f of arr(t.findingsPresent)) needF(f, `${qid}.trigger`);
    if (t.category !== undefined && !cats.has(String(t.category))) errs.push(`${qid}: trigger.category ${String(t.category)} がない`);
  }
  for (const [cid, c] of C) {
    const d = Q.get(String(c.detailQuestion));
    if (!d) errs.push(`主訴 ${cid}: 詳細問診 ${String(c.detailQuestion)} がない`);
    else if (d.section !== 'detail' || !isObj(d.trigger) || !arr(d.trigger.primary).includes(cid)) errs.push(`${String(c.detailQuestion)}: section: detail・trigger.primary に ${cid} が必要`);
  }

  // 証
  const P = isObj(m.patterns) ? m.patterns : {};
  const pids = arr(P.patterns).map((p) => (isObj(p) ? String(p.id) : ''));
  if (JSON.stringify(pids) !== JSON.stringify(PATTERN_IDS)) errs.push(`patterns: 証は ${PATTERN_IDS.join('・')} の順で6つ`);
  for (const p of arr(P.patterns)) {
    if (!isObj(p)) continue;
    if (!isObj(p.cutoff) || typeof p.cutoff.candidate !== 'number' || typeof p.cutoff.strong !== 'number' || p.cutoff.candidate > p.cutoff.strong) errs.push(`${String(p.id)}: cutoff（candidate ≦ strong）が不正`);
    for (const [f, w] of Object.entries(isObj(p.weights) ? p.weights : {})) { needF(f, `weights.${String(p.id)}`); if (![1, 2, 3].includes(w as number)) errs.push(`weights.${String(p.id)}.${f} は 1/2/3`); }
    for (const f of arr(p.keyFindings)) needF(f, `${String(p.id)}.keyFindings`);
  }
  for (const k of ['cold', 'heat', 'def', 'exc']) {
    const a = isObj(P.axes) ? P.axes[k] : undefined;
    if (!isObj(a) || !isObj(a.weights)) { errs.push(`patterns.axes.${k} がない`); continue; }
    for (const [f, w] of Object.entries(a.weights)) { needF(f, `axes.${k}`); if (![1, 2, 3].includes(w as number)) errs.push(`axes.${k}.${f} は 1/2/3`); }
  }
  if (!isObj(P.rules)) errs.push('patterns.rules がない');
  for (const r of arr(P.consistency)) {
    if (!isObj(r) || !isStr(r.id) || !PATTERN_IDS.includes(r.pattern as PatternId) || !isStr(r.message)) { errs.push('consistency: id/pattern/message が必要'); continue; }
    for (const f of arr(r.needs)) needF(f, `consistency.${r.id}`);
  }

  // 処方
  const FM = new Map<string, J>();
  for (const f of arr(isObj(m.formulas) ? m.formulas.formulas : undefined)) {
    if (!isObj(f) || !isStr(f.id) || !isStr(f.name) || !isStr(f.kana)) { errs.push('formulas: id/name/kana のない処方'); continue; }
    if (FM.has(f.id)) errs.push(`formulas: 処方ID重複 ${f.id}`);
    FM.set(f.id, f);
    if (!['candidate', 'reference'].includes(String(f.role))) errs.push(`${f.id}: role が不正`);
    if (!['active', 'inactive'].includes(String(f.status))) errs.push(`${f.id}: status が不正`);
    checkReview(f.review, f.id);
  }
  const HB = new Set<string>();
  for (const h of arr(isObj(m.herbs) ? m.herbs.herbs : undefined)) if (isObj(h) && isStr(h.id)) HB.add(h.id); else errs.push('herbs: id のない生薬');
  const compOf = new Set<string>();
  for (const c of arr(isObj(m.herbs) ? m.herbs.compositions : undefined)) {
    if (!isObj(c) || !FM.has(String(c.formulaId))) { errs.push(`compositions: 処方 ${isObj(c) ? String(c.formulaId) : '?'} がない`); continue; }
    if (!REVIEW_STATUSES.includes(c.verification_status as ReviewStatus)) errs.push(`compositions.${String(c.formulaId)}: verification_status が不正`);
    if (arr(c.herbs).length === 0) errs.push(`compositions.${String(c.formulaId)}: 生薬がない`);
    for (const h of arr(c.herbs)) if (!isObj(h) || !HB.has(String(h.herbId))) errs.push(`compositions.${String(c.formulaId)}: 生薬 ${isObj(h) ? String(h.herbId) : '?'} が herbs にない`);
    if (c.productId === null) compOf.add(String(c.formulaId));
  }
  for (const [id] of FM) if (!compOf.has(id)) errs.push(`${id}: 構成生薬（compositions）がない`);
  const EV = new Set<string>();
  for (const e of arr(isObj(m.evaluations) ? m.evaluations.evaluations : undefined)) {
    if (!isObj(e) || FM.get(String(e.formulaId))?.role !== 'candidate') { errs.push(`evaluations: 候補処方 ${isObj(e) ? String(e.formulaId) : '?'} がない`); continue; }
    EV.add(String(e.formulaId));
    checkReview(e.review, `evaluations.${String(e.formulaId)}`);
    const q = isObj(e.qi_blood_fluid) ? e.qi_blood_fluid : {};
    for (const p of [...arr(q.primary), ...arr(q.secondary)]) if (!PATTERN_IDS.includes(p as PatternId)) errs.push(`evaluations.${String(e.formulaId)}: 証 ${String(p)} が不正`);
    if (!['cold', 'heat', 'neutral'].includes(String(e.cold_heat))) errs.push(`evaluations.${String(e.formulaId)}: cold_heat が不正`);
    if (arr(e.deficiency_excess).length === 0 || !arr(e.deficiency_excess).every((x) => ['def', 'mid', 'exc'].includes(String(x)))) errs.push(`evaluations.${String(e.formulaId)}: deficiency_excess が不正`);
    for (const z of arr(e.zang)) if (!ZANGS.includes(z as Zang)) errs.push(`evaluations.${String(e.formulaId)}: zang が不正`);
    for (const k of ['key_findings', 'supporting_findings', 'conflicting_findings']) for (const f of arr(e[k])) needF(f, `evaluations.${String(e.formulaId)}.${k}`);
    if (isStr(e.action) && /診断|治る|治り|治す/.test(e.action)) errs.push(`evaluations.${String(e.formulaId)}: action に「診断」「治る」を使わない`);
  }
  for (const [id, f] of FM) if (f.role === 'candidate' && !EV.has(id)) errs.push(`${id}: 漢方医学的評価（formula_evaluations）がない`);
  const seenCF = new Set<string>();
  for (const e of arr(isObj(m.complaintFormulas) ? m.complaintFormulas.entries : undefined)) {
    if (!isObj(e)) continue;
    const key = `${String(e.complaintId)}/${String(e.formulaId)}`;
    if (seenCF.has(key)) errs.push(`complaint_formulas: 重複 ${key}`);
    seenCF.add(key);
    if (!C.has(String(e.complaintId))) errs.push(`complaint_formulas ${key}: 主訴がない`);
    if (FM.get(String(e.formulaId))?.role !== 'candidate') errs.push(`complaint_formulas ${key}: 候補処方でない`);
    if (!['efficacy', 'partial', 'use_target'].includes(String(e.indication_match))) errs.push(`complaint_formulas ${key}: indication_match が不正`);
    if (arr(e.terms).length === 0) errs.push(`complaint_formulas ${key}: terms が空`);
    for (const t of arr(e.terms)) {
      if (!isObj(t) || !isStr(t.term) || !['efficacy', 'partial', 'use_target'].includes(String(t.match))) { errs.push(`complaint_formulas ${key}: term が不正`); continue; }
      for (const r of arr(t.requires)) needF(r, `complaint_formulas ${key}.requires`);
    }
    for (const k of ['key_findings', 'supporting_findings', 'conflicting_findings']) for (const f of arr(e[k])) needF(f, `complaint_formulas ${key}.${k}`);
    for (const q of arr(e.required_questions)) if (Q.get(String(q))?.section !== 'staff') errs.push(`complaint_formulas ${key}: required_questions ${String(q)} は薬剤師の追加質問でない`);
    checkReview(e.review, `complaint_formulas ${key}`);
  }
  for (const p of arr(isObj(m.products) ? m.products.products : undefined)) {
    if (!isObj(p) || !isStr(p.id) || !FM.has(String(p.formulaId))) { errs.push('products: id/formulaId が不正'); continue; }
    for (const k of ['manufacturer', 'product_name', 'source', 'source_version', 'last_verified']) if (!isStr(p[k])) errs.push(`products.${p.id}: ${k} がない（公式資料に基づき登録する）`);
    if (!isObj(p.review)) errs.push(`products.${p.id}: review がない`);
    else checkReview(p.review, `products.${p.id}`);
    for (const k of ['contraindication_findings', 'interaction_findings']) for (const f of arr(p[k])) needF(f, `products.${p.id}.${k}`);
    for (const h of arr(p.herbs)) if (!isObj(h) || !HB.has(String(h.herbId))) errs.push(`products.${p.id}: 生薬が herbs にない`);
  }

  // 安全規則
  const S = isObj(m.safetyRules) ? m.safetyRules : {};
  for (const r of arr(S.herbChecks)) { if (!isObj(r) || !HB.has(String(r.herb))) errs.push(`safety_rules.herbChecks: 生薬 ${isObj(r) ? String(r.herb) : '?'} がない`); else for (const f of arr(r.when)) needF(f, 'herbChecks'); }
  for (const h of [...arr(S.pregnancyExcludeHerbs), ...arr(S.pregnancyCheckHerbs)]) if (!HB.has(String(h))) errs.push(`safety_rules: 生薬 ${String(h)} がない`);
  for (const r of arr(S.medChecks)) if (isObj(r)) needF(r.when, 'medChecks');
  for (const r of arr(S.formulaRules)) { if (!isObj(r)) continue; for (const f of arr(r.formulas)) if (!FM.has(String(f))) errs.push(`formulaRules: 処方 ${String(f)} がない`); for (const f of arr(r.when)) needF(f, 'formulaRules'); }

  // 体質の説明
  const T = isObj(m.types) && isObj(m.types.types) ? m.types.types : {};
  for (const k of ADVICE_KEYS) {
    const d = T[k];
    if (!isObj(d)) { errs.push(`types.json: ${k} がない`); continue; }
    for (const f of ['name', 'reading', 'color', 'headline', 'summary']) if (!isStr(d[f])) errs.push(`types.${k}.${f} がない`);
    if (!isObj(d.advice) || !isObj(d.tsubo)) errs.push(`types.${k}: advice/tsubo がない`);
  }
  for (const t of arr(isObj(m.types) ? m.types.tips : undefined)) if (!isObj(t) || !O.has(String(t.when))) errs.push(`tips: when ${isObj(t) ? String(t.when) : '?'} が存在しない選択肢`);
  return errs;
}

export const MASTER_SET: MasterSet = {
  findings: findingsJson, complaints: complaintsJson, questions: questionsJson, patterns: patternsJson, formulas: formulasJson, products: productsJson,
  herbs: herbsJson, evaluations: evaluationsJson, complaintFormulas: complaintFormulasJson, safetyRules: safetyRulesJson, types: typesJson,
};
const problems = validateMasters(MASTER_SET);
if (problems.length) throw new Error(`[kampo] マスタデータの検証に失敗:\n  - ${problems.join('\n  - ')}`);

// --- 読み込み・索引 -------------------------------------------------------------

export const VERSION = (questionsJson as { version: string }).version;
export const FINDINGS: Finding[] = (findingsJson as unknown as { findings: Finding[] }).findings;
export const FINDING_GROUPS: Record<string, string> = (findingsJson as unknown as { groups: Record<string, string> }).groups;
const FINDING_BY_ID = new Map(FINDINGS.map((f) => [f.id, f]));
export const findingById = (id: string) => FINDING_BY_ID.get(id);
export const findingName = (id: string) => FINDING_BY_ID.get(id)?.name ?? id;
/** 相関グループ（グループのない所見は自分自身が1グループ） */
export const groupOf = (id: string) => FINDING_BY_ID.get(id)?.group ?? id;
export const groupName = (g: string) => FINDING_GROUPS[g] ?? findingName(g);

export const CATEGORIES: Category[] = (complaintsJson as unknown as { categories: Category[] }).categories;
export const COMPLAINTS: Complaint[] = (complaintsJson as unknown as { complaints: Complaint[] }).complaints;
const COMPLAINT_BY_ID = new Map(COMPLAINTS.map((c) => [c.id, c]));
export const complaintById = (id: string) => COMPLAINT_BY_ID.get(id);
export const categoryName = (id: string) => CATEGORIES.find((c) => c.id === id)?.name ?? id;

// 主訴の一覧画面（K1 カテゴリー → K_A〜K_H 具体的主訴 → KM 優先主訴）を complaints.json から作る
const complaintScreens: Question[] = [
  {
    id: 'K1', section: 'complaint', role: 'category', type: 'multi', title: '気になっているお悩みの分野を選んでください',
    help: '複数選べます。次の画面で、具体的な症状を選びます。',
    options: CATEGORIES.map((c) => ({ id: `cat:${c.id}`, text: c.name })),
  },
  ...CATEGORIES.map((c): Question => ({
    id: `K_${c.id}`, section: 'complaint', role: 'complaints', type: 'multi', title: `「${c.name}」で気になる症状を選んでください`,
    trigger: { category: c.id },
    options: COMPLAINTS.filter((x) => x.category === c.id).map((x) => ({ id: x.id, text: x.name, findings: [x.finding], complaint: x.id })),
  })),
  { id: 'KM', section: 'complaint', role: 'primary', type: 'single', title: 'いちばん改善したい症状を1つ選んでください', trigger: { minComplaints: 2 }, options: [] },
];
const rawQuestions = (questionsJson as unknown as { questions: Question[] }).questions;
const ORDER: Section[] = ['basic', 'safety', 'complaint', 'detail', 'redflag', 'course', 'constitution', 'lifestyle'];
/** 患者向けの設問（表示順） */
export const QUESTIONS: Question[] = ORDER.flatMap((sec) => (sec === 'complaint' ? complaintScreens : rawQuestions.filter((q) => q.section === sec)));
/** 薬剤師の追加質問 */
export const STAFF_QUESTIONS: Question[] = rawQuestions.filter((q) => q.section === 'staff');
const QUESTION_BY_ID = new Map([...QUESTIONS, ...STAFF_QUESTIONS].map((q) => [q.id, q]));
const OPTION_BY_ID = new Map<string, { q: Question; o: Option }>();
for (const q of [...QUESTIONS, ...STAFF_QUESTIONS]) for (const o of [...q.options, ...(q.sub?.options ?? [])]) OPTION_BY_ID.set(o.id, { q, o });
export const questionById = (id: string) => QUESTION_BY_ID.get(id);
export const optionById = (id: string) => OPTION_BY_ID.get(id)?.o;
export const questionOfOption = (id: string) => OPTION_BY_ID.get(id)?.q;
/** 優先主訴の選択肢（KM:<主訴ID>） */
export const primaryOptionId = (cid: string) => `KM:${cid}`;
export function optionText(id: string): string {
  if (id.startsWith('KM:')) return complaintById(id.slice(3))?.name ?? id;
  return OPTION_BY_ID.get(id)?.o.text ?? id;
}

const P = patternsJson as unknown as { patterns: Pattern[]; axes: Record<AxisId, Axis>; rules: PatternRules; consistency: ConsistencyRule[]; review: Review; note: string };
export const PATTERNS: Pattern[] = P.patterns;
export const patternById = (id: PatternId) => PATTERNS.find((p) => p.id === id)!;
export const patternName = (id: PatternId) => patternById(id).name;
export const AXES: Record<AxisId, Axis> = P.axes;
export const RULES: PatternRules = P.rules;
export const CONSISTENCY: ConsistencyRule[] = P.consistency;

export const FORMULAS: Formula[] = (formulasJson as unknown as { formulas: Formula[] }).formulas;
const FORMULA_BY_ID = new Map(FORMULAS.map((f) => [f.id, f]));
export const formulaById = (id: string) => FORMULA_BY_ID.get(id);
export const formulaName = (id: string) => FORMULA_BY_ID.get(id)?.name ?? id;
export const CANDIDATE_FORMULAS = FORMULAS.filter((f) => f.role === 'candidate');
export const PRODUCTS: Product[] = (productsJson as unknown as { products: Product[] }).products;
export const productsOf = (formulaId: string) => PRODUCTS.filter((p) => p.formulaId === formulaId);
export const HERBS: Herb[] = (herbsJson as unknown as { herbs: Herb[] }).herbs;
const COMPOSITIONS: Composition[] = (herbsJson as unknown as { compositions: Composition[] }).compositions;
const HERB_ALIAS = new Map<string, string>();
for (const h of HERBS) { HERB_ALIAS.set(h.name, h.id); for (const a of h.aliases) HERB_ALIAS.set(a, h.id); }
export const normalizeHerb = (name: string) => HERB_ALIAS.get(name) ?? name;
/**
 * 処方の構成生薬。確認済みの製品（products.json）に構成があればそれを、なければ処方単位の草案を返す。
 * status は構成の確認状態（草案なら「未確認」として扱い、共通生薬なしと解釈しない）。
 */
export function compositionOf(formulaId: string): { herbs: string[]; status: ReviewStatus; source: string } | undefined {
  const prod = productsOf(formulaId).find((p) => isConfirmed(p.review.status) && p.herbs?.length);
  if (prod) return { herbs: prod.herbs!.map((h) => normalizeHerb(h.herbId)), status: prod.review.status, source: `${prod.product_name}（${prod.source}）` };
  const c = COMPOSITIONS.find((x) => x.formulaId === formulaId && x.productId === null);
  return c ? { herbs: c.herbs.map((h) => normalizeHerb(h.herbId)), status: c.verification_status, source: c.source } : undefined;
}
export const EVALUATIONS: Evaluation[] = (evaluationsJson as unknown as { evaluations: Evaluation[] }).evaluations;
const EVAL_BY_ID = new Map(EVALUATIONS.map((e) => [e.formulaId, e]));
export const evaluationOf = (formulaId: string) => EVAL_BY_ID.get(formulaId);
const CF = complaintFormulasJson as unknown as { entries: ComplaintFormula[]; review: Review; source: string };
export const COMPLAINT_FORMULAS: ComplaintFormula[] = CF.entries;
export const CF_SOURCE = CF.source;
export const CF_REVIEW = CF.review;
/** 主訴対応の確認状態（項目に review がなければファイルの review） */
export const cfReview = (e: ComplaintFormula): Review => e.review ?? CF.review;
export const entriesOf = (complaintId: string) => COMPLAINT_FORMULAS.filter((e) => e.complaintId === complaintId);
export const SAFETY_RULES: SafetyRules = safetyRulesJson as unknown as SafetyRules;

export const TYPE_DEFS: Record<AdviceKey, TypeDef> = (typesJson as unknown as { types: Record<AdviceKey, TypeDef> }).types;
export const TIPS: Tip[] = (typesJson as unknown as { tips: Tip[] }).tips;

/** マスタの確認状態の一覧（担当者画面の表示用） */
export const MASTER_REVIEWS: { file: string; label: string; status: ReviewStatus }[] = [
  ['findings.json', '所見', findingsJson], ['questions.json', '設問', questionsJson], ['patterns.json', '証の重み・カットオフ', patternsJson],
  ['formulas.json', '①処方基本', formulasJson], ['products.json', '②製品情報', productsJson], ['herbs.json', '③構成生薬', herbsJson],
  ['formula_evaluations.json', '④漢方医学的評価', evaluationsJson], ['complaint_formulas.json', '⑤主訴対応', complaintFormulasJson], ['safety_rules.json', '安全性の確認規則', safetyRulesJson],
].map(([file, label, j]) => ({ file: file as string, label: label as string, status: ((j as { review?: Review }).review?.status ?? 'draft') as ReviewStatus }));

/** v1（2026-10-24 版まで）のセッション表示用の文言 */
export const LEGACY = legacyJson as unknown as { version: string; questions: { id: string; title: string; options: Record<string, string> }[]; types: Record<string, string> };
