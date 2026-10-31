// ---------------------------------------------------------------------------
// 体質スコア（純粋関数）。2026-10-31 第5弾：薬剤師が確認した「配点表」（src/data/kampo/scoring.json）どおりに計算する。
//  - 配点表の1行＝1つの選択肢。強3・中2・弱1。行の所見のどれかが「あり」なら、その行を1回だけ数える（同じ内容は1回）
//  - 各タイプの点数＝「あり」の行の点数の合計。満点＝その方に聞いた（あり・なしが決まった）行の点数の合計
//    （月経がない方の月経の設問など、判定外の項目は分子・分母の両方から外す。「特にない」は陰性所見として分母に残る）
//  - 割合＝点数÷満点。カットオフ＝満点の40%（scoring.json の cutoffRatio。変更できる）
//  - 主な体質＝割合がいちばん高いタイプ（カットオフ以上）。ほかの体質＝カットオフ以上のほかのタイプ（割合の高い順）
//    段階：強い＝カットオフ＋20%以上、注意＝カットオフ以上、傾向あり＝カットオフの半分以上、バランス＝それ未満
//  - 観察と本人回答が両方あるときは観察（applyStaffAnswers）。舌の本人入力は 0.5 倍（点数・満点とも）
//  - 寒熱：冷え・虚熱・実熱を別々に合計（虚熱と実熱は合算しない）。熱（判別不能）は舌の苔・ほてりの時間帯・汗で振り分ける
//    上熱下寒＝上部の熱1つ以上かつ下部の冷え1つ以上／寒熱錯雑＝熱と冷えがどちらも2つ以上（上熱下寒でない）／虚熱と冷えが併存
//  - 虚実：虚・実の点数の合計で 虚／中間／実
//  - 五臓：体質が決まったあと、そのタイプの点数の根拠になった行の五臓タグだけを数え、いちばん多い臓を証の名前に付ける
//    （例：気虚＋脾→脾気虚）。そのタイプを支える行が3つ以上あるときだけ名前を付ける
// 寒熱・虚実・五臓・組み合わせは薬剤師画面だけに出す（患者画面は6タイプだけ）。
// ---------------------------------------------------------------------------
import { TYPES, AXES, ORGANS, SCORE_ROWS, CUTOFF_RATIO, SCORING_VERSION, ORGAN_LABEL, findingById, axisName, type TypeKey, type AxisKey, type OrganKey, type ScoreRow } from './masters.ts';
import type { FindingState } from './findings.ts';

export const DEFICIENT: AxisKey[] = ['qi_def', 'blood_def', 'yin_def', 'cold']; // 虚
export const EXCESS: AxisKey[] = ['qi_stag', 'blood_stasis', 'fluid', 'heat']; // 実
export const HOT: AxisKey[] = ['heat', 'yin_def'];
export const COLD: AxisKey[] = ['cold', 'qi_def', 'fluid'];
/** 組み合わせの表示（独立したタイプにしない。寒熱の判定と合わせる） */
export type Combo = 'yang_def' | 'damp_heat';
export const COMBO_LABEL: Record<Combo, string> = { yang_def: '気虚＋冷え（陽虚）', damp_heat: '水滞＋熱（湿熱）' };

/** ご本人が鏡で見て入力した舌の所見の重み（暫定） */
export const SELF_TONGUE_FACTOR = 0.5;

