// ---------------------------------------------------------------------------
// 気血水・寒熱・虚実・五臓の判定と整合性の確認（純粋関数）。仕様書 §8〜§13。
// 重み・カットオフ・規則は patterns.json（草案・開発テスト用の暫定値）。
//  - 加点：present の所見だけ。同じ所見IDは証ごとに1回（所見は回答の段階で1つにまとめている）。
//    相関する所見はグループにまとめ、グループ内の最大点だけを採る。
//  - 主証：最高得点だけで決めない。候補以上の証のうち、独立した支持グループ数・比較的強く示唆する所見（3点）・
//    2位との差を見て、根拠が足りなければ「保留」。
//  - 併存証：カットオフ以上／独立支持グループ2以上／主証と共通の所見・グループを除いても候補点以上／3点の所見あり／
//    重要鑑別所見がすべて未確認でない、のすべてを満たすもの。満たさない証は詳細表示に格納する。
//  - 主訴関連の証：優先主訴とその詳細問診の所見だけで評価し、体質としての主証とは別に持つ（優先しない）。
//  - 寒熱・虚実：それぞれ別々に評価（混在・保留あり）。気虚＝虚、瘀血＝実などの自動対応はしない。
//    冷えとほてりの併存だけで上熱下寒とは判定しない。
//  - 五臓：主証・併存証を支持する所見のうち、その臓に関連するものが独立グループ2以上で「関連の可能性」。単一症状では決めない。
// ---------------------------------------------------------------------------
import {
  PATTERNS, AXES, RULES, CONSISTENCY, ZANGS, groupOf, findingById, findingName, patternById,
  type PatternId, type Pattern, type Zang, type AxisId,
} from './masters.ts';
import { isPresent, statusOf, type FindingState } from './findings.ts';

export interface Contribution { group: string; findingId: string; weight: number }
export interface WeightScore { score: number; groups: Contribution[]; strong: string[] }
export type PatternLevel = 'none' | 'low' | 'candidate' | 'strong';
export const PATTERN_LEVEL_LABEL: Record<PatternLevel, string> = { none: '該当なし', low: '低スコア', candidate: '候補', strong: '強く示唆' };
export interface PatternScore extends WeightScore { id: PatternId; name: string; level: PatternLevel; cutoff: { candidate: number; strong: number }; missingKey: string[] }

/** present の所見を重みで加点（グループ内は最大点のみ）。filter で対象の所見を絞れる */
export function scoreWeights(weights: Record<string, number>, st: FindingState, filter?: (fid: string) => boolean): WeightScore {
  const best = new Map<string, Contribution>();
  for (const [fid, w] of Object.entries(weights)) {
    if (!isPresent(st, fid) || (filter && !filter(fid))) continue;
    const g = groupOf(fid);
    const cur = best.get(g);
    if (!cur || w > cur.weight) best.set(g, { group: g, findingId: fid, weight: w });
  }
  const groups = [...best.values()].sort((a, b) => b.weight - a.weight);
  return {
    score: groups.reduce((s, x) => s + x.weight, 0),
    groups,
    strong: Object.entries(weights).filter(([fid, w]) => w === 3 && isPresent(st, fid) && (!filter || filter(fid))).map(([fid]) => fid),
  };
}
const levelOf = (score: number, c: { candidate: number; strong: number }): PatternLevel => (score >= c.strong ? 'strong' : score >= c.candidate ? 'candidate' : score > 0 ? 'low' : 'none');
const unresolved = (st: FindingState, fid: string) => { const s = statusOf(st, fid); return s === 'not_asked' || s === 'unknown'; };

export function scorePattern(p: Pattern, st: FindingState, filter?: (fid: string) => boolean): PatternScore {
  const w = scoreWeights(p.weights, st, filter);
  return { ...w, id: p.id, name: p.name, cutoff: p.cutoff, level: levelOf(w.score, p.cutoff), missingKey: p.keyFindings.filter((k) => unresolved(st, k)) };
}
const isCand = (p: PatternScore) => p.level === 'candidate' || p.level === 'strong';
const byScore = (a: PatternScore, b: PatternScore) => b.score - a.score || b.strong.length - a.strong.length || b.groups.length - a.groups.length;

