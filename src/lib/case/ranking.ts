// 探偵評価の算出。評価ロジックをこの関数に閉じ込めることで、将来
// 「回答回数・ヒント使用回数・所要時間」を加味した評価へ変更する際も
// この中だけを書き換えればよい（UI は InvestigationSummary を表示する
// だけで、算出方法を知らない）。
import type {
  DetectiveRank,
  InvestigationSummary,
  Question,
  UserProgress,
} from '../../types/case';
import { detectiveRanks } from '../../data/case/ranks';

/** 正答率 (%) からランクを引く。minScore の降順で最初に該当したもの。 */
export function rankForScore(
  score: number,
  ranks: DetectiveRank[] = detectiveRanks,
): DetectiveRank {
  const sorted = [...ranks].sort((a, b) => b.minScore - a.minScore);
  return sorted.find((r) => score >= r.minScore) ?? sorted[sorted.length - 1];
}

/**
 * 調査結果の集計と探偵ランクの算出。
 * 現状は正答率のみで評価するが、progress には attempts / hintLevel /
 * solvedAt が揃っているため、ここで自由に重み付けを追加できる。
 */
export function calculateDetectiveRank(
  progress: UserProgress,
  questions: Question[],
): InvestigationSummary {
  const totalQuestions = questions.length;
  const entries = questions.map((q) =>
    progress.questions.find((p) => p.questionId === q.id),
  );
  const solvedCount = entries.filter((p) => p?.solved).length;
  const attemptedCount = entries.filter((p) => p?.attempted).length;
  const totalAttempts = entries.reduce((sum, p) => sum + (p?.attempts ?? 0), 0);
  const totalHintLevels = entries.reduce(
    (sum, p) => sum + (p?.hintLevel ?? 0),
    0,
  );
  const accuracy =
    totalQuestions === 0
      ? 0
      : Math.round((solvedCount / totalQuestions) * 100);

  return {
    totalQuestions,
    attemptedCount,
    solvedCount,
    accuracy,
    totalAttempts,
    totalHintLevels,
    rank: rankForScore(accuracy),
  };
}
