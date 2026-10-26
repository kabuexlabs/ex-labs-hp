// 日程調整（/yoyaku）のリマインドメールに画像を入れるための共通処理。
// Redis・メール送信には依存しない純粋な関数だけを置く（scripts/yoyaku-mail-test.mjs でテストできるように）。
//
// 仕組み：
//   ・画像はイベントごとに最大 MAX_IMAGES 枚。管理画面でアップロードする（保存は lib/yoyaku.ts）
//   ・メールには画像を「インライン添付（cid）」で埋め込む。外部URLを読み込まないので、
//     受信側の「画像を表示しますか？」の確認や、削除後に見えなくなる問題が起きない
//   ・ご案内文に [画像1]〜[画像3] と書くと、その位置に N 枚目の画像が入る。書かなかった画像は
//     ご案内文の後ろに順に入る。マーカーは予約ページ・確認メールには出さない（stripImageMarkers）
//   ・画像が1枚もないイベントは、従来どおりテキストだけのメール（HTML 部分なし）のまま

export const MAX_IMAGES = 3;
/** 1枚あたりの上限（バイト）。Upstash 無料枠のリクエスト上限（1MB）に base64 化しても収まる大きさ */
export const MAX_IMAGE_BYTES = 450 * 1024;
/** 画像を縮小して入れる幅（メールの本文幅）。Outlook など max-width を無視する環境向けに width 属性へ入れる */
export const MAIL_IMAGE_WIDTH = 520;

export type ImageType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface MailImage {
  id: string;
  /** キャプション（任意）。画像の下に表示し、alt にも使う */
  alt: string;
  type: ImageType;
  data: Buffer;
  width?: number;
  height?: number;
}

export interface ImageMeta {
  id: string;
  alt: string;
  type: ImageType;
  bytes: number;
  width?: number;
  height?: number;
}

const EXT: Record<ImageType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };
export const imageExt = (t: ImageType): string => EXT[t];

/** ファイルの先頭バイトで形式を判定する（拡張子や申告された Content-Type は信用しない。SVG・HTML などは弾く）。 */
export function sniffImage(buf: Buffer): { type: ImageType; width?: number; height?: number } | null {
  if (buf.length < 12) return null;
  // PNG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return buf.length >= 24 ? { type: 'image/png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) } : { type: 'image/png' };
  }
  // GIF
  const head6 = buf.subarray(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return { type: 'image/gif', width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  // WebP
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { type: 'image/webp', ...webpSize(buf) };
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ...jpegSize(buf) };
  return null;
}

function jpegSize(buf: Buffer): { width?: number; height?: number } {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xff) { i++; continue; }
    // SOF0〜SOF15（DHT=C4・JPG=C8・DAC=CC を除く）に高さ・幅がある
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return {};
}

function webpSize(buf: Buffer): { width?: number; height?: number } {
  const kind = buf.subarray(12, 16).toString('latin1');
  if (kind === 'VP8X' && buf.length >= 30) return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8 ' && buf.length >= 30) return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L' && buf.length >= 25) { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  return {};
}

// --- ご案内文の [画像N] マーカー ---------------------------------------------------

const toHalf = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
// [画像1] ［画像１］ 【画像1】 のゆらぎを同じものとして扱う
const markerSource = String.raw`[\[［【]\s*画像\s*([1-9１-９])\s*[\]］】]`;

