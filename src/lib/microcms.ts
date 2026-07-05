// Valid values for the optional microCMS "category" field, matching
// the LP theme keys used elsewhere on the site (tag-nazotoki etc.).
export type PostCategory = 'nazotoki' | 'murder' | 'zunou' | 'shisetsu';

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

// The rich-editor field may be called `body` or `content` depending on
// how the microCMS API schema was created; accept either and make sure
// the templates always receive strings.
function normalizePost(raw: any): BlogPost {
  return {
    ...raw,
    title: raw?.title ?? '(無題)',
    body: raw?.body ?? raw?.content ?? '',
  };
}

async function fetchList(offset: number, limit: number, category?: PostCategory) {
  const filter = category ? `&filters=category[equals]${encodeURIComponent(category)}` : '';
  const res = await microcmsFetch(`${ENDPOINT}?offset=${offset}&limit=${limit}${filter}`);
  if (!res || !res.ok) {
    if (res) console.error('[microcms] list request failed:', res.status);
    return null;
  }
  const data = await res.json();
  return { ...data, contents: (data.contents ?? []).map(normalizePost) };
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
    return normalizePost(await res.json());
  } catch (e) {
    console.error('[microcms] getPost failed:', e);
    return null;
  }
}

export function isMicrocmsConfigured(): boolean {
  return getConfig() !== null;
}
