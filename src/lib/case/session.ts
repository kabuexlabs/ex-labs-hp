// 調査セッションの再スタート（リピーター向け）。
// 期限切れ画面・スタート画面から呼ばれる。進捗を消して新しい調査として
// 開始し、匿名IDも振り直す — 前回の来場記録を統計に残したまま、
// 今回を新しい参加としてカウントするため。
import { ensureStarted, resetProgress } from './progress';
import { rotateDeviceId } from './sync';

export function restartInvestigation(): void {
  rotateDeviceId();
  resetProgress();
  ensureStarted();
}
