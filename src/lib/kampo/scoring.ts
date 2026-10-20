// ---------------------------------------------------------------------------
// 体質スコアリング（純粋関数）。仕様書 第6節。
// 等重み（選択肢1つ＝1点、2タイプにまたがるものは0.5ずつ）。
// 表示されなかった設問（B11・B13 のスキップ）と「閉経している」を選んだ B11 は
// 理論最大点から除く。「どれもあてはまらない」は 0 点。
// ---------------------------------------------------------------------------
import { TYPES, type TypeKey, type Question } from './masters.ts';

export const DEFICIENT: TypeKey[] = ['qi_def', 'blood_def', 'yin_def', 'yang_def']; // 虚
export const EXCESS: TypeKey[] = ['qi_stag', 'blood_stasis', 'fluid', 'yang_exc']; // 実
export const HOT: TypeKey[] = ['yang_exc', 'yin_def'];
export const COLD: TypeKey[] = ['yang_def', 'qi_def', 'fluid'];

export type Level = 'balanced' | 'tendency' | 'caution' | 'strong';
export const LEVEL_LABEL: Record<Level, string> = { balanced: 'バランス', tendency: '傾向あり', caution: '注意', strong: '強い' };
export type DefExcLabel = 'def' | 'mid' | 'exc';
export type ThermalLabel = 'cold' | 'neutral' | 'hot';
export const DEF_EXC_LABEL: Record<DefExcLabel, string> = { def: '虚証寄り', mid: '虚実間', exc: '実証寄り' };
export const THERMAL_STATE_LABEL: Record<ThermalLabel, string> = { cold: '寒（冷え）寄り', neutral: '中間', hot: '熱寄り' };

/** 回答：設問ID → 選んだ選択肢ID（sub の選択肢も同じ配列に入れる） */
export type Answers = Record<string, string[]>;

export interface ScoreContext {
  sex?: string; // female / male / none
  tongueMode: 'self' | 'staff';
  /** 薬剤師が入力・上書きした舌所見（B13 の選択肢ID）。あればセルフ回答より優先 */
  tongueOverride?: string[];
}

export interface Classification {
  level: Record<TypeKey, Level>;
  mainTypes: TypeKey[];
  subTypes: TypeKey[];
  defExcIndex: number;
  defExcLabel: DefExcLabel;
  thermalIndex: number;
  thermalLabel: ThermalLabel;
  isBalanced: boolean;
}
export interface ScoreResult extends Classification {
  raw: Record<TypeKey, number>;
  max: Record<TypeKey, number>;
  pct: Record<TypeKey, number>;
}

export const zero = (): Record<TypeKey, number> => Object.fromEntries(TYPES.map((t) => [t, 0])) as Record<TypeKey, number>;
const mapTypes = <T,>(fn: (t: TypeKey) => T) => Object.fromEntries(TYPES.map((t) => [t, fn(t)])) as Record<TypeKey, T>;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** showIf による表示判定（B13 はセルフモードのみ、B11・C3 は女性のみ） */
export function isVisible(q: Question, ctx: Pick<ScoreContext, 'sex' | 'tongueMode'>): boolean {
  if (q.showIf?.sex && ctx.sex !== q.showIf.sex) return false;
  if (q.showIf?.tongueMode && ctx.tongueMode !== q.showIf.tongueMode) return false;
  return true;
}

/**
 * B13（舌）の採点に使う選択肢。
 *  - 薬剤師の所見（tongueOverride）があればモードを問わずそれを使う
 *  - スタッフモードで所見未入力なら null（max からも除く）
 *  - セルフモードなら来店客の回答
 */
export function tongueChoice(answers: Answers, ctx: ScoreContext): string[] | null {
  if (ctx.tongueOverride && ctx.tongueOverride.length) return ctx.tongueOverride;
  if (ctx.tongueMode === 'staff') return null;
  return answers['B13'] ?? [];
}

const allOptions = (q: Question) => [...q.options, ...(q.sub?.options ?? [])];
const findOption = (q: Question, id: string) => allOptions(q).find((o) => o.id === id);

/** pct から主体質・副体質・指数を決める後半部分（テスト用に分離） */
export function classify(pct: Record<TypeKey, number>): Classification {
  const level = mapTypes<Level>((t) => (pct[t] >= 60 ? 'strong' : pct[t] >= 40 ? 'caution' : pct[t] >= 20 ? 'tendency' : 'balanced'));
  const top = Math.max(...TYPES.map((t) => pct[t]));
  const isBalanced = top < 20;
  const mainTypes = isBalanced ? [] : TYPES.filter((t) => pct[t] === top);
  const subTypes = isBalanced
    ? []
    : TYPES.filter((t) => !mainTypes.includes(t) && (pct[t] >= 0.7 * top || pct[t] >= 60) && pct[t] >= 20)
        .sort((a, b) => pct[b] - pct[a])
        .slice(0, 2);
  const sum = (ks: TypeKey[]) => ks.reduce((s, k) => s + pct[k], 0);
  const idx = (pos: TypeKey[], neg: TypeKey[]) => (sum(pos) + sum(neg) === 0 ? 0 : round2((sum(pos) - sum(neg)) / (sum(pos) + sum(neg))));
  const defExcIndex = idx(EXCESS, DEFICIENT);
  const thermalIndex = idx(HOT, COLD);
  return {
    level, mainTypes, subTypes, isBalanced,
    defExcIndex, defExcLabel: defExcIndex < -0.2 ? 'def' : defExcIndex > 0.2 ? 'exc' : 'mid',
    thermalIndex, thermalLabel: thermalIndex < -0.2 ? 'cold' : thermalIndex > 0.2 ? 'hot' : 'neutral',
  };
}

export function score(answers: Answers, questions: Question[], ctx: ScoreContext): ScoreResult {
  const raw = zero();
  const max = zero();
  for (const q of questions) {
    if (!q.scored) continue;
    let chosen: string[];
    if (q.id === 'B13') {
      const c = tongueChoice(answers, ctx);
      if (c === null) continue;
      chosen = c;
    } else {
      if (!isVisible(q, ctx)) continue;
      chosen = answers[q.id] ?? [];
    }
    // 理論最大点：その問の全選択肢の重みをタイプごとに合算
    const qMax = zero();
    for (const o of allOptions(q)) for (const [t, w] of Object.entries(o.weights ?? {})) qMax[t as TypeKey] += w ?? 0;
    if (chosen.some((id) => findOption(q, id)?.flags?.includes('skip_max'))) continue; // 閉経など：この問は max に入れない
    for (const t of TYPES) max[t] += qMax[t];
    for (const id of chosen) for (const [t, w] of Object.entries(findOption(q, id)?.weights ?? {})) raw[t as TypeKey] += w ?? 0;
  }
  const pct = mapTypes((t) => (max[t] === 0 ? 0 : Math.round((100 * raw[t]) / max[t])));
  return { raw, max, pct, ...classify(pct) };
}
