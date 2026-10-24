// ---------------------------------------------------------------------------
// 漢方薬候補の選定（純粋関数）。仕様書 §16。薬剤師の画面にだけ出す（患者画面では処方を推奨しない：§25⑪）。
// STEP1 優先主訴の主訴対応マスタ（⑤）から候補を抽出（体質だけで処方を足さない）
// STEP2 安全性（safety.ts）
// STEP3 主訴の詳細症状・重要鑑別所見の一致／不一致
// STEP4 気血水・寒熱・虚実・五臓との適合（補助）
// STEP5 候補間の鑑別に必要な追加質問（staffq.ts）
// STEP6 優先検討候補／検討候補／安全性・情報確認待ち／除外・対象外 に分類
//  - 優先検討候補：主訴対応が確認済み・安全性は「必要な確認完了」・重要鑑別所見が一致し不一致なし・体質に不適合なし
//  - 安全性・情報確認待ち：安全性が確認待ち、または主訴対応・製品情報が未確認
//    （いまは主訴対応がすべて草案で製品情報が未登録のため、除外以外はすべてここに入る。その中の並びは参考順位）
// ---------------------------------------------------------------------------
import {
  entriesOf, evaluationOf, formulaById, complaintById, categoryName, cfReview, productsOf, isConfirmed, findingName, patternName,
  ZANG_LABEL, type ComplaintFormula, type Evaluation, type Match, type ReviewStatus, type PatternId,
} from './masters.ts';
import { isPresent, statusOf, type FindingState } from './findings.ts';
import type { Assessment } from './assess.ts';
import { candidateSafety, type SessionSafety, type CandidateSafety, type SafetyInput } from './safety.ts';

export type CandidateClass = 'priority' | 'consider' | 'pending' | 'excluded';
export const CLASS_LABEL: Record<CandidateClass, string> = { priority: '優先検討候補', consider: '検討候補', pending: '安全性・情報確認待ち', excluded: '除外・対象外' };
export const CLASSES: CandidateClass[] = ['priority', 'consider', 'pending', 'excluded'];
export type Fit = 'match' | 'partial' | 'mismatch' | 'unknown' | 'neutral';
export const FIT_LABEL: Record<Fit, string> = { match: '一致', partial: '一部一致', mismatch: '不適合', unknown: '判定保留', neutral: '中間' };

export interface CandidateAssessment {
  formulaId: string; name: string; kana: string;
  entry: ComplaintFormula; evaluation: Evaluation;
  indication: { match: Match; terms: { term: string; match: Match; requires?: string[]; satisfied: boolean }[]; ok: boolean; review: ReviewStatus };
  product: 'none' | 'unverified' | 'verified';
  detail: { key: string[]; matchedKey: string[]; matchedSupport: string[]; conflicts: string[]; missingKey: string[]; score: number };
  constitution: { items: { axis: string; fit: Fit; text: string }[]; score: number; mismatch: boolean };
  /** ほかに選んだ主訴のうち、この処方にも主訴対応があるもの */
  companions: string[];
  safety: CandidateSafety;
  klass: CandidateClass;
  classReasons: string[];
  /** 参考順位に使う適合の点（草案・補助） */
  fit: number;
}
export interface Selection {
  stop?: { reason: string; findings: string[] };
  primary?: { id: string; name: string; category: string };
  others: { id: string; name: string; category: string }[];
  candidates: CandidateAssessment[];
  byClass: Record<CandidateClass, CandidateAssessment[]>;
  /** 優先主訴に主訴対応マスタの登録がない（根拠のある候補がない） */
  noEvidence: boolean;
}

const unresolved = (st: FindingState, f: string) => { const s = statusOf(st, f); return s === 'not_asked' || s === 'unknown'; };

