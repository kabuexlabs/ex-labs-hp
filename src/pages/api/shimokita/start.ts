export const prerender = false;

// ゲーム開始。参加コード（設定されている場合のみ）を照合してプレイヤーを発行し、
// HttpOnly Cookie で以後のリクエストに紐付ける。
// 既に同じ端末に進行中のプレイヤーがいれば、新規発行せずそのまま再開させる。
import type { APIRoute } from 'astro';
import {
  isKvConfigured,
  getContent,
  createPlayer,
  checkStartCode,
} from '../../../lib/shimokita';
import { json, loadPlayer, setPlayerCookie, buildPlayerState, touchPlayer } from './_util';

export const POST: APIRoute = async (ctx) => {
  if (!isKvConfigured()) return json({ ok: false, error: 'サーバー準備中です。時間をおいてお試しください。' }, 503);

  let body: { code?: string; restart?: boolean } = {};
  try {
    body = (await ctx.request.json()) as typeof body;
  } catch {
    // 空ボディ許容
  }

  const content = await getContent();

  // 進行中プレイヤーの再開（restart 指定時は新規に作り直す）
  const existing = await loadPlayer(ctx);
  if (existing && !body.restart) {
    await touchPlayer(existing);
    return json({ resumed: true, ...buildPlayerState(content, existing) });
  }

  if (!checkStartCode(content, body.code ?? '')) {
    return json({ ok: false, error: '参加コードが違います。' }, 403);
  }

  const player = await createPlayer();
  setPlayerCookie(ctx, player.id);
  return json({ resumed: false, ...buildPlayerState(content, player) });
};
