// お問い合わせ受付の共有ヘルパー。
// /api/contact（受付）と /contact/admin/（受信箱・診断）の両方から使う。
// メールは Resend、記録は Upstash KV — どちらも予約システムと同じ
// 無料インフラで、外部フォームサービスには依存しない。

export interface ContactRecord {
  id: string;
  subject: string;
  email: string;
  fields: string;
  ip: string;
  ua: string;
  createdAt: string;
  /** 流入元（SourceField が記録：最初のランディングページ・参照元・UTM など） */
  source?: string;
  /** 営業・スパム自動判定でフラグが立った送信 */
  spam?: boolean;
  /** 商談ステータス（管理画面で手動更新）。SEO・AI 経由の相談が有効商談になったかを追う */
  status?: InquiryStatus;
  /** ステータスのメモ（例：初回打合せ 9/12） */
  statusNote?: string;
  statusUpdatedAt?: string;
}

export type InquiryStatus = 'new' | 'replied' | 'meeting' | 'won' | 'lost' | 'spam';
export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: '未対応', replied: '返信済み', meeting: '商談中', won: '受注', lost: '失注', spam: 'スパム',
};

function readEnv(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name] ?? process.env[name];
  return v?.trim() || undefined;
}

// yoyaku.ts と同じ二系統対応の Upstash REST クライアント。
// 未設定・障害時は null を返し、呼び出し側は「その機能をスキップ」する。
export async function contactRedis(...command: string[]): Promise<unknown | null> {
  const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
  const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) return null;
  try {
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!res.ok) {
      console.error('[contact] KV request failed:', res.status);
      return null;
    }
    const data = (await res.json()) as { result?: unknown };
    return data.result ?? null;
  } catch (e) {
    console.error('[contact] KV request failed:', e);
    return null;
  }
}

export const CONTACT_LOG_KEY = 'contact:log';

// --- 管理ページのログイン総当たり対策 -----------------------------------------
// 10分間に5回失敗したIPはロックする。KV未設定時は制限なし（合言葉照合は
// タイミングセーフ比較なので、最低限の防御は残る）。

export async function loginAllowed(ip: string): Promise<boolean> {
  const n = await contactRedis('GET', `login:rl:${ip}`);
  return Number(n ?? 0) < 5;
}

export async function recordLoginFailure(ip: string): Promise<void> {
  const n = await contactRedis('INCR', `login:rl:${ip}`);
  if (n === 1) await contactRedis('EXPIRE', `login:rl:${ip}`, '600');
}

/** 受信箱：KVに保存された問い合わせを新しい順に返す。 */
export async function listInquiries(limit = 50): Promise<ContactRecord[]> {
  const raw = await contactRedis('LRANGE', CONTACT_LOG_KEY, '0', String(limit - 1));
  if (!Array.isArray(raw)) return [];
  const out: ContactRecord[] = [];
  for (const item of raw) {
    try {
      out.push(JSON.parse(String(item)) as ContactRecord);
    } catch {
      // 壊れたレコードは無視
    }
  }
  return out;
}

/** 問い合わせの商談ステータスを更新する（LRANGE で位置を探し LSET で置き換え）。 */
export async function setInquiryStatus(id: string, status: InquiryStatus, note: string): Promise<boolean> {
  const raw = await contactRedis('LRANGE', CONTACT_LOG_KEY, '0', '-1');
  if (!Array.isArray(raw)) return false;
  for (let i = 0; i < raw.length; i++) {
    let rec: ContactRecord;
    try { rec = JSON.parse(String(raw[i])) as ContactRecord; } catch { continue; }
    if (rec.id !== id) continue;
    rec.status = status;
    rec.statusNote = note.slice(0, 200);
    rec.statusUpdatedAt = new Date().toISOString();
    const r = await contactRedis('LSET', CONTACT_LOG_KEY, String(i), JSON.stringify(rec));
    return r !== null;
  }
  return false;
}