export type Level = 'balanced' | 'tendency' | 'caution' | 'strong';
export const LEVEL_LABEL: Record<Level, string> = { balanced: 'バランス', tendency: '傾向あり', caution: '注意', strong: '強い' };
/** 段階の区切り（％）：注意＝カットオフ、強い＝カットオフ＋20、傾向あり＝カットオフの半分 */
export const LEVEL_CUT = { caution: Math.round(CUTOFF_RATIO * 100), strong: Math.round(CUTOFF_RATIO * 100) + 20, tendency: Math.round(CUTOFF_RATIO * 50) };
export const levelOfPct = (p: number): Level => (p >= LEVEL_CUT.strong ? 'strong' : p >= LEVEL_CUT.caution ? 'caution' : p >= LEVEL_CUT.tendency ? 'tendency' : 'balanced');
export type DefExcLabel = 'def' | 'mid' | 'exc';
export type ThermalLabel = 'cold' | 'neutral' | 'hot';
/** 熱寄りのときの熱の種類：実熱／虚熱（潤い不足による熱） */
export type HeatKindLabel = 'excess' | 'deficient';
export const HEAT_KIND_LABEL: Record<HeatKindLabel, string> = { excess: '実熱（余分な熱）', deficient: '虚熱（潤い不足による熱）' };
export const DEF_EXC_LABEL: Record<DefExcLabel, string> = { def: '虚', mid: '中間', exc: '実' };
export const THERMAL_STATE_LABEL: Record<ThermalLabel, string> = { cold: '冷え寄り', neutral: 'はっきりしない', hot: '熱寄り' };
/** 冷えと熱が両方出たときの表示（第5弾 3-1） */
export type ThermalCondition = 'upper_heat_lower_cold' | 'mixed' | 'def_heat_with_cold';
export const THERMAL_CONDITION_LABEL: Record<ThermalCondition, string> = {
  upper_heat_lower_cold: '上熱下寒の可能性', mixed: '寒熱錯雑の可能性（確認してください）', def_heat_with_cold: '虚熱と冷えが併存',
};

export type { Answers } from './flow.ts';

