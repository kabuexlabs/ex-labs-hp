// ---------------------------------------------------------------------------
// 体質スコア（純粋関数）。2026-10-25 フェーズ2 の暫定版（フェーズ3 で証の判定条件に置き換える）。
// 所見ごとに草案の重み（findings.json。2026-10-24 版の選択肢の値を引き継いだもの）を使い、
//  - 同じ所見は何問で答えても1回だけ数える
//  - 同じ group（例：冷えで悪化／温めると楽になる）は、同じタイプへ1回分（group 内の最大）しか加点しない
//  - 回答済み（あり・なし）の所見だけを理論最大点に入れる。未質問・わからない・回答しないは入れない
// 主体質・副体質の区切り（20／40／60 点、最高点の0.7倍）は 2026-10-24 版のまま。出典のない暫定値で、検証前に新しく決めない。
// 2026-10-28（修正依頼 1-1）：体質タイプは6つ（気虚・血虚・気滞・瘀血・水滞・水不足（陰虚））。冷え・熱は寒熱の軸として
// 別に点数化し（旧・陽虚／陽盛の重みをそのまま付け替えた）、主体質・副体質の候補にしない。
// 陽虚は「気虚＋冷え」、湿熱は「水滞＋熱」（両方が「傾向あり」＝20点以上）として表示だけする。
// 2026-10-29 第3弾 11-1：舌（group tongue）をご本人が鏡で見て入力した所見は、重み・理論最大点とも 0.5 倍（暫定）。
// 舌を確認しない方は舌の所見がないので、分子・分母の両方から外れる。
// ---------------------------------------------------------------------------
import { TYPES, AXES, ORGANS, findingById, type TypeKey, type AxisKey, type OrganKey } from './masters.ts';
import type { FindingState } from './findings.ts';

export const DEFICIENT: AxisKey[] = ['qi_def', 'blood_def', 'yin_def', 'cold']; // 虚
export const EXCESS: AxisKey[] = ['qi_stag', 'blood_stasis', 'fluid', 'heat']; // 実
export const HOT: AxisKey[] = ['heat', 'yin_def'];
export const COLD: AxisKey[] = ['cold', 'qi_def', 'fluid'];
/** 組み合わせの表示（独立したタイプにしない） */
export type Combo = 'yang_def' | 'damp_heat';
export const COMBO_LABEL: Record<Combo, string> = { yang_def: '気虚＋冷え（陽虚）', damp_heat: '水滞＋熱（湿熱）' };

/** ご本人が鏡で見て入力した舌の所見の重み（暫定） */
export const SELF_TONGUE_FACTOR = 0.5;

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
  /** 6タイプと寒熱（冷え・熱）の段階 */
  level: Record<AxisKey, Level>;
  mainTypes: TypeKey[];
  subTypes: TypeKey[];
  defExcIndex: number;
  defExcLabel: DefExcLabel;
  thermalIndex: number;
  thermalLabel: ThermalLabel;
  /** 熱寄り（thermalLabel=hot）のときの熱の種類 */
  heatKind?: HeatKindLabel;
  isBalanced: boolean;
  /** 気虚＋冷え（陽虚）・水滞＋熱（湿熱） */
  combos: Combo[];
}
export interface ScoreResult extends Classification {
  raw: Record<AxisKey, number>;
  max: Record<AxisKey, number>;
  pct: Record<AxisKey, number>;
  /** 五臓の傾向（0〜100）。所見の organs の重みで集計 */
  organRaw: Record<OrganKey, number>;
  organMax: Record<OrganKey, number>;
  organPct: Record<OrganKey, number>;
  /** タイプごとに加点した所見（薬剤師画面の根拠表示用） */
  evidence?: Record<AxisKey, string[]>;
}

export const zero = (): Record<AxisKey, number> => Object.fromEntries(AXES.map((t) => [t, 0])) as Record<AxisKey, number>;
const mapTypes = <T,>(fn: (t: AxisKey) => T) => Object.fromEntries(AXES.map((t) => [t, fn(t)])) as Record<AxisKey, T>;
export const zeroOrgans = (): Record<OrganKey, number> => Object.fromEntries(ORGANS.map((o) => [o, 0])) as Record<OrganKey, number>;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** pct から主体質・副体質・指数を決める後半部分（テスト用に分離） */
export function classify(pct: Record<AxisKey, number>): Classification {
  const level = mapTypes<Level>((t) => (pct[t] >= 60 ? 'strong' : pct[t] >= 40 ? 'caution' : pct[t] >= 20 ? 'tendency' : 'balanced'));
  const top = Math.max(...TYPES.map((t) => pct[t]));
  const isBalanced = top < 20;
  const mainTypes = isBalanced ? [] : TYPES.filter((t) => pct[t] === top);
  const subTypes = isBalanced
    ? []
    : TYPES.filter((t) => !mainTypes.includes(t) && (pct[t] >= 0.7 * top || pct[t] >= 60) && pct[t] >= 20)
        .sort((a, b) => pct[b] - pct[a])
        .slice(0, 2);
  const sum = (ks: AxisKey[]) => ks.reduce((s, k) => s + pct[k], 0);
  const idx = (pos: AxisKey[], neg: AxisKey[]) => (sum(pos) + sum(neg) === 0 ? 0 : round2((sum(pos) - sum(neg)) / (sum(pos) + sum(neg))));
  const defExcIndex = idx(EXCESS, DEFICIENT);
  const thermalIndex = idx(HOT, COLD);
  const thermalLabel: ThermalLabel = thermalIndex < -0.2 ? 'cold' : thermalIndex > 0.2 ? 'hot' : 'neutral';
  return {
    level, mainTypes, subTypes, isBalanced,
    defExcIndex, defExcLabel: defExcIndex < -0.2 ? 'def' : defExcIndex > 0.2 ? 'exc' : 'mid',
    thermalIndex, thermalLabel,
    heatKind: thermalLabel === 'hot' ? (pct.yin_def > pct.heat ? 'deficient' : 'excess') : undefined,
    combos: [...(pct.qi_def >= 20 && pct.cold >= 20 ? ['yang_def' as const] : []), ...(pct.fluid >= 20 && pct.heat >= 20 ? ['damp_heat' as const] : [])],
  };
}