function constitutionFit(ev: Evaluation, a: Assessment): CandidateAssessment['constitution'] {
  const items: CandidateAssessment['constitution']['items'] = [];
  let score = 0;
  const target = [...ev.qi_blood_fluid.primary, ...ev.qi_blood_fluid.secondary];
  const tn = (ids: PatternId[]) => ids.map(patternName).join('・') || '—';
  if (a.primary.status === 'determined') {
    const p = a.primary.patternId!;
    if (ev.qi_blood_fluid.primary.includes(p)) { items.push({ axis: '気血水', fit: 'match', text: `主証「${patternName(p)}」が処方の主な対象（${tn(ev.qi_blood_fluid.primary)}）と一致` }); score += 2; }
    else if (target.includes(p) || a.coexisting.some((c) => target.includes(c))) { items.push({ axis: '気血水', fit: 'partial', text: `主証・併存証の一部が処方の対象（${tn(target)}）と重なる` }); score += 1; }
    else items.push({ axis: '気血水', fit: target.length ? 'neutral' : 'unknown', text: `処方の対象（${tn(target)}）は主証「${patternName(p)}」と別（不一致とは扱わない）` });
  } else {
    const c = a.primary.candidates.filter((x) => target.includes(x));
    items.push({ axis: '気血水', fit: c.length ? 'partial' : 'unknown', text: c.length ? `主証は保留。候補の証（${tn(c)}）が処方の対象と重なる` : '主証が保留のため判定保留' });
    if (c.length) score += 0.5;
  }
  const ch = a.coldHeat.status;
  if (ev.cold_heat === 'neutral') items.push({ axis: '寒熱', fit: 'neutral', text: '寒熱は中間の処方' });
  else if (ch === 'hold') items.push({ axis: '寒熱', fit: 'unknown', text: `寒熱が判定保留（処方は${ev.cold_heat === 'cold' ? '温める' : '冷ます'}）` });
  else if (ch === 'mixed') items.push({ axis: '寒熱', fit: 'unknown', text: `寒熱混在の可能性（処方は${ev.cold_heat === 'cold' ? '温める' : '冷ます'}）。部位・時間帯を確認` });
  else if ((ev.cold_heat === 'cold' && ch === 'cold') || (ev.cold_heat === 'heat' && ch === 'heat')) { items.push({ axis: '寒熱', fit: 'match', text: `${ch === 'cold' ? '寒' : '熱'}傾向に対して${ev.cold_heat === 'cold' ? '温める' : '冷ます'}処方` }); score += 1; }
  else { items.push({ axis: '寒熱', fit: 'mismatch', text: `${ch === 'cold' ? '寒' : '熱'}傾向に対して${ev.cold_heat === 'cold' ? '温める' : '冷ます'}処方（逆）` }); score -= 2; }
  const de = a.defExc.status;
  const r = ev.deficiency_excess;
  const range = r.length === 3 ? '体力に関わらず' : r.includes('def') && !r.includes('exc') ? '体力中等度以下' : r.includes('exc') && !r.includes('def') ? '体力中等度以上' : '体力中等度';
  if (de === 'hold' || de === 'mixed') items.push({ axis: '虚実', fit: 'unknown', text: `虚実が${de === 'hold' ? '判定保留' : '混在の可能性'}（処方は${range}）` });
  else if ((de === 'def' && r.includes('def')) || (de === 'exc' && r.includes('exc'))) { items.push({ axis: '虚実', fit: 'match', text: `${de === 'def' ? '虚証' : '実証'}傾向で、処方の範囲（${range}）内` }); score += 1; }
  else if ((de === 'def' && !r.includes('def') && !r.includes('mid')) || (de === 'exc' && !r.includes('exc') && !r.includes('mid'))) { items.push({ axis: '虚実', fit: 'mismatch', text: `${de === 'def' ? '虚証' : '実証'}傾向だが、処方は${range}` }); score -= 2; }
  else if ((de === 'def' && !r.includes('def')) || (de === 'exc' && !r.includes('exc'))) { items.push({ axis: '虚実', fit: 'mismatch', text: `${de === 'def' ? '虚証' : '実証'}傾向だが、処方は${range}` }); score -= 1.5; }
  else items.push({ axis: '虚実', fit: 'neutral', text: `処方は${range}` });
  if (a.zang.status === 'possible') {
    const z = a.zang.items.filter((x) => x.possible && ev.zang.includes(x.zang)).map((x) => ZANG_LABEL[x.zang]);
    items.push({ axis: '五臓', fit: z.length ? 'match' : 'neutral', text: z.length ? `関連の可能性がある臓（${z.join('・')}）に働く処方` : `処方の臓（${ev.zang.map((x) => ZANG_LABEL[x]).join('・')}）は関連の可能性がある臓と別` });
    if (z.length) score += 0.5;
  } else items.push({ axis: '五臓', fit: 'unknown', text: '五臓は判定保留' });
  return { items, score, mismatch: items.some((x) => x.fit === 'mismatch') };
}

export interface SelectInput { st: FindingState; assessment: Assessment; safety: SessionSafety; safetyInput: SafetyInput; complaints: string[]; primary?: string }

