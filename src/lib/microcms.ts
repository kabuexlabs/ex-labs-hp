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

function getConfig() {
  const serviceDomain = import.meta.env.MICROCMS_SERVICE_DOMAIN;
  const apiKey = import.meta.env.MICROCMS_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey };
}

async function microcmsFetch(path: string): Promise<Response | null> {
  const config = getConfig();
  if (!config) return null;
  return fetch(`https://${config.serviceDomain}.microcms.io/api/v1/${path}`, {
    headers: { 'X-MICROCMS-API-KEY': config.apiKey },
  });
}

export async function getPostList(offset = 0, limit = 12): Promise<ListResponse> {
  const res = await microcmsFetch(`blog?offset=${offset}&limit=${limit}`);
  if (!res || !res.ok) return { contents: [], totalCount: 0, offset, limit };
  return res.json();
}

export async function getPost(id: string): Promise<BlogPost | null> {
  const res = await microcmsFetch(`blog/${id}`);
  if (!res || !res.ok) return null;
  return res.json();
}

export function isMicrocmsConfigured(): boolean {
  return getConfig() !== null;
}
