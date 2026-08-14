export const prerender = false;

// 現在の進行状況を返す。ページ再読み込み・通信断からの復帰はこれ一本で行う（§47）。
import type { APIRoute } from 'astro';
import { isKvConfigured, getContent } from '../../../lib/shimokita';
import { json, loadPlayer, buildPlayerState, touchPlayer } from './_util';

export const GET: APIRoute = async (ctx) => {
  if (!isKvConfigured()) return json({ ok: false, error: 'サーバー準備中です。' }, 503);
  const player = await loadPlayer(ctx);
  if (!player) return json({ ok: false, error: 'no_player' }, 401);
  const content = await getContent();
  await touchPlayer(player);
  return json(buildPlayerState(content, player));
};
