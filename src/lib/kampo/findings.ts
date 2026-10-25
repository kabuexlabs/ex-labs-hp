// ---------------------------------------------------------------------------
// 所見の状態（純粋関数）。回答（選択肢ID）を所見に変換し、あり／なし／わからない／回答しないを区別して持つ。
// 状態がない所見は「未質問」で、「なし」とは扱わない。
//  - 選んだ選択肢の所見 → present（implies に挙げた所見も present）
//  - 「特にない」→ その画面に出した選択肢の所見を absent
//  - 「わからない」→ unknown、「回答しない」→ declined
//  - 主訴・深掘り・体質の複数選択で、選ばなかった選択肢の所見 → absent（主訴の画面は除く）
//  - すでに present の所見は、あとから absent にしない（安全側）。薬剤師の入力は患者の回答より優先
// ---------------------------------------------------------------------------
import { findingById, type Question, type Option, type Section } from './masters.ts';

export type FindingStatus = 'present' | 'absent' | 'unknown' | 'declined';
export type FindingSource = 'patient' | 'staff' | 'implied';
export interface FindingEntry { status: FindingStatus; source: FindingSource; question: string; section: Section }
export type FindingState = Map<string, FindingEntry>;
export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = { present: 'あり', absent: 'なし', unknown: 'わからない', declined: '回答しない' };

export const emptyState = (): FindingState => new Map();
/** 回答済み（あり・なし・わからない・回答しない）なら true。未質問は false */
export const isDetermined = (s: FindingState, id: string) => s.has(id);
export const isPresent = (s: FindingState, id: string) => s.get(id)?.status === 'present';
export const anyPresent = (s: FindingState, ids: string[]) => ids.some((id) => isPresent(s, id));
export const presentIds = (s: FindingState) => [...s].filter(([, e]) => e.status === 'present').map(([id]) => id);

function setFinding(s: FindingState, id: string, e: FindingEntry): void {
  const cur = s.get(id);
  if (cur) {
    if (e.source !== 'staff' && cur.source === 'staff') return;
    if (e.status !== 'present' && cur.status === 'present' && e.source !== 'staff') return;
  }
  s.set(id, e);
  if (e.status === 'present') {
    for (const i of findingById(id)?.implies ?? []) {
      if (!isPresent(s, i)) setFinding(s, i, { ...e, source: e.source === 'staff' ? 'staff' : 'implied' });
    }
  }
}

/**
 * 1問の回答を所見に反映する。
 * shown は画面に出した選択肢（回答済みで隠した選択肢は含めない）。inferAbsent なら選ばなかった選択肢の所見を absent にする。
 */
export function applyAnswer(s: FindingState, q: Question, shown: Option[], ids: string[], opts: { source?: FindingSource; inferAbsent?: boolean } = {}): void {
  const source = opts.source ?? 'patient';
  const chosen = new Set(ids);
  const picked = shown.filter((o) => chosen.has(o.id));
  if (!picked.length) return;
  const base = { source, question: q.id, section: q.section };
  const ex = picked.find((o) => o.exclusive);
  if (ex) {
    const status: FindingStatus = ex.exclusive === 'none' ? 'absent' : ex.exclusive === 'unknown' ? 'unknown' : 'declined';
    for (const o of shown) for (const f of o.findings ?? []) setFinding(s, f, { status, ...base });
    return;
  }
  for (const o of picked) for (const f of o.findings ?? []) setFinding(s, f, { status: 'present', ...base });
  if (opts.inferAbsent) {
    for (const o of shown) {
      if (chosen.has(o.id) || o.exclusive) continue;
      for (const f of o.findings ?? []) setFinding(s, f, { status: 'absent', ...base });
    }
  }
}
