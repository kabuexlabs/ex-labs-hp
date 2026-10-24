// ---------------------------------------------------------------------------
// 所見の管理（純粋関数）。仕様書 §7。
// 回答状態は present／absent／unknown／not_asked／declined の5種。
//  - 選んだ選択肢の所見 → present
//  - 同じ問で表示して選ばなかった選択肢の所見 → absent（表示していない選択肢は absent にしない）
//  - 「特にない」→ 表示した選択肢の所見をすべて absent、「わからない」→ unknown、「回答しない」→ declined
//  - 一度も表示していない所見 → not_asked（「症状なし」と扱わない）
// 主訴の一覧（具体的主訴）は「選ばなかった＝症状なし」とは限らないので absent にしない。
// 同じ症状は共通の所見IDで1つにまとめる。複数の情報源があるときは、薬剤師の観察・回答 ＞ 患者の回答。
// 同じ情報源の中では present ＞ absent ＞ unknown ＞ declined。
// 修飾情報（ストレスで悪化 など）は対象症状に紐づけて modifiers に保存する（症状そのものとしては扱わない）。
// ---------------------------------------------------------------------------
import { findingById, type Option, type Question } from './masters.ts';

export type AnswerStatus = 'present' | 'absent' | 'unknown' | 'not_asked' | 'declined';
export const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = { present: 'あり', absent: 'なし', unknown: 'わからない', not_asked: '未質問', declined: '回答しない' };
export type SourceType = 'patient' | 'patient_tongue' | 'pharmacist_observation' | 'pharmacist_question';
export const SOURCE_LABEL: Record<SourceType, string> = { patient: '患者の回答', patient_tongue: '患者のイラスト選択', pharmacist_observation: '薬剤師の観察', pharmacist_question: '薬剤師の確認' };
export interface FindingSource { questionId: string; optionIds: string[]; sourceType: SourceType; status: Exclude<AnswerStatus, 'not_asked'>; recordedAt?: string }
export interface FindingAnswer { id: string; status: AnswerStatus; sources: FindingSource[] }
export interface SymptomModifier { findingId: string; targetSymptomId?: string; questionId: string; optionId: string; sourceType: SourceType }
export interface FindingState { answers: Map<string, FindingAnswer>; modifiers: SymptomModifier[] }

export const emptyState = (): FindingState => ({ answers: new Map(), modifiers: [] });
export const cloneState = (s: FindingState): FindingState => ({ answers: new Map([...s.answers].map(([k, v]) => [k, { ...v, sources: [...v.sources] }])), modifiers: [...s.modifiers] });
export const statusOf = (s: FindingState, id: string): AnswerStatus => s.answers.get(id)?.status ?? 'not_asked';
export const isPresent = (s: FindingState, id: string) => statusOf(s, id) === 'present';
export const anyPresent = (s: FindingState, ids: string[]) => ids.some((id) => isPresent(s, id));
/** present／absent のどちらかに決まっている（unknown・not_asked・declined は未確定） */
export const isDetermined = (s: FindingState, id: string) => { const st = statusOf(s, id); return st === 'present' || st === 'absent'; };
export const presentIds = (s: FindingState) => [...s.answers.values()].filter((a) => a.status === 'present').map((a) => a.id);

const RANK: Record<Exclude<AnswerStatus, 'not_asked'>, number> = { present: 4, absent: 3, unknown: 2, declined: 1 };
const isPharmacist = (t: SourceType) => t === 'pharmacist_observation' || t === 'pharmacist_question';

/** 情報源の優先順位で状態を決め直す */
function resolve(a: FindingAnswer): AnswerStatus {
  const ph = a.sources.filter((x) => isPharmacist(x.sourceType));
  const use = ph.length ? ph : a.sources;
  if (!use.length) return 'not_asked';
  return use.reduce((best, x) => (RANK[x.status] > RANK[best] ? x.status : best), use[0].status);
}
function addSource(s: FindingState, id: string, src: FindingSource) {
  const a = s.answers.get(id) ?? { id, status: 'not_asked' as AnswerStatus, sources: [] };
  a.sources.push(src);
  a.status = resolve(a);
  s.answers.set(id, a);
}

/**
 * 1問の回答を所見に反映する。displayed は実際に画面に出した選択肢（隠した選択肢は所見を変えない）。
 * inferAbsent: false なら選ばなかった選択肢を absent にしない（主訴の一覧）。
 */
export function applyAnswer(
  s: FindingState, q: Pick<Question, 'id' | 'sub'>, displayed: Option[], chosenIds: string[], sourceType: SourceType,
  opts: { inferAbsent?: boolean; recordedAt?: string } = {},
): void {
  const chosen = new Set(chosenIds);
  const groups: Option[][] = [displayed, q.sub?.options ?? []];
  for (const opts_ of groups) {
    if (!opts_.length) continue;
    const ex = opts_.find((o) => o.exclusive && chosen.has(o.id));
    const per = new Map<string, { status: Exclude<AnswerStatus, 'not_asked'>; optionIds: string[] }>();
    const put = (fid: string, st: Exclude<AnswerStatus, 'not_asked'>, oid: string) => {
      const cur = per.get(fid);
      if (!cur || RANK[st] > RANK[cur.status]) per.set(fid, { status: st, optionIds: [oid] });
      else if (cur.status === st) cur.optionIds.push(oid);
    };
    const anyChosen = opts_.some((o) => chosen.has(o.id));
    if (!anyChosen) continue; // この組は未回答
    for (const o of opts_) {
      if (o.exclusive || !o.findings?.length) continue;
      for (const fid of o.findings) {
        if (ex) put(fid, ex.exclusive === 'none' ? 'absent' : ex.exclusive === 'unknown' ? 'unknown' : 'declined', ex.id);
        else if (chosen.has(o.id)) put(fid, 'present', o.id);
        else if (opts.inferAbsent !== false) put(fid, 'absent', o.id);
      }
      if (!ex && chosen.has(o.id)) {
        for (const fid of o.findings) {
          if (findingById(fid)?.kind === 'modifier') s.modifiers.push({ findingId: fid, targetSymptomId: o.target, questionId: q.id, optionId: o.id, sourceType });
        }
      }
    }
    for (const [fid, v] of per) addSource(s, fid, { questionId: q.id, optionIds: v.optionIds, sourceType, status: v.status, recordedAt: opts.recordedAt });
  }
}

/** 所見の情報源ごとの状態（担当者画面で「患者のイラスト選択」と「薬剤師の観察」を並べて見る） */
export function sourcesOf(s: FindingState, id: string): FindingSource[] {
  return s.answers.get(id)?.sources ?? [];
}
