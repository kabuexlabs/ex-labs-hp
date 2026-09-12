// 管理画面で確認・公開した外部サイト掲載の公演（listings）を KV に保存する。
// データファイル src/data/events/listings.ts と同じ形。/events/ は両方を合わせて表示する。
// KV 未設定なら空（保存もされない）。
import { contactRedis } from './contact';
import type { Listing } from '../data/events/types';
import { validateListings } from './events';
import { sourceSites } from '../data/events/sourceSites';

const KEY = 'events:listings';

export async function kvListListings(): Promise<Listing[]> {
  const raw = await contactRedis('HGETALL', KEY);
  if (!Array.isArray(raw)) return [];
  const out: Listing[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    try { out.push(JSON.parse(String(raw[i + 1])) as Listing); } catch { /* 壊れた行は無視 */ }
  }
  return out.sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
}

/** 公開ページ向け：検証を通った公開分だけ返す（不正な行は出さない） */
export async function kvPublishedListings(): Promise<Listing[]> {
  const all = await kvListListings();
  const siteIds = new Set(sourceSites.map((s) => s.id));
  return all.filter((l) => l.published && !l.test && validateListings([l], siteIds).length === 0);
}

export async function kvUpsertListing(l: Listing): Promise<boolean> {
  const n = await contactRedis('HSET', KEY, l.id, JSON.stringify(l));
  return n !== null;
}
export async function kvDeleteListing(id: string): Promise<boolean> {
  const n = await contactRedis('HDEL', KEY, id);
  return n !== null;
}
export async function kvGetListing(id: string): Promise<Listing | null> {
  const raw = await contactRedis('HGET', KEY, id);
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw) as Listing; } catch { return null; }
}
