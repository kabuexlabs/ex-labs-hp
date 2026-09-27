export const prerender = false;

// HACKTALE 公演カレンダーの公開API（トップページの「現在募集中の公演」用）。
// 公演日時・作品・残席・受付状態だけを返す。予約者の情報は含めない。
// 残席は最大30秒のCDNキャッシュ（予約確定時にはサーバー側で必ず再確認する）。
import type { APIRoute } from 'astro';
import { isKvConfigured } from '../../../lib/hacktaleBooking';
import { buildCalendarData } from '../../../lib/hacktaleCalendar';

export const GET: APIRoute = async () => {
  if (!isKvConfigured()) {
    return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const data = await buildCalendarData();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (e) {
    console.error('[hacktale] calendar api failed:', e);
    return new Response(JSON.stringify({ error: 'failed' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
