export const prerender = false;

// 前日リマインドメールの送信エンドポイント。
// vercel.json の crons 設定で毎日 0:00 UTC（= 日本時間 9:00）に呼ばれ、
// 「翌日（JST）の予約」でまだリマインドしていないものにメールを送る。
// remindedAt を記録するので、同じ予約に二度送ることはない（冪等）。
// CRON_SECRET を設定しておくと Vercel が Authorization ヘッダに付けて
// 呼び出すため、第三者が叩けなくなる。

import type { APIRoute } from 'astro';
import {
  checkCronSecret,
  isKvConfigured,
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

  const tomorrow = jstTomorrow();
  const bookings = await getBookings();
  const due = [...bookings.values()].filter((b) => b.date === tomorrow && !b.remindedAt);

  const sent: string[] = [];
  for (const b of due) {
    const when = formatSlotJa(b.date, b.time);
    const ok = await sendMail(
      b.email,
      '【ex Labs】明日のご予約のリマインド',
      `${b.name} 様\n\n明日のご予約のリマインドです。\n\n■ 日程\n${when}\n\n` +
        `ご不明な点や変更のご希望がありましたら、このメールへの返信、または ${adminEmail()} までご連絡ください。\n\n` +
        `当日はどうぞよろしくお願いいたします。\n\n株式会社 ex Labs`,
    );
    if (ok) {
      await saveBooking({ ...b, remindedAt: new Date().toISOString() });
      sent.push(b.slotId);
    }
  }

  // 管理者にも翌日の予定をまとめて知らせる（予約がある日だけ）
  if (due.length > 0) {
    const lines = due
      .map((b) => `・${formatSlotJa(b.date, b.time)}｜${b.name}｜${b.phone}｜${b.email}`)
      .join('\n');
    await sendMail(
      adminEmail(),
      `【予約】明日の予約 ${due.length}件のリマインド`,
      `明日（${tomorrow}）の予約は以下のとおりです。\n\n${lines}\n\nお客様にはリマインドメールを送信済みです。`,
    );
  }

  return new Response(JSON.stringify({ date: tomorrow, due: due.length, sent: sent.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