export function selectCandidates(inp: SelectInput): Selection {
  const { st, assessment: a, safety: ss } = inp;
  const info = (id: string) => { const c = complaintById(id)!; return { id, name: c.name, category: categoryName(c.category) }; };
  const primary = inp.primary ? info(inp.primary) : undefined;
  const others = inp.complaints.filter((c) => c !== inp.primary).map(info);
  const empty = (): Record<CandidateClass, CandidateAssessment[]> => ({ priority: [], consider: [], pending: [], excluded: [] });
  if (ss.state === 'emergency') return { stop: { reason: '緊急症状が疑われるため、通常の候補提示を停止しています。医療対応を優先してください。', findings: ss.emergency.map((e) => e.text) }, primary, others, candidates: [], byClass: empty(), noEvidence: false };
  if (!primary) return { primary, others, candidates: [], byClass: empty(), noEvidence: false };

  // STEP1：優先主訴の主訴対応マスタ
  const entries = entriesOf(primary.id);
  const candidates: CandidateAssessment[] = [];
  for (const e of entries) {
    const f = formulaById(e.formulaId)!;
    const ev = evaluationOf(e.formulaId)!;
    const terms = e.terms.map((t) => ({ ...t, satisfied: !t.requires || t.requires.some((r) => isPresent(st, r)) }));
    const okTerms = terms.filter((t) => t.satisfied);
    const review = cfReview(e).status;
    const prods = inp.safetyInput.products ? inp.safetyInput.products.filter((p) => p.formulaId === e.formulaId) : productsOf(e.formulaId);
    const product: CandidateAssessment['product'] = !prods.length ? 'none' : prods.some((p) => isConfirmed(p.review.status)) ? 'verified' : 'unverified';
    // STEP3：詳細症状・重要鑑別所見
    const key = e.key_findings ?? ev.key_findings;
    const supp = e.supporting_findings ?? ev.supporting_findings;
    const conf = e.conflicting_findings ?? ev.conflicting_findings;
    const matchedKey = key.filter((x) => isPresent(st, x));
    const matchedSupport = supp.filter((x) => isPresent(st, x));
    const conflicts = conf.filter((x) => isPresent(st, x));
    const missingKey = key.filter((x) => unresolved(st, x));
    const detail = { key, matchedKey, matchedSupport, conflicts, missingKey, score: 2 * matchedKey.length + matchedSupport.length - 2 * conflicts.length };
    // STEP4：体質との適合
    const constitution = constitutionFit(ev, a);
    const companions = others.filter((o) => entriesOf(o.id).some((x) => x.formulaId === e.formulaId)).map((o) => o.name);
    // STEP2：安全性
    const safety = candidateSafety(e.formulaId, ss, inp.safetyInput);
    // STEP6：分類
    const reasons: string[] = [];
    let klass: CandidateClass;
    const bestMatch = (okTerms.length ? okTerms : terms).reduce<Match>((m, t) => (rank(t.match) < rank(m) ? t.match : m), 'use_target');
    if (!okTerms.length) { klass = 'excluded'; reasons.push(`条件つきの効能（${terms.map((t) => t.term).join('、')}）の条件（${[...new Set(terms.flatMap((t) => t.requires ?? []))].map(findingName).join('・')}）に該当しないため対象外`); }
    else if (f.status !== 'active') { klass = 'excluded'; reasons.push('処方マスタで無効'); }
    else if (safety.state === 'excluded') { klass = 'excluded'; reasons.push(...safety.reasons.filter((r) => r.state === 'excluded').map((r) => r.text)); }
    else {
      const pend: string[] = [];
      if (safety.state === 'pending') pend.push(...safety.reasons.filter((r) => r.state === 'pending').map((r) => r.text));
      if (!isConfirmed(review)) pend.push('主訴対応が未確認（草案）です');
      if (product !== 'verified' && !safety.reasons.some((r) => r.category === 'product')) pend.push(product === 'none' ? '医療用製品の情報が未登録です' : '製品情報が未確認です');
      if (pend.length) { klass = 'pending'; reasons.push(...pend); }
      else if (safety.state === 'done' && matchedKey.length > 0 && conflicts.length === 0 && !constitution.mismatch && bestMatch !== 'use_target') { klass = 'priority'; reasons.push('主訴対応・安全性が確認済みで、重要鑑別所見が一致し不一致・不適合がない'); }
      else {
        klass = 'consider';
        if (safety.state === 'check') reasons.push('薬剤師の確認が必要な安全性の項目があります');
        if (!matchedKey.length) reasons.push('重要鑑別所見の一致がありません');
        if (conflicts.length) reasons.push(`不一致所見：${conflicts.map(findingName).join('・')}`);
        if (constitution.mismatch) reasons.push('体質の評価に不適合な軸があります');
        if (bestMatch === 'use_target') reasons.push('主訴は効能の語ではなく使用目標に記載');
      }
    }
    const fit = detail.score + constitution.score + 0.5 * companions.length + (bestMatch === 'efficacy' ? 1 : bestMatch === 'partial' ? 0.5 : 0);
    candidates.push({
      formulaId: e.formulaId, name: f.name, kana: f.kana, entry: e, evaluation: ev,
      indication: { match: bestMatch, terms, ok: okTerms.length > 0, review }, product, detail, constitution, companions, safety, klass, classReasons: reasons, fit,
    });
  }
  candidates.sort((x, y) => CLASSES.indexOf(x.klass) - CLASSES.indexOf(y.klass) || y.fit - x.fit || rank(x.indication.match) - rank(y.indication.match) || x.formulaId.localeCompare(y.formulaId));
  const byClass = empty();
  for (const c of candidates) byClass[c.klass].push(c);
  return { primary, others, candidates, byClass, noEvidence: entries.length === 0 };
}
const rank = (m: Match) => ({ efficacy: 0, partial: 1, use_target: 2 })[m];

/** 監査・履歴用の要約（提案保存時のスナップショット） */
export function selectionSummary(sel: Selection) {
  return {
    stop: sel.stop?.reason, primary: sel.primary?.id, others: sel.others.map((o) => o.id), noEvidence: sel.noEvidence,
    candidates: sel.candidates.map((c) => ({ id: c.formulaId, name: c.name, klass: c.klass, safety: c.safety.state, fit: Math.round(c.fit * 10) / 10, reasons: c.classReasons, safetyReasons: c.safety.reasons.map((r) => `${r.state}:${r.code}`) })),
  };
}