export interface PrimaryResult { status: 'determined' | 'hold'; patternId?: PatternId; reasons: string[]; candidates: PatternId[] }
export interface CoexistCheck { patternId: PatternId; ok: boolean; failed: string[]; scoreWithoutShared: number }
export interface AxisResult { score: number; groups: Contribution[]; tendency: boolean }
export interface ColdHeatResult {
  cold: AxisResult; heat: AxisResult;
  status: 'cold' | 'heat' | 'mixed' | 'hold';
  /** 熱傾向のときの虚熱・実熱の可能性（虚実・陰虚と合わせて「可能性」として出す） */
  heatKind?: 'deficient_possible' | 'excess_possible' | 'undetermined';
  notes: string[];
}
export interface DefExcResult { def: AxisResult; exc: AxisResult; status: 'def' | 'exc' | 'mixed' | 'hold'; notes: string[] }
export interface ZangItem { zang: Zang; findings: string[]; groups: number; possible: boolean }
export interface ZangResult { status: 'possible' | 'hold'; items: ZangItem[]; reason?: string }
export type ConsistencyKind = 'consistent' | 'check' | 'mixed' | 'hold';
export const CONSISTENCY_LABEL: Record<ConsistencyKind, string> = { consistent: '整合', check: '要確認', mixed: '混在', hold: '判定保留' };
export interface ConsistencyItem { kind: ConsistencyKind; message: string; needs: string[] }
export interface ComplaintRelated { complaintId?: string; scores: PatternScore[]; related: PatternId[]; status: 'related' | 'hold'; note: string }
export interface MissingItem { findingId: string; reason: string }
export interface Assessment {
  patterns: PatternScore[];
  primary: PrimaryResult;
  coexisting: PatternId[];
  coexistChecks: CoexistCheck[];
  /** 通常表示しない証（低スコア・併存の条件を満たさない候補） */
  folded: PatternId[];
  complaintRelated: ComplaintRelated;
  coldHeat: ColdHeatResult;
  defExc: DefExcResult;
  zang: ZangResult;
  consistency: { status: ConsistencyKind; items: ConsistencyItem[] };
  missing: MissingItem[];
}

function axis(id: AxisId, st: FindingState): AxisResult {
  const a = AXES[id];
  const w = scoreWeights(a.weights, st);
  const tendency = w.groups.length >= RULES.axisMinGroups && (a.cutoff === undefined || w.score >= a.cutoff);
  return { score: w.score, groups: w.groups, tendency };
}

/**
 * 判定本体。st は患者の回答と薬剤師の確認を統合した所見。
 * 「主訴関連の証」は、優先主訴そのものの所見（complaintFindings）と詳細問診（complaintQuestionIds）で present になった所見だけで評価する。
 */
