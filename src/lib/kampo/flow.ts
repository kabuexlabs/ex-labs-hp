// ---------------------------------------------------------------------------
// 患者向けの設問フロー（純粋関数）。仕様書 §2-1・§5・§7。
// 順番：基本情報 → 安全性確認 → 主訴カテゴリー → 具体的主訴 →（2つ以上なら）優先主訴 → 主訴別詳細問診（優先主訴）
//       → 安全上の確認（選んだ主訴に応じて）→ 経過 → 共通体質（B1〜B13）→ 生活習慣 → 回答確認 → 送信完了。
// walk() が設問を順にたどり、表示する設問・表示する選択肢・それまでの回答から作った所見を同時に決める。
//  - 回答済みの事項は再質問しない：詳細問診・安全上の確認・共通体質では、それより前の回答で present／absent が
//    決まっている所見だけの選択肢を出さない（unknown は出す）。出す選択肢がなくなった設問は出さない。
//  - B7（むくみ）は関連する所見があるとき、B11（月経）は月経がある（不規則を含む）と答えたとき、
//    B13（舌）は受付で「ご自分で」を選んだときだけ出す。
// ---------------------------------------------------------------------------
import {
  QUESTIONS, STAFF_QUESTIONS, COMPLAINTS, TIPS, complaintById, primaryOptionId,
  type Question, type Option, type Trigger, type AdviceKey,
} from './masters.ts';
import { emptyState, applyAnswer, isDetermined, anyPresent, type FindingState } from './findings.ts';

/** 回答：設問ID → 選んだ選択肢ID（sub の選択肢も同じ配列に入れる） */
export type Answers = Record<string, string[]>;
export type TongueMode = 'self' | 'staff';
export type Sex = 'female' | 'male' | 'declined';
export const SEX_LABEL: Record<Sex, string> = { female: '女性', male: '男性', declined: '回答しない' };
export const AGE_BAND_LABEL: Record<string, string> = { '10s': '10代', '20s': '20代', '30s': '30代', '40s': '40代', '50s': '50代', '60s': '60代', '70s': '70代以上' };
export type Menses = 'regular' | 'irregular' | 'post' | 'none_preg' | 'none_other' | 'declined';

const valueOf = (answers: Answers, qid: string) => {
  const id = answers[qid]?.[0];
  return id ? id.slice(qid.length + 1) : undefined;
};
export const sexOf = (a: Answers): Sex | undefined => { const v = valueOf(a, 'P1'); return v === 'female' || v === 'male' || v === 'declined' ? v : undefined; };
export const ageBandOf = (a: Answers): string | undefined => { const v = valueOf(a, 'P2'); return v && v in AGE_BAND_LABEL ? v : undefined; };
export function mensesOf(a: Answers): Menses | undefined {
  const v = valueOf(a, 'P3');
  const map: Record<string, Menses> = { menses_regular: 'regular', menses_irregular: 'irregular', menses_post: 'post', menses_none_preg: 'none_preg', menses_none_other: 'none_other', declined: 'declined' };
  return v ? map[v] : undefined;
}
/** 選んだ主訴カテゴリー（A〜H） */
export const categoriesOf = (a: Answers): string[] => (a['K1'] ?? []).filter((x) => x.startsWith('cat:')).map((x) => x.slice(4));
/** 選んだ具体的主訴（いま選んでいるカテゴリーのものだけ。complaints.json の並び順） */
export function complaintsOf(a: Answers): string[] {
  const cats = new Set(categoriesOf(a));
  const chosen = new Set(Object.entries(a).filter(([k]) => k.startsWith('K_') && cats.has(k.slice(2))).flatMap(([, v]) => v));
  return COMPLAINTS.filter((c) => cats.has(c.category) && chosen.has(c.id)).map((c) => c.id);
}
/** 優先主訴（primary_complaint_id）。主訴が1つならそれ、2つ以上なら KM の回答 */
export function primaryOf(a: Answers): string | undefined {
  const list = complaintsOf(a);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const m = a['KM']?.[0];
  const cid = m?.startsWith('KM:') ? m.slice(3) : undefined;
  return cid && list.includes(cid) ? cid : undefined;
}

export interface FlowContext {
  answers: Answers; tongueMode: TongueMode; sex?: Sex; menses?: Menses;
  categories: string[]; complaints: string[]; primary?: string;
  state: FindingState; chosen: Set<string>;
}
export function triggerOk(t: Trigger | undefined, c: FlowContext): boolean {
  if (!t) return true;
  if (t.sexNot && c.sex === t.sexNot) return false;
  if (t.menses && !(c.menses === 'regular' || c.menses === 'irregular')) return false;
  if (t.tongueMode && c.tongueMode !== t.tongueMode) return false;
  if (t.category && !c.categories.includes(t.category)) return false;
  if (t.complaintSelected && !t.complaintSelected.some((x) => c.complaints.includes(x))) return false;
  if (t.primary && !(c.primary && t.primary.includes(c.primary))) return false;
  if (t.minComplaints && c.complaints.length < t.minComplaints) return false;
  if (t.hasPrimary && !c.primary) return false;
  if (t.findingsPresent && !anyPresent(c.state, t.findingsPresent)) return false;
  if (t.chosen && !t.chosen.some((x) => c.chosen.has(x))) return false;
  return true;
}

