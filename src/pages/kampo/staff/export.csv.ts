// スタッフ画面の CSV 書き出し（全セッションの一覧と回答）。middleware の kampoGuard で PIN 認証必須。
// 旧版（2026-10-24 版・取り消した v2）のセッションは再計算せず、回答を「旧版の回答」列に文言で入れる。
export const prerender = false;
import type { APIRoute } from 'astro';
import { AXES, axisName, QUESTIONS, STAFF_QUESTIONS, optionText, legacyOptionText, questionById } from '../../../lib/kampo/masters';
import { toAxis } from '../../../lib/kampo/scoring';
import { isStaffAuthed } from '../../../lib/kampo/auth';
import { mainComplaintGroup, companionComplaints } from '../../../lib/kampo/recommend';
import { computeSession, isLegacy } from '../../../lib/kampo/compute';
import { isKvConfigured, listAllSessions, audit, fmtJst, jstDate } from '../../../lib/kampo/store';

// 薬剤師が ② で入力する妊娠・授乳の補足（texts の「<キー>#staff」）
const TEXT_LABEL: Record<string, string> = { preg_weeks: '妊娠週数', preg_due: '出産予定日', lact_months: '産後の月数' };
const esc = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ cookies }) => {
  if (!isStaffAuthed(cookies)) return new Response('unauthorized', { status: 401 });
  if (!isKvConfigured()) return new Response('kv not configured', { status: 503 });
  const sessions = await listAllSessions();
  await audit('export_csv', `${sessions.length}件`);
  // 主訴の深掘り（約110問）は列にせず「主訴の詳細」1列にまとめる。主訴の選択（K_A〜K_H）も1列にまとめる
  const cols = QUESTIONS.filter((q) => q.section !== 'detail' && q.section !== 'complaint' && q.section !== 'primary');
  const header = [
    'セッションID', '開始日時', '完了日時', '状態', 'お客様', '顧客ID', '入力者', '設問版',
    '主となる体質', '併存する傾向', ...AXES.map((t) => `${axisName(t)}（暫定）`), '虚実指数', '寒熱指数',
    '薬剤師の判定:担当', '薬剤師の判定:体質', '薬剤師の判定:寒熱', '薬剤師の判定:虚実', '薬剤師の判定:漢方薬', '薬剤師の判定:メモ', '薬剤師の判定:日時', '判定記録時のAIの判定',
    '直ちに対応', '受診のおすすめ（お客様に伝えた）', '追加した薬（薬剤師）', '安全確認タグ', 'タグ・項目の確認', '安全フラグ', '記入欄', '漢方候補の表示（体調を崩した経験あり）', ...STAFF_QUESTIONS.map((q) => `薬剤師:${q.title}`),
    '担当', '提案', '渡し方', 'メモ', '提案保存日時',
    'いちばん改善したい主訴', '主訴の詳細', 'ほかの主訴（随伴症状）',
    ...cols.map((q) => `${q.id} ${q.title}`), '旧版の回答',
  ];
  const rows = sessions.map((s) => {
    const legacy = isLegacy(s);
    const c = legacy ? null : computeSession(s);
    const r = c?.scores ?? s.scores;
    const g = c ? mainComplaintGroup(c.w) : undefined;
    const ans = (qid: string) => (s.answers[qid] ?? []).map(optionText).join('｜');
    const j = s.judgment;
    return [
      s.id, fmtJst(s.startedAt), s.completedAt ? fmtJst(s.completedAt) : '', s.status, s.customerLabel, s.customerId ?? '', s.inputBy, s.questionnaireVersion,
      r ? (r.isBalanced ? 'バランス良好' : r.mainTypes.map(axisName).join('・')) : '', r ? r.subTypes.map(axisName).join('・') : '',
      ...AXES.map((t) => (r ? (Object.entries(r.pct).find(([k]) => toAxis(k) === t)?.[1] ?? '') : '')), r?.defExcIndex ?? '', r?.thermalIndex ?? '',
      j?.staffName ?? '', j ? (j.skipped ? '（記録せずに開いた）' : j.types.map(axisName).join('・')) : '', j?.thermal ?? '', j?.defExc ?? '', j?.formulas ?? '', j?.note ?? '', j ? fmtJst(j.at) : '',
      j?.ai ? `主:${j.ai.mainTypes.map(axisName).join('・') || '—'}／併存:${j.ai.subTypes.map(axisName).join('・') || '—'}／寒熱:${j.ai.thermalLabel}／虚実:${j.ai.defExcLabel}` : '',
      (c?.urgent ?? s.urgent) ? '1' : '',
      Object.entries(s.referralNotified ?? {}).map(([k, v]) => `${k.replace(/^refer:/, '')}：${v.by} ${fmtJst(v.at)}`).join('｜'),
      (s.staffMeds ?? []).map((m) => `${optionText(m.id)}：${m.name}`).join('｜'),
      (c?.tags ?? s.tags ?? []).map((t) => t.label).join('｜'),
      Object.entries(s.tagChecks ?? {}).map(([k, v]) => `${k}:${v.by}${v.note ? `（${v.note}）` : ''}`).join('｜'),
      (c?.safetyFlags ?? s.safetyFlags ?? []).map((f) => `${f.level}:${f.label}`).join('｜'),
      legacy ? '' : Object.entries(s.texts).map(([k, v]) => { const base = k.replace(/#staff$/, ''); return `${TEXT_LABEL[base] ?? questionById(base)?.id ?? optionText(base)}${k.endsWith('#staff') ? '（薬剤師が確認）' : ''}：${v}`; }).join('｜'),
      s.kampoUnlocked ? `${s.kampoUnlocked.by} ${fmtJst(s.kampoUnlocked.at)}` : '',
      ...STAFF_QUESTIONS.map((q) => (s.staffAnswers?.[q.id] ?? []).map(optionText).join('｜')),
      s.proposal?.staffName ?? '', (s.proposal?.selected ?? []).map((x) => x.name).join('・'), s.proposal?.deliveredVia ?? '', s.proposal?.note ?? '', s.proposal ? fmtJst(s.proposal.updatedAt) : '',
      g ? `${g.label}（${g.category}）` : '', g ? g.details.map((d) => d.text).join('｜') : '',
      c ? companionComplaints(c.w).map((x) => `${x.label}（${x.category}）`).join('｜') : '',
      ...cols.map((q) => (legacy ? '' : ans(q.id))),
      legacy ? Object.entries(s.answers).map(([qid, ids]) => `${qid}:${ids.map((x) => legacyOptionText(s.questionnaireVersion, x) + (s.texts[x] ? `（${s.texts[x]}）` : '')).join('・')}`).join('｜') : '',
    ].map(esc).join(',');
  });
  const csv = '﻿' + [header.map(esc).join(','), ...rows].join('\r\n') + '\r\n';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`kampo-check-${jstDate()}.csv`)}`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
    },
  });
};
