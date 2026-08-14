export const prerender = false;

// ゲーム内アクションの受け口。正誤判定はすべてここ（サーバー側）で行う（§46）。
//   read_story … ストーリー読了 → 謎解きへ
//   answer     … 謎の回答
//   hint       … 次のヒントを開示
//   visit      … 店舗ミッションのコード/キーワード照合
//   advance    … 店舗フェーズ完了後、次のSTEP/最終推理へ
//   final      … 最終推理の回答
import type { APIRoute } from 'astro';
import {
  isKvConfigured,
  getContent,
  savePlayer,
  bumpStat,
  answerMatches,
  jstToday,
  openStoresForStep,
  effectiveRequiredVisits,
  storePhaseCleared,
  advanceToNextStep,
  newId,
} from '../../../lib/shimokita';
import { json, loadPlayer, buildPlayerState } from './_util';

export const POST: APIRoute = async (ctx) => {
  if (!isKvConfigured()) return json({ ok: false, error: 'サーバー準備中です。' }, 503);

  let body: Record<string, unknown> = {};
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: '不正なリクエストです。' }, 400);
  }
  const action = String(body.action ?? '');

  const player = await loadPlayer(ctx);
  if (!player) return json({ ok: false, error: 'no_player' }, 401);
  const content = await getContent();
  const today = jstToday();
  const step = player.stepIndex < content.steps.length ? content.steps[player.stepIndex] : null;

  player.lastAccessAt = new Date().toISOString();

  // 結果に添える追加情報（正解演出・獲得証拠など）
  let extra: Record<string, unknown> = {};

  if (action === 'read_story') {
    if (player.phase === 'story') player.phase = 'puzzle';
  } else if (action === 'answer') {
    if (player.phase !== 'puzzle' || !step) return json({ ok: false, error: '現在は回答できません。' }, 409);
    const text = String(body.text ?? '');
    if (!text.trim()) return json({ ok: false, error: '答えを入力してください。' }, 400);
    if (answerMatches(text, step.puzzle.answer, step.puzzle.variations)) {
      extra = { correct: true, successText: step.puzzle.successText };
      if (step.storePhase) {
        player.phase = 'stores';
      } else {
        // 店舗フェーズのないSTEPは正解で即次へ
        advanceToNextStep(player, content);
        await bumpStat(player.phase === 'final' ? 'reach:final' : `reach:step:${player.stepIndex}`);
      }
    } else {
      player.wrongAnswers += 1;
      await bumpStat(`wrong:${step.id}`);
      extra = { correct: false, message: 'その答えではないようだ。' };
    }
  } else if (action === 'hint') {
    if ((player.phase !== 'puzzle' && player.phase !== 'stores') || !step) {
      return json({ ok: false, error: '現在ヒントは利用できません。' }, 409);
    }
    const used = player.hintsUsed[step.id] ?? 0;
    if (used < step.puzzle.hints.length) {
      player.hintsUsed[step.id] = used + 1;
      await bumpStat(`hint:${step.id}`);
    }
    extra = { hintsRevealed: step.puzzle.hints.slice(0, player.hintsUsed[step.id] ?? 0) };
  } else if (action === 'visit') {
    if (player.phase !== 'stores' || !step?.storePhase) {
      return json({ ok: false, error: '現在は店舗調査中ではありません。' }, 409);
    }
    const storeId = String(body.storeId ?? '');
    const code = String(body.code ?? '');
    const open = openStoresForStep(step, content, today);
    const store = open.find((s) => s.id === storeId);
    if (!store) return json({ ok: false, error: 'この店舗は現在利用できません。' }, 409);
    const cleared = player.visited[step.id] ?? [];
    if (cleared.includes(storeId)) {
      extra = { correct: true, already: true };
    } else if (answerMatches(code, store.verification.code)) {
      player.visited[step.id] = [...cleared, storeId];
      const evidence = {
        id: newId('ev'),
        title: store.reward.title,
        content: store.reward.content,
        image: store.reward.image,
        storeName: store.name,
        at: new Date().toISOString(),
      };
      player.evidence.push(evidence);
      await bumpStat(`visit:${store.id}`);
      extra = { correct: true, evidence };
    } else {
      await bumpStat(`wrong:visit:${store.id}`);
      extra = {
        correct: false,
        message: store.verification.type === 'code' ? '店舗コードが違うようです。' : 'そのキーワードではないようだ。',
      };
    }
  } else if (action === 'advance') {
    if (player.phase !== 'stores' || !step) return json({ ok: false, error: '現在は進行できません。' }, 409);
    // 進行不能防止（§30）：営業店舗が必要数を下回れば必要数は自動で下がり、
    // 0店舗・運営スキップ時は required=0 となりそのまま通過できる。
    if (!storePhaseCleared(player, step, content, today)) {
      const req = effectiveRequiredVisits(step, content, today);
      return json({ ok: false, error: `まだ調査が完了していません（あと${req - (player.visited[step.id] ?? []).length}か所）。` }, 409);
    }
    advanceToNextStep(player, content);
    await bumpStat(player.phase === 'final' ? 'reach:final' : `reach:step:${player.stepIndex}`);
  } else if (action === 'final') {
    if (player.phase !== 'final') return json({ ok: false, error: '最終推理はまだ解放されていません。' }, 409);
    const answers = Array.isArray(body.answers) ? body.answers.map((a) => String(a ?? '')) : [];
    const results = content.final.questions.map((q, i) => answerMatches(answers[i] ?? '', q.answer, q.variations));
    if (results.every(Boolean)) {
      player.phase = 'ending';
      player.completedAt = new Date().toISOString();
      await bumpStat('clear');
      extra = { correct: true, successText: content.final.successText };
    } else {
      player.wrongAnswers += 1;
      await bumpStat('final_wrong');
      extra = { correct: false, results, message: '推理が正しくない項目があるようだ。証拠を見返してもう一度。' };
    }
  } else {
    return json({ ok: false, error: '不明なアクションです。' }, 400);
  }

  await savePlayer(player);
  return json({ ...buildPlayerState(content, player), ...extra });
};
