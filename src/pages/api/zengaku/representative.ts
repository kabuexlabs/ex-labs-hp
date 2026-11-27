export const prerender = false;
// 全国学生 未来視察連盟「学内代表」の応募受付（JSON）。画面は /preview/zengaku-h4tq8wnm/representative/。
import type { APIRoute } from 'astro';
import { validateRep, saveRep, mailRep, MSG, NOINDEX_HEADERS } from '../../../lib/zengaku';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...NOINDEX_HEADERS, 'Content-Type': 'application/json; charset=utf-8' } });

export const POST: APIRoute = async ({ request, url }) => {
  let body: Record<string, unknown> = {};
  try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ ok: false, message: MSG.fail }, 400); }
  if (typeof body.website === 'string' && body.website) return json({ ok: true });
  const { data, errors } = validateRep(body);
  if (Object.keys(errors).length) return json({ ok: false, errors }, 422);
  try {
    const rec = await saveRep(data);
    await mailRep(rec, url.origin).catch((e) => console.error('[zengaku] mail failed', e));
    return json({ ok: true });
  } catch (e) {
    console.error('[zengaku] save failed', e);
    return json({ ok: false, message: MSG.fail }, 503);
  }
};
