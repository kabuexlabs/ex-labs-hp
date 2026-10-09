// 真凜会 会員限定書庫：scripts/karma-seal.mjs で暗号化した特典をブラウザで復号する。
// 正しいパスワードのときだけ AES-GCM の検証が通る（違えば例外）。
// 同じタブで開き直したときに再入力しなくて済むよう、導出した鍵だけを sessionStorage に置く（パスワードは保存しない）。
export type Sealed = { v: number; iter: number; salt: string; iv: string; ct: string };

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const memKey = (salt: string) => `karma-key:${salt}`;

export async function loadSealed(url: string): Promise<Sealed | null> {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    return (await r.json()) as Sealed;
  } catch {
    return null;
  }
}

export async function deriveKey(pass: string, s: Sealed): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(s.salt), iterations: s.iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt'],
  );
}

export async function openText(key: CryptoKey, s: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(s.iv) }, key, fromB64(s.ct));
  return new TextDecoder().decode(pt);
}

export async function openBin(key: CryptoKey, buf: ArrayBuffer): Promise<ArrayBuffer> {
  const u8 = new Uint8Array(buf);
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.slice(0, 12) }, key, u8.slice(12));
}

export async function rememberKey(key: CryptoKey, s: Sealed) {
  try {
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    sessionStorage.setItem(memKey(s.salt), toB64(raw));
  } catch { /* 保存できなくても閲覧はできる */ }
}

export async function recallKey(s: Sealed): Promise<CryptoKey | null> {
  try {
    const raw = sessionStorage.getItem(memKey(s.salt));
    if (!raw) return null;
    return await crypto.subtle.importKey('raw', fromB64(raw), { name: 'AES-GCM' }, true, ['decrypt']);
  } catch {
    return null;
  }
}

// パスワードフォームの共通処理。成功したら onOpen(key, text) を呼ぶ。
export function bindGate(opts: {
  sealed: Sealed;
  form: HTMLFormElement;
  input: HTMLInputElement;
  error: HTMLElement;
  onOpen: (key: CryptoKey, text: string) => void;
}) {
  const { sealed, form, input, error, onOpen } = opts;
  const tryKey = async (key: CryptoKey) => {
    const text = await openText(key, sealed);
    await rememberKey(key, sealed);
    onOpen(key, text);
  };
  recallKey(sealed).then((k) => { if (k) tryKey(k).catch(() => {}); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const btn = form.querySelector('button');
    if (btn) btn.disabled = true;
    try {
      await tryKey(await deriveKey(input.value.normalize('NFKC').trim(), sealed));
    } catch {
      error.hidden = false;
      input.select();
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}
