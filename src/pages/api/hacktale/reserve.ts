export const prerender = false;

// HACKTALE 公演予約の確定エンドポイント。
// /hacktale/reservation/<sessionId>/ の確認画面から POST される。
//
// 二重送信・同時申し込みへの備え：
//   1. 確認画面ごとに冪等トークンを発行し、SET NX で最初の1回だけ通す。
//      連打・通信再試行では最初に確定した予約番号の完了画面へ流す。
//   2. 残席の確保は Lua（reserveSeats）で人数チェックと書き込みを
//      原子的に行う。残り1席への同時申し込みは片方だけが成功する。
// メール送信に失敗しても予約は保持し（confirmMailError に記録）、
// 管理画面から再送できる。
import type { APIRoute } from 'astro';
import {
  isKvConfigured,
  getSession,
  getWork,
  getSettings,
  bookedSeats,
  availability,
  reserveSeats,
  claimIdempotency,
  releaseIdempotency,
  reserveRateLimited,
  newReservationId,
  sendConfirmMail,
  hoursUntil,
  jstNow,
  type HtReservation,
} from '../../../lib/hacktaleBooking';
import { normalizePhone, validPhone, validEmail } from '../../../lib/yoyaku';

const redirect = (to: string) => new Response(null, { status: 303, headers: { Location: to } });

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const get = (k: string) => String(form.get(k) ?? '').trim();

  const sessionId = get('session').slice(0, 40);
  const formUrl = `/hacktale/reservation/${encodeURIComponent(sessionId)}/`;

  // ハニーポット：bot には成功したように見せて何も作らない
  if (get('_honey') !== '') return redirect('/hacktale/reservation/done/');

  if (!isKvConfigured()) return redirect(`${formUrl}?err=kv`);

  // --- 入力検証（サーバー側で必ずやり直す） --------------------------------
  const name = get('name').slice(0, 40);
  const email = get('email').slice(0, 254);
  const phone = normalizePhone(get('phone')).slice(0, 20);
  const xId = get('x').replace(/^@/, '').slice(0, 30);
  const note = get('note').slice(0, 500);
  const count = parseInt(get('count'), 10);
  const agree = get('agree') !== '';
  const idem = get('idem');

  if (!name || !validEmail(email) || !validPhone(phone) || !Number.isInteger(count) || count < 1 || count > 50 || !agree || !/^[0-9a-f]{32}$/.test(idem)) {
    return redirect(`${formUrl}?err=input`);
  }

  // --- 大量申し込み対策 ------------------------------------------------------
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  try {
    if (await reserveRateLimited(ip)) return redirect(`${formUrl}?err=rate`);
  } catch (e) {
    console.error('[hacktale] rate limit check failed:', e);
    return redirect(`${formUrl}?err=kv`);
  }

  try {
    const session = await getSession(sessionId);
    if (!session) return redirect('/hacktale/reservation/?err=notfound');

    // 受付状態の事前確認（満席・受付終了・中止は申し込み不可）
    const avail = availability(session, await bookedSeats(session.id));
    if (avail.state !== 'open') return redirect(`${formUrl}?err=${avail.state}`);
    if (count > avail.remaining) return redirect(`${formUrl}?err=full`);

    // --- 冪等トークン：連打・再送信は最初の予約の完了画面へ -----------------
    const reservationId = newReservationId();
    const claim = await claimIdempotency(idem, reservationId);
    if (!claim.fresh) {
      return redirect(`/hacktale/reservation/done/?no=${encodeURIComponent(claim.reservationId)}`);
    }

    // リマインド送信タイミングを過ぎてからの予約は、完了メールのみ
    // （直後にリマインドが重複しないよう最初から対象外にしておく）
    const settings = await getSettings();
    const withinWindow = hoursUntil(session.start, jstNow()) <= settings.reminderHours;

    const reservation: HtReservation = {
      id: reservationId,
      sessionId: session.id,
      name,
      email,
      phone,
      xId: xId || undefined,
      count,
      note: note || undefined,
      status: 'confirmed',
      source: 'web',
      createdAt: new Date().toISOString(),
      reminderSkipped: withinWindow ? 'リマインド設定時刻より後の予約（完了メールで案内済み）' : undefined,
    };

    // --- 残席の確保（原子的）。確定時に残席を再確認する --------------------
    const result = await reserveSeats(session, reservation);
    if (result < 0) {
      await releaseIdempotency(idem);
      return redirect(`${formUrl}?err=full`);
    }

    // --- 予約完了メール（失敗しても予約は保持し、管理画面から再送できる） ----
    const work = await getWork(session.workId);
    let mailOk = false;
    try {
      mailOk = await sendConfirmMail(work, session, reservation);
    } catch (e) {
      console.error('[hacktale] confirm mail failed:', e);
    }

    return redirect(`/hacktale/reservation/done/?no=${encodeURIComponent(reservationId)}&mail=${mailOk ? '1' : '0'}`);
  } catch (e) {
    console.error('[hacktale] reserve failed:', e);
    return redirect(`${formUrl}?err=kv`);
  }
};
