export const prerender = false;

// 自前のお問い合わせ受付エンドポイント。
// Formspree / FormSubmit 等の外部フォームサービスを廃止し、既存の
// 無料インフラだけで完結させる：
//   - 通知メール: Resend（予約システムと同じ sendMail を再利用）
//   - 記録:       Upstash KV（メールが落ちても問い合わせを失わない）
// インターフェースは formsubmit 互換（_subject / _next / _gotcha）なので、
// 各サイトのフォームは action を差し替えるだけで移行できる。
import type { APIRoute } from 'astro';
import { sendMail, adminEmail } from '../../lib/yoyaku';
import { contactRedis as redis, CONTACT_LOG_KEY } from '../../lib/contact';

// リダイレクト先はサイト内パスか kabuexlabs.com のみ許可
// （open redirect 防止）。
function safeNext(raw: string | undefined): string {
  const fallback = '/contact/thanks/';
  if (!raw) return fallback;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const u = new URL(raw);
    if (u.origin === 'https://kabuexlabs.com') return u.pathname + u.search;
  } catch { /* 不正なURLはfallbackへ */ }
  return fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// フォーム側で使われているハニーポット名（bot はここを埋めてしまう）
const HONEYPOTS = ['_gotcha', '_honey', 'website'];
// メール本文に含めない制御用フィールド
const META = new Set(['_subject', '_next', '_template', '_captcha', ...HONEYPOTS]);

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const get = (k: string) => String(form.get(k) ?? '').trim();
  const next = safeNext(get('_next'));
  const redirect = () =>
    new Response(null, { status: 303, headers: { Location: next } });

  // --- スパム対策 -----------------------------------------------------------
  // ハニーポットが埋まっていたら、botに気付かれないよう成功を装って捨てる。
  if (HONEYPOTS.some((h) => get(h) !== '')) return redirect();

  // IPごとのレート制限（10分に5件まで）。KV未設定なら素通し。
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const count = await redis('INCR', `contact:rl:${ip}`);
  if (typeof count === 'number') {
    if (count === 1) await redis('EXPIRE', `contact:rl:${ip}`, '600');
    if (count > 5) return redirect(); // 静かに捨てる
  }

  // --- バリデーション --------------------------------------------------------
  const email = get('email');
  if (!EMAIL_RE.test(email) || email.length > 200) return redirect();

  // メタ以外の入力フィールドを本文に整形（フォームごとの項目差を吸収）
  const lines: string[] = [];
  let totalLen = 0;
  for (const [key, value] of form.entries()) {
    if (META.has(key) || typeof value !== 'string') continue;
    const v = value.trim();
    if (!v) continue;
    totalLen += v.length;
    lines.push(`【${key}】\n${v}`);
  }
  if (lines.length === 0 || totalLen > 8000) return redirect();

  const subject = (get('_subject') || '【ex Labs】サイトからのお問い合わせ').slice(0, 150);
  const record = {
    id: crypto.randomUUID(),
    subject,
    email,
    fields: lines.join('\n\n'),
    ip,
    ua: (request.headers.get('user-agent') ?? '').slice(0, 300),
    createdAt: new Date().toISOString(),
  };

  // --- 記録（KV）＋ 通知メール（Resend） -------------------------------------
  // どちらか片方でも成功すれば問い合わせは「受け付けた」ことにする。
  let stored = false;
  const pushed = await redis('LPUSH', CONTACT_LOG_KEY, JSON.stringify(record));
  if (pushed !== null) {
    stored = true;
    await redis('LTRIM', CONTACT_LOG_KEY, '0', '499');
  }

  const body =
    `サイトのお問い合わせフォームから送信がありました。\n\n${record.fields}\n\n` +
    `——\n送信者メールアドレス: ${email}\n受信日時: ${record.createdAt}\n` +
    `このメールに返信すると送信者宛に届きます。`;
  const mailed = await sendMail(adminEmail(), subject, body, email);

  // 送信者への自動控えメール。受付が成立した場合のみ送る。
  // 返信先は info@ なので、送信者がこのメールに返信すればそのまま届く。
  if (stored || mailed) {
    const receipt =
      `お問い合わせありがとうございます。\n以下の内容で受け付けました。\n\n` +
      `${record.fields}\n\n——\n` +
      `担当者より2営業日以内に折り返しご連絡いたします。\n` +
      `お急ぎの場合は info@kabuexlabs.com までご連絡ください。\n\n` +
      `株式会社ex Labs\nhttps://kabuexlabs.com/`;
    await sendMail(email, 'お問い合わせを受け付けました｜株式会社ex Labs', receipt);
  }

  if (!stored && !mailed) {
    // 保存もメールも失敗（KV/Resend両方の設定切れ等）。無言で捨てず、
    // 直接メールしてもらうための案内を返す。
    return new Response(
      `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>送信エラー</title><body style="font-family:sans-serif;max-width:560px;margin:80px auto;padding:0 24px;line-height:2"><h1 style="font-size:20px">送信を受け付けられませんでした</h1><p>お手数ですが <a href="mailto:info@kabuexlabs.com">info@kabuexlabs.com</a> まで直接メールでお問い合わせください。</p><p><a href="javascript:history.back()">← フォームに戻る</a></p></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  return redirect();
};

export const ALL: APIRoute = () => new Response('Method Not Allowed', { status: 405 });