/** 所見の状態からスコアを出す（暫定） */
export function score(state: FindingState): ScoreResult {
  // group（なければ所見ID）ごとに、タイプ別の最大値を取る
  const rawG = new Map<string, Partial<Record<AxisKey | OrganKey, number>>>();
  const maxG = new Map<string, Partial<Record<AxisKey | OrganKey, number>>>();
  const ev = new Map<string, Partial<Record<AxisKey, string>>>();
  for (const [id, e] of state) {
    if (e.status !== 'present' && e.status !== 'absent') continue;
    const f = findingById(id);
    if (!f || (!f.weights && !f.organs)) continue;
    const key = f.group ?? id;
    const mx = maxG.get(key) ?? {};
    const rw = rawG.get(key) ?? {};
    const evg = ev.get(key) ?? {};
    const factor = f.group === 'tongue' && e.source !== 'staff' ? SELF_TONGUE_FACTOR : 1;
    for (const [k, w0] of [...Object.entries(f.weights ?? {}), ...Object.entries(f.organs ?? {})] as [AxisKey | OrganKey, number][]) {
      const w = w0 * factor;
      mx[k] = Math.max(mx[k] ?? 0, w);
      if (e.status === 'present' && w > (rw[k] ?? 0)) {
        rw[k] = w;
        if ((AXES as string[]).includes(k)) evg[k as AxisKey] = f.id;
      }
    }
    maxG.set(key, mx); rawG.set(key, rw); ev.set(key, evg);
  }
  const raw = zero(); const max = zero(); const organRaw = zeroOrgans(); const organMax = zeroOrgans();
  const evidence = mapTypes<string[]>(() => []);
  for (const [key, mx] of maxG) {
    const rw = rawG.get(key) ?? {};
    for (const t of AXES) { max[t] += mx[t] ?? 0; raw[t] += rw[t] ?? 0; }
    for (const o of ORGANS) { organMax[o] += mx[o] ?? 0; organRaw[o] += rw[o] ?? 0; }
    for (const [t, fid] of Object.entries(ev.get(key) ?? {}) as [AxisKey, string][]) evidence[t].push(fid);
  }
  const pct = mapTypes((t) => (max[t] === 0 ? 0 : Math.round((100 * raw[t]) / max[t])));
  const organPct = Object.fromEntries(ORGANS.map((k) => [k, organMax[k] === 0 ? 0 : Math.round((100 * organRaw[k]) / organMax[k])])) as Record<OrganKey, number>;
  return { raw: mapTypes((t) => round2(raw[t])), max: mapTypes((t) => round2(max[t])), pct, organRaw: roundMap(organRaw), organMax: roundMap(organMax), organPct, evidence, ...classify(pct) };
}
const roundMap = (m: Record<OrganKey, number>) => Object.fromEntries(ORGANS.map((k) => [k, round2(m[k])])) as Record<OrganKey, number>;

// --- 表示用 -------------------------------------------------------------------

/** 旧版（2026-10-25-v3 まで）の陽虚・陽盛は、冷え・熱として表示する */
const LEGACY_AXIS: Record<string, AxisKey> = { yang_def: 'cold', yang_exc: 'heat' };
export const toAxis = (k: string): AxisKey | undefined => ((AXES as string[]).includes(k) ? (k as AxisKey) : LEGACY_AXIS[k]);
export type CardRank = 'main' | 'sub' | 'thermal';
export const CARD_RANK_LABEL: Record<CardRank, string> = { main: '主となる体質', sub: '併存する体質の傾向', thermal: '寒熱の傾向' };
/** 結果・改善アドバイスに出す順：主となる体質 → 併存する体質（6タイプ）→ 寒熱（冷え・熱が「傾向あり」＝20点以上） */
export function resultCards(r: Pick<ScoreResult, 'mainTypes' | 'subTypes' | 'pct'>): { t: AxisKey; rank: CardRank }[] {
  const out: { t: AxisKey; rank: CardRank }[] = [];
  const add = (k: string, rank: CardRank) => { const a = toAxis(k); if (a && !out.some((x) => x.t === a)) out.push({ t: a, rank }); };
  for (const k of r.mainTypes as string[]) add(k, 'main');
  for (const k of r.subTypes as string[]) add(k, 'sub');
  const pct = r.pct as Record<string, number>;
  for (const t of (['cold', 'heat'] as const).filter((t) => (pct[t] ?? 0) >= 20).sort((a, b) => pct[b] - pct[a])) add(t, 'thermal');
  return out;
}
export const adviceKeys = (r: Pick<ScoreResult, 'mainTypes' | 'subTypes' | 'pct'>): AxisKey[] => resultCards(r).map((x) => x.t);