const FILTERED = new Set(['detail', 'redflag', 'constitution']);
/**
 * 画面に出す形の設問：優先主訴の選択肢を作る、男性には女性向けの選択肢を出さない、
 * 回答済みの所見だけの選択肢を出さない（詳細・安全上の確認・体質）、title の {main} を優先主訴の名前に。
 */
export function resolveQuestion(q: Question, c: FlowContext): Question {
  let options: Option[] = q.options;
  if (q.role === 'primary') options = c.complaints.map((cid) => ({ id: primaryOptionId(cid), text: complaintById(cid)!.name, complaint: cid }));
  if (c.sex === 'male') options = options.filter((o) => !o.femaleOnly);
  if (FILTERED.has(q.section)) options = options.filter((o) => o.exclusive || !o.findings?.length || !o.findings.every((f) => isDetermined(c.state, f)));
  const main = c.primary ? complaintById(c.primary)?.name : undefined;
  const title = q.title.replace(/\{main\}/g, main ?? 'その症状');
  return { ...q, title, options };
}

export interface Step { q: Question; ids: string[] }
export interface WalkResult {
  steps: Step[]; state: FindingState; sex?: Sex; ageBand?: string; menses?: Menses;
  categories: string[]; complaints: string[]; primary?: string;
}
/** 設問を順にたどって、表示する設問と回答から作った所見を返す */
export function walk(answers: Answers, tongueMode: TongueMode): WalkResult {
  // 月経の状況は P3 を表示したときだけ使う（性別を男性に変えたあとに残った回答を拾わない）
  const ctx: FlowContext = {
    answers, tongueMode, sex: sexOf(answers), menses: undefined,
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
    if (ids.length) {
      applyAnswer(ctx.state, rq, rq.options, ids, q.domain === 'B13' ? 'patient_tongue' : 'patient', { inferAbsent: q.section !== 'complaint' });
      for (const id of ids) ctx.chosen.add(id);
      if (q.id === 'P3') ctx.menses = mensesOf(answers);
    }
  }
  return { steps, state: ctx.state, sex: ctx.sex, ageBand: ageBandOf(answers), menses: ctx.menses, categories: ctx.categories, complaints: ctx.complaints, primary: ctx.primary };
}

/** 薬剤師の追加質問の回答を所見に統合する（薬剤師の情報が患者の回答より優先） */
export function applyStaffAnswers(state: FindingState, staffAnswers: Answers | undefined, recordedAt?: Record<string, string>): void {
  if (!staffAnswers) return;
  for (const q of STAFF_QUESTIONS) {
    const ids = staffAnswers[q.id];
    if (!ids?.length) continue;
    applyAnswer(state, q, q.options, ids, q.staff!.source, { recordedAt: recordedAt?.[q.id] });
  }
}

/**
 * フォームから来た選択肢IDを設問に合わせて整える。
 *  - 表示していないIDは捨てる。single は1つ、sub は1つ。
 *  - 「特にない」「わからない」などの排他選択肢と、ほかの選択肢が両方あれば、ほかの選択肢を残す（安全側）。
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

/** 漢方薬の選択（服用中・副作用歴）。患者の回答と薬剤師の確認を合わせる */
export interface KampoPick { formulas: string[]; unknown: boolean; answered: boolean }
export function kampoPicks(answers: Answers, staffAnswers: Answers | undefined, qids: string[]): KampoPick {
  const ids = qids.flatMap((q) => [...(answers[q] ?? []), ...(staffAnswers?.[q] ?? [])]);
  const formulas = [...new Set(ids.filter((id) => !id.endsWith(':unknown')).map((id) => id.split(':')[1]))];
  return { formulas, unknown: ids.some((id) => id.endsWith(':unknown')), answered: ids.length > 0 };
}
export const currentKampo = (a: Answers, st?: Answers) => kampoPicks(a, st, ['S3K', 'X_kampo']);
export const adverseKampo = (a: Answers, st?: Answers) => kampoPicks(a, st, ['S5A', 'X_ar']);

/** 生活習慣の回答に応じた「あなたへの一言」 */
export function personalTips(answers: Answers, key: AdviceKey): string[] {
  const chosen = new Set(Object.values(answers).flat());
  return TIPS.filter((t) => t.types.includes(key) && chosen.has(t.when)).map((t) => t.text);
}
