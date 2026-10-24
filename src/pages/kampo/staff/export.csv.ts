// スタッフ画面の CSV 書き出し（全セッションの一覧・判定の要約・回答）。middleware の kampoGuard で PIN 認証必須。
// v2 のセッションは患者向けの各設問（主訴の詳細問診・安全上の確認はまとめて1列）、薬剤師の追加質問は1列にまとめる。
// v1 のセッションは回答を「v1の回答」1列にまとめる（判定は再計算しない）。
export const prerender = false;
import type { APIRoute } from 'astro';
import { QUESTIONS, STAFF_QUESTIONS, LEGACY, optionText, questionById } from '../../../lib/kampo/masters';
import { isStaffAuthed } from '../../../lib/kampo/auth';
import { walk } from '../../../lib/kampo/flow';
import { complaintLabel } from '../../../lib/kampo/compute';
import { isKvConfigured, listAllSessions, audit, fmtJst, jstDate, isV2 } from '../../../lib/kampo/store';

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ cookies }) => {
  if (!isStaffAuthed(cookies)) return new Response('unauthorized', { status: 401 });
  if (!isKvConfigured()) return new Response('kv not configured', { status: 503 });
  const sessions = await listAllSessions();
  await audit('export_csv', `${sessions.length}件`);
  const cols = QUESTIONS.filter((q) => q.section !== 'detail' && q.section !== 'redflag');
  const legacyQ = new Map(LEGACY.questions.map((q) => [q.id, q]));
  const header = [
    'セッションID', '開始日時', '送信日時', '状態', 'お客様', '顧客ID', '入力者', '舌モード', '設問版',
    '優先主訴', 'その他の主訴', '主証', '併存証', '寒熱', '虚実', '五臓', '整合性', '緊急', '受診勧奨', '安全性',
    '優先検討候補', '検討候補', '確認待ち', '除外・対象外', '候補（分類）',
    '担当', '提案', '渡し方', 'メモ', '提案保存日時',
    '主訴の詳細', '安全上の確認', ...cols.map((q) => `${q.id} ${q.title}`), '薬剤師の追加質問', '副作用歴の原因生薬の記録', 'v1の回答',
  ];
  const rows = sessions.map((s) => {
    const sn = s.snapshot;
    const v2 = isV2(s);
    const w = v2 ? walk(s.answers, s.tongueMode) : null;
    const ans = (sec: string) => (w ? w.steps.filter((x) => x.q.section === sec).map((x) => `${x.q.id}:${x.ids.map(optionText).join('・')}`).join('｜') : '');
    const cand = (sn?.candidates as { candidates?: { name: string; klass: string }[] } | undefined)?.candidates ?? [];
    return [
      s.id, fmtJst(s.startedAt), s.completedAt ? fmtJst(s.completedAt) : '', s.status, s.customerLabel, s.customerId ?? '', s.inputBy, s.tongueMode, s.questionnaireVersion,
      v2 ? complaintLabel(sn?.primaryComplaint) : '', (sn?.complaints ?? []).filter((c) => c !== sn?.primaryComplaint).map((c) => complaintLabel(c)).join('｜'),
      sn ? (sn.primaryPattern.status === 'determined' ? sn.primaryPattern.name : '保留') : '', (sn?.coexisting ?? []).join('・'), sn?.coldHeat ?? '', sn?.defExc ?? '', sn?.zang ?? '', sn?.consistency ?? '',
      sn ? (sn.emergency ? '1' : '0') : '', sn?.redflags ?? '', sn?.safetyState ?? '',
      sn?.classes.priority ?? '', sn?.classes.consider ?? '', sn?.classes.pending ?? '', sn?.classes.excluded ?? '', cand.map((c) => `${c.name}:${c.klass}`).join('｜'),
      s.proposal?.staffName ?? '', (s.proposal?.selected ?? []).map((x) => x.name).join('・'), s.proposal?.deliveredVia ?? '', s.proposal?.note ?? '', s.proposal ? fmtJst(s.proposal.updatedAt) : '',
      ans('detail'), ans('redflag'),
      ...cols.map((q) => (w ? (w.steps.find((x) => x.q.id === q.id)?.ids ?? []).map(optionText).join('｜') : '')),
      Object.entries(s.staffAnswers ?? {}).filter(([k]) => STAFF_QUESTIONS.some((q) => q.id === k)).map(([k, v]) => `${k} ${questionById(k)?.title ?? ''}：${v.map(optionText).join('・')}`).join('｜'),
      (s.adverseRecords ?? []).map((r) => `${r.formulaId}:${r.causalHerbs.join('・')}（${r.staffName} ${fmtJst(r.at)}）`).join('｜'),
      v2 ? '' : Object.entries(s.answers).map(([k, v]) => `${k}:${v.map((x) => (legacyQ.get(k)?.options[x] ?? x) + (s.texts?.[x] ? `（${s.texts[x]}）` : '')).join('・')}`).join('｜'),
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
