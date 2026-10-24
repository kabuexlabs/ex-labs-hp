// ---------------------------------------------------------------------------
// 漢方体質チェック（/kampo/）のマスタデータ。
// 設問・体質タイプ・処方の正本は src/data/kampo/*.json（薬剤師が直接編集する）。
// このモジュールは JSON を読み込み、起動時（モジュール読込時）に形を検証する。
// 検証に失敗したら例外を投げてページを落とす（壊れたマスタで店頭運用しない）。
// 依存ライブラリを増やさないため zod ではなく手書きの検証にしている。
//
// 漢方薬の選定は「主訴 → 候補群 → 体質で選ぶ」の二段階（src/lib/kampo/recommend.ts）。
// そのため処方マスタでは次の3つを混同しないよう別の欄に持つ：
//   efficacy / indications … 承認された効能・効果（候補群の抽出＝STEP 1 に使う）
//   useTarget / strength   … 使用目標（効能・効果の前段「体力…で、〜もの」。体質照合＝STEP 2 に使う）
//   action                 … 漢方医学的な作用の説明（推薦理由の補足。抽出には使わない）
// ---------------------------------------------------------------------------
import questionsJson from '../../data/kampo/questions.json' with { type: 'json' };
import typesJson from '../../data/kampo/types.json' with { type: 'json' };
import formulasJson from '../../data/kampo/formulas.json' with { type: 'json' };

export type TypeKey = 'qi_def' | 'blood_def' | 'qi_stag' | 'blood_stasis' | 'fluid' | 'yin_def' | 'yang_def' | 'yang_exc';
/** レーダーの軸順（上から時計回り）。気虚・血虚・気滞・瘀血・水滞・陰虚・陽虚・陽盛 */
export const TYPES: TypeKey[] = ['qi_def', 'blood_def', 'qi_stag', 'blood_stasis', 'fluid', 'yin_def', 'yang_def', 'yang_exc'];
export const isTypeKey = (s: string): s is TypeKey => (TYPES as string[]).includes(s);

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

export type Block = 'A' | 'B' | 'C' | 'D';
export const BLOCK_LABEL: Record<Block, string> = { A: '基本情報', B: '体質チェック', C: '安全確認', D: '生活習慣' };

export interface Option {
  id: string;
  text: string;
  weights?: Partial<Record<TypeKey, number>>;
  /** 五臓の傾向への加点（0〜1） */
  organs?: Partial<Record<OrganKey, number>>;
  /** 主訴の詳細：この選択肢が表す症状コード（formulas.json の symptoms のキー） */
  symptoms?: string[];
  flags?: string[];
  image?: string;
  freeText?: boolean;
  placeholder?: string;
  /** A5 なりたい自分 */
  goal?: string;
}
export interface Question {
  id: string;
  block: Block;
  title: string;
  type: 'single' | 'multi' | 'text';
  scored: boolean;
  /** 表示条件。chosen は「これらの選択肢のどれかが選ばれていれば表示」（主訴の詳細） */
  showIf?: { sex?: 'female'; tongueMode?: 'self'; chosen?: string[] };
  options: Option[];
  /** multi の最大選択数 */
  max?: number;
  /** 同じ画面に出す補助の単一選択（A4 影響・D2 就寝・D3 入浴） */
  sub?: { title: string; options: Option[] };
  help?: string;
  placeholder?: string;
  optional?: boolean;
  /** 設問画面の上部に出す区分名（例: 主訴の詳細） */
  meta?: string;
}
export interface Questionnaire { version: string; questions: Question[] }

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
export interface Tip { when: string; types: TypeKey[]; text: string }
export interface TypesData { types: Record<TypeKey, TypeDef>; tips: Tip[] }

