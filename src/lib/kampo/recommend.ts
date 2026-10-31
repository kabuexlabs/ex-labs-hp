// ---------------------------------------------------------------------------
// 漢方薬の選定（純粋関数）：主訴を起点とした二段階選定方式。
//
//   STEP 1 主訴 → 候補群
//     いちばん改善したい主訴（大カテゴリー K1 → 具体的な主訴 KA〜KH → 複数なら KM で1つ）と、
//     その詳細問診（S*）で特定した症状に対応する漢方薬を、承認された効能・効果（formulas.json の
//     indications）だけで抽出する。体質スコアを理由に、主訴と関係のない漢方薬を候補に加えることはしない。
//     ほかに選んだ主訴と、詳細問診の随伴症状（also）は候補群に加えず、STEP 2 の加点にだけ使う。
//   STEP 2 候補群の中で体質との適合性を評価
//     ① 気血水（気虚・血虚・気滞・瘀血・水滞・陰虚=水不足）② 寒熱（実熱・虚熱を含む）
//     ③ 虚実（使用目標の体力の範囲）④ 五臓 ⑤ 主訴の詳細・随伴症状（使用目標に当たる回答）
//     を合わせて適合度を出す。逆の虚実・逆の寒熱などは「不適合」として推薦しない。
//   STEP 3 候補群の中から最も適合する漢方薬を選ぶ（主訴ごと）
//   STEP 4 安全性：除外フラグに当たるものは除外。相談事項・情報不足は「要確認」で確定しない
//   STEP 5 推薦理由を「①主訴の候補になった理由 ②体質に合う理由 ③他の候補との比較
//          ④服用前の確認事項」の順で作る
//
// 候補群の中に体質的に適合する漢方薬がなければ、無理に推薦しない（pick なし）。
// 主訴が承認された効能・効果に当たらない（抜け毛・お腹の張りなど）ときは候補群が空になり、推薦しない。
// 重み・しきい値は SELECTION の初期値。店頭の実データで薬剤師が調整する。
// 2026-10-25 フェーズ2：回答は所見（findings.json）に変換して照合する。処方の signs・requires は所見ID。
// 候補は薬剤師画面にだけ出す（患者向け画面には出さない。改修指示 第1章）。処方選定の作り直しはフェーズ5。
// ---------------------------------------------------------------------------
import {
  axisName, ORGAN_PLAIN, THERMAL_LABEL, HEAT_LABEL,
  findingLabel, symptomLabel, strengthRangeLabel,
  type Formula, type AxisKey, type OrganKey, type Strength,
} from './masters.ts';
import { complaintInfo } from './complaints.ts';
import { presentIds } from './findings.ts';
import { DEF_EXC_LABEL, THERMAL_STATE_LABEL, HEAT_KIND_LABEL, type ScoreResult } from './scoring.ts';
import { safetyContext, assessFormulaSafety, GENERAL_NOTES, type SafetyFlag, type TagHit, type FormulaSafety, type SafetyInput } from './safety.ts';
import type { Answers, WalkResult } from './flow.ts';

export const SELECTION = {
  weight: {
    qbf: 0.45, // 気血水（処方の対象タイプに対する本人の点数の加重平均）
    organ: 0.15, // 五臓
    thermal: 0.1, // 寒熱の方向が合う
    heat: 0.05, // 熱の種類（実熱・虚熱）が合う
    heatSoft: -0.05, // 熱の種類がずれる（虚熱向けを実熱の人に など）
    strengthIn: 0.1, // 体力の範囲に入る
    strengthNear: -0.05, // 体力の範囲から1段ずれる
    sign: 0.1, // 使用目標・随伴症状に当たる回答（体質チェックなど）1つにつき
    signCap: 0.3,
    signDetail: 0.1, // 使用目標に当たる、主訴とその詳細問診の回答 1つにつき（主訴の性質に合うかを別枠で重く見る）
    signDetailCap: 0.2,
    extra: 0.05, // ほかに選んだ主訴の症状も効能に含まれる 1つにつき
    extraCap: 0.1,
  },
  /** 推薦できる適合度（good）と、参考程度（fair）のしきい値 */
  good: 0.45,
  fair: 0.25,
  /** 「傾向あり」とみなす点数 */
  tendency: 20,
};

