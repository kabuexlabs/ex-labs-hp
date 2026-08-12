// 進捗スナップショットのサーバー送信（統計収集用）。
// progress.ts が発火する 'case:progress-changed' イベントを拾い、
// 数秒デバウンスして /api/case/track へ匿名送信する。
// 送信は fire-and-forget: 失敗・オフライン・ストレージ未設定でも
// 来場者の体験には一切影響しない（次の変更時にまた最新版が送られる）。
import type { UserProgress } from '../../types/case';
import { loadProgress, PROGRESS_CHANGED_EVENT } from './progress';

const DEVICE_KEY = 'exlabs-case-device-id';
const ENDPOINT = '/api/case/track';
const DEBOUNCE_MS = 2500;

// localStorage が使えない環境（プライベートブラウズ等）向けの
// セッション内フォールバック。
let memoryDeviceId: string | null = null;

function randomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** この端末の匿名ID。氏名等とは一切紐付かないランダム値。 */
export function getDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    if (!memoryDeviceId) memoryDeviceId = randomId();
    return memoryDeviceId;
  }
}

function buildPayload(progress: UserProgress): string {
  return JSON.stringify({
    deviceId: getDeviceId(),
    startedAt: progress.startedAt,
    ...(progress.finishedAt ? { finishedAt: progress.finishedAt } : {}),
    questions: progress.questions.map((q) => ({
      id: q.questionId,
      a: q.attempted,
      s: q.solved,
      at: q.attempts,
      h: q.hintLevel,
    })),
  });
}

function send(body: string): void {
  // ページ離脱時にも届くよう sendBeacon を優先。content-type は付けず、
  // サーバー側は本文だけを見て JSON として解釈する。
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
  } catch {
    /* fall through to fetch */
  }
  fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => {
    /* 統計は best-effort。失敗しても無視 */
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

function flush(): void {
  if (!dirty) return;
  dirty = false;
  clearTimeout(timer);
  send(buildPayload(loadProgress()));
}

function schedule(): void {
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

/**
 * 匿名IDを新しく振り直す（リピーターの再スタート用）。
 * 前回の記録はサーバーに残したまま、新しい調査は別の参加者として
 * 集計される — 消してしまうと前回の来場が統計から消えてしまうため。
 */
export function rotateDeviceId(): void {
  const id = randomId();
  try {
    window.localStorage.setItem(DEVICE_KEY, id);
  } catch {
    memoryDeviceId = id;
  }
}

/** この端末のサーバー側記録を削除する（開発用リセットと合わせて使う）。 */
export function resetRemoteRecord(): void {
  dirty = false;
  clearTimeout(timer);
  send(JSON.stringify({ deviceId: getDeviceId(), reset: true }));
}

let initialized = false;

/**
 * 統計送信の初期化。CaseLayout から全ページで呼ばれる。
 * 進捗変更イベントを購読し、ページ離脱時には未送信分を即時送信する。
 */
export function initCaseSync(): void {
  if (initialized) return;
  initialized = true;
  window.addEventListener(PROGRESS_CHANGED_EVENT, schedule);
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
