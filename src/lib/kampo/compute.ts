// セッションの回答からスコアと安全確認フラグをまとめて計算する（保存はしない）。
import { QUESTIONS } from './masters.ts';
import { score, type ScoreResult } from './scoring.ts';
import { safetyFlags, type SafetyFlag } from './safety.ts';
import { sexFromAnswers } from './flow.ts';
import type { KampoSession } from './store.ts';

export function computeSession(s: Pick<KampoSession, 'answers' | 'texts' | 'tongueMode' | 'tongueOverride'>): { scores: ScoreResult; safetyFlags: SafetyFlag[] } {
  const scores = score(s.answers, QUESTIONS, { sex: sexFromAnswers(s.answers), tongueMode: s.tongueMode, tongueOverride: s.tongueOverride });
  return { scores, safetyFlags: safetyFlags(s.answers, s.texts, s.tongueOverride ?? []) };
}

/** 回答が終わっていればスコアを確定して completed にする（既に確定済みなら何もしない） */
export function finalize(s: KampoSession): KampoSession {
  const { scores, safetyFlags: flags } = computeSession(s);
  s.scores = scores;
  s.safetyFlags = flags;
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
export function staffNames(): string[] {
  const v = (import.meta.env as Record<string, string | undefined>).KAMPO_STAFF_NAMES ?? process.env.KAMPO_STAFF_NAMES;
  return (v ?? '').split(/[,、，]/).map((s) => s.trim()).filter(Boolean);
}
