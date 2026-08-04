export const prerender = false;

// 前日リマインドメールの送信エンドポイント。
// vercel.json の crons 設定で毎日 0:00 UTC（= 日本時間 9:00）に呼ばれ、
// すべてのイベントを横断して「翌日（JST）の予約」でまだリマインドして
// いないものにメールを送る。remindedAt を記録するので、同じ予約に二度
// 送ることはない（冪等）。CRON_SECRET を設定しておくと Vercel が
// Authorization ヘッダに付けて呼び出すため、第三者が叩けなくなる。

import type { APIRoute } from 'astro';
import {
  checkCronSecret,
  isKvConfigured,
  migrateLegacy,
  getEvents,
  getBookings,
  saveBooking,
  sendMail,
  adminEmail,
  formatSlotJa,
  jstTomorrow,
} from '../../../lib/yoyaku';

export const GET: APIRoute = async ({ request }) => {
  if (!checkCronSecret(request.headers.get('authorization'))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  if (!isKvConfigured()) {
    return new Response(JSON.stringify({ error: 'kv not configured' }), { status: 503 });
  }

  await migrateLegacy();
  const tomorrow = jstTomorrow();
  const events = await getEvents();

  let dueCount = 0;
  let sentCount = 0;
  const adminLines: string[] = [];

  for (const ev of events) {
    const bookings = await getBookings(ev.id);
    const due = [...bookings.values()].filter((b) => b.date === tomorrow && !b.remindedAt);
    dueCount += due.length;

    const notesBlock = ev.notes ? `■ ご案内\n${ev.notes}\n\n` : '';
    for (const b of due) {
      const when = formatSlotJa(b.date, b.time);
      const ok = await sendMail(
        b.email,
        '【ex Labs】明日のご予約のリマインド',
        `${b.name} 様\n\n明日のご予約のリマインドです。\n\n` +
          `■ イベント\n${ev.title}\n\n■ 日程\n${when}\n\n` +
          notesBlock +
          `ご不明な点や変更のご希望がありましたら、このメールへの返信、または ${adminEmail()} までご連絡ください。\n\n` +
          `当日はどうぞよろしくお願いいたします。\n\n株式会社 ex Labs`,
      );
      if (ok) {
        await saveBooking(ev.id, { ...b, remindedAt: new Date().toISOString() });
        sentCount++;
      }
      adminLines.push(`・${ev.title}｜${when}｜${b.name}｜${b.phone}｜${b.email}`);
    }
  }

  // 管理者にも翌日の予定をまとめて知らせる（予約がある日だけ）
  if (dueCount > 0) {
    await sendMail(
      adminEmail(),
      `【予約】明日の予約 ${dueCount}件のリマインド`,
      `明日（${tomorrow}）の予約は以下のとおりです。\n\n${adminLines.join('\n')}\n\nお客様にはリマインドメールを送信済みです。`,
    );
  }

  return new Response(JSON.stringify({ date: tomorrow, due: dueCount, sent: sentCount }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
