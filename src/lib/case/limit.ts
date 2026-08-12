// 体験の時間制限（開始からの経過時間ベース）。
// 判定はすべてこのモジュールに閉じ、UI 側は isExpired / remainingMs を
// 呼ぶだけにする。制限方式を変える場合（絶対日時での締切など）も
// ここだけを差し替えればよい。
//
// 注意: 判定は端末側で行うため、ブラウザのデータを消せば回避は可能。
// ネタバレ防止・体験設計のための仕組みであり、厳密なアクセス制御ではない。
import { caseConfig } from '../../data/case/config';
import type { UserProgress } from '../../types/case';

/** 期限の時刻 (ms)。制限なし・未開始の場合は null。 */
export function expiryTimeMs(progress: UserProgress): number | null {
  if (caseConfig.timeLimitHours === null) return null;
  const started = Date.parse(progress.startedAt);
  if (Number.isNaN(started)) return null;
  return started + caseConfig.timeLimitHours * 60 * 60 * 1000;
}

export function isExpired(progress: UserProgress): boolean {
  const expiry = expiryTimeMs(progress);
  return expiry !== null && Date.now() > expiry;
}

/** 期限までの残り時間 (ms)。制限なしなら null、期限切れなら 0。 */
export function remainingMs(progress: UserProgress): number | null {
  const expiry = expiryTimeMs(progress);
  if (expiry === null) return null;
  return Math.max(0, expiry - Date.now());
}

/** 残り時間の表示用文字列（例: 「4時間58分」「32分」）。 */
export function formatRemaining(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}時間${minutes > 0 ? `${minutes}分` : ''}`;
  return `${minutes}分`;
}
