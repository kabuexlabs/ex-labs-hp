// ---------------------------------------------------------------------------
// 設問フロー（純粋関数）：表示する設問の決定・1問ごとの回答の正規化・必須判定。
// 性別が女性以外なら B11 と C3 を、舌モードがスタッフなら B13 をスキップする。
// 主訴は「大カテゴリー → 具体的な主訴 →（複数なら）いちばん改善したい主訴 → その主訴の詳細問診」の順に出す。
// 進捗は「実際に表示される問数」で数える（主訴を選ぶと詳細問診の分だけ増える）。
// ---------------------------------------------------------------------------
import { QUESTIONS, TIPS, type Question, type TypeKey } from './masters.ts';
import { isVisible, optionVisible, visibilityContext, type Answers } from './scoring.ts';
import { chosenComplaintIds, mainComplaintId, complaintLabel, complaintInfo } from './complaints.ts';
import type { FreeTexts } from './safety.ts';

export type Sex = 'female' | 'male' | 'none';
export function sexFromAnswers(answers: Answers): Sex | undefined {
  const a1 = answers['A1']?.[0];
  return a1 === 'A1-1' ? 'female' : a1 === 'A1-2' ? 'male' : a1 === 'A1-3' ? 'none' : undefined;
}
export const AGE_BAND: Record<string, string> = { 'A2-1': '10s', 'A2-2': '20s', 'A2-3': '30s', 'A2-4': '40s', 'A2-5': '50s', 'A2-6': '60s', 'A2-7': '70s' };
export const AGE_BAND_LABEL: Record<string, string> = { '10s': '10代', '20s': '20代', '30s': '30代', '40s': '40代', '50s': '50代', '60s': '60代', '70s': '70代以上' };
export const SEX_LABEL: Record<Sex, string> = { female: '女性', male: '男性', none: '回答しない' };
export function ageBandFromAnswers(answers: Answers): string | undefined {
  const a2 = answers['A2']?.[0];
  return a2 ? AGE_BAND[a2] : undefined;
}

/** 表示する設問（順序は A1→…→D4） */
export function visibleQuestions(answers: Answers, tongueMode: 'self' | 'staff', questions: Question[] = QUESTIONS): Question[] {
  const ctx = visibilityContext(answers, sexFromAnswers(answers), tongueMode);
  return questions.filter((q) => isVisible(q, ctx));
}

/**
 * 画面に出す形の設問：
 *  - 「いちばん改善したい主訴」は、選んだ具体的な主訴を選択肢にする（同じ名前が別カテゴリーにあればカテゴリー名を添える）
 *  - 女性向けの選択肢は、性別が男性なら外す
 *  - title の {main} を、いちばん改善したい主訴の名前に置き換える
 * normalizeAnswer・isAnswered にも、この形を渡す。
 */
export function resolveQuestion(q: Question, answers: Answers, texts: FreeTexts = {}): Question {
  const sex = sexFromAnswers(answers);
  let options = q.options.filter((o) => optionVisible(o, { sex }));
  if (q.dynamic === 'complaints') {
    const ids = chosenComplaintIds(answers);
    const labels = ids.map((id) => complaintLabel(id, texts));
    options = ids.map((id, i) => ({
      id,
      text: labels.filter((l) => l === labels[i]).length > 1 ? `${labels[i]}（${complaintInfo(id)?.category ?? ''}）` : labels[i],
    }));
  }
  const main = mainComplaintId(answers);
  const name = main ? complaintLabel(main, texts) : '';
  const title = q.title.replace(/「\{main\}」/g, name ? `「${name}」` : 'その症状').replace(/\{main\}/g, name || 'その症状');
  return { ...q, title, options };
}

export interface Normalized { ids: string[]; texts: FreeTexts }

/**
 * フォームから来た選択肢IDを設問の定義に合わせて整える。
 *  - 存在しないIDは捨てる。single は本体1つ＋sub1つまで。
 *  - 「どれもあてはまらない」(none) が入っていれば本体はそれだけにする。
 *  - max を超えた分は切る。
 *  - 自由記入は、選ばれた選択肢に freeText があるものだけ残す。text 型は設問IDで保存。
 */
export function normalizeAnswer(q: Question, rawIds: string[], rawTexts: FreeTexts): Normalized {
  const texts: FreeTexts = {};
  if (q.type === 'text') {
    const t = (rawTexts[q.id] ?? '').trim().slice(0, 500);
    if (t) texts[q.id] = t;
    return { ids: [], texts };
  }
  const mainIds = q.options.map((o) => o.id);
  const subIds = q.sub?.options.map((o) => o.id) ?? [];
  const uniq = [...new Set(rawIds)];
  let main = uniq.filter((id) => mainIds.includes(id));
  let sub = uniq.filter((id) => subIds.includes(id));
  if (q.type === 'single') main = main.slice(0, 1);
  const noneId = q.options.find((o) => o.flags?.includes('none'))?.id;
  if (noneId && main.includes(noneId)) main = [noneId];
  if (q.max && main.length > q.max) main = main.slice(0, q.max);
  sub = sub.slice(0, 1);
  for (const id of main) {
    const o = q.options.find((x) => x.id === id);
    if (o?.freeText) {
      const t = (rawTexts[id] ?? '').trim().slice(0, 300);
      if (t) texts[id] = t;
    }
  }
  return { ids: [...main, ...sub], texts };
}

/** 必須が満たされているか（C5 だけ任意） */
export function isAnswered(q: Question, ids: string[] | undefined, texts: FreeTexts): boolean {
  if (q.type === 'text') return !!q.optional || !!(texts[q.id] ?? '').trim();
  if (!ids || ids.length === 0) return false;
  const mainIds = q.options.map((o) => o.id);
  const hasMain = ids.some((id) => mainIds.includes(id));
  if (!hasMain) return false;
  if (q.sub) {
    const subIds = q.sub.options.map((o) => o.id);
    if (!ids.some((id) => subIds.includes(id))) return false;
  }
  return true;
}

/** 最初の未回答設問の step（1始まり）。全問回答済みなら visible.length + 1 */
export function firstUnansweredStep(visible: Question[], answers: Answers, texts: FreeTexts): number {
  for (let i = 0; i < visible.length; i++) {
    if (!isAnswered(resolveQuestion(visible[i], answers, texts), answers[visible[i].id], texts)) return i + 1;
  }
  return visible.length + 1;
}

/** 生活習慣（D）の回答に応じた「あなたへの一言」 */
export function personalTips(answers: Answers, type: TypeKey): string[] {
  const chosen = new Set(Object.values(answers).flat());
  return TIPS.filter((t) => t.types.includes(type) && chosen.has(t.when)).map((t) => t.text);
}
