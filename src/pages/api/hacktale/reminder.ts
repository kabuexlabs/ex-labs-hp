export const prerender = false;

// HACKTALE 公演予約のリマインド送信エンドポイント。
// vercel.json の crons 設定で毎日 0:10 UTC（= 日本時間 9:10）に呼ばれ、
// 「開始まで settings.reminderHours 時間以内（既定36時間＝実質前日朝）」の
// 公演の確定予約にリマインドメールを送る。remindedAt / reminderSkipped を
// 見るので、同じ予約に二度送ることはない（冪等）。
// 送信の有効・無効とタイミングは /hacktale/admin/ の設定で変えられる。
// サイトを誰も開いていなくても Vercel Cron が自動で実行する。
import type { APIRoute } from 'astro';
import { checkCronSecret, sendMail, adminEmail } from '../../../lib/yoyaku';
import {
  isKvConfigured,
  getSettings,
  getSessions,
  getWorks,
  remindSession,
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
  if (!settings.reminderEnabled) {
    return new Response(JSON.stringify({ enabled: false, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = jstNow();
  const works = new Map((await getWorks()).map((w) => [w.id, w]));
  const sessions = (await getSessions()).filter(
    (s) => s.status !== 'cancelled' && s.start > now && hoursUntil(s.start, now) <= settings.reminderHours,
  );

  let due = 0;
  let sent = 0;
  let failed = 0;
  const lines: string[] = [];
  for (const s of sessions) {
    const r = await remindSession(works, s.id, settings);
    due += r.due;
    sent += r.sent;
    failed += r.failed;
    lines.push(...r.lines);
  }

  // 管理者にも予定をまとめて知らせる（対象があった日だけ）
  if (due > 0) {
    await sendMail(
      adminEmail(),
      `【HACKTALE予約】リマインド送信 ${sent}/${due}件${failed > 0 ? `（失敗${failed}件）` : ''}`,
      `直近の公演のリマインドを送信しました。\n\n${lines.join('\n')}\n\n` +
        (failed > 0
          ? '※送信に失敗した予約があります。/hacktale/admin/ の該当公演から再送してください。'
          : 'すべて送信済みです。'),
    );
  }

  return new Response(JSON.stringify({ now, sessions: sessions.length, due, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
