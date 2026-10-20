// ---------------------------------------------------------------------------
// 漢方体質チェック（/kampo/）のマスタデータ。
// 設問・体質タイプ・処方の正本は src/data/kampo/*.json（薬剤師が直接編集する）。
// このモジュールは JSON を読み込み、起動時（モジュール読込時）に形を検証する。
// 検証に失敗したら例外を投げてページを落とす（壊れたマスタで店頭運用しない）。
// 依存ライブラリを増やさないため zod ではなく手書きの検証にしている。
// ---------------------------------------------------------------------------
import questionsJson from '../../data/kampo/questions.json' with { type: 'json' };
import typesJson from '../../data/kampo/types.json' with { type: 'json' };
import formulasJson from '../../data/kampo/formulas.json' with { type: 'json' };

export type TypeKey = 'qi_def' | 'blood_def' | 'qi_stag' | 'blood_stasis' | 'fluid' | 'yin_def' | 'yang_def' | 'yang_exc';
/** レーダーの軸順（上から時計回り）。気虚・血虚・気滞・瘀血・水滞・陰虚・陽虚・陽盛 */
export const TYPES: TypeKey[] = ['qi_def', 'blood_def', 'qi_stag', 'blood_stasis', 'fluid', 'yin_def', 'yang_def', 'yang_exc'];
export const isTypeKey = (s: string): s is TypeKey => (TYPES as string[]).includes(s);

export type Block = 'A' | 'B' | 'C' | 'D';
export const BLOCK_LABEL: Record<Block, string> = { A: '基本情報', B: '体質チェック', C: '安全確認', D: '生活習慣' };

