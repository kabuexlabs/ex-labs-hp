// ---------------------------------------------------------------------------
// 患者向けの設問フロー（純粋関数）。2026-10-25 改修計画 §4。
// 順番：基本情報 → 主訴カテゴリー（A〜H、複数）→ 具体的な主訴 →（2つ以上なら）いちばん改善したい主訴
//       → その主訴の深掘り → 共通体質（顔色のイラストを含む）→ 安全確認 → 生活習慣 → 回答の確認 → 送信完了。
// walk() が設問を順にたどり、表示する設問・表示する選択肢・それまでの回答から作った所見を同時に決める。
//  - 回答の引き継ぎ：深掘りと共通体質では、それより前の回答で決まった所見だけの選択肢を出さない。
//    出す選択肢がなくなった設問は出さない（同じ症状を2回聞かない。改修指示 3-1）。
//  - 月経の設問は「月経の状況」で出し分け、むくみの設問は関連する所見があるときだけ出す。
//  - 舌は聞かない（薬剤師が観察して入力する。改修指示 第12章）。
// ---------------------------------------------------------------------------
import {
  QUESTIONS, STAFF_QUESTIONS, COMPLAINTS, TIPS, complaintById, optionById,
  type Question, type Option, type Trigger, type TypeKey, type Section,
} from './masters.ts';
import { emptyState, applyAnswer, isDetermined, anyPresent, type FindingState } from './findings.ts';

/** 回答：設問ID → 選んだ選択肢ID（sub の選択肢も同じ配列に入れる） */
export type Answers = Record<string, string[]>;
export type Sex = 'female' | 'male' | 'none';
export const SEX_LABEL: Record<Sex, string> = { female: '女性', male: '男性', none: '回答しない' };
export const AGE_BAND_LABEL: Record<string, string> = { '10s': '10代', '20s': '20代', '30s': '30代', '40s': '40代', '50s': '50代', '60s': '60代', '70s': '70代以上' };
export type Menses = 'regular' | 'irregular' | 'post' | 'none' | 'declined';
export const MENSES_LABEL: Record<Menses, string> = { regular: '月経あり（周期ほぼ一定）', irregular: '月経あり（不規則）', post: '閉経', none: '月経なし（妊娠・授乳・その他）', declined: '回答しない' };

const valueOf = (answers: Answers, qid: string) => {
  const id = answers[qid]?.[0];
  return id ? optionById(id)?.value : undefined;
};
export function sexFromAnswers(a: Answers): Sex | undefined {
  const v = valueOf(a, 'A1');
  return v === 'female' || v === 'male' ? v : v === 'declined' ? 'none' : undefined;
}
export const ageBandFromAnswers = (a: Answers): string | undefined => { const v = valueOf(a, 'A2'); return v && v in AGE_BAND_LABEL ? v : undefined; };
const mensesValue = (a: Answers): Menses | undefined => { const v = valueOf(a, 'A3'); return v && v in MENSES_LABEL ? (v as Menses) : undefined; };

/** 選んだ主訴カテゴリー（A〜H） */
export const categoriesOf = (a: Answers): string[] => (a['K1'] ?? []).map((id) => optionById(id)?.category).filter((x): x is string => !!x);
/** 選んだ具体的な主訴の主訴ID（いま選んでいるカテゴリーのものだけ。complaints.json の並び順。同じ主訴は1つ） */
export function complaintsOf(a: Answers): string[] {
  const cats = new Set(categoriesOf(a));
  const chosen = new Set<string>();
  for (const [qid, ids] of Object.entries(a)) {
    if (!qid.startsWith('K_') || !cats.has(qid.slice(2))) continue;
    for (const id of ids) { const c = optionById(id)?.complaint; if (c) chosen.add(c); }
  }
  return COMPLAINTS.filter((c) => chosen.has(c.id)).map((c) => c.id);
}
export const primaryOptionId = (cid: string) => `KM-${cid}`;
/** いちばん改善したい主訴（1つならそれ、2つ以上なら KM の回答） */
export function primaryOf(a: Answers): string | undefined {
  const list = complaintsOf(a);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const m = a['KM']?.[0];
  const cid = m?.startsWith('KM-') ? m.slice(3) : undefined;
  return cid && list.includes(cid) ? cid : undefined;
}

export interface FlowContext {
  sex?: Sex; menses?: Menses; categories: string[]; complaints: string[]; primary?: string;
  state: FindingState; chosen: Set<string>;
}
export function triggerOk(t: Trigger | undefined, c: FlowContext): boolean {
  if (!t) return true;
  if (t.sexNot && c.sex === t.sexNot) return false;
  if (t.menses && !(c.menses === 'regular' || c.menses === 'irregular')) return false;
  if (t.mensesNot && c.menses === t.mensesNot) return false;
  if (t.category && !c.categories.includes(t.category)) return false;
  if (t.minComplaints && c.complaints.length < t.minComplaints) return false;
  if (t.primaryDetail && !(c.primary && complaintById(c.primary)?.detail === t.primaryDetail)) return false;
  if (t.findingsPresent && !anyPresent(c.state, t.findingsPresent)) return false;
  if (t.chosen && !t.chosen.some((x) => c.chosen.has(x))) return false;
  return true;
}

