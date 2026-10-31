// セッションの回答から、所見・スコア・安全確認をまとめて計算する（保存はしない）。
import { FORMULAS, QUESTIONNAIRE } from './masters.ts';
import { walk, applyStaffAnswers, type WalkResult } from './flow.ts';
import { score, advicePlan, relatedTypeOf, type ScoreResult, type AdvicePlan } from './scoring.ts';
import { safetyFlags, safetyTags, isUrgent, type SafetyFlag, type TagHit } from './safety.ts';
import { selectFormulas, type Selection } from './recommend.ts';
import type { KampoSession } from './store.ts';

export interface Computed { w: WalkResult; scores: ScoreResult; safetyFlags: SafetyFlag[]; tags: TagHit[]; urgent: boolean }

/** 旧版（2026-10-24 版・取り消した v2）のセッションは再計算せず、保存時の内容を表示する */
export const isLegacy = (s: Pick<KampoSession, 'questionnaireVersion'>) => s.questionnaireVersion !== QUESTIONNAIRE.version;

type Inputs = Pick<KampoSession, 'answers' | 'staffAnswers' | 'texts' | 'tagChecks' | 'staffMeds'>;
const inputOf = (s: Partial<Inputs>) => ({ staffAnswers: s.staffAnswers, texts: s.texts, tagChecks: s.tagChecks, staffMeds: s.staffMeds });
export function computeSession(s: Pick<KampoSession, 'answers' | 'staffAnswers'> & Partial<Inputs>): Computed {
  const w = walk(s.answers);
  applyStaffAnswers(w.state, s.staffAnswers, s.answers);
  return { w, scores: score(w.state), safetyFlags: safetyFlags(s.answers, w, inputOf(s)), tags: safetyTags(w, s.staffAnswers, s.tagChecks), urgent: isUrgent(w) };
}
export const selectionOf = (s: Pick<KampoSession, 'answers'> & Partial<Inputs>, c: Computed): Selection =>
  selectFormulas(c.scores, s.answers, c.w, c.safetyFlags, c.tags, FORMULAS, inputOf(s));

/**
 * 漢方薬で体調を崩したことがあるとご本人が答えた方は、初期表示では漢方候補を出さない（美容商品のおすすめを出す）。
 * 薬剤師が確認して「漢方候補も表示する」に切り替えたら出す（2026-10-29 第2弾 6-4）。
 */
export const kampoHidden = (s: Pick<KampoSession, 'answers' | 'kampoUnlocked'>) => (s.answers['C3'] ?? []).includes('C3-kampo') && !s.kampoUnlocked;

/** 回答が終わっていればスコアを確定して completed にする（既に確定済みなら状態は変えない） */
export function finalize(s: KampoSession): KampoSession {
  const c = computeSession(s);
  s.scores = c.scores;
  s.safetyFlags = c.safetyFlags;
  s.tags = c.tags;
  s.urgent = c.urgent;
  if (s.status === 'in_progress') {
    s.status = 'completed';
    s.completedAt = new Date().toISOString();
  }
  return s;
}

export function supervisorName(): string {
  const v = (import.meta.env as Record<string, string | undefined>).KAMPO_SUPERVISOR_NAME ?? process.env.KAMPO_SUPERVISOR_NAME;
  return v?.trim() || '';
}
export function supervisorBio(): string {
  const v = (import.meta.env as Record<string, string | undefined>).KAMPO_SUPERVISOR_BIO ?? process.env.KAMPO_SUPERVISOR_BIO;
  return v?.trim() || '';
}

/** お客様に伝える養生の計画（主タイプ＋主訴に関係するタイプの最大2つ。第4弾 3-9）。旧版・スコアなしは null */
export function advicePlanOf(s: Pick<KampoSession, 'answers' | 'staffAnswers' | 'questionnaireVersion'> & Partial<Inputs>): AdvicePlan | null {
  if (isLegacy(s)) return null;
  const c = computeSession(s);
  return advicePlan(c.scores, relatedTypeOf(c.w.state, c.scores.mainTypes as string[]));
}
