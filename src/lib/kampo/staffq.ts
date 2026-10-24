// ---------------------------------------------------------------------------
// 薬剤師向けの条件付き追加質問（純粋関数）。仕様書 §14・§16 STEP5。
// 優先順位：安全性の確認 → 処方候補の鑑別 → 主証・併存証の鑑別 → 五臓（五臓の細分類だけのための質問は低優先）。
// すべて選択式。薬剤師がすでに答えた質問は出さない（回答済みの再質問を防ぐ）。
// 回答は共通の所見IDに統合して再計算する（flow.ts の applyStaffAnswers）。
// ---------------------------------------------------------------------------
import { STAFF_QUESTIONS, findingName, type StaffCategory, type Question } from './masters.ts';
import { statusOf, type FindingState } from './findings.ts';
import type { Assessment } from './assess.ts';
import type { SessionSafety } from './safety.ts';
import type { Selection } from './recommend.ts';
import type { Answers, TongueMode } from './flow.ts';

export interface SuggestedQuestion { questionId: string; category: StaffCategory; reasons: string[]; findings: string[] }
const ORDER: StaffCategory[] = ['safety', 'formula', 'pattern', 'zang'];
const unresolved = (st: FindingState, f: string) => { const s = statusOf(st, f); return s === 'not_asked' || s === 'unknown'; };
const findingsOfQ = (q: Question) => new Set(q.options.flatMap((o) => o.findings ?? []));

export interface StaffQInput { st: FindingState; assessment: Assessment; safety: SessionSafety; selection: Selection; staffAnswers?: Answers; tongueMode: TongueMode }

export function suggestStaffQuestions(inp: StaffQInput): SuggestedQuestion[] {
  const { st, assessment: a, safety: ss, selection: sel } = inp;
  const out = new Map<string, SuggestedQuestion>();
  const answered = (qid: string) => !!inp.staffAnswers?.[qid]?.length;
  const push = (qid: string, reason: string, findings: string[] = []) => {
    const q = STAFF_QUESTIONS.find((x) => x.id === qid);
    if (!q || answered(qid)) return;
    const cur = out.get(qid) ?? { questionId: qid, category: q.staff!.category, reasons: [], findings: [] };
    if (!cur.reasons.includes(reason)) cur.reasons.push(reason);
    for (const f of findings) if (!cur.findings.includes(f)) cur.findings.push(f);
    out.set(qid, cur);
  };
  /** 未確認の所見を含む追加質問（カテゴリーの順で最初に見つかったもの）を出す */
  const ask = (fids: string[], reason: string, cats: StaffCategory[]) => {
    for (const fid of fids.filter((f) => unresolved(st, f))) {
      const q = cats.flatMap((c) => STAFF_QUESTIONS.filter((x) => x.staff!.category === c)).find((x) => findingsOfQ(x).has(fid) && !answered(x.id));
      if (q) push(q.id, `${reason}：${findingName(fid)}`, [fid]);
    }
  };

  // 安全性
  for (const r of ss.common) {
    if (r.code === 'em_unknown') push('X_em', r.text);
    if (r.code === 'dx_unknown') push('X_dx', r.text);
    if (r.code === 'med_unknown' || r.code === 'med_unknown_name') push('X_meds', r.text);
    if (r.code === 'kampo_unknown') push('X_kampo', r.text);
    if (r.code === 'ar_unknown' || r.code === 'ar_formula_unknown') push('X_ar', r.text);
    if (r.code === 'allergy_unknown') push('X_allergy', r.text);
    if (r.code === 'preg_unknown') push('X_preg', r.text);
  }

  // 処方候補の鑑別：上位の候補（除外以外）で未確認の重要鑑別所見、主訴対応マスタの required_questions
  const live = sel.candidates.filter((c) => c.klass !== 'excluded').slice(0, 8);
  for (const c of live) {
    ask(c.detail.missingKey, `候補「${c.name}」の重要鑑別所見`, ['formula', 'pattern']);
    for (const qid of c.entry.required_questions) {
      const q = STAFF_QUESTIONS.find((x) => x.id === qid);
      const need = q ? [...findingsOfQ(q)].filter((f) => c.detail.key.includes(f) && unresolved(st, f)) : [];
      if (need.length) push(qid, `候補「${c.name}」の鑑別に必要`, need);
    }
  }
  // 候補間で寒熱・虚実の扱いが分かれるのに、患者側が判定保留のとき
  if (live.some((c) => c.evaluation.cold_heat === 'cold') && live.some((c) => c.evaluation.cold_heat === 'heat') && a.coldHeat.status !== 'cold' && a.coldHeat.status !== 'heat') push('X_coldheat', '温める処方と冷ます処方が候補にあり、寒熱が判定保留・混在');
  if (live.some((c) => c.evaluation.deficiency_excess.includes('def') && !c.evaluation.deficiency_excess.includes('exc')) && live.some((c) => c.evaluation.deficiency_excess.includes('exc') && !c.evaluation.deficiency_excess.includes('def')) && (a.defExc.status === 'hold' || a.defExc.status === 'mixed')) push('X_defexc', '虚証向けと実証向けの処方が候補にあり、虚実が判定保留・混在');

  // 証の鑑別：主証の保留・併存証の不足・整合性の要確認・寒熱の確認
  for (const m of a.missing) ask([m.findingId], m.reason, ['pattern', 'formula']);
  for (const it of a.consistency.items) if (it.kind === 'check' || it.kind === 'mixed') ask(it.needs, it.message.split('。')[0], ['pattern', 'formula']);
  if (a.coldHeat.notes.some((n) => n.includes('上熱下寒'))) push('X_coldheat', '冷えとほてりの併存（部位・時間帯・随伴症状の確認）');
  // 舌：スタッフ確認モードで、薬剤師の観察がまだのとき
  if (inp.tongueMode === 'staff') for (const qid of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) push(qid, '舌の観察（受付で「スタッフが確認」）');

  // 五臓（低優先）：主証は決まっているが五臓が保留
  if (a.primary.status === 'determined' && a.zang.status === 'hold') push('X_zang', '五臓の特定が保留（細分類のための低優先の確認）');

  return [...out.values()].sort((x, y) => ORDER.indexOf(x.category) - ORDER.indexOf(y.category));
}