/** ご案内文から [画像N] を取り除く（予約ページ・確認メール用）。マーカーだけの行は行ごと消し、空行が続かないよう整える。 */
export function stripImageMarkers(text: string): string {
  const kept: string[] = [];
  // フォームから届いたご案内文は改行が CRLF のことがあるので LF にそろえる
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const cleaned = line.replace(new RegExp(markerSource, 'g'), '');
    if (cleaned !== line && cleaned.trim() === '') continue; // マーカーだけの行は消す
    kept.push(cleaned);
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

type Piece = { kind: 'text'; text: string } | { kind: 'image'; n: number };

/** ご案内文を「文字」と「画像N」の並びに分ける。 */
export function splitNotes(notes: string): Piece[] {
  const out: Piece[] = [];
  const re = new RegExp(markerSource, 'g');
  let last = 0;
  for (let m = re.exec(notes); m; m = re.exec(notes)) {
    if (m.index > last) out.push({ kind: 'text', text: notes.slice(last, m.index) });
    out.push({ kind: 'image', n: Number(toHalf(m[1])) });
    last = m.index + m[0].length;
  }
  if (last < notes.length) out.push({ kind: 'text', text: notes.slice(last) });
  return out;
}

// --- リマインドメール本文 ------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const cidOf = (img: MailImage): string => `yoyaku-${img.id}@kabuexlabs.com`;

export interface ReminderInput {
  name: string;
  title: string;
  /** 例: 2026年11月5日(木) 14:00〜16:00 */
  when: string;
  notes?: string;
  adminMail: string;
  images: MailImage[];
}
export interface ReminderMail {
  text: string;
  /** 画像があるときだけ入る。ない場合はテキストのみのメール（従来どおり） */
  html?: string;
  /** メールに埋め込む画像（html 内の cid と対応） */
  images: MailImage[];
}

/** 前日リマインドメールの本文を作る。画像がなければ従来とまったく同じテキストになる。 */
export function buildReminderMail(i: ReminderInput): ReminderMail {
  const images = i.images.slice(0, MAX_IMAGES);
  const notes = (i.notes ?? '').replace(/\r\n?/g, '\n').trim();
  const closing = `ご不明な点や変更のご希望がありましたら、このメールへの返信、または ${i.adminMail} までご連絡ください。\n\n当日はどうぞよろしくお願いいたします。\n\n株式会社 ex Labs`;
  const head = `${i.name} 様\n\n明日のご予約のリマインドです。\n\n■ イベント\n${i.title}\n\n■ 日程\n${i.when}\n\n`;

  if (images.length === 0) {
    const clean = stripImageMarkers(notes);
    return { text: `${head}${clean ? `■ ご案内\n${clean}\n\n` : ''}${closing}`, images: [] };
  }

  // 画像あり：マーカーの位置に入れ、書かれなかった画像はご案内文の後ろに順に入れる
  const pieces = splitNotes(notes);
  const used = new Set<number>();
  const seq: Piece[] = [];
  for (const p of pieces) {
    if (p.kind === 'image') {
      if (p.n >= 1 && p.n <= images.length && !used.has(p.n)) { used.add(p.n); seq.push(p); }
    } else seq.push(p);
  }
  images.forEach((_, idx) => { if (!used.has(idx + 1)) seq.push({ kind: 'image', n: idx + 1 }); });

  // テキスト版（HTML を表示できない環境向け）：画像の位置に［画像：キャプション］を入れる
  const textNotes = seq
    .map((p) => (p.kind === 'text' ? p.text : images[p.n - 1].alt ? `\n［画像：${images[p.n - 1].alt}］\n` : '\n'))
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const text = `${head}${textNotes ? `■ ご案内\n${textNotes}\n\n` : ''}${closing}`;

  const imgHtml = (img: MailImage) => {
    const w = img.width ? Math.min(img.width, MAIL_IMAGE_WIDTH) : undefined;
    const h = img.width && img.height && w ? Math.round((img.height * w) / img.width) : undefined;
    return `<div style="margin:14px 0"><img src="cid:${cidOf(img)}" alt="${esc(img.alt)}"${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} style="display:block;max-width:100%;height:auto;border:0;border-radius:6px">${img.alt ? `<div style="font-size:12px;line-height:1.6;color:#777;margin-top:4px">${esc(img.alt)}</div>` : ''}</div>`;
  };
  const para = (t: string) => esc(t.replace(/^\n+|\n+$/g, '')).replace(/\n/g, '<br>');
  const notesHtml = seq
    .map((p) => (p.kind === 'text' ? (p.text.trim() ? `<div>${para(p.text)}</div>` : '') : imgHtml(images[p.n - 1])))
    .join('');
  const block = (label: string, body: string) => `<p style="margin:18px 0 0"><strong>■ ${label}</strong><br>${body}</p>`;
  const html =
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>` +
    `<body style="margin:0;padding:16px;background:#ffffff"><div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;font-size:15px;line-height:1.8;color:#222">` +
    `<p style="margin:0">${esc(i.name)} 様</p><p style="margin:12px 0 0">明日のご予約のリマインドです。</p>` +
    block('イベント', esc(i.title)) +
    block('日程', esc(i.when)) +
    (notesHtml ? `<p style="margin:18px 0 0"><strong>■ ご案内</strong></p>${notesHtml}` : '') +
    `<p style="margin:22px 0 0">ご不明な点や変更のご希望がありましたら、このメールへの返信、または <a href="mailto:${esc(i.adminMail)}" style="color:#0b35c8">${esc(i.adminMail)}</a> までご連絡ください。</p>` +
    `<p style="margin:12px 0 0">当日はどうぞよろしくお願いいたします。</p><p style="margin:12px 0 0">株式会社 ex Labs</p>` +
    `</div></body></html>`;
  return { text, html, images };
}