export type FitLevel = 'good' | 'fair' | 'weak' | 'unfit';
export const FIT_LEVEL_LABEL: Record<FitLevel, string> = { good: '適合', fair: 'やや適合', weak: '一致が弱い', unfit: '不適合' };
/** 適合の記号（第5弾 3-11：指数の数字は出さず ◎○△ で） */
export const FIT_LEVEL_SYMBOL: Record<FitLevel, string> = { good: '◎', fair: '○', weak: '△', unfit: '×' };
export type Axis = '主訴の詳細' | '気血水' | '寒熱' | '虚実' | '五臓' | '随伴症状';
export interface FitPoint { axis: Axis; text: string }

export interface Candidate {
  code: string;
  name: string;
  reading: string;
  formula: Formula;
  /** この主訴（グループ）で候補になった根拠＝効能・効果の該当語 */
  matched: { symptom: string; term: string }[];
  /** ほかの主訴の症状で、この漢方薬の効能・効果にも含まれるもの */
  alsoCovers: { symptom: string; term: string }[];
  fit: number;
  level: FitLevel;
  qbf: number;
  organ: number;
  matches: FitPoint[];
  /** 不適合の理由（逆の虚実・逆の寒熱など）。1つでもあれば推薦しない */
  mismatches: FitPoint[];
  /** 軽いずれ（推薦は可能だが一致が弱まる点） */
  gaps: FitPoint[];
  signsMatched: string[];
  safety: FormulaSafety;
  /** 効能・効果の記載順（主たる効能ほど小さい）。同点時の並びに使う */
  efficacyIndex: number;
}

export type GroupOutcome = 'pick' | 'pick_check' | 'no_pool' | 'no_fit' | 'all_excluded';
export interface DetailAnswer {
  id: string;
  text: string;
  /** 回答した詳細問診の設問ID */
  question: string;
  /** 主訴の性質として候補群の抽出に加える症状コード */
  symptoms: string[];
  /** 随伴症状の症状コード（加点のみ） */
  also: string[];
}
export interface ComplaintGroup {
  /** いちばん改善したい主訴の選択肢ID */
  key: string;
  label: string;
  /** 大カテゴリー名 */
  category: string;
  /** 詳細問診で選んだ回答（「特になし」などは除く） */
  details: DetailAnswer[];
  /** 主訴そのものの症状コード */
  ownSymptoms: string[];
  /** 候補群の抽出に使う症状コード（主訴そのもの＋詳細問診で特定した症状） */
  symptoms: string[];
  /** 随伴症状の症状コード（詳細問診の随伴症状＋ほかに選んだ主訴）。候補群には加えない */
  also: string[];
  candidates: Candidate[];
  pick?: Candidate;
  outcome: GroupOutcome;
}
export interface Companion { id: string; label: string; category: string; symptoms: string[] }
export interface Selection {
  /** いちばん改善したい主訴（0件か1件） */
  groups: ComplaintGroup[];
  /** ほかに選んだ主訴（随伴症状として扱う） */
  companions: Companion[];
  /** 安全確認タグ（未確認のあいだは提案を確定しない） */
  tags: TagHit[];
  /** 全候補に共通の確認事項（情報不足・未確認のタグ・服用中の薬など。候補の上に1回だけ出す。第4弾 3-8） */
  general: string[];
  /** 確認タブで確認すると共通の確認事項が外れる行（未確認）と、それ以外で外れる事項の数（第5弾 3-10） */
  pendingKeys: string[];
  pendingOther: number;
  /** 甘草を含まない処方を上に並べたか（第5弾 3-14） */
  preferNoLicorice: boolean;
  /** 食品アレルギーで選ばれた食品（候補の除外理由の表示用） */
  foods: { id: string; food: string }[];
}

export const OUTCOME_LABEL: Record<GroupOutcome, string> = {
  pick: '推薦',
  pick_check: '推薦（要確認）',
  no_pool: '効能に当たる候補なし',
  no_fit: '体質に合う候補なし',
  all_excluded: '安全性で全て除外',
};

