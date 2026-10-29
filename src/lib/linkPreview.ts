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

/** HTML の <meta property="og:*"> / <meta name="twitter:*"> から、画像・タイトル・サイト名を取り出す（画像URLは絶対URLにする） */
export function extractOg(html: string, pageUrl: string): OgInfo {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = decode(attrs.content.trim());
  }
  const raw = meta['og:image:secure_url'] || meta['og:image'] || meta['og:image:url'] || meta['twitter:image'] || meta['twitter:image:src'];
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
