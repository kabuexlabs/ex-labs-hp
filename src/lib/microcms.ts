export interface BlogPost {
  id: string;
  title: string;
  body: string;
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
  const serviceDomain = readEnv('MICROCMS_SERVICE_DOMAIN');
  const apiKey = readEnv('MICROCMS_API_KEY');
  if (!serviceDomain || !apiKey) return null;
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
  return fetch(`${base}/api/v1/${path}`, {
    headers: { 'X-MICROCMS-API-KEY': config.apiKey },
  });
}

export async function getPostList(offset = 0, limit = 12): Promise<ListResponse> {
  const res = await microcmsFetch(`${ENDPOINT}?offset=${offset}&limit=${limit}`);
  if (!res || !res.ok) return { contents: [], totalCount: 0, offset, limit };
  return res.json();
}

export async function getPost(id: string): Promise<BlogPost | null> {
  const res = await microcmsFetch(`${ENDPOINT}/${id}`);
  if (!res || !res.ok) return null;
  return res.json();
}

export function isMicrocmsConfigured(): boolean {
  return getConfig() !== null;
}