export type Strength = 'def' | 'mid' | 'exc';
export type Thermal = 'warm' | 'neutral' | 'cool';
export type HeatKind = 'excess' | 'deficient';
export interface Indication {
  /** 症状コード（主訴の詳細の選択肢と対応） */
  symptom: string;
  /** 効能・効果に書かれている語（例: にきび） */
  term: string;
  /** 条件つきの効能（例:「高血圧や肥満に伴う便秘」）。どれかの選択肢が選ばれているときだけ候補にする */
  requires?: string[];
}
export interface SymptomDef { label: string }
export interface Formula {
  code: string;
  name: string;
  reading: string;
  /** 承認された効能・効果の全文（一般用漢方製剤製造販売承認基準） */
  efficacy: string;
  /** 効能・効果の諸症を症状コードに対応づけたもの（並びは効能・効果の記載順） */
  indications: Indication[];
  /** 使用目標（効能・効果の前段のしばり。体質照合に使う） */
  useTarget: string;
  /** 使用目標の体力の範囲（体力虚弱=def／中等度=mid／充実=exc） */
  strength: Strength[];
  /** 漢方医学的な作用の説明（推薦理由の補足） */
  action: string;
  /** 他の候補と比べたときの特徴（スタッフ・比較用の短い語） */
  targetLabel: string;
  /** 気血水（陰虚=水不足、陽虚・陽盛を含む8タイプ）の対象と重み */
  types: Partial<Record<TypeKey, number>>;
  thermal: Thermal;
  /** 冷ます処方が対象とする熱：実熱（excess）／虚熱（deficient） */
  heat?: HeatKind;
  /** 主に働きかける五臓 */
  organs: OrganKey[];
  /** 使用目標・随伴症状・症状の性質に対応する選択肢ID（一致すると適合度に加点） */
  signs: string[];
  /** 注意が必要な生薬（甘草・麻黄・大黄・附子・地黄・山梔子・黄芩・桃仁 など） */
  cautionHerbs: string[];
  /** この安全フラグがあれば推薦から除外する */
  contraindications: string[];
  /** 同点時の並び順（小さいほど上） */
  priority: number;
  /** 効能・効果の出典確認済みか（製品の添付文書で薬剤師が確認したら true） */
  verified: boolean;
  note?: string;
  active: boolean;
}
export interface FormulasData { version: string; source?: string; symptoms: Record<string, SymptomDef>; formulas: Formula[] }

export const CONTRA_CODES = ['pregnancy', 'lactation', 'interferon', 'hypertension', 'heart', 'kidney', 'thyroid', 'glaucoma_bph', 'gi_weak'] as const;

// --- 検証 ------------------------------------------------------------------

