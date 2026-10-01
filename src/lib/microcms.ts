import sanitizeHtml from 'sanitize-html';

// Valid values for the optional microCMS "category" field, matching
// the LP theme keys used elsewhere on the site (tag-nazotoki etc.).
export type PostCategory = 'nazotoki' | 'murder' | 'zunou' | 'shisetsu' | 'immersive';

export interface BlogPost {
  id: string;
  title: string;
  body: string;
  category?: PostCategory;
  eyecatch?: { url: string; width: number; height: number };
  publishedAt: string;
  revisedAt?: string;
}

interface ListResponse {
  contents: BlogPost[];
  totalCount: number;
  offset: number;
  limit: number;
}

// Vercel injects dashboard variables into process.env at runtime;
// import.meta.env covers .env files and build-time injection. Check
// both so the config works in every environment.
function readEnv(name: string): string | undefined {
  return import.meta.env[name] ?? process.env[name];
}

function getConfig() {
  const rawDomain = readEnv('MICROCMS_SERVICE_DOMAIN')?.trim();
  const apiKey = readEnv('MICROCMS_API_KEY')?.trim();
  if (!rawDomain || !apiKey) return null;
  // Accept a full URL or hostname pasted into the domain variable and
  // reduce it to the bare service ID microCMS expects.
  const serviceDomain = rawDomain
    .replace(/^https?:\/\//, '')
    .replace(/\.microcms\.io.*$/, '')
    .replace(/\/.*$/, '');
  return { serviceDomain, apiKey };
}

// The microCMS content API for blog posts. Must match the endpoint
// name configured in the microCMS admin (API設定 → エンドポイント).
const ENDPOINT = 'blogs';

async function microcmsFetch(path: string): Promise<Response | null> {
  const config = getConfig();
  if (!config) return null;
  // MICROCMS_API_BASE lets local tests point at a mock server.
  const base =
    readEnv('MICROCMS_API_BASE') || `https://${config.serviceDomain}.microcms.io`;
  // A CMS outage or a malformed env value must degrade to the empty
  // state, never crash the page.
  try {
    return await fetch(`${base}/api/v1/${path}`, {
      headers: { 'X-MICROCMS-API-KEY': config.apiKey },
    });
  } catch (e) {
    console.error('[microcms] fetch failed:', e);
    return null;
  }
}

// サイトから露出させない非公開ワード。CMS上の記事は直接編集できない
// ことがあるため、配信時にここで一括除去する：
// - タイトルに含む記事 → 記事ごと非公開（一覧から除外・記事ページは404）
// - 本文に含む記事 → 該当ブロック（段落・見出し・リスト項目・図版など）
//   を丸ごと取り除いて配信する
// CMS側の記事本文を直接修正できたら、この一覧から語を消してよい。
// 表記ゆれ（読点・空白の挿入、「で」の有無など）にも一致するよう
// 正規表現で持つ。/g 付き正規表現は lastIndex が残って test() の結果が
// ぶれるため、使うたびに生成する。
const HIDDEN_TOPIC_SOURCES = [
  '紅\\s*、?\\s*漂う\\s*街角\\s*で?',
  'Smystery',
  'スミステリー',
];
const hiddenTopicRe = () => new RegExp(HIDDEN_TOPIC_SOURCES.join('|'), 'gi');

function containsHiddenTopic(s: string | undefined | null): boolean {
  return !!s && hiddenTopicRe().test(s);
}

function isHiddenPost(post: BlogPost): boolean {
  return containsHiddenTopic(post.title);
}

// 非公開ワードを含むブロック要素を本文HTMLから取り除く。入れ子の外側
// （figure等）から順に消し、最後に素の文字列としての残存も除去する。
function scrubHiddenTopics(html: string): string {
  let out = html;
  for (const tag of ['figure', 'blockquote', 'tr', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    out = out.replace(re, (m) => (containsHiddenTopic(m) ? '' : m));
  }
  // alt属性などに語を含む単独の<img>タグ
  out = out.replace(/<img\b[^>]*>/gi, (m) => (containsHiddenTopic(m) ? '' : m));
  // 最後の保険：どんな構造に紛れていても語そのものは残さない
  out = out.replace(hiddenTopicRe(), '');
  return out;
}

// 非公開ワードの除去で本文が消え、見出しだけが残った節を補う（CMS の原稿は直接編集できないため配信時に足す）。
// 補足は自社で確認できる事実だけで書く。
const TOKYO_GUIDE_LINK = '<p><a href="/guide/immersive-tokyo/">東京で体験できるイマーシブ公演を、開催日・料金・人数で比較する →</a></p>';
const BLOG_SUPPLEMENTS: Record<string, { heading: RegExp; html: (body: string) => string }[]> = {
  // イマーシブシアター解説の旧記事：「街なか型イマーシブという選択肢」の本文が非公開ワードの除去で空になっていた（2026-10-01）
  v1czofdqf: [{
    heading: /街なか型イマーシブ/,
    html: (body) =>
      '<p>劇場の外に出て、実際の街や商業施設そのものを舞台にするイマーシブもあります。株式会社ex Labsが企画・制作した「ロスト・フレーム」は、下北沢の街に散らばった絵画を探して歩く周遊型の公演でした。「ウワサバナシ調査委員会」は、渋谷サクラステージの施設全体を調査員として巡りながら、キャストへの聞き込みで物語を追う施設一体型の公演です。</p>' +
      (/\/guide\/immersive-tokyo\//.test(body) ? '' : TOKYO_GUIDE_LINK),
  }],
};

function applySupplements(id: string | undefined, html: string): string {
  const list = id ? BLOG_SUPPLEMENTS[id] : undefined;
  if (!list) return html;
  let out = html;
  for (const sup of list) {
    const re = /<(h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let done = false;
    out = out.replace(re, (m, _tag, inner) => {
      if (done || !sup.heading.test(String(inner).replace(/<[^>]+>/g, ''))) return m;
      done = true;
      return m + sup.html(out);
    });
  }
  return out;
}

// 中身のない見出し（直後が同じか上の階層の見出し、または本文の終わり）を出さない
function dropEmptyHeadings(html: string): string {
  let out = html;
  for (let pass = 0; pass < 3; pass++) {
    out = out.replace(/<h([2-4])\b[^>]*>[\s\S]*?<\/h\1>((?:\s|<p>\s*(?:<br\s*\/?>)?\s*<\/p>)*)(?=<h([1-4])\b|$)/gi, (m, lv, _gap, nextLv) =>
      nextLv === undefined || Number(nextLv) <= Number(lv) ? '' : m);
  }
  return out;
}

// The rich-editor field may be called `body` or `content` depending on
// how the microCMS API schema was created; accept either and make sure
// the templates always receive strings.
function normalizePost(raw: any): BlogPost {
  return {
    ...raw,
    title: raw?.title ?? '(無題)',
    body: dropEmptyHeadings(applySupplements(raw?.id, scrubHiddenTopics(sanitizeBody(raw?.body ?? raw?.content ?? '')))),
  };
}

// The blog template renders `body` with set:html, so a compromised CMS
// account (or API key leak) must not be able to inject script into the
// site. Strip scripts and event handlers while keeping the rich-text
// markup microCMS produces, plus YouTube/Vimeo embeds.
function sanitizeBody(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'figure', 'figcaption', 'iframe', 'h1', 'h2']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
      iframe: ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'loading'],
      '*': ['class', 'id'],
    },
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'],
    allowedSchemes: ['https', 'http', 'mailto'],
  });
}

