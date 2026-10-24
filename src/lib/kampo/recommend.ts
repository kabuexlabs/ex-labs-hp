// ---------------------------------------------------------------------------
// 漢方薬の選定（純粋関数）：主訴を起点とした二段階選定方式。
//
//   STEP 1 主訴 → 候補群
//     来店客が選んだ主訴（A3）と、その詳細（A3a〜A3m の症状）に対応する漢方薬を、
//     承認された効能・効果（formulas.json の indications）だけで抽出する。
//     体質スコアを理由に、主訴と関係のない漢方薬を候補に加えることはしない。
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
// 重み・しきい値は SELECTION の初期値。店頭の実データで薬剤師が調整する。
// ---------------------------------------------------------------------------
import {
  TYPE_DEFS, ORGAN_LABEL, ORGAN_PLAIN, THERMAL_LABEL, HEAT_LABEL, QUESTIONS,
  optionText, questionById, symptomLabel, strengthRangeLabel,
  type Formula, type TypeKey, type OrganKey, type Strength, type Question,
} from './masters.ts';
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
    sign: 0.1, // 使用目標・随伴症状に当たる回答 1つにつき
    signCap: 0.3,
    extra: 0.05, // ほかに選んだ主訴の症状も効能に含まれる 1つにつき
    extraCap: 0.1,
  },
  /** 推薦できる適合度（good）と、参考程度（fair）のしきい値 */
  good: 0.45,
  fair: 0.25,
  /** 「傾向あり」とみなす点数 */
  tendency: 20,
  /** 先の主訴で選んだ漢方薬を、この主訴でも優先してよい一致度の差 */
  reuseMargin: 0.1,
};

export type FitLevel = 'good' | 'fair' | 'weak' | 'unfit';
export const FIT_LEVEL_LABEL: Record<FitLevel, string> = { good: '適合', fair: 'やや適合', weak: '一致が弱い', unfit: '不適合' };
export type Axis = '気血水' | '寒熱' | '虚実' | '五臓' | '随伴症状';
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

export type GroupOutcome = 'pick' | 'pick_check' | 'no_detail' | 'no_pool' | 'no_fit' | 'all_excluded';
export interface ComplaintGroup {
  /** A3 の選択肢ID */
  key: string;
  label: string;
  /** 選ばれた詳細の選択肢ID と文言 */
  details: { id: string; text: string }[];
  symptoms: string[];
  candidates: Candidate[];
  pick?: Candidate;
  outcome: GroupOutcome;
}
export interface Selection {
  groups: ComplaintGroup[];
  /** 受診勧奨があれば来店客向けの推薦は出さない */
  refer: boolean;
  /** その他（自由記入）の主訴 */
  otherComplaint?: string;
}

export const OUTCOME_LABEL: Record<GroupOutcome, string> = {
  pick: '推薦',
  pick_check: '推薦（要確認）',
  no_detail: '症状の詳細なし',
  no_pool: '候補なし',
  no_fit: '体質に合う候補なし',
  all_excluded: '安全性で全て除外',
};

