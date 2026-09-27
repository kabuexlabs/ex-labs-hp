export const prerender = false;

// HACKTALE 公演予約の定期実行エンドポイント（毎日 0:10 UTC = 日本時間 9:10）。
//   1. リマインド: 開催決定（立卓）済みで「開始まで settings.reminderHours 時間以内
//      （既定36時間＝実質前日朝）」の公演の確定予約に送る。remindedAt /
//      reminderSkipped を見るので二重送信しない（冪等）。
//   2. 開催判断のお知らせ: 開催決定していない8日以内の公演を、予約人数と
//      最少人数つきで管理者に知らせる（流卓連絡＝前日20時・人狼定理は1週間前の判断用）。
// サイトを誰も開いていなくても Vercel Cron が自動で実行する。
import type { APIRoute } from 'astro';
import { checkCronSecret } from '../../../lib/yoyaku';
import {
  isKvConfigured,
  getSettings,
  getSessions,
  getWorks,
  remindSession,
  bookedSeatsMap,
  minPlayersOf,
  notifyAdmin,
  formatStartJa,
  hoursUntil,
  jstNow,
} from '../../../lib/hacktaleBooking';

export const GET: APIRoute = async ({ request }) => {
  if (!checkCronSecret(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  if (!isKvConfigured()) {
    return new Response(JSON.stringify({ error: 'kv not configured' }), { status: 503 });
  }

  const settings = await getSettings();
  const now = jstNow();
  const works = new Map((await getWorks()).map((w) => [w.id, w]));
  const upcoming = (await getSessions()).filter((s) => s.status !== 'cancelled' && s.status !== 'draft' && s.start > now);

  // --- 1. リマインド ------------------------------------------------------------
  let due = 0;
  let sent = 0;
  let failed = 0;
  const lines: string[] = [];
  if (settings.reminderEnabled) {
    for (const s of upcoming.filter((x) => x.go && hoursUntil(x.start, now) <= settings.reminderHours)) {
      const r = await remindSession(works, s.id, settings);
      due += r.due;
      sent += r.sent;
      failed += r.failed;
      lines.push(...r.lines);
    }
  }

  // --- 2. 開催判断が必要な公演（8日以内・未決定） ----------------------------------
  const pending = upcoming.filter((s) => !s.go && hoursUntil(s.start, now) <= 8 * 24);
  const seats = await bookedSeatsMap(pending.map((s) => s.id));
  const pendingLines = pending.map((s) => {
    const booked = seats.get(s.id) ?? 0;
    const min = minPlayersOf(s);
    const days = Math.ceil(hoursUntil(s.start, now) / 24);
    const title = works.get(s.workId)?.title ?? s.workId;
    return `・${title}｜${formatStartJa(s.start)}（あと${days}日）｜予約 ${booked}名／最少 ${min}名${booked >= min ? ' → 開催可能' : ` → あと${min - booked}名`}`;
  });

  if (due > 0 || pending.length > 0) {
    const parts: string[] = [];
    if (pending.length > 0) {
      parts.push(
        `■ まだ開催決定していない公演（8日以内）\n${pendingLines.join('\n')}\n\n` +
          '人数が揃った公演は管理画面で「開催決定」、見送る公演は「開催見送り」を押してください（見送りの連絡は前日20時頃・人狼定理は1週間前が目安）。',
      );
    }
    if (due > 0) {
      parts.push(
        `■ リマインド送信 ${sent}/${due}件\n${lines.join('\n')}` +
          (failed > 0 ? '\n※送信に失敗した予約があります。該当公演の画面から再送してください。' : ''),
      );
    }
    await notifyAdmin(
      'cron',
      `【HACKTALE予約】本日の確認${pending.length ? `（開催判断待ち ${pending.length}件）` : ''}${due ? `（リマインド ${sent}/${due}件）` : ''}`,
      `${parts.join('\n\n')}\n\n管理画面: https://kabuexlabs.com/hacktale/admin/`,
    );
  }

  return new Response(JSON.stringify({ now, due, sent, failed, pending: pending.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
