// 展示型謎解きアプリのイベント設定。
// 文言・終了条件・マップ画像はすべてここで差し替えられるようにし、
// UI コンポーネントへはベタ書きしない（将来の管理画面化を見据える）。
import type { Question, UserProgress } from '../../types/case';

export const caseConfig = {
  /** 英字のイベントタイトル（ヘッダーやロックアップに使用）。 */
  title: 'CASE FILE',
  /** 日本語のイベント名。 */
  subtitle: '消えた収蔵品事件',
  /** スタート画面の導入文。行ごとに配列で持つ。 */
  intro: [
    'あなたは、この街で発生している',
    '不可解な事件を調査する探偵です。',
  ],
  mission: [
    '30件の調査項目を確認し、',
    '事件の真相へ辿り着いてください。',
  ],
  /** スタート画面の注意事項。 */
  notes: [
    '会場内では周囲のお客様にご配慮ください。',
    '歩きながらのスマートフォン操作はお控えください。',
    '進捗はこの端末のブラウザに保存されます。',
  ],
  /** マップ画像 (public/ 配下)。null の間はプレースホルダーを表示。 */
  mapImage: null as string | null,
  /**
   * 体験の制限時間（時間）。「調査を開始する」を押してからこの時間を
   * 過ぎると問題の閲覧・回答がロックされる。リピーターはロック画面から
   * 新しい調査として再スタートできる（進捗はリセット）。
   * null にすると無制限。
   */
  timeLimitHours: 5 as number | null,
} as const;

/**
 * 体験終了ボタンを表示する条件。
 * 初期設定は「全問題に一度以上回答した」。イベントに応じて
 * この関数だけを差し替えれば終了条件を変更できる。
 * 例: 「20問以上正解」なら
 *   progress.questions.filter((p) => p.solved).length >= 20
 */
export function isFinishConditionMet(
  progress: UserProgress,
  questions: Question[],
): boolean {
  return questions.every(
    (q) => progress.questions.find((p) => p.questionId === q.id)?.attempted,
  );
}
