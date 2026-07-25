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
}

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

/** 設定の有無（値そのものは絶対に返さない）。診断表示用。 */
export function contactConfigStatus(): { kv: boolean; resend: boolean; mailFrom: string } {
  const kv =
    !!(readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL')) &&
    !!(readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN'));
  return {
    kv,
    resend: !!readEnv('RESEND_API_KEY'),
    mailFrom: readEnv('MAIL_FROM') ?? 'ex Labs 予約窓口 <no-reply@kabuexlabs.com>（既定値）',
  };
}

/**
 * Resend へ実際にテスト送信し、生のステータスとエラー本文を返す。
 * 「キー切れ」「ドメイン未認証」等、失敗理由をそのまま可視化する。
 * 管理ページ（合言葉認証済み）からのみ呼ぶこと。
 */
export async function testResendSend(to: string): Promise<{ ok: boolean; detail: string }> {
  const apiKey = readEnv('RESEND_API_KEY');
  if (!apiKey) return { ok: false, detail: 'RESEND_API_KEY が設定されていません（Vercelの環境変数を確認）' };
  const from = readEnv('MAIL_FROM') ?? 'ex Labs 予約窓口 <no-reply@kabuexlabs.com>';
  const base = readEnv('RESEND_API_BASE') ?? 'https://api.resend.com';
  try {
    const res = await fetch(`${base}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: '【テスト】お問い合わせシステムの送信テスト',
        text: `このメールが届いていれば、お問い合わせフォームのメール通知は正常に動作しています。\n送信日時: ${new Date().toISOString()}`,
      }),
    });
    const text = (await res.text()).slice(0, 400);
    return res.ok
      ? { ok: true, detail: `送信成功（HTTP ${res.status}）。${to} の受信箱を確認してください。` }
      : { ok: false, detail: `Resend がエラーを返しました（HTTP ${res.status}）: ${text}` };
  } catch (e) {
    return { ok: false, detail: `送信リクエスト自体が失敗: ${String(e).slice(0, 300)}` };
  }
}
