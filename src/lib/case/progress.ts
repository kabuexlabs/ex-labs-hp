// ユーザー進捗の永続化。MVP では localStorage を使うが、保存先を
// 差し替えられるよう read/write をこのモジュールに閉じ込めている。
// 将来 Supabase 等へ移行する場合は loadProgress / persist の中身を
// 置き換えるだけで、UI 側のコードは変更不要。
import type { QuestionProgress, UserProgress } from '../../types/case';

const STORAGE_KEY = 'exlabs-case-progress-v1';

// プライベートブラウズ等で localStorage が使えない環境向けの
// フォールバック（タブを閉じるまでは保持される）。
let memoryStore: string | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryStore;
  }
}

function writeRaw(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    memoryStore = value;
  }
}

function removeRaw(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  memoryStore = null;
}

function emptyProgress(): UserProgress {
  return {
    startedAt: new Date().toISOString(),
    questions: [],
  };
}

/** 保存済み進捗を読み込む。未開始なら空の進捗を返す（保存はしない）。 */
export function loadProgress(): UserProgress {
  const raw = readRaw();
  if (!raw) return emptyProgress();
  try {
    const parsed = JSON.parse(raw) as UserProgress;
    if (!parsed || !Array.isArray(parsed.questions)) return emptyProgress();
    return parsed;
  } catch {
    return emptyProgress();
  }
}

function persist(progress: UserProgress): UserProgress {
  writeRaw(JSON.stringify(progress));
  return progress;
}

/** 調査開始を記録する。既に開始済みなら何もしない。 */
export function ensureStarted(): UserProgress {
  const raw = readRaw();
  if (raw) return loadProgress();
  return persist(emptyProgress());
}

export function getQuestionProgress(
  progress: UserProgress,
  questionId: number,
): QuestionProgress | undefined {
  return progress.questions.find((p) => p.questionId === questionId);
}

function upsertQuestion(
  progress: UserProgress,
  questionId: number,
  update: (entry: QuestionProgress) => void,
): UserProgress {
  let entry = getQuestionProgress(progress, questionId);
  if (!entry) {
    entry = {
      questionId,
      attempted: false,
      solved: false,
      attempts: 0,
      hintLevel: 0,
    };
    progress.questions.push(entry);
  }
  update(entry);
  return persist(progress);
}

/** 回答1回を記録する。不正解でも attempted / attempts は更新される。 */
export function recordAttempt(
  questionId: number,
  solved: boolean,
): UserProgress {
  const progress = ensureStarted();
  return upsertQuestion(progress, questionId, (entry) => {
    entry.attempted = true;
    entry.attempts += 1;
    if (solved && !entry.solved) {
      entry.solved = true;
      entry.solvedAt = new Date().toISOString();
    }
  });
}

/** ヒント開示を記録する。既に見た段階より浅い場合は更新しない。 */
export function recordHintLevel(
  questionId: number,
  level: number,
): UserProgress {
  const progress = ensureStarted();
  return upsertQuestion(progress, questionId, (entry) => {
    entry.hintLevel = Math.max(entry.hintLevel, level);
  });
}

/** 体験終了を記録する。 */
export function finishInvestigation(): UserProgress {
  const progress = ensureStarted();
  if (!progress.finishedAt) {
    progress.finishedAt = new Date().toISOString();
  }
  return persist(progress);
}

/** 進捗をすべて破棄する（開発・運営用）。 */
export function resetProgress(): void {
  removeRaw();
}
