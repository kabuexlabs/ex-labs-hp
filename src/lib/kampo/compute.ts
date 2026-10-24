// ---------------------------------------------------------------------------
// セッションの回答から、所見 → 判定 → 安全性 → 候補 → 追加質問 をまとめて計算する（保存はしない）。
// 患者の回答（walk）に薬剤師の追加質問・舌の観察（staffAnswers）を統合してから判定する。
// ---------------------------------------------------------------------------
import { VERSION, complaintById, patternName, CATEGORIES } from './masters.ts';
import { walk, applyStaffAnswers, currentKampo, adverseKampo, type WalkResult } from './flow.ts';
import { cloneState, type FindingState } from './findings.ts';
import { assess, COLD_HEAT_LABEL, DEF_EXC_LABEL, CONSISTENCY_LABEL, type Assessment } from './assess.ts';
import { sessionSafety, SAFETY_STATE_LABEL, type SessionSafety, type SafetyInput } from './safety.ts';
import { selectCandidates, selectionSummary, CLASSES, type Selection } from './recommend.ts';
import { suggestStaffQuestions, type SuggestedQuestion } from './staffq.ts';
import { readEnv, type KampoSession, type SessionSnapshot } from './store.ts';

export interface SessionResult {
  walk: WalkResult;
  /** 患者の回答だけの所見 */
  patientState: FindingState;
  /** 患者の回答＋薬剤師の確認を統合した所見（判定に使う） */
  state: FindingState;
  assessment: Assessment;
  safetyInput: SafetyInput;
  safety: SessionSafety;
  selection: Selection;
  suggestions: SuggestedQuestion[];
}

export function computeSession(s: Pick<KampoSession, 'answers' | 'tongueMode' | 'staffAnswers' | 'staffAnsweredAt' | 'adverseRecords'>): SessionResult {
  const w = walk(s.answers, s.tongueMode);
  const state = cloneState(w.state);
  applyStaffAnswers(state, s.staffAnswers, s.staffAnsweredAt);
  const c = w.primary ? complaintById(w.primary) : undefined;
  const assessment = assess(state, { primaryComplaint: w.primary, complaintQuestionIds: c ? [c.detailQuestion] : [], complaintFindings: c ? [c.finding] : [] });
  const safetyInput: SafetyInput = {
    st: state, sex: w.sex, ageBand: w.ageBand,
    current: currentKampo(s.answers, s.staffAnswers), adverse: adverseKampo(s.answers, s.staffAnswers), records: s.adverseRecords,
    pregnancyAsked: w.steps.some((x) => x.q.id === 'P4') || !!s.staffAnswers?.['X_preg']?.length,
  };
  const safety = sessionSafety(safetyInput);
  const selection = selectCandidates({ st: state, assessment, safety, safetyInput, complaints: w.complaints, primary: w.primary });
  const suggestions = suggestStaffQuestions({ st: state, assessment, safety, selection, staffAnswers: s.staffAnswers, tongueMode: s.tongueMode });
  return { walk: w, patientState: w.state, state, assessment, safetyInput, safety, selection, suggestions };
}

export function snapshotOf(r: SessionResult): SessionSnapshot {
  const a = r.assessment;
  return {
    version: VERSION, computedAt: new Date().toISOString(),
    primaryComplaint: r.walk.primary, complaints: r.walk.complaints,
    primaryPattern: a.primary.status === 'determined' ? { status: 'determined', id: a.primary.patternId, name: patternName(a.primary.patternId!) } : { status: 'hold' },
    patternScores: Object.fromEntries(a.patterns.map((p) => [p.id, p.score])),
    coexisting: a.coexisting.map(patternName), coldHeat: COLD_HEAT_LABEL[a.coldHeat.status], defExc: DEF_EXC_LABEL[a.defExc.status],
    zang: a.zang.status === 'possible' ? '関連の可能性あり' : '保留', consistency: CONSISTENCY_LABEL[a.consistency.status],
    emergency: r.safety.emergency.length > 0, redflags: r.safety.redflags.length, safetyState: SAFETY_STATE_LABEL[r.safety.state],
    classes: Object.fromEntries(CLASSES.map((k) => [k, r.selection.byClass[k].length])),
    candidates: selectionSummary(r.selection),
  };
}

/** 回答確認画面から送信したとき：判定の要約を保存して送信済みにする */
export function submit(s: KampoSession): KampoSession {
  s.snapshot = snapshotOf(computeSession(s));
  if (s.status === 'in_progress') {
    s.status = 'completed';
    s.completedAt = new Date().toISOString();
  }
  return s;
}

export const complaintLabel = (id: string | undefined) => {
  const c = id ? complaintById(id) : undefined;
  return c ? `${c.name}（${CATEGORIES.find((x) => x.id === c.category)?.name ?? ''}）` : '—';
};

export const supervisorName = () => readEnv('KAMPO_SUPERVISOR_NAME') ?? '';
export const supervisorBio = () => readEnv('KAMPO_SUPERVISOR_BIO') ?? '';
export const staffNames = () => (readEnv('KAMPO_STAFF_NAMES') ?? '').split(/[,、，]/).map((s) => s.trim()).filter(Boolean);