export function assess(st: FindingState, opts: { primaryComplaint?: string; complaintQuestionIds?: string[]; complaintFindings?: string[] } = {}): Assessment {
  const patterns = PATTERNS.map((p) => scorePattern(p, st));
  const cands = patterns.filter(isCand).sort(byScore);

  // 主証
  const primary: PrimaryResult = { status: 'hold', reasons: [], candidates: cands.map((c) => c.id) };
  if (!cands.length) primary.reasons.push('カットオフ（候補）以上の証がありません（根拠不足）');
  else {
    const top = cands[0];
    if (top.groups.length < RULES.primary.minGroups) primary.reasons.push(`「${top.name}」を支持する独立した所見が${RULES.primary.minGroups}グループ未満です`);
    if (RULES.primary.requireStrongFinding && top.strong.length === 0) primary.reasons.push(`「${top.name}」を比較的強く示唆する所見（3点）がありません`);
    const second = cands[1];
    if (second && top.score - second.score <= RULES.primary.tieMargin) primary.reasons.push(`「${top.name}」（${top.score}点）と「${second.name}」（${second.score}点）の差が${RULES.primary.tieMargin}点以内です`);
    if (!primary.reasons.length) { primary.status = 'determined'; primary.patternId = top.id; }
  }

  // 併存証
  const coexistChecks: CoexistCheck[] = [];
  const coexisting: PatternId[] = [];
  if (primary.status === 'determined') {
    const top = patterns.find((p) => p.id === primary.patternId)!;
    const pw = patternById(top.id).weights;
    const sharedF = new Set(Object.keys(pw).filter((f) => isPresent(st, f)));
    const sharedG = new Set(top.groups.map((g) => g.group));
    for (const p of cands) {
      if (p.id === top.id) continue;
      const failed: string[] = [];
      if (p.groups.length < RULES.coexisting.minGroups) failed.push(`独立した支持グループが${RULES.coexisting.minGroups}未満`);
      const wo = scorePattern(patternById(p.id), st, (f) => !sharedF.has(f) && !sharedG.has(groupOf(f)));
      if (wo.score < p.cutoff.candidate) failed.push(`主証と共通の所見を除くと${wo.score}点（候補点${p.cutoff.candidate}未満）`);
      if (RULES.coexisting.requireStrongFinding && p.strong.length === 0) failed.push('比較的強く示唆する所見（3点）がない');
      const key = patternById(p.id).keyFindings;
      if (key.length && key.every((k) => unresolved(st, k))) failed.push('重要鑑別所見がすべて未確認');
      coexistChecks.push({ patternId: p.id, ok: failed.length === 0, failed, scoreWithoutShared: wo.score });
      if (!failed.length) coexisting.push(p.id);
    }
  }
  const shown = new Set<PatternId>([...(primary.patternId ? [primary.patternId] : []), ...coexisting, ...(primary.status === 'hold' ? primary.candidates : [])]);
  const folded = patterns.filter((p) => p.score > 0 && !shown.has(p.id)).map((p) => p.id);

  // 主訴関連の証
  const csrc = new Set(opts.complaintQuestionIds ?? []);
  const cfind = new Set(opts.complaintFindings ?? []);
  const fromComplaint = (fid: string) => cfind.has(fid) || (st.answers.get(fid)?.sources ?? []).some((s) => csrc.has(s.questionId) && s.status === 'present');
  const cScores = PATTERNS.map((p) => scorePattern(p, st, fromComplaint)).filter((p) => p.score > 0).sort(byScore);
  const cr = RULES.complaintRelated;
  const okC = cScores.filter((p) => p.score >= cr.minScore && p.groups.length >= cr.minGroups);
  const related = okC.length ? okC.filter((p) => okC[0].score - p.score <= RULES.primary.tieMargin).map((p) => p.id) : [];
  const complaintRelated: ComplaintRelated = {
    complaintId: opts.primaryComplaint, scores: cScores, related, status: related.length ? 'related' : 'hold',
    note: !opts.primaryComplaint ? '優先主訴が決まっていません' : related.length > 1 ? '複数の証が同程度に関連しています' : related.length ? '' : `主訴の詳細所見だけでは${cr.minScore}点・${cr.minGroups}グループに届かず、判定保留です`,
  };

  // 寒熱
  const cold = axis('cold', st);
  const heat = axis('heat', st);
  const chStatus = cold.tendency && heat.tendency ? 'mixed' : cold.tendency ? 'cold' : heat.tendency ? 'heat' : 'hold';
  const chNotes: string[] = [];
  if (['cold_limbs', 'cold_lowback', 'cold_whole', 'cold_abdomen'].some((f) => isPresent(st, f)) && ['hot_upper', 'hot_flash', 'red_face', 'hot_palms'].some((f) => isPresent(st, f))) {
    chNotes.push('冷えとほてりが併存しています。部位・時間帯・随伴症状を確認してください（この組み合わせだけで上熱下寒とは判定しません）。');
  }
  if (chStatus === 'mixed') chNotes.push('寒・熱の両方に傾向があります（寒熱混在の可能性）。');
  if (chStatus === 'hold') chNotes.push(cold.score + heat.score === 0 ? '寒熱を判断する所見がありません。' : '寒・熱とも、傾向と判断する条件（5点以上・独立グループ2以上）に届きません。');

  // 虚実（数値カットオフは未確定のため、独立グループ数で評価し点数は補助表示）
  const def = axis('def', st);
  const exc = axis('exc', st);
  const deStatus = def.tendency && exc.tendency ? 'mixed' : def.tendency ? 'def' : exc.tendency ? 'exc' : 'hold';
  const deNotes: string[] = [];
  if (deStatus === 'mixed') deNotes.push('虚・実の両方の所見があります（虚実混在の可能性）。体力の充実度と症状の勢いを確認してください。');
  if (deStatus === 'hold') deNotes.push('虚実を判断できる所見の組み合わせが足りません（判定保留）。');

  let heatKind: ColdHeatResult['heatKind'];
  if (chStatus === 'heat' || chStatus === 'mixed') {
    const yin = patterns.find((p) => p.id === 'yin_def')!;
    heatKind = isCand(yin) && deStatus !== 'exc' ? 'deficient_possible' : deStatus === 'exc' && !isCand(yin) ? 'excess_possible' : 'undetermined';
  }

  // 五臓
  let zang: ZangResult;
  if (primary.status !== 'determined') zang = { status: 'hold', items: [], reason: '主証が保留のため、五臓の特定は保留です' };
  else {
    const support = [primary.patternId!, ...coexisting].map((id) => patternById(id).weights);
    const items: ZangItem[] = ZANGS.map((z) => {
      const fs = [...st.answers.values()].filter((a) => a.status === 'present' && findingById(a.id)?.zang?.includes(z) && support.some((w) => (w[a.id] ?? 0) > 0)).map((a) => a.id);
      const groups = new Set(fs.map(groupOf)).size;
      return { zang: z, findings: fs, groups, possible: groups >= RULES.zangMinGroups };
    }).filter((x) => x.findings.length > 0).sort((a, b) => b.groups - a.groups);
    zang = items.some((x) => x.possible) ? { status: 'possible', items } : { status: 'hold', items, reason: '関連する所見が単一症状（1グループ）にとどまるため、五臓の特定は保留です' };
  }

  // 整合性
  const items: ConsistencyItem[] = [];
  if (primary.status === 'hold') items.push({ kind: 'hold', message: `主証は判定保留です（${primary.reasons.join('／')}）`, needs: [] });
  if (chStatus === 'mixed') items.push({ kind: 'mixed', message: '寒熱混在の可能性があります。部位・時間帯・随伴症状を確認してください。', needs: ['cold_heat_split', 'evening_fever', 'mod_warm_relief', 'mod_cool_relief'] });
  if (deStatus === 'mixed') items.push({ kind: 'mixed', message: '虚実混在の可能性があります。', needs: ['robust', 'intense_symptoms', 'fatigue_exertion'] });
  const judged = [primary.patternId, ...coexisting].filter(Boolean) as PatternId[];
  for (const r of CONSISTENCY) {
    if (!judged.includes(r.pattern)) continue;
    if (r.coldHeat && !(chStatus === r.coldHeat || chStatus === 'mixed')) continue;
    if (r.defExc && !(deStatus === r.defExc || deStatus === 'mixed')) continue;
    items.push({ kind: 'check', message: r.message, needs: r.needs });
  }
  const status: ConsistencyKind = items.some((x) => x.kind === 'hold') ? 'hold' : items.some((x) => x.kind === 'mixed') ? 'mixed' : items.some((x) => x.kind === 'check') ? 'check' : 'consistent';

  // 未確認事項（鑑別に必要で、未質問・わからないの所見）
  const missing: MissingItem[] = [];
  const addMissing = (fid: string, reason: string) => { if (unresolved(st, fid) && !missing.some((m) => m.findingId === fid)) missing.push({ findingId: fid, reason }); };
  for (const p of patterns.filter((x) => shown.has(x.id) || x.level === 'candidate' || x.level === 'strong')) for (const k of p.missingKey) addMissing(k, `${p.name}の重要所見`);
  for (const it of items) for (const n of it.needs) addMissing(n, it.message.split('。')[0]);
  if (chNotes.length && chStatus !== 'cold' && chStatus !== 'heat') for (const n of ['mod_warm_relief', 'mod_cool_relief', 'prefer_warm', 'prefer_cold']) addMissing(n, '寒熱の判断');
  if (deStatus === 'hold') for (const n of ['robust', 'fatigue_exertion', 'weak_voice', 'abdominal_fullness']) addMissing(n, '虚実の判断');

  return {
    patterns, primary, coexisting, coexistChecks, folded, complaintRelated,
    coldHeat: { cold, heat, status: chStatus, heatKind, notes: chNotes },
    defExc: { def, exc, status: deStatus, notes: deNotes },
    zang, consistency: { status, items }, missing,
  };
}

export const COLD_HEAT_LABEL: Record<ColdHeatResult['status'], string> = { cold: '寒傾向', heat: '熱傾向', mixed: '寒熱混在の可能性', hold: '判定保留' };
export const HEAT_KIND_LABEL: Record<NonNullable<ColdHeatResult['heatKind']>, string> = { deficient_possible: '虚熱の可能性', excess_possible: '実熱の可能性', undetermined: '虚熱・実熱は未判定（虚実と合わせて確認）' };
export const DEF_EXC_LABEL: Record<DefExcResult['status'], string> = { def: '虚証傾向', exc: '実証傾向', mixed: '虚実混在の可能性', hold: '判定保留' };
export const contributionText = (c: Contribution) => `${findingName(c.findingId)}（${c.weight}）`;
