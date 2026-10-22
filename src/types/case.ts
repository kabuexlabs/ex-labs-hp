// 展示型謎解きアプリ (/case/) の型定義。
// データ層 (src/data/case) とロジック層 (src/lib/case) はこの型だけに
// 依存させ、将来 Supabase / Firebase / 独自 API へ差し替えるときは
// この型を境界として実装を入れ替えられるようにする。

export type Question = {
  id: number;
  number: number;
  title: string;
  description: string;
  /** 補足説明（任意）。問題文の下に小さく表示する。 */
  note?: string;
  /** 問題画像 (public/ 配下のパス)。無い問題もあるため optional。 */
  image?: string;
  /**
   * 問題一覧カード用のサムネイル (public/ 配下のパス)。
   * 未設定で image がある問題は image を流用し、どちらも無い場合は
   * プレースホルダー枠を表示する。
   */
  thumbnail?: string;
  /** 許容する正解のリスト。判定時に正規化して比較する。 */
  answers: string[];
  /** 段階ヒント。配列の先頭から順に開示する。 */
  hints: string[];
  /** 会場マップ上の位置 (%)。マップ画像導入後にピン配置へ使う。 */
  mapPosition?: {
    x: number;
    y: number;
  };
};

export type QuestionProgress = {
  questionId: number;
  attempted: boolean;
  solved: boolean;
  /** 回答した回数（正解した回も含む）。 */
  attempts: number;
  /** 何段階目までヒントを見たか。0 = 未使用。 */
  hintLevel: number;
  solvedAt?: string;
};

export type UserProgress = {
  startedAt: string;
  finishedAt?: string;
  questions: QuestionProgress[];
};

export type DetectiveRank = {
  /** この正答率 (%) 以上でこのランクになる。 */
  minScore: number;
  rank: string;
  title: string;
  description: string;
};

/** 結果画面・評価ロジックが使う集計値。 */
export type InvestigationSummary = {
  totalQuestions: number;
  attemptedCount: number;
  solvedCount: number;
  /** 正答率 (%) = 正解数 / 全問題数。 */
  accuracy: number;
  totalAttempts: number;
  totalHintLevels: number;
  rank: DetectiveRank;
};
