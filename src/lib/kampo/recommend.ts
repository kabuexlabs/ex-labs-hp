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
// 主訴が承認された効能・効果に当たらない（毛穴・たるみ・抜け毛など）ときは候補群が空になり、推薦しない。
// 重み・しきい値は SELECTION の初期値。店頭の実データで薬剤師が調整する。
// ---------------------------------------------------------------------------
import {
  TYPE_DEFS, ORGAN_PLAIN, THERMAL_LABEL, HEAT_LABEL, QUESTIONS,
  optionText, symptomLabel, strengthRangeLabel, questionOfOption,
  type Formula, type TypeKey, type OrganKey, type Strength, type Question,
} from './masters.ts';
import { chosenComplaintIds, mainComplaintId, complaintInfo } from './complaints.ts';
import { DEF_EXC_LABEL, THERMAL_STATE_LABEL, HEAT_KIND_LABEL, type Answers, type ScoreResult } from './scoring.ts';
import { hasRefer, safetyContext, assessFormulaSafety, GENERAL_NOTES, type SafetyFlag, type FreeTexts, type FormulaSafety } from './safety.ts';

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

export type GroupOutcome = 'pick' | 'pick_check' | 'no_pool' | 'no_fit' | 'all_excluded' | 'other';
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
  /** いちばん改善したい主訴（0件か1件。主訴が未選択の旧データは0件） */
  groups: ComplaintGroup[];
  /** ほかに選んだ主訴（随伴症状として扱う） */
  companions: Companion[];
  /** 受診勧奨があれば来店客向けの推薦は出さない */
  refer: boolean;
  /** その他（自由記入）の主訴 */
  otherComplaint?: string;
}

export const OUTCOME_LABEL: Record<GroupOutcome, string> = {
  pick: '推薦',
  pick_check: '推薦（要確認）',
  no_pool: '効能に当たる候補なし',
  no_fit: '体質に合う候補なし',
  all_excluded: '安全性で全て除外',
  other: 'その他（自由記入）',
};

const STRENGTH_ORDER: Record<Strength, number> = { def: 0, mid: 1, exc: 2 };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 主訴の詳細問診の設問（いちばん改善したい主訴の detail と showIf.mainDetail で対応づけ） */
export function detailQuestionsFor(complaintId: string, questions: Question[] = QUESTIONS): Question[] {
  const tpl = complaintInfo(complaintId)?.option.detail;
  return tpl ? questions.filter((q) => q.role === 'detail' && q.showIf?.mainDetail === tpl) : [];
}