// --- 患者向けの養生の出し方（2026-10-31 第4弾 3-9）-------------------------------------
/** 養生を出すタイプ（最大2）：主タイプ＋主訴に関係するタイプ。点数の順だけでは選ばない */
export interface AdvicePlan {
  types: TypeKey[];
  /** 1位との差が5点以内のタイプ（2つ以上なら「主」と決めつけず「同じくらい」と並べる） */
  tied: TypeKey[];
  /** 「強い」（60点以上）のタイプの数。5つ以上なら薬剤師画面に「全体的に高く出ています」 */
  strongCount: number;
  allHigh: boolean;
  /** 全体が「バランス」（全タイプ20点未満） */
  balanced: boolean;
}
export function advicePlan(r: Pick<ScoreResult, 'pct' | 'isBalanced'>, related?: TypeKey): AdvicePlan {
  const pct = r.pct as Record<string, number>;
  const order = [...TYPES].sort((a, b) => pct[b] - pct[a] || TYPES.indexOf(a) - TYPES.indexOf(b));
  const top = pct[order[0]] ?? 0;
  const strongCount = TYPES.filter((t) => pct[t] >= 60).length;
  if (r.isBalanced || top < 20) return { types: [], tied: [], strongCount, allHigh: strongCount >= 5, balanced: true };
  const tied = order.filter((t) => pct[t] >= top - 5 && pct[t] >= 20);
  const types: TypeKey[] = [order[0]];
  const second = related && related !== order[0] && pct[related] >= 20 ? related : tied.length >= 2 ? tied[1] : undefined;
  if (second) types.push(second);
  return { types, tied: tied.length >= 2 ? tied : [], strongCount, allHigh: strongCount >= 5, balanced: false };
}
/** 同時に出ると逆の内容になる養生の組み合わせ：両方に合う表現に置き換える */
export const ADVICE_CONFLICTS: { types: [TypeKey, TypeKey]; item: 'mind' | 'food' | 'move' | 'rest'; text: string }[] = [
  { types: ['fluid', 'yin_def'], item: 'food', text: '水分は一度にたくさんではなく、少しずつこまめにとります。冷たい飲み物は控えめにして、温かいお茶や白湯を。豆類・ハトムギと、白ごま・豆乳・梨などを無理のない量で組み合わせます。' },
  { types: ['qi_def', 'qi_stag'], item: 'move', text: '激しい運動は避け、息が上がらない程度の散歩やストレッチから始めます。胸や脇を伸ばして呼吸を深くし、慣れてきたら少しずつ長くします。' },
  { types: ['blood_def', 'blood_stasis'], item: 'food', text: '赤身の肉・魚、レバー、黒ごま、黒豆などの血を補う食材を中心に、生姜やネギは温かい料理に少量ずつ。辛いものの食べすぎは避けます。' },
  { types: ['yin_def', 'blood_stasis'], item: 'rest', text: '湯船は38〜40度のぬるめのお湯に10分ほど。熱いお湯や長風呂、サウナは潤いを失うので避けます。喫煙は巡りを妨げるので、減らすだけでも助けになります。' },
];
/** その2タイプのうち、逆の内容になる養生を両方に合う表現に置き換えたものを返す（なければ undefined） */
export function adviceOverride(types: TypeKey[], type: TypeKey, item: 'mind' | 'food' | 'move' | 'rest'): string | undefined {
  return ADVICE_CONFLICTS.find((c) => c.item === item && c.types.includes(type) && c.types.every((t) => types.includes(t)))?.text;
}
/** 主訴の症状（お悩み・深掘りで「あり」にした所見）に関係するタイプ：その所見の重みの合計が最も大きい体質タイプ（主タイプを除く） */
export function relatedTypeOf(state: FindingState, exclude: string[] = []): TypeKey | undefined {
  const sum: Record<string, number> = {};
  for (const [id, e] of state) {
    if (e.status !== 'present' || (e.section !== 'complaint' && e.section !== 'detail')) continue;
    const f = findingById(id);
    for (const [k, w] of Object.entries(f?.weights ?? {})) if ((TYPES as string[]).includes(k)) sum[k] = (sum[k] ?? 0) + (w as number);
  }
  const best = (TYPES as TypeKey[]).filter((t) => !exclude.includes(t) && (sum[t] ?? 0) > 0).sort((a, b) => sum[b] - sum[a])[0];
  return best;
}