const STRENGTH_ORDER: Record<Strength, number> = { def: 0, mid: 1, exc: 2 };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 照合に使う集合：present の所見と、選ばれている選択肢ID（舌などの薬剤師の観察を含む） */
export function chosenSet(w: WalkResult): Set<string> {
  return new Set([...presentIds(w.state), ...w.chosen]);
}
/** 主訴そのものと深掘りの回答から得た所見・選択肢（使用目標の一致を「主訴の詳細」として重く見る） */
export function complaintSignSet(w: WalkResult): Set<string> {
  const out = new Set<string>();
  for (const [id, e] of w.state) if (e.status === 'present' && (e.section === 'complaint' || e.section === 'detail')) out.add(id);
  for (const s of w.steps) if (s.q.section === 'complaint' || s.q.section === 'detail') for (const id of s.ids) out.add(id);
  return out;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** ほかに選んだ主訴（随伴症状） */
export function companionComplaints(w: WalkResult): Companion[] {
  return w.complaints.filter((id) => id !== w.primary).map((id) => {
    const info = complaintInfo(id)!;
    return { id, label: info.label, category: info.category, symptoms: info.complaint.symptoms };
  });
}

/** いちばん改善したい主訴と、その深掘りの回答から症状コードをまとめる */
export function mainComplaintGroup(w: WalkResult): Omit<ComplaintGroup, 'candidates' | 'pick' | 'outcome'> | undefined {
  const info = w.primary ? complaintInfo(w.primary) : undefined;
  if (!w.primary || !info) return undefined;
  const details: DetailAnswer[] = [];
  for (const st of w.steps) {
    if (st.q.section !== 'detail') continue;
    for (const id of st.ids) {
      const o = st.q.options.find((x) => x.id === id);
      if (!o || o.exclusive) continue;
      details.push({ id, text: o.text, question: st.q.id, symptoms: o.symptoms ?? [], also: o.also ?? [] });
    }
  }
  const ownSymptoms = info.complaint.symptoms;
  const symptoms = uniq([...ownSymptoms, ...details.flatMap((d) => d.symptoms)]);
  const also = uniq([...details.flatMap((d) => d.also), ...companionComplaints(w).flatMap((c) => c.symptoms)]).filter((x) => !symptoms.includes(x));
  return { key: w.primary, label: info.label, category: info.category, details, ownSymptoms, symptoms, also };
}

/** 効能・効果のうち、症状コードに当たるもの（条件つきの効能は条件を満たすときだけ） */
export function matchIndications(f: Formula, symptoms: Iterable<string>, chosen: Set<string>): { symptom: string; term: string; index: number }[] {
  const set = new Set(symptoms);
  const out: { symptom: string; term: string; index: number }[] = [];
  f.indications.forEach((ind, index) => {
    if (!set.has(ind.symptom)) return;
    if (ind.requires && !ind.requires.some((id) => chosen.has(id))) return;
    if (!out.some((x) => x.symptom === ind.symptom && x.term === ind.term)) out.push({ symptom: ind.symptom, term: ind.term, index });
  });
  return out;
}

const typeName = (t: AxisKey) => axisName(t);

/** STEP 2：体質との適合性 */
export function evaluateFit(f: Formula, result: ScoreResult, chosen: Set<string>, otherSymptoms: Set<string>, complaintSigns: Set<string> = new Set()): Omit<Candidate, 'code' | 'name' | 'reading' | 'formula' | 'matched' | 'safety' | 'efficacyIndex'> {
  const W = SELECTION.weight;
  const matches: FitPoint[] = [];
  const mismatches: FitPoint[] = [];
  const gaps: FitPoint[] = [];
  let fit = 0;

  // ① 気血水
  const entries = Object.entries(f.types) as [AxisKey, number][];
  const wsum = entries.reduce((s, [, w]) => s + w, 0) || 1;
  const qbf = entries.reduce((s, [t, w]) => s + w * (result.pct[t] / 100), 0) / wsum;
  fit += W.qbf * qbf;
  const hit = entries.filter(([t]) => result.pct[t] >= SELECTION.tendency).sort((a, b) => result.pct[b[0]] - result.pct[a[0]]);
  const main = [...entries].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (hit.length) {
    matches.push({ axis: '気血水', text: `${hit.map(([t]) => `${typeName(t)} ${result.pct[t]}点${(result.mainTypes as AxisKey[]).includes(t) ? '（主体質）' : (result.subTypes as AxisKey[]).includes(t) ? '（副体質）' : ''}`).join('・')}の傾向が、この漢方薬が整える対象と重なります` });
  }
  if (main && result.pct[main] < SELECTION.tendency) {
    gaps.push({ axis: '気血水', text: `主な対象の${typeName(main)}は ${result.pct[main]}点で、傾向がはっきりしません` });
  }

  // ② 寒熱
  const th = result.thermalLabel;
  if (f.thermal !== 'neutral' && th !== 'neutral') {
    const ok = (f.thermal === 'warm' && th === 'cold') || (f.thermal === 'cool' && th === 'hot');
    if (ok) {
      fit += W.thermal;
      matches.push({ axis: '寒熱', text: `${THERMAL_STATE_LABEL[th]}の体質に、${THERMAL_LABEL[f.thermal]}性質の漢方薬が合います` });
    } else {
      mismatches.push({ axis: '寒熱', text: `${THERMAL_STATE_LABEL[th]}の体質に、${THERMAL_LABEL[f.thermal]}性質の漢方薬は合いません` });
    }
  }
  if (f.thermal === 'cool' && th === 'hot' && f.heat && result.heatKind) {
    if (f.heat === result.heatKind) {
      fit += W.heat;
      matches.push({ axis: '寒熱', text: `熱の種類（${HEAT_KIND_LABEL[result.heatKind]}）が、この漢方薬の対象（${HEAT_LABEL[f.heat]}）と一致します` });
    } else if (f.heat === 'excess' && result.heatKind === 'deficient') {
      mismatches.push({ axis: '寒熱', text: `潤い不足による熱（虚熱）に、余分な熱（実熱）を冷ます漢方薬は合いません` });
    } else {
      fit += W.heatSoft;
      gaps.push({ axis: '寒熱', text: `熱の種類（${HEAT_KIND_LABEL[result.heatKind]}）が、この漢方薬の対象（${HEAT_LABEL[f.heat]}）とずれます` });
    }
  }

  // ③ 虚実（使用目標の体力の範囲）
  const me = result.defExcLabel;
  const dist = Math.min(...f.strength.map((s) => Math.abs(STRENGTH_ORDER[s] - STRENGTH_ORDER[me])));
  const range = strengthRangeLabel(f.strength);
  if (dist === 0) {
    fit += W.strengthIn;
    matches.push({ axis: '虚実', text: `体力の目安：あなたは${DEF_EXC_LABEL[me]}で、使用目標の「${range}」に合います` });
  } else if (dist === 1) {
    fit += W.strengthNear;
    gaps.push({ axis: '虚実', text: `体力の目安：あなたは${DEF_EXC_LABEL[me]}で、使用目標の「${range}」とややずれます` });
  } else {
    mismatches.push({ axis: '虚実', text: `体力の目安：あなたは${DEF_EXC_LABEL[me]}で、使用目標の「${range}」と逆です` });
  }

  // ④ 五臓
  const organ = f.organs.reduce((s, o) => s + (result.organPct?.[o] ?? 0) / 100, 0) / (f.organs.length || 1);
  fit += W.organ * organ;
  const organHit = f.organs.filter((o) => (result.organPct?.[o] ?? 0) >= SELECTION.tendency);
  if (organHit.length) {
    matches.push({ axis: '五臓', text: `${organHit.map((o: OrganKey) => `${ORGAN_PLAIN[o]} ${result.organPct[o]}点`).join('・')}の不調の傾向があり、この漢方薬が働きかける臓と重なります` });
  }

  // ⑤ 主訴の詳細・随伴症状（使用目標に当たる回答）
  const signsMatched = f.signs.filter((id) => chosen.has(id));
  const isComplaintSign = (id: string) => complaintSigns.has(id);
  const nDetail = signsMatched.filter(isComplaintSign).length;
  fit += Math.min(W.signCap, W.sign * (signsMatched.length - nDetail)) + Math.min(W.signDetailCap, W.signDetail * nDetail);
  const signText = (ids: string[]) => `回答「${ids.slice(0, 4).map(findingLabel).join('」「')}」${ids.length > 4 ? `ほか${ids.length - 4}件` : ''}が、使用目標「${f.useTarget}」に当てはまります`;
  const detailSigns = signsMatched.filter(isComplaintSign);
  const otherSigns = signsMatched.filter((id) => !isComplaintSign(id));
  // 主訴とその詳細問診の一致を先に出す（主訴の性質に合うかがいちばん大事）
  if (detailSigns.length) matches.unshift({ axis: '主訴の詳細', text: signText(detailSigns) });
  if (otherSigns.length) matches.push({ axis: '随伴症状', text: signText(otherSigns) });
  // 随伴症状（詳細問診の随伴症状・ほかに選んだ主訴）も効能に含むか（同じ症状を指す語が複数あっても1つと数える）
  const alsoCovers: { symptom: string; term: string }[] = [];
  for (const m of matchIndications(f, otherSymptoms, chosen)) if (!alsoCovers.some((x) => x.symptom === m.symptom)) alsoCovers.push({ symptom: m.symptom, term: m.term });
  fit += Math.min(W.extraCap, W.extra * alsoCovers.length);
  if (alsoCovers.length) {
    matches.push({ axis: '随伴症状', text: `あわせて気になる「${alsoCovers.map((x) => symptomLabel(x.symptom)).join('」「')}」も、効能・効果（${alsoCovers.map((x) => x.term).join('、')}）に含まれます` });
  }

  fit = round2(fit);
  const evidence = qbf >= SELECTION.tendency / 100 || signsMatched.length > 0;
  const level: FitLevel = mismatches.length ? 'unfit' : fit >= SELECTION.good && evidence ? 'good' : fit >= SELECTION.fair ? 'fair' : 'weak';
  return { fit, level, qbf: round2(qbf), organ: round2(organ), matches, mismatches, gaps, signsMatched, alsoCovers };
}

const LEVEL_ORDER: Record<FitLevel, number> = { good: 0, fair: 1, weak: 2, unfit: 3 };
export function compareCandidates(a: Candidate, b: Candidate, preferNoLicorice = false): number {
  const ex = (c: Candidate) => (c.safety.status === 'excluded' ? 1 : 0);
  const unfit = (c: Candidate) => (c.level === 'unfit' ? 1 : 0);
  // 低カリウム・利尿薬・高血圧・心臓・腎臓 → 甘草を含まない処方を上に（第5弾 3-14。構成生薬で判定、未登録は含むとみなす）
  const lic = (c: Candidate) => (preferNoLicorice && c.safety.licorice !== 0 ? 1 : 0);
  return ex(a) - ex(b) || unfit(a) - unfit(b) || lic(a) - lic(b) || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.fit - a.fit || a.efficacyIndex - b.efficacyIndex || a.formula.priority - b.formula.priority;
}

/** 二段階選定の本体（いちばん改善したい主訴を中心に、候補群 → 体質で選ぶ） */
export function selectFormulas(result: ScoreResult, answers: Answers, w: WalkResult, flags: SafetyFlag[], tags: TagHit[], formulas: Formula[], input: SafetyInput = {}): Selection {
  const chosen = chosenSet(w);
  const csigns = complaintSignSet(w);
  const sctx = safetyContext(flags, answers, w, tags, input);
  const g = mainComplaintGroup(w);
  const groups: ComplaintGroup[] = [];
  if (g) {
    const own = new Set(g.symptoms);
    const others = new Set(g.also);
    // STEP 1：主訴の症状に対応する効能・効果を持つ漢方薬だけを候補にする
    const candidates: Candidate[] = [];
    for (const f of formulas) {
      if (!f.active) continue;
      const matched = matchIndications(f, own, chosen);
      if (!matched.length) continue;
      const ev = evaluateFit(f, result, chosen, others, csigns); // STEP 2
      const safety = assessFormulaSafety(f, sctx); // STEP 4
      candidates.push({
        code: f.code, name: f.name, reading: f.reading, formula: f,
        matched: matched.map(({ symptom, term }) => ({ symptom, term })),
        efficacyIndex: Math.min(...matched.map((m) => m.index)),
        safety, ...ev,
      });
    }
    candidates.sort((a, b) => compareCandidates(a, b, sctx.preferNoLicorice)); // STEP 3
    const usable = candidates.filter((c) => c.safety.status !== 'excluded');
    const pick = usable.find((c) => c.level === 'good');
    const outcome: GroupOutcome = !candidates.length ? 'no_pool' : !usable.length ? 'all_excluded' : !pick ? 'no_fit' : pick.safety.status === 'check' ? 'pick_check' : 'pick';
    groups.push({ ...g, candidates, pick, outcome });
  }
  return {
    groups, companions: companionComplaints(w), tags, general: sctx.general, pendingKeys: sctx.pendingKeys, pendingOther: sctx.pendingOther,
    preferNoLicorice: sctx.preferNoLicorice, foods: sctx.foods.map((x) => ({ id: x.id, food: x.food })),
  };
}

// --- STEP 5：推薦理由 ----------------------------------------------------------

export interface Reasons {
  /** ① この漢方薬が主訴に対する候補となる理由（承認された効能・効果） */
  complaint: string;
  /** ② 候補群の中で体質に適合する理由（気血水・寒熱・虚実・五臓・随伴症状） */
  constitution: string[];
  /** 使用目標（承認された効能・効果の前段） */
  useTarget: string;
  /** 漢方医学的な作用（効能・効果とは別の、漢方の考え方による説明） */
  action: string;
  /** ③ ほかの候補との比較 */
  comparison: string[];
  /** ④ 服用前に確認すべき注意事項 */
  cautions: string[];
}

function comparisonLine(c: Candidate, pick: Candidate, result: ScoreResult): string {
  const head = `${c.name}（${c.formula.targetLabel}）`;
  if (c.safety.status === 'excluded') return `${head}：除外（${c.safety.exclude.join('、')}）`;
  if (c.mismatches.length) return `${head}：${c.mismatches[0].text}。`;
  if (c.level === 'good' && c.fit === pick.fit) {
    return `${head}：体質との一致は同程度ですが、${pick.name}は効能・効果の中で「${pick.matched[0]?.term ?? ''}」をより主な対象として挙げているため優先しました。`;
  }
  if (c.qbf + 0.05 < pick.qbf) {
    const low = (Object.entries(c.formula.types) as [AxisKey, number][]).filter(([t]) => result.pct[t] < SELECTION.tendency).sort((a, b) => b[1] - a[1]);
    if (low.length) return `${head}：この漢方薬が対象とする${low.map(([t]) => `${typeName(t)}（${result.pct[t]}点）`).join('・')}の傾向が見られず、体質との一致が少なくなりました。`;
    return `${head}：対象とする体質との重なりが、${pick.name}より少なくなりました。`;
  }
  if (c.signsMatched.length < pick.signsMatched.length) return `${head}：使用目標に当てはまる回答が少なく、体質との一致が少なくなりました。`;
  if (c.gaps.length) return `${head}：${c.gaps[0].text}。`;
  if (c.level !== 'good') return `${head}：体質との一致がはっきりしませんでした。`;
  return `${head}：体質との一致は近いものの、${pick.name}のほうがわずかに多く一致しました。`;
}

/** STEP 5：推薦理由（実際の回答と体質チェックの結果だけを使う） */
export function buildReasons(group: ComplaintGroup, c: Candidate, result: ScoreResult, opts: { maxCompare?: number } = {}): Reasons {
  const matchedSy = new Set(c.matched.map((m) => m.symptom));
  const fromMain = group.ownSymptoms.some((x) => matchedSy.has(x));
  const fromDetails = group.details.filter((d) => d.symptoms.some((x) => matchedSy.has(x))).map((d) => d.text);
  const terms = uniq(c.matched.map((m) => m.term));
  const what = fromMain
    ? `「${group.label}」（${group.category}）${fromDetails.length ? `の「${fromDetails.join('」「')}」` : ''}`
    : `「${group.label}」の詳しい症状「${fromDetails.join('」「')}」`;
  const complaint = `いちばん改善したいお悩み${what}は、${c.name}の効能・効果（承認された内容）にある「${terms.join('」「')}」に当たるため、候補になりました。`;
  const constitution = c.matches.map((m) => `【${m.axis}】${m.text}`);
  for (const g of c.gaps) constitution.push(`【${g.axis}・ずれ】${g.text}`);
  const others = group.candidates.filter((x) => x.code !== c.code);
  const axes = [...new Set(c.matches.map((m) => m.axis))];
  const comparison = [
    others.length
      ? `この主訴の候補${group.candidates.length}種類のうち、${c.name}は${axes.map((a) => `【${a}】`).join('')}が一致し、体質との適合がもっとも高くなりました。`
      : `この主訴の候補は${c.name}だけで、${axes.map((a) => `【${a}】`).join('')}が一致しました。`,
    ...others.slice(0, opts.maxCompare ?? 10).map((x) => comparisonLine(x, c, result)),
  ];
  const cautions = [...c.safety.own, ...c.safety.notes, ...GENERAL_NOTES]; // 全候補に共通の確認事項は候補の上に1回だけ（第5弾 3-9）
  if (c.formula.note) cautions.unshift(c.formula.note);
  return { complaint, constitution, useTarget: `${c.formula.useTarget}方`, action: c.formula.action, comparison, cautions };
}

/** スタッフの提案保存用（監査）：表示した候補の要約 */
export function selectionSnapshot(sel: Selection) {
  return sel.groups.map((g) => ({
    complaint: g.label,
    category: g.category,
    companions: sel.companions.map((c) => c.label),
    details: g.details.map((d) => d.text),
    outcome: g.outcome,
    pick: g.pick?.code,
    candidates: g.candidates.map((c) => ({ code: c.code, name: c.name, fit: c.fit, level: c.level, safety: c.safety.status, terms: c.matched.map((m) => m.term) })),
  }));
}
