// /api/shimokita/* 共通ヘルパー。
// 先頭アンダースコアのファイルは Astro のルーティングから除外される。
import type { APIContext } from 'astro';
import {
  getPlayer,
  savePlayer,
  jstToday,
  openStoresForStep,
  effectiveRequiredVisits,
  effectiveStatus,
  STORE_STATUS_LABEL,
  type GameContent,
  type Player,
  type Step,
} from '../../../lib/shimokita';

export const PLAYER_COOKIE = 'smk_player';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export function setPlayerCookie(ctx: APIContext, playerId: string): void {
  ctx.cookies.set(PLAYER_COOKIE, playerId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30日。ページを閉じても同じ端末から再開できる（§7）
  });
}

export async function loadPlayer(ctx: APIContext): Promise<Player | null> {
  const id = ctx.cookies.get(PLAYER_COOKIE)?.value ?? '';
  if (!id) return null;
  return getPlayer(id);
}

export async function touchPlayer(player: Player): Promise<void> {
  player.lastAccessAt = new Date().toISOString();
  await savePlayer(player);
}

// ---------------------------------------------------------------------------
// プレイヤーに見せてよい情報だけを組み立てる（正答・未解放情報は絶対に含めない）
// ---------------------------------------------------------------------------

function storeView(content: GameContent, step: Step, player: Player, today: string) {
  if (!step.storePhase) return null;
  const open = openStoresForStep(step, content, today);
  const cleared = player.visited[step.id] ?? [];
  const required = effectiveRequiredVisits(step, content, today);
  return {
    prompt: step.storePhase.prompt,
    required,
    done: cleared.length,
    skipped: !!step.storePhase.skipped,
    noStoresOpen: open.length === 0,
    list: open.map((s) => ({
      id: s.id,
      name: s.name,
      image: s.image ?? null,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      description: s.description ?? '',
      hours: s.hours ?? '',
      status: effectiveStatus(s, today),
      statusLabel: STORE_STATUS_LABEL[effectiveStatus(s, today)],
      seatingAvailable: s.seatingAvailable,
      purchaseRequired: s.purchaseRequired,
      purchaseItem: s.purchaseRequired ? (s.purchaseItem ?? '') : null,
      purchasePrice: s.purchaseRequired ? (s.purchasePrice ?? null) : null,
      missionDescription: s.missionDescription,
      notes: s.notes ?? '',
      verificationType: s.verification.type,
      cleared: cleared.includes(s.id),
    })),
  };
}

/** 調査記録の「？？？（未発見）」枠：全STEPの候補店舗（重複除去）の総数を上限に。 */
function totalEvidenceSlots(content: GameContent): number {
  const ids = new Set<string>();
  for (const step of content.steps) for (const id of step.storePhase?.storeIds ?? []) ids.add(id);
  return ids.size;
}

export function buildPlayerState(content: GameContent, player: Player) {
  const today = jstToday();
  const step = player.stepIndex < content.steps.length ? content.steps[player.stepIndex] : null;
  const inStep = step && (player.phase === 'story' || player.phase === 'puzzle' || player.phase === 'stores');

  const hintsRevealed =
    inStep && step ? step.puzzle.hints.slice(0, player.hintsUsed[step.id] ?? 0) : [];

  const playMinutes = Math.max(
    0,
    Math.round(
      ((player.completedAt ? Date.parse(player.completedAt) : Date.now()) - Date.parse(player.startedAt)) / 60000,
    ),
  );
  const totalHints = Object.values(player.hintsUsed).reduce((a, b) => a + b, 0);
  const totalVisits = Object.values(player.visited).reduce((a, b) => a + b.length, 0);

  return {
    ok: true as const,
    game: { title: content.settings.title, tagline: content.settings.tagline ?? '' },
    player: {
      id: player.id,
      phase: player.phase,
      stepNumber: Math.min(player.stepIndex + 1, content.steps.length),
      stepCount: content.steps.length,
      startedAt: player.startedAt,
    },
    step:
      inStep && step
        ? {
            id: step.id,
            title: step.title,
            subtitle: step.subtitle ?? '',
            mission: step.mission,
            story: step.story,
          }
        : null,
    puzzle:
      inStep && step && (player.phase === 'puzzle' || player.phase === 'stores')
        ? {
            question: step.puzzle.question,
            image: step.puzzle.image ?? null,
            solved: player.phase === 'stores',
            hintCount: step.puzzle.hints.length,
            hintsRevealed,
          }
        : null,
    stores: step && player.phase === 'stores' ? storeView(content, step, player, today) : null,
    record: {
      items: player.evidence,
      totalSlots: totalEvidenceSlots(content),
    },
    final:
      player.phase === 'final'
        ? {
            story: content.final.story,
            questions: content.final.questions.map((q, i) => ({ index: i, question: q.question })),
          }
        : null,
    ending:
      player.phase === 'ending'
        ? {
            title: content.ending.title,
            text: content.ending.text,
            image: content.ending.image ?? null,
            stats: {
              playMinutes,
              hintsUsed: totalHints,
              storesVisited: totalVisits,
              wrongAnswers: player.wrongAnswers,
            },
          }
        : null,
  };
}
