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

// --- 営業スパム自動判定 ------------------------------------------------------
// 実際に届いた営業メールに共通する高精度シグナルだけを見る。
// 該当しても破棄はしない（KV保存・管理者通知はそのまま）。件名に
// 【営業・スパムの疑い】を付けて仕分けし、お客様向け自動控えメールだけ止める。
// 誤判定してもメール自体は届くので、問い合わせを取りこぼす事故は起きない。
const SPAM_STRONG: RegExp[] = [
  // 被リンク・相互リンク営業（nocode-sol型）
  /相互リンク|被リンク|リンク設置|ドメインパワー|dofollow/i,
  // 日程調整URLを貼ってくる営業（Wedia型）
  /timerex\.net|youcanbook\.me|calendly\.com|meetings\.hubspot/i,
  // 営業代行・広告運用・SEO業者の定型文
  /営業代行|テレアポ|アポ(?:イント)?(?:獲得)?代行/,
  /広告運用(?:代行)?の|リスティング広告|MEO対策/,
  /SEO(?:対策|コンサル)(?:の)?(?:ご案内|ご提案|サービス)|検索順位を(?:上げ|改善)/i,
  // 一斉配信メールの常套句（通常の問い合わせには絶対に現れない）
  /配信(?:の)?(?:停止|解除)|受信を希望(?:され)?ない|一斉(?:送信|配信)/,
];
const SPAM_WEAK: RegExp[] = [
  /補助金|助成金/,
  /貴社(?:の)?(?:ホームページ|ＨＰ|HP|サイト)を拝見/i,
  /無料(?:診断|トライアル)/,
];
function spamCheck(text: string, source: string): boolean {
  const strong = SPAM_STRONG.some((re) => re.test(text));
  const weak = SPAM_WEAK.filter((re) => re.test(text)).length;
  // _source が空＝ブラウザのJSを経由していない直POSTの可能性が高い。
  // 単独では判定せず、弱シグナルと組み合わせたときだけ効かせる。
  return strong || weak >= 2 || (weak >= 1 && !source);
}
// フォーム側で使われているハニーポット名（bot はここを埋めてしまう）
const HONEYPOTS = ['_gotcha', '_honey', 'website'];
// メール本文に含めない制御用フィールド
// （_source は流入元の自動記録。管理者通知にのみ別枠で記載し、
//   お客様への控えメールには載せない）
const META = new Set(['_subject', '_next', '_template', '_captcha', '_source', ...HONEYPOTS]);

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

  const baseSubject = (get('_subject') || '【ex Labs】サイトからのお問い合わせ').slice(0, 150);
  const source = get('_source').slice(0, 1500);
  const spam = spamCheck(`${baseSubject}\n${lines.join('\n')}`, source);
  const subject = spam ? `【営業・スパムの疑い】${baseSubject}` : baseSubject;
  const record = {
    id: crypto.randomUUID(),
    subject,
    spam,
    email,
    fields: lines.join('\n\n'),
    source,
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
    (spam
      ? `※自動判定: 営業・スパムの可能性が高い送信です（送信者への自動控えメールは送っていません）。\n\n`
      : '') +
    `サイトのお問い合わせフォームから送信がありました。\n\n${record.fields}\n\n` +
    `——\n送信者メールアドレス: ${email}\n受信日時: ${record.createdAt}\n` +
    (source ? `流入元:\n${source}\n` : '') +
    `このメールに返信すると送信者宛に届きます。`;
  const mailed = await sendMail(adminEmail(), subject, body, email);

  // 送信者への自動控えメール。受付が成立した場合のみ送る。
  // 返信先は info@ なので、送信者がこのメールに返信すればそのまま届く。
  // 営業スパム判定時は送らない（営業リストに「生きているアドレス」と
  // 認識させないため。誤判定でも本人には後から手動で返信できる）。
  if (!spam && (stored || mailed)) {
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