/** 検証エラーを集めて返す（空配列なら合格）。テストからも呼ぶ。 */
export function validateMasters(q: unknown, t: unknown, f: unknown): string[] {
  const errs: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
  const symptomKeys = new Set<string>(isObj(f) && isObj(f.symptoms) ? Object.keys(f.symptoms) : []);

  // 設問
  const optionIds = new Set<string>();
  const usedSymptoms = new Set<string>();
  const showIfRefs: [string, string][] = [];
  if (!isObj(q) || !isStr(q.version) || !Array.isArray(q.questions)) {
    errs.push('questions.json: version と questions が必要');
  } else {
    const qIds = new Set<string>();
    for (const raw of q.questions as unknown[]) {
      if (!isObj(raw) || !isStr(raw.id)) { errs.push('questions.json: id のない設問'); continue; }
      const id = raw.id;
      if (qIds.has(id)) errs.push(`questions.json: 設問ID重複 ${id}`);
      qIds.add(id);
      if (!['A', 'B', 'C', 'D'].includes(String(raw.block))) errs.push(`${id}: block が A〜D でない`);
      if (!isStr(raw.title)) errs.push(`${id}: title がない`);
      if (!['single', 'multi', 'text'].includes(String(raw.type))) errs.push(`${id}: type が single/multi/text でない`);
      if (typeof raw.scored !== 'boolean') errs.push(`${id}: scored が真偽値でない`);
      const opts = Array.isArray(raw.options) ? (raw.options as unknown[]) : [];
      if (raw.type !== 'text' && opts.length === 0) errs.push(`${id}: 選択肢がない`);
      const isDetail = isObj(raw.showIf) && Array.isArray(raw.showIf.chosen);
      if ((raw.block === 'B' || isDetail) && !opts.some((o) => isObj(o) && Array.isArray(o.flags) && (o.flags as string[]).includes('none'))) {
        errs.push(`${id}: 「どれもあてはまらない／このなかにはない」(flags: none) がない`);
      }
      if (isObj(raw.showIf) && raw.showIf.chosen !== undefined) {
        if (!Array.isArray(raw.showIf.chosen) || raw.showIf.chosen.length === 0) errs.push(`${id}: showIf.chosen は選択肢IDの配列`);
        else for (const c of raw.showIf.chosen as unknown[]) showIfRefs.push([id, String(c)]);
      }
      const checkOpt = (o: unknown, where: string) => {
        if (!isObj(o) || !isStr(o.id) || !isStr(o.text)) { errs.push(`${where}: id/text のない選択肢`); return; }
        if (optionIds.has(o.id)) errs.push(`選択肢ID重複 ${o.id}`);
        optionIds.add(o.id);
        if (o.weights !== undefined) {
          if (!isObj(o.weights)) errs.push(`${o.id}: weights がオブジェクトでない`);
          else for (const [k, v] of Object.entries(o.weights)) {
            if (!isTypeKey(k)) errs.push(`${o.id}: weights のキー ${k} が TypeKey でない`);
            if (typeof v !== 'number' || v < 0 || v > 1) errs.push(`${o.id}: weights.${k} は 0〜1 の数値`);
          }
        }
        if (o.organs !== undefined) {
          if (!isObj(o.organs)) errs.push(`${o.id}: organs がオブジェクトでない`);
          else for (const [k, v] of Object.entries(o.organs)) {
            if (!isOrganKey(k)) errs.push(`${o.id}: organs のキー ${k} が五臓（liver/heart/spleen/lung/kidney）でない`);
            if (typeof v !== 'number' || v < 0 || v > 1) errs.push(`${o.id}: organs.${k} は 0〜1 の数値`);
          }
        }
        if (o.symptoms !== undefined) {
          if (!Array.isArray(o.symptoms)) errs.push(`${o.id}: symptoms が配列でない`);
          else for (const s of o.symptoms as unknown[]) {
            if (!symptomKeys.has(String(s))) errs.push(`${o.id}: 症状コード ${String(s)} が formulas.json の symptoms にない`);
            usedSymptoms.add(String(s));
          }
        }
        if (o.flags !== undefined && !Array.isArray(o.flags)) errs.push(`${o.id}: flags が配列でない`);
      };
      for (const o of opts) checkOpt(o, id);
      if (raw.sub !== undefined) {
        if (!isObj(raw.sub) || !isStr(raw.sub.title) || !Array.isArray(raw.sub.options)) errs.push(`${id}: sub は title と options を持つ`);
        else for (const o of raw.sub.options as unknown[]) checkOpt(o, `${id}.sub`);
      }
      if (raw.scored === true && !opts.some((o) => isObj(o) && isObj(o.weights) && Object.keys(o.weights).length > 0)) {
        errs.push(`${id}: scored なのに weights を持つ選択肢がない`);
      }
    }
    for (const [qid, ref] of showIfRefs) if (!optionIds.has(ref)) errs.push(`${qid}: showIf.chosen の ${ref} は存在しない選択肢ID`);
  }

  // タイプ
  if (!isObj(t) || !isObj(t.types)) errs.push('types.json: types が必要');
  else {
    for (const key of TYPES) {
      const d = (t.types as Record<string, unknown>)[key];
      if (!isObj(d)) { errs.push(`types.json: ${key} がない`); continue; }
      for (const k of ['name', 'reading', 'color', 'headline', 'summary']) if (!isStr(d[k])) errs.push(`types.${key}.${k} がない`);
      if (!Array.isArray(d.symptoms) || d.symptoms.length !== 5) errs.push(`types.${key}.symptoms は5つ`);
      if (!isObj(d.advice) || !['mind', 'food', 'move', 'rest'].every((k) => isStr((d.advice as Record<string, unknown>)[k]))) errs.push(`types.${key}.advice は mind/food/move/rest`);
      if (!isObj(d.tsubo) || !['name', 'reading', 'position', 'effect'].every((k) => isStr((d.tsubo as Record<string, unknown>)[k]))) errs.push(`types.${key}.tsubo は name/reading/position/effect`);
    }
    const tips = Array.isArray(t.tips) ? (t.tips as unknown[]) : [];
    tips.forEach((tip, i) => {
      if (!isObj(tip) || !isStr(tip.when) || !Array.isArray(tip.types) || !isStr(tip.text)) { errs.push(`tips[${i}]: when/types/text が必要`); return; }
      if (optionIds.size && !optionIds.has(tip.when)) errs.push(`tips[${i}]: when=${tip.when} は存在しない選択肢ID`);
      for (const ty of tip.types as unknown[]) if (!isTypeKey(String(ty))) errs.push(`tips[${i}]: types に不正な値 ${String(ty)}`);
    });
  }

  // 処方
  if (!isObj(f) || !Array.isArray(f.formulas) || !isObj(f.symptoms)) errs.push('formulas.json: symptoms と formulas が必要');
  else {
    for (const [k, v] of Object.entries(f.symptoms)) if (!isObj(v) || !isStr(v.label)) errs.push(`symptoms.${k}: label がない`);
    const codes = new Set<string>();
    const names = new Set<string>();
    for (const raw of f.formulas as unknown[]) {
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
          if (!Array.isArray(ind.requires) || ind.requires.length === 0) errs.push(`${c}: requires は選択肢IDの配列`);
          else for (const r of ind.requires as unknown[]) if (optionIds.size && !optionIds.has(String(r))) errs.push(`${c}: requires の ${String(r)} は存在しない選択肢ID`);
        }
      }
      if (!Array.isArray(raw.strength) || raw.strength.length === 0 || !(raw.strength as unknown[]).every((s) => ['def', 'mid', 'exc'].includes(String(s)))) errs.push(`${c}: strength は def/mid/exc の配列`);
      if (!isObj(raw.types) || Object.keys(raw.types).length === 0) errs.push(`${c}: types が空`);
      else for (const [k, v] of Object.entries(raw.types)) {
        if (!isTypeKey(k)) errs.push(`${c}: types のキー ${k} が TypeKey でない`);
        if (typeof v !== 'number' || v < 0 || v > 1) errs.push(`${c}: types.${k} は 0〜1`);
      }
      if (!['warm', 'neutral', 'cool'].includes(String(raw.thermal))) errs.push(`${c}: thermal が warm/neutral/cool でない`);
      if (raw.heat !== undefined && !['excess', 'deficient'].includes(String(raw.heat))) errs.push(`${c}: heat は excess/deficient`);
      if (!Array.isArray(raw.organs) || raw.organs.length === 0 || !(raw.organs as unknown[]).every((o) => isOrganKey(String(o)))) errs.push(`${c}: organs は五臓の配列`);
      for (const k of ['signs', 'cautionHerbs', 'contraindications']) if (!Array.isArray(raw[k])) errs.push(`${c}: ${k} が配列でない`);
      for (const ks of (Array.isArray(raw.signs) ? raw.signs : []) as string[]) if (optionIds.size && !optionIds.has(ks)) errs.push(`${c}: signs の ${ks} は存在しない選択肢ID`);
      for (const ct of (Array.isArray(raw.contraindications) ? raw.contraindications : []) as string[]) if (!(CONTRA_CODES as readonly string[]).includes(ct)) errs.push(`${c}: 除外フラグ ${ct} が不明`);
      if (typeof raw.priority !== 'number') errs.push(`${c}: priority が数値でない`);
      if (typeof raw.verified !== 'boolean') errs.push(`${c}: verified が真偽値でない`);
      if (typeof raw.active !== 'boolean') errs.push(`${c}: active が真偽値でない`);
    }
  }
  return errs;
}