export interface Option {
  id: string;
  text: string;
  weights?: Partial<Record<TypeKey, number>>;
  flags?: string[];
  image?: string;
  freeText?: boolean;
  placeholder?: string;
  /** A3 主訴タグ（処方候補の complaints と対応） */
  tag?: string;
  /** A5 なりたい自分 */
  goal?: string;
}
export interface Question {
  id: string;
  block: Block;
  title: string;
  type: 'single' | 'multi' | 'text';
  scored: boolean;
  showIf?: { sex?: 'female'; tongueMode?: 'self' };
  options: Option[];
  /** multi の最大選択数 */
  max?: number;
  /** 同じ画面に出す補助の単一選択（A4 影響・D2 就寝・D3 入浴） */
  sub?: { title: string; options: Option[] };
  help?: string;
  placeholder?: string;
  optional?: boolean;
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

export type Deficiency = 'def' | 'mid' | 'exc';
export type Thermal = 'warm' | 'neutral' | 'cool';
export interface Formula {
  code: string;
  name: string;
  reading: string;
  /** 来店客向けの説明（一般用漢方製剤の効能に基づく「〜に用いられます」の文。断定しない） */
  description: string;
  types: Partial<Record<TypeKey, number>>;
  deficiency: Deficiency;
  thermal: Thermal;
  complaints: string[];
  keySigns: string[];
  cautionHerbs: string[];
  contraindications: string[];
  priority: number;
  note?: string;
  active: boolean;
}
export interface FormulasData { version: string; formulas: Formula[] }

export const COMPLAINT_TAGS = ['fatigue', 'cold', 'skin', 'gi', 'bowel', 'edema', 'sleep', 'mood', 'pain', 'menstrual', 'weight', 'cold_prone'] as const;
export const CONTRA_CODES = ['pregnancy', 'interferon', 'hypertension', 'heart', 'thyroid', 'glaucoma_bph', 'gi_weak'] as const;

// --- 検証 ------------------------------------------------------------------

/** 検証エラーを集めて返す（空配列なら合格）。テストからも呼ぶ。 */
export function validateMasters(q: unknown, t: unknown, f: unknown): string[] {
  const errs: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

  // 設問
  const optionIds = new Set<string>();
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
      if (raw.block === 'B' && !opts.some((o) => isObj(o) && Array.isArray(o.flags) && (o.flags as string[]).includes('none'))) {
        errs.push(`${id}: ブロックBの設問に「どれもあてはまらない」(flags: none) がない`);
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
  if (!isObj(f) || !Array.isArray(f.formulas)) errs.push('formulas.json: formulas が必要');
  else {
    const codes = new Set<string>();
    for (const raw of f.formulas as unknown[]) {
      if (!isObj(raw) || !isStr(raw.code)) { errs.push('formulas.json: code のない処方'); continue; }
      const c = raw.code;
      if (codes.has(c)) errs.push(`formulas.json: code 重複 ${c}`);
      codes.add(c);
      if (!isStr(raw.name) || !isStr(raw.reading)) errs.push(`${c}: name/reading がない`);
      if (!isStr(raw.description) || raw.description.length < 10) errs.push(`${c}: description（来店客向けの説明文）がない`);
      if (isStr(raw.description) && /診断|治る|治り|治す|処方/.test(raw.description)) errs.push(`${c}: description に「診断」「治る」「処方」を使わない`);
      if (!isObj(raw.types) || Object.keys(raw.types).length === 0) errs.push(`${c}: types が空`);
      else for (const [k, v] of Object.entries(raw.types)) {
        if (!isTypeKey(k)) errs.push(`${c}: types のキー ${k} が TypeKey でない`);
        if (typeof v !== 'number' || v < 0 || v > 1) errs.push(`${c}: types.${k} は 0〜1`);
      }
      if (!['def', 'mid', 'exc'].includes(String(raw.deficiency))) errs.push(`${c}: deficiency が def/mid/exc でない`);
      if (!['warm', 'neutral', 'cool'].includes(String(raw.thermal))) errs.push(`${c}: thermal が warm/neutral/cool でない`);
      for (const k of ['complaints', 'keySigns', 'cautionHerbs', 'contraindications']) if (!Array.isArray(raw[k])) errs.push(`${c}: ${k} が配列でない`);
      for (const tag of (Array.isArray(raw.complaints) ? raw.complaints : []) as string[]) if (!(COMPLAINT_TAGS as readonly string[]).includes(tag)) errs.push(`${c}: 主訴タグ ${tag} が不明`);
      for (const ks of (Array.isArray(raw.keySigns) ? raw.keySigns : []) as string[]) if (optionIds.size && !optionIds.has(ks)) errs.push(`${c}: keySigns の ${ks} は存在しない選択肢ID`);
      for (const ct of (Array.isArray(raw.contraindications) ? raw.contraindications : []) as string[]) if (!(CONTRA_CODES as readonly string[]).includes(ct)) errs.push(`${c}: 禁忌フラグ ${ct} が不明`);
      if (typeof raw.priority !== 'number') errs.push(`${c}: priority が数値でない`);
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
export const FORMULAS: Formula[] = (formulasJson as unknown as FormulasData).formulas;

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));
const OPTION_BY_ID = new Map<string, { q: Question; o: Option; sub: boolean }>();
for (const q of QUESTIONS) {
  for (const o of q.options) OPTION_BY_ID.set(o.id, { q, o, sub: false });
  for (const o of q.sub?.options ?? []) OPTION_BY_ID.set(o.id, { q, o, sub: true });
}
export const questionById = (id: string) => QUESTION_BY_ID.get(id);
export const optionById = (id: string) => OPTION_BY_ID.get(id)?.o;
export const optionText = (id: string) => OPTION_BY_ID.get(id)?.o.text ?? id;
export const formulaByCode = (code: string) => FORMULAS.find((f) => f.code === code);

export const COMPLAINT_LABEL: Record<string, string> = {
  fatigue: '疲れ・だるさ', cold: '冷え', skin: '肌・髪', gi: '胃腸', bowel: '便通', edema: 'むくみ',
  sleep: '睡眠', mood: 'ストレス・気分', pain: '痛み・こり', menstrual: '月経・更年期', weight: '体重', cold_prone: '風邪をひきやすい',
};
export const DEFICIENCY_LABEL: Record<Deficiency, string> = { def: '虚証', mid: '虚実間', exc: '実証' };
export const THERMAL_LABEL: Record<Thermal, string> = { warm: '温める', neutral: '中間', cool: '冷ます' };
