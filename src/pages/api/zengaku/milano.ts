export const prerender = false;
// 全国学生 未来視察連盟「ミラノ建築短期留学ツアー」の応募受付（JSON）。画面は /preview/zengaku-h4tq8wnm/milano/。
// 締切後・入力不備・同じメールの2回目は保存しない。保存できたら自動返信を送り、完了ページ用のトークンを返す。
import type { APIRoute } from 'astro';
import { validateMilano, saveMilano, mailMilano, isClosed, MSG, NOINDEX_HEADERS } from '../../../lib/zengaku';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...NOINDEX_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });

export const POST: APIRoute = async ({ request, url }) => {
  if (isClosed()) return json({ ok: false, closed: true, message: '応募受付は終了しました' }, 403);
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ ok: false, message: MSG.fail }, 400); }
  if (typeof body.website === 'string' && body.website) return json({ ok: true, token: '' }); // ハニーポット
  const { data, errors } = validateMilano(body);
  if (Object.keys(errors).length) return json({ ok: false, errors }, 422);
  try {
    const r = await saveMilano(data);
    if (r.dup) return json({ ok: false, errors: { email: MSG.dup } }, 409);
    await mailMilano(r.rec, url.origin).catch((e) => console.error('[zengaku] mail failed', e));
    return json({ ok: true, token: r.rec.token });
  } catch (e) {
    console.error('[zengaku] save failed', e);
    return json({ ok: false, message: MSG.fail }, 503);
  }
};