/** 選ばれている選択肢ID（舌は薬剤師の所見があれば差し替え） */
export function chosenSet(answers: Answers, tongueOverride?: string[]): Set<string> {
  const ids = new Set<string>();
  for (const [qid, arr] of Object.entries(answers)) {
    if (qid === 'B13' && tongueOverride && tongueOverride.length) continue;
    for (const id of arr) ids.add(id);
  }
  for (const id of tongueOverride ?? []) ids.add(id);
  return ids;
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

/** ほかに選んだ主訴（随伴症状） */
export function companionComplaints(answers: Answers, texts: FreeTexts = {}): Companion[] {
  const main = mainComplaintId(answers);
  return chosenComplaintIds(answers).filter((id) => id !== main).map((id) => {
    const info = complaintInfo(id, texts)!;
    return { id, label: info.label, category: info.category, symptoms: info.option.symptoms ?? [] };
  });
}

/** いちばん改善したい主訴と、その詳細問診の回答から症状コードをまとめる */
export function mainComplaintGroup(answers: Answers, texts: FreeTexts = {}, questions: Question[] = QUESTIONS): Omit<ComplaintGroup, 'candidates' | 'pick' | 'outcome'> | undefined {
  const main = mainComplaintId(answers);
  const info = main ? complaintInfo(main, texts) : undefined;
  if (!main || !info) return undefined;
  const details: DetailAnswer[] = [];
  for (const dq of detailQuestionsFor(main, questions)) {
    for (const id of answers[dq.id] ?? []) {
      const o = dq.options.find((x) => x.id === id);
      if (!o || o.flags?.includes('none')) continue;
      const t = (texts[id] ?? '').trim();
      details.push({ id, text: o.freeText && t ? `${o.text}（${t}）` : o.text, question: dq.id, symptoms: o.symptoms ?? [], also: o.also ?? [] });
    }
  }
  const ownSymptoms = info.option.symptoms ?? [];
  const symptoms = uniq([...ownSymptoms, ...details.flatMap((d) => d.symptoms)]);
  const also = uniq([...details.flatMap((d) => d.also), ...companionComplaints(answers, texts).flatMap((c) => c.symptoms)]).filter((x) => !symptoms.includes(x));
  return { key: main, label: info.label, category: info.category, details, ownSymptoms, symptoms, also };
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

const typeName = (t: TypeKey) => (t === 'yin_def' ? '陰虚（水不足）' : TYPE_DEFS[t].name);

/** STEP 2：体質との適合性 */
export function evaluateFit(f: Formula, result: ScoreResult, chosen: Set<string>, otherSymptoms: Set<string>): Omit<Candidate, 'code' | 'name' | 'reading' | 'formula' | 'matched' | 'safety' | 'efficacyIndex'> {
  const W = SELECTION.weight;
  const matches: FitPoint[] = [];
  const mismatches: FitPoint[] = [];
  const gaps: FitPoint[] = [];
  let fit = 0;

  // ① 気血水
  const entries = Object.entries(f.types) as [TypeKey, number][];
  const wsum = entries.reduce((s, [, w]) => s + w, 0) || 1;
  const qbf = entries.reduce((s, [t, w]) => s + w * (result.pct[t] / 100), 0) / wsum;
  fit += W.qbf * qbf;
  const hit = entries.filter(([t]) => result.pct[t] >= SELECTION.tendency).sort((a, b) => result.pct[b[0]] - result.pct[a[0]]);
  const main = [...entries].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (hit.length) {
    matches.push({ axis: '気血水', text: `${hit.map(([t]) => `${typeName(t)} ${result.pct[t]}点${result.mainTypes.includes(t) ? '（主体質）' : result.subTypes.includes(t) ? '（副体質）' : ''}`).join('・')}の傾向が、この漢方薬が整える対象と重なります` });
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
  const isComplaintSign = (id: string) => ['complaint', 'detail'].includes(questionOfOption(id)?.role ?? '');
  const nDetail = signsMatched.filter(isComplaintSign).length;
  fit += Math.min(W.signCap, W.sign * (signsMatched.length - nDetail)) + Math.min(W.signDetailCap, W.signDetail * nDetail);
  const signText = (ids: string[]) => `回答「${ids.slice(0, 4).map(optionText).join('」「')}」${ids.length > 4 ? `ほか${ids.length - 4}件` : ''}が、使用目標「${f.useTarget}」に当てはまります`;
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
export function compareCandidates(a: Candidate, b: Candidate): number {
  const ex = (c: Candidate) => (c.safety.status === 'excluded' ? 1 : 0);
  return ex(a) - ex(b) || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.fit - a.fit || a.efficacyIndex - b.efficacyIndex || a.formula.priority - b.formula.priority;
}

/** 二段階選定の本体（いちばん改善したい主訴を中心に、候補群 → 体質で選ぶ） */
export function selectFormulas(result: ScoreResult, answers: Answers, texts: FreeTexts, flags: SafetyFlag[], formulas: Formula[], tongueOverride?: string[]): Selection {
  const chosen = chosenSet(answers, tongueOverride);
  const sctx = safetyContext(flags, answers, texts);
  const g = mainComplaintGroup(answers, texts);
  const companions = companionComplaints(answers, texts);
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
      const ev = evaluateFit(f, result, chosen, others); // STEP 2
      const safety = assessFormulaSafety(f, sctx); // STEP 4
      candidates.push({
        code: f.code, name: f.name, reading: f.reading, formula: f,
        matched: matched.map(({ symptom, term }) => ({ symptom, term })),
        efficacyIndex: Math.min(...matched.map((m) => m.index)),
        safety, ...ev,
      });
    }
    candidates.sort(compareCandidates); // STEP 3
    const usable = candidates.filter((c) => c.safety.status !== 'excluded');
    const pick = usable.find((c) => c.level === 'good');
    const isOther = !!complaintInfo(g.key)?.option.freeText;
    const outcome: GroupOutcome = !candidates.length
      ? (isOther ? 'other' : 'no_pool')
      : !usable.length
        ? 'all_excluded'
        : !pick
          ? 'no_fit'
          : pick.safety.status === 'check'
            ? 'pick_check'
            : 'pick';
    groups.push({ ...g, candidates, pick, outcome });
  }
  const others = chosenComplaintIds(answers).filter((id) => complaintInfo(id)?.option.freeText);
  const otherComplaint = others.length
    ? others.map((id) => { const i = complaintInfo(id)!; return `${i.category}：${(texts[id] ?? '').trim() || '（記入なし）'}`; }).join('／')
    : undefined;
  return { groups, companions, refer: hasRefer(flags), otherComplaint };
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

function comparisonLine(c: Candidate, pick: Candidate, result: ScoreResult, forCustomer: boolean): string {
  const head = `${c.name}（${c.formula.targetLabel}）`;
  if (c.safety.status === 'excluded') return forCustomer ? `${head}：安全確認の回答から、今回は候補から外しました。` : `${head}：除外（${c.safety.exclude.join('、')}）`;
  if (c.mismatches.length) return `${head}：${c.mismatches[0].text}。`;
  if (c.level === 'good' && c.fit === pick.fit) {
    return `${head}：体質との一致は同程度ですが、${pick.name}は効能・効果の中で「${pick.matched[0]?.term ?? ''}」をより主な対象として挙げているため優先しました。`;
  }
  if (c.qbf + 0.05 < pick.qbf) {
    const low = (Object.entries(c.formula.types) as [TypeKey, number][]).filter(([t]) => result.pct[t] < SELECTION.tendency).sort((a, b) => b[1] - a[1]);
    if (low.length) return `${head}：この漢方薬が対象とする${low.map(([t]) => `${typeName(t)}（${result.pct[t]}点）`).join('・')}の傾向が見られず、体質との一致が少なくなりました。`;
    return `${head}：対象とする体質との重なりが、${pick.name}より少なくなりました。`;
  }
  if (c.signsMatched.length < pick.signsMatched.length) return `${head}：使用目標に当てはまる回答が少なく、体質との一致が少なくなりました。`;
  if (c.gaps.length) return `${head}：${c.gaps[0].text}。`;
  if (c.level !== 'good') return `${head}：体質との一致がはっきりしませんでした。`;
  return `${head}：体質との一致は近いものの、${pick.name}のほうがわずかに多く一致しました。`;
}

/** STEP 5：推薦理由（実際の回答と体質チェックの結果だけを使う） */
export function buildReasons(group: ComplaintGroup, c: Candidate, result: ScoreResult, opts: { forCustomer?: boolean; maxCompare?: number } = {}): Reasons {
  const forCustomer = opts.forCustomer ?? false;
  const matchedSy = new Set(c.matched.map((m) => m.symptom));
  const fromMain = group.ownSymptoms.some((x) => matchedSy.has(x));
  const fromDetails = group.details.filter((d) => d.symptoms.some((x) => matchedSy.has(x))).map((d) => d.text);
  const terms = uniq(c.matched.map((m) => m.term));
  const what = fromMain
    ? `「${group.label}」（${group.category}）${fromDetails.length ? `の「${fromDetails.join('」「')}」` : ''}`
    : `「${group.label}」の詳しい症状「${fromDetails.join('」「')}」`;
  const complaint = `いちばん改善したいお悩み${what}は、${c.name}の効能・効果（承認された内容）にある「${terms.join('」「')}」に当たるため、候補になりました。`;
  const constitution = c.matches.map((m) => `【${m.axis}】${m.text}`);
  if (!forCustomer) for (const g of c.gaps) constitution.push(`【${g.axis}・ずれ】${g.text}`);
  const others = group.candidates.filter((x) => x.code !== c.code && (!forCustomer || x.safety.status !== 'excluded'));
  const axes = [...new Set(c.matches.map((m) => m.axis))];
  const comparison = [
    others.length
      ? `この主訴の候補${group.candidates.length}種類のうち、${c.name}は${axes.map((a) => `【${a}】`).join('')}が一致し、体質との適合がもっとも高くなりました。`
      : `この主訴の候補は${c.name}だけで、${axes.map((a) => `【${a}】`).join('')}が一致しました。`,
    ...others.slice(0, opts.maxCompare ?? (forCustomer ? 3 : 10)).map((x) => comparisonLine(x, c, result, forCustomer)),
  ];
  if (forCustomer && group.candidates.some((x) => x.safety.status === 'excluded')) comparison.push('ほかに、安全確認の回答から今回は候補から外した漢方薬があります。');
  const cautions = [...c.safety.check, ...c.safety.notes, ...GENERAL_NOTES];
  if (c.formula.note) cautions.unshift(c.formula.note);
  return { complaint, constitution, useTarget: `${c.formula.useTarget}方`, action: c.formula.action, comparison, cautions };
}

/** 来店客向けにまとめる：主訴ごとの推薦を、同じ漢方薬なら1つに束ねる */
export interface CustomerPick {
  candidate: Candidate;
  groups: ComplaintGroup[];
  reasons: Reasons;
  status: 'ok' | 'check';
}
export function customerPicks(sel: Selection, result: ScoreResult): { picks: CustomerPick[]; messages: { label: string; text: string }[] } {
  if (sel.refer) return { picks: [], messages: [] };
  const picks: CustomerPick[] = [];
  const messages: { label: string; text: string }[] = [];
  for (const g of sel.groups) {
    if (g.pick) {
      const same = picks.find((p) => p.candidate.code === g.pick!.code);
      if (same) { same.groups.push(g); continue; }
      picks.push({ candidate: g.pick, groups: [g], reasons: buildReasons(g, g.pick, result, { forCustomer: true }), status: g.pick.safety.status === 'check' ? 'check' : 'ok' });
      continue;
    }
    if (g.outcome === 'other') continue; // 「その他のお悩み」として別に表示する
    const text: Record<Exclude<GroupOutcome, 'pick' | 'pick_check' | 'other'>, string> = {
      no_pool: `「${g.label}」を効能・効果に持つ一般用の漢方薬がないため、ここでは漢方薬の候補を挙げていません。体質に合わせた養生とあわせて、薬剤師がお話を伺います。`,
      no_fit: `候補になる漢方薬（${g.candidates.filter((c) => c.safety.status !== 'excluded').length}種類）の中に、あなたの体質にはっきり合うものが見つかりませんでした。無理におすすめせず、薬剤師が詳しくお話を伺います。`,
      all_excluded: '安全確認の回答から、候補になる漢方薬をおすすめできませんでした。薬剤師にご相談ください。',
    };
    messages.push({ label: g.label, text: text[g.outcome as Exclude<GroupOutcome, 'pick' | 'pick_check' | 'other'>] });
  }
  // 同じ注意生薬を含む漢方薬が複数並ぶときは、重複に注意を促す
  for (const herb of ['甘草', '麻黄', '大黄', '附子']) {
    const withHerb = picks.filter((p) => p.candidate.formula.cautionHerbs.includes(herb));
    if (withHerb.length > 1) for (const p of withHerb) p.reasons.cautions.unshift(`ここに挙げた複数の漢方薬（${withHerb.map((x) => x.candidate.name).join('・')}）に${herb}が含まれます。一緒に飲む場合は合計量に注意が必要なため、薬剤師が組み合わせを確認します。`);
  }
  // 束ねたものは、主訴の理由を複数まとめる
  for (const p of picks) {
    if (p.groups.length > 1) {
      p.reasons.complaint = p.groups.map((g) => buildReasons(g, p.candidate, result, { forCustomer: true }).complaint).join('\n');
    }
  }
  return { picks, messages };
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
