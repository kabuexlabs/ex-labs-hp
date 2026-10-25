// ---------------------------------------------------------------------------
// 体質スコア（純粋関数）。2026-10-25 フェーズ2 の暫定版（フェーズ3 で証の判定条件に置き換える）。
// 所見ごとに草案の重み（findings.json。2026-10-24 版の選択肢の値を引き継いだもの）を使い、
//  - 同じ所見は何問で答えても1回だけ数える
//  - 同じ group（例：冷えで悪化／温めると楽になる）は、同じタイプへ1回分（group 内の最大）しか加点しない
//  - 回答済み（あり・なし）の所見だけを理論最大点に入れる。未質問・わからない・回答しないは入れない
// 主体質・副体質の区切り（20／40／60 点、最高点の0.7倍）は 2026-10-24 版のまま。出典のない暫定値で、検証前に新しく決めない。
// ---------------------------------------------------------------------------
import { TYPES, ORGANS, findingById, type TypeKey, type OrganKey } from './masters.ts';
import type { FindingState } from './findings.ts';

export const DEFICIENT: TypeKey[] = ['qi_def', 'blood_def', 'yin_def', 'yang_def']; // 虚
export const EXCESS: TypeKey[] = ['qi_stag', 'blood_stasis', 'fluid', 'yang_exc']; // 実
export const HOT: TypeKey[] = ['yang_exc', 'yin_def'];
export const COLD: TypeKey[] = ['yang_def', 'qi_def', 'fluid'];

export type Level = 'balanced' | 'tendency' | 'caution' | 'strong';
export const LEVEL_LABEL: Record<Level, string> = { balanced: 'バランス', tendency: '傾向あり', caution: '注意', strong: '強い' };
export type DefExcLabel = 'def' | 'mid' | 'exc';
export type ThermalLabel = 'cold' | 'neutral' | 'hot';
/** 熱寄りのときの熱の種類：実熱（陽盛が主）／虚熱（陰虚＝潤い不足が主） */
export type HeatKindLabel = 'excess' | 'deficient';
export const HEAT_KIND_LABEL: Record<HeatKindLabel, string> = { excess: '実熱（余分な熱）', deficient: '虚熱（潤い不足による熱）' };
export const DEF_EXC_LABEL: Record<DefExcLabel, string> = { def: '虚証寄り', mid: '虚実間', exc: '実証寄り' };
export const THERMAL_STATE_LABEL: Record<ThermalLabel, string> = { cold: '寒（冷え）寄り', neutral: '中間', hot: '熱寄り' };

export type { Answers } from './flow.ts';

export interface Classification {
  level: Record<TypeKey, Level>;
  mainTypes: TypeKey[];
  subTypes: TypeKey[];
  defExcIndex: number;
  defExcLabel: DefExcLabel;
  thermalIndex: number;
  thermalLabel: ThermalLabel;
  /** 熱寄り（thermalLabel=hot）のときの熱の種類 */
  heatKind?: HeatKindLabel;
  isBalanced: boolean;
}
export interface ScoreResult extends Classification {
  raw: Record<TypeKey, number>;
  max: Record<TypeKey, number>;
  pct: Record<TypeKey, number>;
  /** 五臓の傾向（0〜100）。所見の organs の重みで集計 */
  organRaw: Record<OrganKey, number>;
  organMax: Record<OrganKey, number>;
  organPct: Record<OrganKey, number>;
  /** タイプごとに加点した所見（薬剤師画面の根拠表示用） */
  evidence?: Record<TypeKey, string[]>;
}

export const zero = (): Record<TypeKey, number> => Object.fromEntries(TYPES.map((t) => [t, 0])) as Record<TypeKey, number>;
const mapTypes = <T,>(fn: (t: TypeKey) => T) => Object.fromEntries(TYPES.map((t) => [t, fn(t)])) as Record<TypeKey, T>;
export const zeroOrgans = (): Record<OrganKey, number> => Object.fromEntries(ORGANS.map((o) => [o, 0])) as Record<OrganKey, number>;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  const thermalLabel: ThermalLabel = thermalIndex < -0.2 ? 'cold' : thermalIndex > 0.2 ? 'hot' : 'neutral';
  return {
    level, mainTypes, subTypes, isBalanced,
    defExcIndex, defExcLabel: defExcIndex < -0.2 ? 'def' : defExcIndex > 0.2 ? 'exc' : 'mid',
    thermalIndex, thermalLabel,
    heatKind: thermalLabel === 'hot' ? (pct.yin_def > pct.yang_exc ? 'deficient' : 'excess') : undefined,
  };
}

/** 所見の状態からスコアを出す（暫定） */
export function score(state: FindingState): ScoreResult {
  // group（なければ所見ID）ごとに、タイプ別の最大値を取る
  const rawG = new Map<string, Partial<Record<TypeKey | OrganKey, number>>>();
  const maxG = new Map<string, Partial<Record<TypeKey | OrganKey, number>>>();
  const ev = new Map<string, Partial<Record<TypeKey, string>>>();
  for (const [id, e] of state) {
    if (e.status !== 'present' && e.status !== 'absent') continue;
    const f = findingById(id);
    if (!f || (!f.weights && !f.organs)) continue;
    const key = f.group ?? id;
    const mx = maxG.get(key) ?? {};
    const rw = rawG.get(key) ?? {};
    const evg = ev.get(key) ?? {};
    for (const [k, w] of [...Object.entries(f.weights ?? {}), ...Object.entries(f.organs ?? {})] as [TypeKey | OrganKey, number][]) {
      mx[k] = Math.max(mx[k] ?? 0, w);
      if (e.status === 'present' && w > (rw[k] ?? 0)) {
        rw[k] = w;
        if ((TYPES as string[]).includes(k)) evg[k as TypeKey] = f.id;
      }
    }
    maxG.set(key, mx); rawG.set(key, rw); ev.set(key, evg);
  }
  const raw = zero(); const max = zero(); const organRaw = zeroOrgans(); const organMax = zeroOrgans();
  const evidence = mapTypes<string[]>(() => []);
  for (const [key, mx] of maxG) {
    const rw = rawG.get(key) ?? {};
    for (const t of TYPES) { max[t] += mx[t] ?? 0; raw[t] += rw[t] ?? 0; }
    for (const o of ORGANS) { organMax[o] += mx[o] ?? 0; organRaw[o] += rw[o] ?? 0; }
    for (const [t, fid] of Object.entries(ev.get(key) ?? {}) as [TypeKey, string][]) evidence[t].push(fid);
  }
  const pct = mapTypes((t) => (max[t] === 0 ? 0 : Math.round((100 * raw[t]) / max[t])));
  const organPct = Object.fromEntries(ORGANS.map((k) => [k, organMax[k] === 0 ? 0 : Math.round((100 * organRaw[k]) / organMax[k])])) as Record<OrganKey, number>;
  return { raw: mapTypes((t) => round2(raw[t])), max: mapTypes((t) => round2(max[t])), pct, organRaw: roundMap(organRaw), organMax: roundMap(organMax), organPct, evidence, ...classify(pct) };
}
const roundMap = (m: Record<OrganKey, number>) => Object.fromEntries(ORGANS.map((k) => [k, round2(m[k])])) as Record<OrganKey, number>;