/** 設定の有無（値そのものは絶対に返さない）。診断表示用。 */
export function contactConfigStatus(): { kv: boolean; smtp: boolean; resend: boolean; mailFrom: string } {
  const kv =
    !!(readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL')) &&
    !!(readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN'));
  const smtp = !!readEnv('SMTP_USER') && !!readEnv('SMTP_PASS');
  return {
    kv,
    smtp,
    resend: !!readEnv('RESEND_API_KEY'),
    mailFrom: smtp
      ? `株式会社ex Labs <${readEnv('SMTP_USER')}>（自社メールアカウントから直送）`
      : readEnv('MAIL_FROM') ?? 'ex Labs 予約窓口 <no-reply@kabuexlabs.com>（既定値）',
  };
}

/**
 * 実際にテスト送信し、経路（自社SMTP / Resend）と生の失敗理由を返す。
 * 管理ページ（合言葉認証済み）からのみ呼ぶこと。
 */
export async function testMailSend(to: string): Promise<{ ok: boolean; detail: string }> {
  // 1) 自社SMTP（外部サービス不要の本命経路）
  if (readEnv('SMTP_USER') && readEnv('SMTP_PASS')) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const port = Number(readEnv('SMTP_PORT') ?? 465);
      const transporter = nodemailer.createTransport({
        host: readEnv('SMTP_HOST') ?? 'smtp.gmail.com',
        port,
        secure: readEnv('SMTP_SECURE') === 'false' ? false : port === 465,
        auth: { user: readEnv('SMTP_USER')!, pass: readEnv('SMTP_PASS')!.replace(/\s+/g, '') },
      });
      await transporter.sendMail({
        from: `株式会社ex Labs <${readEnv('SMTP_USER')}>`,
        to,
        subject: '【テスト】お問い合わせシステムの送信テスト',
        text: `このメールが届いていれば、お問い合わせフォームのメール通知は正常に動作しています。\n経路: 自社メール（SMTP直送）\n送信日時: ${new Date().toISOString()}`,
      });
      return { ok: true, detail: `自社メール（SMTP）で送信成功。${to} の受信箱を確認してください。` };
    } catch (e) {
      return { ok: false, detail: `SMTP送信に失敗: ${String(e).slice(0, 350)}（アプリパスワードの誤り・2段階認証未設定の可能性）` };
    }
  }
  // 2) Resend（設定されている場合のみ）
  const apiKey = readEnv('RESEND_API_KEY');
  if (!apiKey) return { ok: false, detail: 'メール送信が未設定です（下の手順で SMTP_USER / SMTP_PASS を設定してください）' };
  const from = readEnv('MAIL_FROM') ?? 'ex Labs 予約窓口 <no-reply@kabuexlabs.com>';
  const base = readEnv('RESEND_API_BASE') ?? 'https://api.resend.com';
  const post = (fromAddr: string) =>
    fetch(`${base}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromAddr,
        to: [to],
        subject: '【テスト】お問い合わせシステムの送信テスト',
        text: `このメールが届いていれば、お問い合わせフォームのメール通知は正常に動作しています。\n送信日時: ${new Date().toISOString()}`,
      }),
    });
  try {
    let res = await post(from);
    if (res.ok) return { ok: true, detail: `送信成功（HTTP ${res.status}）。${to} の受信箱（迷惑メールフォルダも）を確認してください。` };
    const text = (await res.text()).slice(0, 400);
    // 本番の sendMail と同じフォールバック：ドメイン未認証でも
    // アカウント所有者宛てなら共有差出人で届く。
    if (res.status === 403 && !from.includes('resend.dev')) {
      const res2 = await post('ex Labs <onboarding@resend.dev>');
      if (res2.ok) {
        return { ok: true, detail: `共有差出人（onboarding@resend.dev）で送信成功。ドメイン認証が完了するまでは通知メールはこの差出人から届きます。本来の差出人エラー: ${text}` };
      }
      return { ok: false, detail: `Resend がエラーを返しました（HTTP ${res.status}）: ${text}／共有差出人でも失敗（HTTP ${res2.status}）: ${(await res2.text()).slice(0, 200)}` };
    }
    return { ok: false, detail: `Resend がエラーを返しました（HTTP ${res.status}）: ${text}` };
  } catch (e) {
    return { ok: false, detail: `送信リクエスト自体が失敗: ${String(e).slice(0, 300)}` };
  }
}
