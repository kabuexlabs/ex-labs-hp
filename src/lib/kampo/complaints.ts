// ---------------------------------------------------------------------------
// 主訴（純粋関数）：大カテゴリー（K1）→ 具体的な主訴（K_A〜K_H）→ いちばん改善したい主訴（KM）。
// 具体的な主訴を1つだけ選んだらそれが「いちばん改善したい主訴」。2つ以上なら KM で1つに決める。
// 決まった主訴の深掘りを出し、ほかに選んだ主訴は随伴症状として残す。
// 同じ主訴を2つのカテゴリーに出すことがある（顔や上半身のほてり：A と C）が、主訴としては1つ。
// ---------------------------------------------------------------------------
import { complaintById, categoryById, type Complaint } from './masters.ts';
import { complaintsOf, primaryOf, type Answers } from './flow.ts';

export { complaintsOf as chosenComplaintIds, primaryOf as mainComplaintId };

export interface ComplaintInfo {
  id: string;
  label: string;
  /** 大カテゴリー名（複数のカテゴリーに出す主訴は最初のもの） */
  category: string;
  complaint: Complaint;
}
export function complaintInfo(id: string): ComplaintInfo | undefined {
  const c = complaintById(id);
  if (!c) return undefined;
  return { id, label: c.name, category: categoryById(c.categories[0])?.name ?? '', complaint: c };
}
export const complaintLabel = (id: string) => complaintById(id)?.name ?? id;
/** いちばん改善したい主訴の深掘りテンプレート名 */
export function mainDetailOf(answers: Answers): string | undefined {
  const m = primaryOf(answers);
  return m ? complaintById(m)?.detail : undefined;
}