/** 回答済みの所見だけの選択肢を隠す設問 */
const CARRY: Section[] = ['detail', 'constitution'];
/**
 * 画面に出す形の設問：いちばん改善したい主訴の選択肢を作る、男性には女性向けの選択肢を出さない、
 * 回答済みの所見だけの選択肢を出さない（深掘り・体質）、title の {main} を主訴の名前に。
 */
export function resolveQuestion(q: Question, c: FlowContext): Question {
  let options: Option[] = q.options;
  if (q.section === 'primary') options = c.complaints.map((cid) => ({ id: primaryOptionId(cid), text: complaintById(cid)!.name, complaint: cid }));
  if (c.sex === 'male') options = options.filter((o) => !o.femaleOnly);
  if (CARRY.includes(q.section)) options = options.filter((o) => o.exclusive || !o.findings?.length || !o.findings.every((f) => isDetermined(c.state, f)));
  const main = c.primary ? complaintById(c.primary)?.name : undefined;
  const title = q.title.replace(/\{main\}/g, main ?? 'その症状');
  return { ...q, title, options };
}

export interface Step { q: Question; ids: string[] }
export interface WalkResult {
  steps: Step[]; state: FindingState; sex?: Sex; ageBand?: string; menses?: Menses;
  categories: string[]; complaints: string[]; primary?: string;
  /** 表示した設問で選ばれている選択肢ID */
  chosen: Set<string>;
}
/** 設問を順にたどって、表示する設問と回答から作った所見を返す */
export function walk(answers: Answers): WalkResult {
  const ctx: FlowContext = {
    sex: sexFromAnswers(answers), menses: undefined,
    categories: categoriesOf(answers), complaints: complaintsOf(answers), primary: primaryOf(answers),
    state: emptyState(), chosen: new Set(),
  };
  const steps: Step[] = [];
  for (const q of QUESTIONS) {
    if (!triggerOk(q.trigger, ctx)) continue;
    const rq = resolveQuestion(q, ctx);
    if (!rq.options.some((o) => !o.exclusive)) continue;
    const valid = new Set([...rq.options, ...(rq.sub?.options ?? [])].map((o) => o.id));
    const ids = (answers[q.id] ?? []).filter((id) => valid.has(id));
    steps.push({ q: rq, ids });
    if (!ids.length) continue;
    applyAnswer(ctx.state, rq, rq.options, ids, { inferAbsent: CARRY.includes(q.section) });
    for (const id of ids) ctx.chosen.add(id);
    // 月経の状況は A3 を表示したときだけ使う（性別を男性に変えたあとに残った回答を拾わない）
    if (q.id === 'A3') ctx.menses = mensesValue(answers);
  }
  return { steps, state: ctx.state, sex: ctx.sex, ageBand: ageBandFromAnswers(answers), menses: ctx.menses, categories: ctx.categories, complaints: ctx.complaints, primary: ctx.primary, chosen: ctx.chosen };
}

/** 薬剤師の入力（舌・体格・声）を所見に統合する（薬剤師の情報が患者の回答より優先） */
export function applyStaffAnswers(state: FindingState, staffAnswers: Answers | undefined): void {
  if (!staffAnswers) return;
  for (const q of STAFF_QUESTIONS) {
    const ids = staffAnswers[q.id];
    if (ids?.length) applyAnswer(state, q, q.options, ids, { source: 'staff' });
  }
}

/**
 * フォームから来た選択肢IDを設問に合わせて整える。
 *  - 表示していないIDは捨てる。single は1つ、sub は1つ。
 *  - 「特にない」「わからない」などとほかの選択肢が両方あれば、ほかの選択肢を残す（安全側）。
 */
export function normalizeAnswer(q: Question, rawIds: string[]): string[] {
  const main = new Map(q.options.map((o) => [o.id, o]));
  const subIds = new Set(q.sub?.options.map((o) => o.id) ?? []);
  const uniq = [...new Set(rawIds)];
  let m = uniq.filter((id) => main.has(id));
  const nonEx = m.filter((id) => !main.get(id)!.exclusive);
  m = nonEx.length ? nonEx : m.slice(0, 1);
  if (q.type === 'single') m = m.slice(0, 1);
  const s = uniq.filter((id) => subIds.has(id)).slice(0, 1);
  return [...m, ...s];
}
export function isAnswered(q: Question, ids: string[] | undefined): boolean {
  if (!ids?.length) return false;
  if (!ids.some((id) => q.options.some((o) => o.id === id))) return false;
  if (q.sub && !ids.some((id) => q.sub!.options.some((o) => o.id === id))) return false;
  return true;
}
/** 最初の未回答設問の step（1始まり）。全問回答済みなら steps.length + 1 */
export function firstUnansweredStep(steps: Step[]): number {
  const i = steps.findIndex((s) => !isAnswered(s.q, s.ids));
  return i < 0 ? steps.length + 1 : i + 1;
}

/** 漢方薬の選択（服用中 C1K・副作用歴 C4K） */
export const kampoCodes = (answers: Answers, qid: 'C1K' | 'C4K'): string[] =>
  (answers[qid] ?? []).map((id) => optionById(id)?.formula).filter((x): x is string => !!x);

/** 生活習慣の回答に応じた「あなたへの一言」 */
export function personalTips(answers: Answers, type: TypeKey): string[] {
  const chosen = new Set(Object.values(answers).flat());
  return TIPS.filter((t) => t.types.includes(type) && chosen.has(t.when)).map((t) => t.text);
}