async function fetchList(offset: number, limit: number, category?: PostCategory) {
  const filter = category ? `&filters=category[equals]${encodeURIComponent(category)}` : '';
  const res = await microcmsFetch(`${ENDPOINT}?offset=${offset}&limit=${limit}${filter}`);
  if (!res || !res.ok) {
    if (res) console.error('[microcms] list request failed:', res.status);
    return null;
  }
  const data = await res.json();
  const all = (data.contents ?? []).map(normalizePost);
  // タイトルが非公開ワードに該当する記事は一覧・サイトマップから除外する。
  const contents = all.filter((p: BlogPost) => !isHiddenPost(p));
  const hidden = all.length - contents.length;
  return { ...data, contents, totalCount: Math.max(0, (data.totalCount ?? 0) - hidden) };
}

// `category` narrows results to one LP's theme (see PostCategory). If
// no field named "category" exists yet in microCMS, or no posts are
// tagged with it yet, this transparently falls back to the latest
// posts overall so nothing breaks before articles get categorized.
export async function getPostList(
  offset = 0,
  limit = 12,
  category?: PostCategory,
): Promise<ListResponse> {
  const empty = { contents: [], totalCount: 0, offset, limit };
  try {
    if (category) {
      const filtered = await fetchList(offset, limit, category);
      if (filtered && filtered.contents.length > 0) return filtered;
    }
    const unfiltered = await fetchList(offset, limit);
    return unfiltered ?? empty;
  } catch (e) {
    console.error('[microcms] getPostList failed:', e);
    return empty;
  }
}

export async function getPost(id: string): Promise<BlogPost | null> {
  try {
    const res = await microcmsFetch(`${ENDPOINT}/${encodeURIComponent(id)}`);
    if (!res || !res.ok) return null;
    const post = normalizePost(await res.json());
    // タイトルが非公開ワードに該当する記事は記事ページも404にする。
    return isHiddenPost(post) ? null : post;
  } catch (e) {
    console.error('[microcms] getPost failed:', e);
    return null;
  }
}

export function isMicrocmsConfigured(): boolean {
  return getConfig() !== null;
}

// Serialize an object for a JSON-LD <script> block. JSON.stringify alone
// leaves "<" intact, so a CMS-supplied string containing "</script>" could
// break out of the tag; escaping "<" closes that XSS vector.
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
