// 外部サイトのリンクプレビュー（OGP画像）を、SNS のリンクカードと同じ仕組みで表示するための共通処理。
// 画像はこちらで保存・加工・再配信せず、相手のサイトが og:image に指定した画像URLをそのまま <img> で読み込む（直リンク）。
// 取得先は LINK_PREVIEW_TARGETS に登録したページだけ（任意URLを取りに行く中継サーバーにしない）。
// 掲載の可否は相手先との取り決めしだい。enabled を false にすると、APIも画面も文字だけの表示に戻る。

export interface LinkPreviewTarget {
  /** リンクプレビューを出すページ（完全一致） */
  url: string;
  /** og:image として受け付ける画像のホスト（このドメインとそのサブドメインだけ） */
  imageHosts: string[];
  enabled: boolean;
}

export const LINK_PREVIEW_TARGETS: LinkPreviewTarget[] = [
  // 日本テレビ『金曜ミステリークラブ!!!』番組公式サイト
  { url: 'https://www.ntv.co.jp/friday-mystery/', imageHosts: ['ntv.co.jp'], enabled: true },
];

export function findLinkPreviewTarget(url: string): LinkPreviewTarget | undefined {
  return LINK_PREVIEW_TARGETS.find((t) => t.enabled && t.url === url);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'", '#x2F': '/', '#47': '/' };
const decode = (s: string) => s.replace(/&(#?[a-zA-Z0-9]+);/g, (m, k) => ENTITIES[k] ?? m);

export interface OgInfo {
  image?: string;
  title?: string;
  siteName?: string;
}

/** タグの属性を取り出す（"…"・'…'・引用符なしのどれでも） */
function tagAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) {
    let v = m[2] ?? m[3] ?? m[4] ?? '';
    // 引用符なしの値の直後が「/>」のとき、末尾の「/」は値ではない
    if (m[4] !== undefined && v.endsWith('/') && tag.slice((m.index ?? 0) + m[0].length).startsWith('>')) v = v.slice(0, -1);
    attrs[m[1].toLowerCase()] = v;
  }
  return attrs;
}

/** HTML に書かれた meta の property／name の一覧（原因の確認用） */
export function metaKeys(html: string): string[] {
  return (html.match(/<meta\s[^>]*>/gi) ?? []).map((t) => { const a = tagAttrs(t); return (a.property || a.name || a.itemprop || a['http-equiv'] || a.charset || '').toLowerCase(); }).filter(Boolean);
}

/**
 * 共有用に指定された画像・タイトル・サイト名を取り出す（画像URLは絶対URLにする）。
 * 画像は og:image → twitter:image → <link rel="image_src"> → 構造化データ（JSON-LD）の image の順。ページ内の普通の画像は使わない。
 */
export function extractOg(html: string, pageUrl: string): OgInfo {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attrs = tagAttrs(tag);
    const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = decode(attrs.content.trim());
  }
  let linkImage: string | undefined;
  for (const tag of html.match(/<link\s[^>]*>/gi) ?? []) {
    const a = tagAttrs(tag);
    if ((a.rel || '').toLowerCase().split(/\s+/).includes('image_src') && a.href) { linkImage = decode(a.href.trim()); break; }
  }
  let ldImage: string | undefined;
  for (const m of html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const pick = (v: unknown): string | undefined => (typeof v === 'string' ? v : Array.isArray(v) ? pick(v[0]) : v && typeof v === 'object' ? pick((v as { url?: unknown }).url) : undefined);
      const walk = (o: unknown): string | undefined => {
        if (!o || typeof o !== 'object') return undefined;
        if (Array.isArray(o)) { for (const x of o) { const r = walk(x); if (r) return r; } return undefined; }
        const rec = o as Record<string, unknown>;
        return pick(rec.image) ?? pick(rec.thumbnailUrl) ?? walk(rec['@graph']);
      };
      ldImage = walk(JSON.parse(m[1]));
      if (ldImage) break;
    } catch { /* 壊れた JSON-LD は無視 */ }
  }
  const raw = meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'] || meta['image'] || linkImage || ldImage;
  let image: string | undefined;
  if (raw) {
    try { image = new URL(raw, pageUrl).toString(); } catch { image = undefined; }
  }
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  return {
    image,
    title: meta['og:title'] || meta['twitter:title'] || (titleTag ? decode(titleTag.trim()) : undefined),
    siteName: meta['og:site_name'] || undefined,
  };
}

/** 画像URLが https で、登録したドメイン（またはそのサブドメイン）のものか */
export function isAllowedImage(image: string, hosts: string[]): boolean {
  try {
    const u = new URL(image);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return hosts.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}
