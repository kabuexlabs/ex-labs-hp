// スタッフ画面の CSV 書き出し（全セッションの一覧と回答）。middleware の kampoGuard で PIN 認証必須。
export const prerender = false;
import type { APIRoute } from 'astro';
import { TYPES, TYPE_DEFS, QUESTIONS, optionText } from '../../../lib/kampo/masters';
import { isStaffAuthed } from '../../../lib/kampo/auth';
import { mainComplaintGroup, companionComplaints } from '../../../lib/kampo/recommend';
import { isKvConfigured, listAllSessions, audit, fmtJst, jstDate } from '../../../lib/kampo/store';

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ cookies }) => {
  if (!isStaffAuthed(cookies)) return new Response('unauthorized', { status: 401 });
  if (!isKvConfigured()) return new Response('kv not configured', { status: 503 });
  const sessions = await listAllSessions();
  await audit('export_csv', `${sessions.length}件`);
  // 主訴の詳細問診（S*。100問）は列にせず「主訴の詳細」1列にまとめる
  const cols = QUESTIONS.filter((q) => q.role !== 'detail');
  const header = [
    'セッションID', '開始日時', '完了日時', '状態', 'お客様', '顧客ID', '入力者', '舌モード', '設問版',
    '主体質', '副体質', ...TYPES.map((t) => `${TYPE_DEFS[t].name}%`), '虚実指数', '虚実', '寒熱指数', '寒熱', 'バランス良好',
    '安全フラグ', '薬剤師の舌所見', '担当', '提案', '渡し方', 'メモ', '提案保存日時',
    'いちばん改善したい主訴', '主訴の詳細', 'ほかの主訴（随伴症状）',
    ...cols.map((q) => `${q.id} ${q.title.replace(/「\{main\}」/g, '主訴')}`),
  ];
  const rows = sessions.map((s) => {
    const r = s.scores;
    const g = mainComplaintGroup(s.answers, s.texts);
    const ans = cols.map((q) => {
      if (q.type === 'text') return s.texts[q.id] ?? '';
      return (s.answers[q.id] ?? []).map((id) => optionText(id) + (s.texts[id] ? `（${s.texts[id]}）` : '')).join('｜');
    });
    return [
      s.id, fmtJst(s.startedAt), s.completedAt ? fmtJst(s.completedAt) : '', s.status, s.customerLabel, s.customerId ?? '', s.inputBy, s.tongueMode, s.questionnaireVersion,
      r ? r.mainTypes.map((t) => TYPE_DEFS[t].name).join('・') : '', r ? r.subTypes.map((t) => TYPE_DEFS[t].name).join('・') : '',
      ...TYPES.map((t) => (r ? r.pct[t] : '')), r?.defExcIndex ?? '', r?.defExcLabel ?? '', r?.thermalIndex ?? '', r?.thermalLabel ?? '', r ? (r.isBalanced ? '1' : '0') : '',
      (s.safetyFlags ?? []).map((f) => `${f.level}:${f.code}`).join('｜'), (s.tongueOverride ?? []).map(optionText).join('｜'),
      s.proposal?.staffName ?? '', (s.proposal?.selected ?? []).map((x) => x.name).join('・'), s.proposal?.deliveredVia ?? '', s.proposal?.note ?? '', s.proposal ? fmtJst(s.proposal.updatedAt) : '',
      g ? `${g.label}（${g.category}）` : '', g ? g.details.map((d) => d.text).join('｜') : '',
      companionComplaints(s.answers, s.texts).map((c) => `${c.label}（${c.category}）`).join('｜'),
      ...ans,
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