export interface Classification {
  /** 6タイプと寒熱（冷え・熱）の段階 */
  level: Record<AxisKey, Level>;
  /** 主な体質（割合がいちばん高いタイプ。カットオフ未満なら空） */
  mainTypes: TypeKey[];
  /** ほかの体質（カットオフ以上のほかのタイプ。割合の高い順） */
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
/** 寒熱の内訳（点数。虚熱と実熱は合算しない） */
export interface ThermalDetail { cold: number; heatDef: number; heatExc: number; coldCount: number; heatCount: number; conditions: ThermalCondition[] }
/** タイプごとの証の名前（五臓タグ） */
export interface ShoInfo { tags: Partial<Record<OrganKey, number>>; organ?: OrganKey; name?: string; support: number }
export interface ScoreResult extends Classification {
  raw: Record<AxisKey, number>;
  max: Record<AxisKey, number>;
  pct: Record<AxisKey, number>;
  /** 五臓の傾向（0〜100）。五臓タグの付いた行のうち「あり」の割合 */
  organRaw: Record<OrganKey, number>;
  organMax: Record<OrganKey, number>;
  organPct: Record<OrganKey, number>;
  /** タイプごとに加点した行（配点表の選択肢名。薬剤師画面の根拠表示用） */
  evidence?: Record<AxisKey, string[]>;
  thermal?: ThermalDetail;
  /** 虚・実の点数 */
  defExcPts?: { def: number; exc: number };
  sho?: Partial<Record<TypeKey, ShoInfo>>;
  /** 判定に使った配点表の版 */
  scoringVersion?: string;
}

export const zero = (): Record<AxisKey, number> => Object.fromEntries(AXES.map((t) => [t, 0])) as Record<AxisKey, number>;
const mapTypes = <T,>(fn: (t: AxisKey) => T) => Object.fromEntries(AXES.map((t) => [t, fn(t)])) as Record<AxisKey, T>;
export const zeroOrgans = (): Record<OrganKey, number> => Object.fromEntries(ORGANS.map((o) => [o, 0])) as Record<OrganKey, number>;
const round1 = (n: number) => Math.round(n * 10) / 10;
/** 6タイプの並び：割合の高い順 → 同じ割合なら点数の高い順 → マスタの順（第5弾 2-2。患者画面・薬剤師画面で同じ並び） */
export function typeOrder(r: { pct: Partial<Record<string, number>>; raw?: Partial<Record<string, number>> }): TypeKey[] {
  const p = (t: string) => r.pct[t] ?? 0;
  const w = (t: string) => r.raw?.[t] ?? 0;
  return [...TYPES].sort((a, b) => p(b) - p(a) || w(b) - w(a) || TYPES.indexOf(a) - TYPES.indexOf(b));
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 割合から主な体質・ほかの体質・段階を決める（寒熱・虚実は点数から。テスト用に分離） */
export function classify(pct: Record<AxisKey, number>, extra: { thermal?: ThermalDetail; defExcPts?: { def: number; exc: number }; raw?: Record<AxisKey, number> } = {}): Classification {
  const level = mapTypes<Level>((t) => levelOfPct(pct[t] ?? 0));
  const raw = extra.raw;
  const order = typeOrder({ pct, raw });
  const top = pct[order[0]] ?? 0;
  const isBalanced = top < LEVEL_CUT.tendency;
  // 主な体質：割合がいちばん高いタイプ。同じ割合なら点数が高いほう（第5弾 2-2。割合も点数も同じなら並べる）。
  // カットオフ未満なら「傾向」だけ（主な体質なし。患者画面では patientView がいちばん近い体質として出す）
  const mainTypes = top >= LEVEL_CUT.caution ? order.filter((t) => pct[t] === top && (raw?.[t] ?? 0) === (raw?.[order[0]] ?? 0)) : [];
  // ほかの体質：「強い」「注意」（カットオフ以上）のほかのタイプは必ず出す（第5弾 2-2）
  const subTypes = order.filter((t) => !mainTypes.includes(t) && (pct[t] ?? 0) >= LEVEL_CUT.caution);
  // 虚実：虚・実の点数の合計（点数がなければ旧式の割合から）
  const de = extra.defExcPts;
  const sumP = (ks: AxisKey[]) => ks.reduce((s, k) => s + (pct[k] ?? 0), 0);
  const idx = (pos: number, neg: number) => (pos + neg === 0 ? 0 : round2((pos - neg) / (pos + neg)));
  const defExcIndex = de ? idx(de.exc, de.def) : idx(sumP(EXCESS), sumP(DEFICIENT));
  const defExcLabel: DefExcLabel = defExcIndex < -0.2 ? 'def' : defExcIndex > 0.2 ? 'exc' : 'mid';
  // 寒熱：冷え・熱（虚熱＋実熱）の点数で寄りを決める（両方が出たときは条件の表示を優先し「はっきりしない」）
  const th = extra.thermal;
  const heat = th ? th.heatDef + th.heatExc : pct.heat ?? 0;
  const cold = th ? th.cold : pct.cold ?? 0;
  const thermalIndex = idx(heat, cold);
  const thermalLabel: ThermalLabel = th && th.conditions.some((c) => c === 'mixed' || c === 'upper_heat_lower_cold') ? 'neutral'
    : th ? (cold >= 3 && cold > heat ? 'cold' : heat >= 3 && heat > cold ? 'hot' : 'neutral')
    : thermalIndex < -0.2 ? 'cold' : thermalIndex > 0.2 ? 'hot' : 'neutral';
  const heatKind: HeatKindLabel | undefined = thermalLabel === 'hot' ? (th ? (th.heatDef > th.heatExc ? 'deficient' : 'excess') : (pct.yin_def > pct.heat ? 'deficient' : 'excess')) : undefined;
  // 組み合わせは寒熱の判定と合わせる（冷え寄りでないのに陽虚、実熱でないのに湿熱を出さない。第5弾 3-5）
  const combos: Combo[] = [
    ...((pct.qi_def ?? 0) >= LEVEL_CUT.caution && thermalLabel === 'cold' ? ['yang_def' as const] : []),
    ...((pct.fluid ?? 0) >= LEVEL_CUT.caution && thermalLabel === 'hot' && heatKind === 'excess' ? ['damp_heat' as const] : []),
  ];
  return { level, mainTypes, subTypes, isBalanced, defExcIndex, defExcLabel, thermalIndex, thermalLabel, heatKind, combos };
}

const rowPresent = (state: FindingState, r: ScoreRow) => r.findings.some((f) => state.get(f)?.status === 'present');
const rowAsked = (state: FindingState, r: ScoreRow) => r.findings.some((f) => { const st = state.get(f)?.status; return st === 'present' || st === 'absent'; });
/** 行の重み：舌をご本人が鏡で見て入力したときは 0.5 倍 */
const rowFactor = (state: FindingState, r: ScoreRow) => {
  const tongue = r.findings.some((f) => findingById(f)?.group === 'tongue');
  if (!tongue) return 1;
  const e = r.findings.map((f) => state.get(f)).find((x) => x && (x.status === 'present' || x.status === 'absent'));
  return e && e.source !== 'staff' ? SELF_TONGUE_FACTOR : 1;
};
const isPresentF = (state: FindingState, f: string) => state.get(f)?.status === 'present';

/** 配点表どおりにスコアを出す */
export function score(state: FindingState, rows: ScoreRow[] = SCORE_ROWS): ScoreResult {
  const raw = zero(); const max = zero();
  const evidence = mapTypes<string[]>(() => []);
  const support: Partial<Record<TypeKey, ScoreRow[]>> = {};
  let cold = 0, heatDef = 0, heatExc = 0, coldMax = 0, heatMax = 0, coldCount = 0, heatCount = 0;
  let upperHeat = 0, lowerCold = 0;
  let defP = 0, excP = 0;
  const organRaw = zeroOrgans(); const organMax = zeroOrgans();
  for (const r of rows) {
    if (!r.findings.length || !rowAsked(state, r)) continue; // 問診にない・聞いていない行は分子・分母の両方から外す
    const k = rowFactor(state, r);
    const on = rowPresent(state, r);
    for (const [t, p] of Object.entries(r.pts ?? {}) as [TypeKey, number][]) {
      max[t] += p * k;
      if (on) { raw[t] += p * k; evidence[t].push(r.label); (support[t] ??= []).push(r); }
    }
    if (r.defExc && on) { if (r.defExc.side === 'def') defP += r.defExc.pts * k; else excP += r.defExc.pts * k; }
    for (const o of r.organs ?? []) { organMax[o] += 1; if (on) organRaw[o] += 1; }
    const th = r.thermal;
    if (!th) continue;
    const p = th.pts * k;
    if (th.kind === 'cold' || th.kind === 'cold_heat') coldMax += p;
    if (th.kind !== 'cold') heatMax += p;
    if (!on) continue;
    // 熱（判別不能）の振り分け：舌が赤い→苔が黄色いなら実熱・苔が少ないなら虚熱／顔の赤み・上半身のほてり→夕方〜夜なら虚熱・汗が多いなら実熱
    let kind: string = th.kind;
    if (kind === 'heat_unknown' || kind === 'cold_heat') {
      const tongue = r.findings.includes('tongue_color_red');
      const def = tongue ? isPresentF(state, 'tongue_coat_little') || isPresentF(state, 'tongue_mirror') : isPresentF(state, 'evening_heat');
      const exc = tongue ? isPresentF(state, 'tongue_coat_yellow') : isPresentF(state, 'sweat_profuse');
      const hk = exc && !def ? 'heat_exc' : def && !exc ? 'heat_def' : exc && def ? 'heat_exc' : 'heat_unknown';
      if (th.kind === 'cold_heat') { cold += p; coldCount++; lowerCold++; upperHeat++; heatCount++; if (hk === 'heat_exc') heatExc += p; else if (hk === 'heat_def') heatDef += p; continue; }
      kind = hk;
    }
    if (kind === 'cold') { cold += p; coldCount++; if (th.site === 'lower') lowerCold++; }
    else { heatCount++; if (kind === 'heat_def') heatDef += p; else if (kind === 'heat_exc') heatExc += p; if (th.site === 'upper') upperHeat++; }
  }
  raw.cold = cold; max.cold = coldMax; raw.heat = heatDef + heatExc; max.heat = heatMax;
  const conditions: ThermalCondition[] = [];
  if (upperHeat >= 1 && lowerCold >= 1) conditions.push('upper_heat_lower_cold');
  else if (heatCount >= 2 && coldCount >= 2) conditions.push('mixed');
  if (heatDef > 0 && cold > 0) conditions.push('def_heat_with_cold');
  const pct = mapTypes((t) => (max[t] === 0 ? 0 : Math.round((100 * raw[t]) / max[t])));
  const organPct = Object.fromEntries(ORGANS.map((o) => [o, organMax[o] === 0 ? 0 : Math.round((100 * organRaw[o]) / organMax[o])])) as Record<OrganKey, number>;
  const thermal: ThermalDetail = { cold: round1(cold), heatDef: round1(heatDef), heatExc: round1(heatExc), coldCount, heatCount, conditions };
  const defExcPts = { def: round1(defP), exc: round1(excP) };
  const cls = classify(pct, { thermal, defExcPts, raw: mapTypes((t) => round1(raw[t])) });
  // 五臓タグ → 証の名前（そのタイプに加点した根拠の行の五臓タグだけを数える。根拠の行が3つ以上で、いちばん多い臓が1つに決まるときだけ名前を付ける。第5弾 3-2）
  const sho: Partial<Record<TypeKey, ShoInfo>> = {};
  for (const t of TYPES.filter((x) => (support[x] ?? []).length > 0)) {
    const rs = support[t] ?? [];
    const tags: Partial<Record<OrganKey, number>> = {};
    for (const r of rs) for (const o of r.organs ?? []) tags[o] = (tags[o] ?? 0) + 1;
    const best = (Object.entries(tags) as [OrganKey, number][]).sort((a, b) => b[1] - a[1] || ORGANS.indexOf(a[0]) - ORGANS.indexOf(b[0]))[0];
    const tied = best && (Object.values(tags) as number[]).filter((n) => n === best[1]).length > 1;
    const info: ShoInfo = { tags, support: rs.length };
    if (best && !tied && rs.length >= 3) { info.organ = best[0]; info.name = shoName(t, best[0]); }
    sho[t] = info;
  }
  return {
    raw: mapTypes((t) => round1(raw[t])), max: mapTypes((t) => round1(max[t])), pct,
    organRaw, organMax, organPct, evidence, thermal, defExcPts, sho, scoringVersion: SCORING_VERSION, ...cls,
  };
}
/** 証の名前（例：脾気虚・肝血虚・肝気滞・腎陰虚）。瘀血・水滞は「◯の瘀血」「◯の水滞」 */
export function shoName(t: TypeKey, o: OrganKey): string {
  const org = ORGAN_LABEL[o];
  if (t === 'yin_def') return `${org}陰虚`;
  if (t === 'blood_stasis' || t === 'fluid') return `${org}の${axisName(t)}`;
  return `${org}${axisName(t)}`;
}

// --- 表示用 -------------------------------------------------------------------

/** 旧版（2026-10-25-v3 まで）の陽虚・陽盛は、冷え・熱として表示する */
const LEGACY_AXIS: Record<string, AxisKey> = { yang_def: 'cold', yang_exc: 'heat' };
export const toAxis = (k: string): AxisKey | undefined => ((AXES as string[]).includes(k) ? (k as AxisKey) : LEGACY_AXIS[k]);
export type CardRank = 'main' | 'sub' | 'thermal';
export const CARD_RANK_LABEL: Record<CardRank, string> = { main: '主な体質', sub: 'ほかの体質', thermal: '寒熱の傾向' };
/** 結果に出す順：主な体質 → ほかの体質（6タイプ。寒熱は旧版のセッションだけ） */
export function resultCards(r: Pick<ScoreResult, 'mainTypes' | 'subTypes' | 'pct'>, withThermal = false): { t: AxisKey; rank: CardRank }[] {
  const out: { t: AxisKey; rank: CardRank }[] = [];
  const add = (k: string, rank: CardRank) => { const a = toAxis(k); if (a && !out.some((x) => x.t === a)) out.push({ t: a, rank }); };
  for (const k of r.mainTypes as string[]) add(k, 'main');
  for (const k of r.subTypes as string[]) add(k, 'sub');
  const pct = r.pct as Record<string, number>;
  if (withThermal) for (const t of (['cold', 'heat'] as const).filter((t) => (pct[t] ?? 0) >= 20).sort((a, b) => pct[b] - pct[a])) add(t, 'thermal');
  return out;
}
export const adviceKeys = (r: Pick<ScoreResult, 'mainTypes' | 'subTypes' | 'pct'>): AxisKey[] => resultCards(r).map((x) => x.t);

// --- 患者向けの養生の出し方（2026-10-31 第4弾 3-9）-------------------------------------
/** 養生を出すタイプ（最大2）：主タイプ＋主訴に関係するタイプ。点数の順だけでは選ばない */
export interface AdvicePlan {
  types: TypeKey[];
  /** 1位との差が5点以内のタイプ（2つ以上なら「主」と決めつけず「同じくらい」と並べる） */
  tied: TypeKey[];
  /** 「強い」のタイプの数。5つ以上なら薬剤師画面に「全体的に高く出ています」 */
  strongCount: number;
  allHigh: boolean;
  /** 全体が「バランス」（全タイプ20点未満） */
  balanced: boolean;
}
/**
 * 患者画面に出す体質（第5弾 2-1・2-2）：6タイプだけ（寒熱・虚実・五臓は薬剤師画面だけ）。
 *   主な体質＝いちばん高いタイプ（カットオフ未満なら「傾向」としていちばん近いタイプ）、
 *   ほかの体質＝「強い」「注意」のほかのタイプすべて（割合の高い順。同じ割合なら点数の高い順）。
 * 薬剤師画面の要約・お客様用の結果・改善アドバイスで同じものを使う。
 */
export interface PatientView { main: TypeKey[]; others: TypeKey[]; balanced: boolean; tendencyOnly: boolean }
export function patientView(r: Pick<ScoreResult, 'pct' | 'isBalanced' | 'mainTypes' | 'subTypes'> & { raw?: Partial<Record<string, number>> }): PatientView {
  if (r.isBalanced) return { main: [], others: [], balanced: true, tendencyOnly: false };
  const order = typeOrder(r as { pct: Partial<Record<string, number>>; raw?: Partial<Record<string, number>> });
  const main = (r.mainTypes as TypeKey[]).length ? (r.mainTypes as TypeKey[]) : [order[0]];
  const others = order.filter((t) => !main.includes(t) && ((r.pct as Record<string, number>)[t] ?? 0) >= LEVEL_CUT.caution);
  return { main, others, balanced: false, tendencyOnly: !(r.mainTypes as TypeKey[]).length };
}
export function advicePlan(r: Pick<ScoreResult, 'pct' | 'isBalanced'> & Partial<Pick<ScoreResult, 'mainTypes' | 'subTypes' | 'raw'>>, related?: TypeKey): AdvicePlan {
  const pct = r.pct as Record<string, number>;
  const order = typeOrder(r as { pct: Partial<Record<string, number>>; raw?: Partial<Record<string, number>> });
  const top = pct[order[0]] ?? 0;
  const strongCount = TYPES.filter((t) => pct[t] >= LEVEL_CUT.strong).length;
  if (r.isBalanced || top < LEVEL_CUT.tendency) return { types: [], tied: [], strongCount, allHigh: strongCount >= 5, balanced: true };
  // 「同じくらい」は同じ段階（強い・注意・傾向あり）で差5点以内のものだけ（段階の表示と矛盾させない。第5弾 2-2）
  const tied = order.filter((t) => pct[t] >= top - 5 && pct[t] >= LEVEL_CUT.tendency && levelOfPct(pct[t]) === levelOfPct(top));
  const v = patientView({ pct: r.pct, raw: r.raw, isBalanced: r.isBalanced, mainTypes: r.mainTypes ?? (top >= LEVEL_CUT.caution ? [order[0]] : []), subTypes: r.subTypes ?? [] });
  // 養生を出すのは、画面に出す体質（主な体質・ほかの体質）のうち最大2つ：主な体質＋（主訴に関係するタイプ、なければ次に高いタイプ）
  const types: TypeKey[] = [v.main[0]];
  const second = v.main[1] ?? (related && v.others.includes(related) ? related : v.others[0]);
  if (second) types.push(second);
  return { types, tied: tied.length >= 2 ? tied : [], strongCount, allHigh: strongCount >= 5, balanced: false };
}
/**
 * 同じ養生の重複を省く（第5弾 2-3）：前に出したタイプのアドバイスにある養生（夜更かしを避ける・長風呂やサウナを控えるなど）は、
 * あとのタイプでは文を省き、全部省いたら「◯◯のアドバイスと同じです」にする。order は画面に出す順（主な体質 → ほかの体質）。
 */
export const ADVICE_THEMES: { key: string; label: string; re: RegExp }[] = [
  { key: 'sleep', label: '夜更かしを避けて早めに寝る', re: /夜更かし|日付が変わる前に就寝|23時までに就寝|睡眠時間の確保/ },
  { key: 'sauna', label: '長風呂・サウナを控える', re: /サウナ|長風呂/ },
];
export type AdviceItem = 'mind' | 'food' | 'move' | 'rest';
export function dedupeAdvice(type: TypeKey, item: AdviceItem, text: string, order: TypeKey[], textOf: (t: TypeKey, item: AdviceItem) => string): string {
  const i = order.indexOf(type);
  if (i <= 0) return text;
  const used = new Map<string, TypeKey>();
  for (const t of order.slice(0, i)) for (const it of ['mind', 'food', 'move', 'rest'] as AdviceItem[]) {
    const tx = textOf(t, it);
    for (const th of ADVICE_THEMES) if (th.re.test(tx) && !used.has(th.key)) used.set(th.key, t);
  }
  if (!used.size) return text;
  const sentences = text.split(/(?<=。)/).filter((x) => x.trim());
  const dropped: { label: string; t: TypeKey }[] = [];
  const kept = sentences.filter((x) => {
    const th = ADVICE_THEMES.find((h) => used.has(h.key) && h.re.test(x));
    if (th && !dropped.some((d) => d.label === th.label)) dropped.push({ label: th.label, t: used.get(th.key)! });
    return !th;
  });
  if (kept.length) return kept.join('');
  return dropped.map((d) => `「${d.label}」は${axisName(d.t)}のアドバイスと同じです。`).join('');
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
/** 主訴の症状（お悩み・深掘りで「あり」にした所見）に関係するタイプ：その所見を含む配点表の行の点数の合計が最も大きい体質タイプ（主タイプを除く） */
export function relatedTypeOf(state: FindingState, exclude: string[] = []): TypeKey | undefined {
  const sum: Record<string, number> = {};
  for (const r of SCORE_ROWS) {
    const hit = r.findings.some((f) => { const e = state.get(f); return e?.status === 'present' && (e.section === 'complaint' || e.section === 'detail'); });
    if (!hit) continue;
    for (const [k, p] of Object.entries(r.pts ?? {})) sum[k] = (sum[k] ?? 0) + (p as number);
  }
  return (TYPES as TypeKey[]).filter((t) => !exclude.includes(t) && (sum[t] ?? 0) > 0).sort((a, b) => sum[b] - sum[a])[0];
}