const problems = validateMasters(questionsJson, typesJson, formulasJson);
if (problems.length) {
  throw new Error(`[kampo] マスタデータの検証に失敗:\n  - ${problems.join('\n  - ')}`);
}

const rawQuestionnaire = questionsJson as unknown as Questionnaire;
// text 型（C5）は選択肢を持たないので空配列で揃える
export const QUESTIONS: Question[] = rawQuestionnaire.questions.map((q) => ({ ...q, options: q.options ?? [] }));
export const QUESTIONNAIRE: Questionnaire = { version: rawQuestionnaire.version, questions: QUESTIONS };
export const TYPE_DEFS: Record<TypeKey, TypeDef> = (typesJson as unknown as TypesData).types;
export const TIPS: Tip[] = (typesJson as unknown as TypesData).tips;
const formulasData = formulasJson as unknown as FormulasData;
export const FORMULAS: Formula[] = formulasData.formulas;
export const SYMPTOMS: Record<string, SymptomDef> = formulasData.symptoms;
export const FORMULAS_SOURCE = formulasData.source ?? '';

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
const OPTION_BY_ID = new Map<string, { q: Question; o: Option; sub: boolean }>();
for (const q of QUESTIONS) {
  for (const o of q.options) OPTION_BY_ID.set(o.id, { q, o, sub: false });
  for (const o of q.sub?.options ?? []) OPTION_BY_ID.set(o.id, { q, o, sub: true });
}
export const questionById = (id: string) => QUESTION_BY_ID.get(id);
export const optionById = (id: string) => OPTION_BY_ID.get(id)?.o;
export const questionOfOption = (id: string) => OPTION_BY_ID.get(id)?.q;
export const optionText = (id: string) => OPTION_BY_ID.get(id)?.o.text ?? id;
export const formulaByCode = (code: string) => FORMULAS.find((f) => f.code === code);
export const symptomLabel = (code: string) => SYMPTOMS[code]?.label ?? code;

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