const STRENGTH_ORDER: Record<Strength, number> = { def: 0, mid: 1, exc: 2 };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 主訴（A3）ごとの詳細設問（showIf.chosen で対応づけ） */
export function detailQuestionFor(a3OptionId: string, questions: Question[] = QUESTIONS): Question | undefined {
  return questions.find((q) => q.showIf?.chosen?.includes(a3OptionId));
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

/** 主訴のグループ（A3 の選択順＝選択肢の並び順）と、その症状コード */
export function complaintGroups(answers: Answers, questions: Question[] = QUESTIONS): { key: string; label: string; details: { id: string; text: string }[]; symptoms: string[] }[] {
  const a3 = questionById('A3');
  if (!a3) return [];
  const chosenA3 = new Set(answers['A3'] ?? []);
  const out: { key: string; label: string; details: { id: string; text: string }[]; symptoms: string[] }[] = [];
  for (const o of a3.options) {
    if (!chosenA3.has(o.id) || o.freeText) continue;
    const dq = detailQuestionFor(o.id, questions);
    const ids = dq ? (answers[dq.id] ?? []).filter((id) => !dq.options.find((x) => x.id === id)?.flags?.includes('none')) : [];
    const details = ids.map((id) => ({ id, text: optionText(id) }));
    const symptoms = [...new Set(ids.flatMap((id) => dq?.options.find((x) => x.id === id)?.symptoms ?? []))];
    out.push({ key: o.id, label: o.text, details, symptoms });
  }
  return out;
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
  fit += Math.min(W.signCap, W.sign * signsMatched.length);
  if (signsMatched.length) {
    const shown = signsMatched.slice(0, 4).map(optionText);
    matches.push({ axis: '随伴症状', text: `回答「${shown.join('」「')}」${signsMatched.length > 4 ? `ほか${signsMatched.length - 4}件` : ''}が、使用目標「${f.useTarget}」に当てはまります` });
  }
  // ほかの主訴の症状も効能に含むか（同じ症状を指す語が複数あっても1つと数える）
  const alsoCovers: { symptom: string; term: string }[] = [];
  for (const m of matchIndications(f, otherSymptoms, chosen)) if (!alsoCovers.some((x) => x.symptom === m.symptom)) alsoCovers.push({ symptom: m.symptom, term: m.term });
  fit += Math.min(W.extraCap, W.extra * alsoCovers.length);
  if (alsoCovers.length) {
    matches.push({ axis: '随伴症状', text: `ほかに選んだ「${alsoCovers.map((x) => symptomLabel(x.symptom)).join('」「')}」も、効能・効果（${alsoCovers.map((x) => x.term).join('、')}）に含まれます` });
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

/** 二段階選定の本体 */
export function selectFormulas(result: ScoreResult, answers: Answers, texts: FreeTexts, flags: SafetyFlag[], formulas: Formula[], tongueOverride?: string[]): Selection {
  const chosen = chosenSet(answers, tongueOverride);
  const sctx = safetyContext(flags, answers, texts);
  const groups0 = complaintGroups(answers);
  const allSymptoms = new Set(groups0.flatMap((g) => g.symptoms));
  const groups: ComplaintGroup[] = groups0.map((g) => {
    const own = new Set(g.symptoms);
    const others = new Set([...allSymptoms].filter((s) => !own.has(s)));
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
    const outcome: GroupOutcome = !g.details.length
      ? 'no_detail'
      : !candidates.length
        ? 'no_pool'
        : !usable.length
          ? 'all_excluded'
          : !pick
            ? 'no_fit'
            : pick.safety.status === 'check'
              ? 'pick_check'
              : 'pick';
    return { ...g, candidates, pick, outcome };
  });
  // STEP 3 の補正：先の主訴で選んだ漢方薬が、この主訴でも「適合」かつ一致度が僅差なら、それを優先する
  // （1つで複数の主訴をカバーし、似た漢方薬を重ねて飲むことを避ける）
  const picked: Candidate[] = [];
  for (const g of groups) {
    if (!g.pick) continue;
    const reuse = g.candidates.find((c) => c.code !== g.pick!.code && c.level === 'good' && c.safety.status !== 'excluded' && picked.some((p) => p.code === c.code) && c.fit >= g.pick!.fit - SELECTION.reuseMargin);
    if (reuse) {
      g.pick = reuse;
      g.outcome = reuse.safety.status === 'check' ? 'pick_check' : 'pick';
    }
    picked.push(g.pick);
  }
  const other = (answers['A3'] ?? []).includes('A3-13') ? (texts['A3-13'] ?? '').trim() || '（記入なし）' : undefined;
  return { groups, refer: hasRefer(flags), otherComplaint: other };
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
  if (c.level === 'good' && c.fit > pick.fit) {
    return `${head}：一致度はわずかに高いものの、${pick.name}はほかに選んだお悩みにも使えるため、1つにまとめました。`;
  }
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
  const detailTexts = group.details.filter((d) => {
    const dq = detailQuestionFor(group.key);
    const sy = dq?.options.find((o) => o.id === d.id)?.symptoms ?? [];
    return sy.some((x) => c.matched.some((m) => m.symptom === x));
  }).map((d) => d.text);
  const terms = c.matched.map((m) => m.term);
  const complaint = `あなたが選んだ「${detailTexts.join('」「') || group.label}」は、${c.name}の効能・効果（承認された内容）にある「${terms.join('」「')}」に当たるため、候補になりました。`;
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
    const text: Record<Exclude<GroupOutcome, 'pick' | 'pick_check'>, string> = {
      no_detail: '具体的な症状の選択がなかったため、漢方薬の候補を絞り込めませんでした。薬剤師がお話を伺います。',
      no_pool: `選んだ症状（${g.details.map((d) => d.text).join('・')}）に対応する漢方薬の候補がありません。薬剤師にご相談ください。`,
      no_fit: `候補になる漢方薬（${g.candidates.filter((c) => c.safety.status !== 'excluded').length}種類）の中に、あなたの体質にはっきり合うものが見つかりませんでした。無理におすすめせず、薬剤師が詳しくお話を伺います。`,
      all_excluded: '安全確認の回答から、候補になる漢方薬をおすすめできませんでした。薬剤師にご相談ください。',
    };
    messages.push({ label: g.label, text: text[g.outcome as Exclude<GroupOutcome, 'pick' | 'pick_check'>] });
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
    details: g.details.map((d) => d.text),
    outcome: g.outcome,
    pick: g.pick?.code,
    candidates: g.candidates.map((c) => ({ code: c.code, name: c.name, fit: c.fit, level: c.level, safety: c.safety.status, terms: c.matched.map((m) => m.term) })),
  }));
}
