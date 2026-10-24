// ---------------------------------------------------------------------------
// 主訴の3段階（純粋関数）：大カテゴリー（K1）→ 具体的な主訴（KA〜KH）→ いちばん改善したい主訴（KM）。
// 具体的な主訴を1つだけ選んだらそれが「いちばん改善したい主訴」。2つ以上なら KM で1つに決める。
// 決まった主訴を中心に詳細問診（S*）を出し、ほかに選んだ主訴は随伴症状として扱う。
// ---------------------------------------------------------------------------
import { COMPLAINT_QUESTIONS, MAIN_QUESTION, optionById, categoryOfComplaint, type Option } from './masters.ts';

type Answers = Record<string, string[]>;
type Texts = Record<string, string>;

/** 選ばれている具体的な主訴の選択肢ID（設問の並び→選択肢の並びの順） */
export function chosenComplaintIds(answers: Answers): string[] {
  const out: string[] = [];
  for (const q of COMPLAINT_QUESTIONS) {
    const chosen = new Set(answers[q.id] ?? []);
    for (const o of q.options) if (chosen.has(o.id)) out.push(o.id);
  }
  return out;
}

/** いちばん改善したい主訴の選択肢ID（未確定なら undefined） */
export function mainComplaintId(answers: Answers): string | undefined {
  const list = chosenComplaintIds(answers);
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const m = MAIN_QUESTION ? answers[MAIN_QUESTION.id]?.[0] : undefined;
  return m && list.includes(m) ? m : undefined;
}

/** 主訴の表示名（「その他」は記入内容を添える） */
export function complaintLabel(id: string, texts: Texts = {}): string {
  const o = optionById(id);
  if (!o) return id;
  const t = (texts[id] ?? '').trim();
  return o.freeText && t ? `${o.text}（${t}）` : o.text;
}

export interface ComplaintInfo {
  id: string;
  label: string;
  /** 大カテゴリー名（例: 肌の悩み） */
  category: string;
  option: Option;
}
export function complaintInfo(id: string, texts: Texts = {}): ComplaintInfo | undefined {
  const o = optionById(id);
  if (!o) return undefined;
  return { id, label: complaintLabel(id, texts), category: categoryOfComplaint(id), option: o };
}

/** 主訴の詳細問診のテンプレート名 */
export function mainDetailOf(answers: Answers): string | undefined {
  const m = mainComplaintId(answers);
  return m ? optionById(m)?.detail : undefined;
}
