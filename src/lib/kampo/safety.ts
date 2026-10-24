// ---------------------------------------------------------------------------
// 安全性の判定（純粋関数）。仕様書 §17〜§20。体質スコアとは独立に評価する。
// 状態は5種：緊急対応優先／除外／安全性確認待ち／薬剤師確認必要／必要な確認完了。複数の問題はすべての理由を保存する。
// 「必要な確認完了」は安全性を保証する意味ではない。必要な情報が取れなければ「安全性確認待ち」にする。
//  - 緊急症状 → 緊急対応優先（通常の候補提示を停止）
//  - 副作用歴（§18 必須）：副作用歴の漢方の構成生薬を取得し、1種でも共通する候補は除外。原因生薬が未特定なら
//    全構成生薬を「暫定除外」。薬剤師が原因生薬を記録しても自動解除しない。構成生薬が未確認（草案）で共通生薬が
//    見つからない場合は「共通生薬なし」と解釈せず確認待ち。
//  - 併用漢方（§19）：共通生薬を表示（重複だけで禁忌とはしない。薬剤師確認）。
//  - 製品情報（products.json）が未登録・未確認の処方は確認待ち（禁忌・相互作用・副作用を確認できないため）。
// 規則の中身（生薬×状態など）は safety_rules.json の草案。
// ---------------------------------------------------------------------------
import { SAFETY_RULES, compositionOf, productsOf, formulaName, findingName, isConfirmed, optionById, type ReviewStatus, type Product } from './masters.ts';
import { isPresent, statusOf, presentIds, type FindingState } from './findings.ts';
import type { KampoPick } from './flow.ts';

export type SafetyState = 'emergency' | 'excluded' | 'pending' | 'check' | 'done';
export const SAFETY_STATE_LABEL: Record<SafetyState, string> = { emergency: '緊急対応優先', excluded: '除外', pending: '安全性確認待ち', check: '薬剤師確認必要', done: '必要な確認完了' };
const confirmedStatus = (s: ReviewStatus | 'none') => s !== 'none' && isConfirmed(s);
const SEVERITY: Record<SafetyState, number> = { emergency: 4, excluded: 3, pending: 2, check: 1, done: 0 };
export const worst = (a: SafetyState, b: SafetyState): SafetyState => (SEVERITY[a] >= SEVERITY[b] ? a : b);
export type ReasonCategory = 'emergency' | 'redflag' | 'pregnancy' | 'age' | 'disease' | 'medication' | 'allergy' | 'adverse' | 'herb' | 'duplicate' | 'product' | 'info';
export interface SafetyReason { state: SafetyState; category: ReasonCategory; code: string; text: string }

/** 薬剤師が記録した副作用歴の原因生薬（確認資料・判断理由つき）。自動解除には使わない */
export interface AdverseRecord { formulaId: string; causalHerbs: string[]; evidence: string; reason: string; staffName: string; at: string }

export interface AdverseFormula { formulaId: string; name: string; herbs: string[]; compositionStatus: ReviewStatus | 'none'; causalHerbs?: string[]; records: AdverseRecord[] }
export interface AdverseInfo {
  /** 漢方で体調を崩したことがあるか（present／absent／unknown／not_asked） */
  reported: 'yes' | 'no' | 'unknown';
  formulas: AdverseFormula[];
  /** 副作用歴の漢方の名前がわからない（特定できない） */
  unknownFormula: boolean;
  reactions: string[];
  /** 除外対象の生薬（provisional＝原因生薬が未特定または原因生薬以外の暫定除外） */
  excludedHerbs: { herb: string; provisional: boolean; from: string[] }[];
}
export interface SessionSafety {
  emergency: { findingId: string; text: string }[];
  redflags: { findingId: string; text: string; level: 'refer' | 'consult' }[];
  /** 全候補に共通する理由（情報不足・併用薬・治療中の病気など） */
  common: SafetyReason[];
  adverse: AdverseInfo;
  current: { formulas: string[]; unknown: boolean };
  /** セッション全体の状態（緊急なら emergency） */
  state: SafetyState;
}
export interface CandidateSafety {
  state: SafetyState;
  reasons: SafetyReason[];
  herbs: string[];
  compositionStatus: ReviewStatus | 'none';
  /** 副作用歴の漢方と共通する生薬 */
  commonAdverseHerbs: string[];
  /** 服用中の漢方と共通する生薬 */
  commonCurrentHerbs: { herb: string; formulas: string[] }[];
}

const ALERT_OF = (fid: string, st: FindingState): 'emergency' | 'refer' | 'consult' | undefined => {
  const src = st.answers.get(fid)?.sources.filter((s) => s.status === 'present') ?? [];
  let best: 'emergency' | 'refer' | 'consult' | undefined;
  const rank = { emergency: 3, refer: 2, consult: 1 } as const;
  for (const s of src) for (const oid of s.optionIds) {
    const a = optionById(oid)?.alert;
    if (a && (!best || rank[a] > rank[best])) best = a;
  }
  return best;
};

export interface SafetyInput {
  st: FindingState;
  sex?: string; ageBand?: string;
  current: KampoPick; adverse: KampoPick;
  records?: AdverseRecord[];
  /** 妊娠・授乳の質問を出したか（男性には出さない） */
  pregnancyAsked: boolean;
  /** 製品情報（省略時は products.json。テストで差し替える） */
  products?: Product[];
}

/** セッション単位の安全性（緊急・受診勧奨・情報不足・副作用歴の除外生薬） */
export function sessionSafety(inp: SafetyInput): SessionSafety {
  const { st } = inp;
  const emergency: SessionSafety['emergency'] = [];
  const redflags: SessionSafety['redflags'] = [];
  for (const fid of presentIds(st)) {
    const a = ALERT_OF(fid, st);
    if (a === 'emergency' || fid.startsWith('em_')) emergency.push({ findingId: fid, text: findingName(fid) });
    else if (a === 'refer' || a === 'consult') redflags.push({ findingId: fid, text: findingName(fid), level: a });
  }
  const common: SafetyReason[] = [];
  const add = (state: SafetyState, category: ReasonCategory, code: string, text: string) => { if (!common.some((r) => r.code === code)) common.push({ state, category, code, text }); };
  for (const r of redflags) add('check', 'redflag', `rf:${r.findingId}`, `${r.level === 'refer' ? '受診勧奨' : '受診も検討'}の症状：${r.text}。医療機関の受診を優先して確認してください`);
  if (isPresent(st, 'impact_high') && ['course_1m', 'course_6m', 'course_long'].some((f) => isPresent(st, f))) add('check', 'redflag', 'impact_long', '生活への影響が大きく、長く続いています。受診状況を確認してください');
  // 情報不足（必要な情報が取れなければ確認待ち）
  const unk = (fids: string[]) => fids.every((f) => { const s = statusOf(st, f); return s === 'unknown' || s === 'not_asked' || s === 'declined'; });
  const unsure = [...st.answers.values()].filter((a) => a.status === 'unknown' && (a.id.startsWith('em_') || a.id.startsWith('rf_'))).map((a) => a.id);
  if (!emergency.length && unsure.length) add('pending', 'emergency', 'em_unknown', `緊急症状・受診が必要な症状の確認に「わからない」があります（${unsure.map(findingName).join('・')}）。確認してください`);
  const dx = ['dx_hypertension', 'dx_heart', 'dx_kidney', 'dx_liver', 'dx_thyroid', 'dx_glaucoma', 'dx_prostate', 'dx_diabetes', 'dx_gi', 'dx_cancer', 'dx_respiratory', 'dx_other'];
  if (unk(dx)) add('pending', 'disease', 'dx_unknown', '治療中の病気が確認できていません');
  else if (dx.some((f) => isPresent(st, f))) add('check', 'disease', 'dx_any', `治療中の病気（${dx.filter((f) => isPresent(st, f)).map(findingName).join('・')}）があります。主治医への確認を含めて判断してください`);
  const meds = ['med_antihypertensive', 'med_diuretic', 'med_anticoagulant', 'med_diabetes', 'med_thyroid', 'med_steroid', 'med_hypnotic', 'med_antidepressant', 'med_interferon', 'med_anticancer', 'med_laxative', 'med_gi', 'med_analgesic', 'med_hormone', 'med_licorice', 'med_kampo', 'med_supplement', 'med_other', 'med_unknown_name'];
  if (unk(meds)) add('pending', 'medication', 'med_unknown', '服用中の薬が確認できていません（相互作用を確認できない）');
  if (isPresent(st, 'med_unknown_name')) add('pending', 'medication', 'med_unknown_name', '名前・種類のわからない薬があります（相互作用を確認できない）');
  const takingMeds = meds.filter((f) => f !== 'med_kampo' && f !== 'med_unknown_name' && isPresent(st, f));
  if (takingMeds.length) add('check', 'medication', 'med_any', `併用薬（${takingMeds.map(findingName).join('・')}）があります。製品情報が未登録のため相互作用は自動照合していません`);
  for (const r of SAFETY_RULES.medChecks) if (isPresent(st, r.when)) add('check', 'medication', `med:${r.when}`, r.text);
  if (unk(['allergy_drug', 'allergy_food', 'allergy_pollen'])) add('pending', 'allergy', 'allergy_unknown', 'アレルギー歴が確認できていません');
  if (isPresent(st, 'allergy_drug')) add('check', 'allergy', 'allergy_drug', '薬のアレルギー歴があります。製品の成分・添加物を確認してください');
  if (isPresent(st, 'lactation')) add('check', 'pregnancy', 'lactation', '授乳中です。製品の添付文書で授乳中の注意を確認してください');
  if (inp.ageBand === '10s') add('check', 'age', 'age_10s', '10代です。製品の用法・用量（年齢）を確認してください');
  if (inp.ageBand === '70s') add('check', 'age', 'age_70s', '高齢（70代以上）です。生理機能の低下に注意して用量を確認してください');
  if (!inp.ageBand) add('pending', 'age', 'age_unknown', '年代が未回答です');
  const cur = inp.current;
  if (isPresent(st, 'med_kampo') && (cur.unknown || !cur.formulas.length)) add('pending', 'duplicate', 'kampo_unknown', '服用中の漢方薬の名前がわからないため、生薬の重複を確認できません');

  // 副作用歴
  const arStatus = statusOf(st, 'ar_history');
  const reported: AdverseInfo['reported'] = arStatus === 'present' || inp.adverse.formulas.length ? 'yes' : arStatus === 'absent' ? 'no' : 'unknown';
  const records = inp.records ?? [];
  const formulas: AdverseFormula[] = inp.adverse.formulas.map((fid) => {
    const c = compositionOf(fid);
    const recs = records.filter((r) => r.formulaId === fid);
    const causal = recs.length ? [...new Set(recs.flatMap((r) => r.causalHerbs))] : undefined;
    return { formulaId: fid, name: formulaName(fid), herbs: c?.herbs ?? [], compositionStatus: c?.status ?? 'none', causalHerbs: causal, records: recs };
  });
  const ex = new Map<string, { herb: string; provisional: boolean; from: string[] }>();
  for (const f of formulas) for (const h of f.herbs) {
    const e = ex.get(h) ?? { herb: h, provisional: true, from: [] };
    if (f.causalHerbs?.includes(h)) e.provisional = false;
    e.from.push(f.name);
    ex.set(h, e);
  }
  const adverse: AdverseInfo = {
    reported, formulas, unknownFormula: reported === 'yes' && (inp.adverse.unknown || !inp.adverse.formulas.length),
    reactions: presentIds(st).filter((f) => f.startsWith('ar_') && f !== 'ar_history').map(findingName), excludedHerbs: [...ex.values()],
  };
  if (reported === 'unknown') add('pending', 'adverse', 'ar_unknown', '漢方薬の副作用歴が確認できていません');
  if (adverse.unknownFormula) add('pending', 'adverse', 'ar_formula_unknown', '副作用歴の漢方薬が特定できていません（構成生薬を照合できない）');

  const pregUnknown = inp.pregnancyAsked && ['pregnancy', 'pregnancy_possible'].every((f) => { const s = statusOf(st, f); return s !== 'present' && s !== 'absent'; }) && !['60s', '70s'].includes(inp.ageBand ?? '');
  if (pregUnknown) add('check', 'pregnancy', 'preg_unknown', '妊娠の可能性が確認できていません');

  const state: SafetyState = emergency.length ? 'emergency' : common.reduce<SafetyState>((s, r) => worst(s, r.state), 'done');
  return { emergency, redflags, common, adverse, current: { formulas: cur.formulas, unknown: cur.unknown }, state };
}

/** 候補1件の安全性 */
export function candidateSafety(formulaId: string, ss: SessionSafety, inp: SafetyInput): CandidateSafety {
  const { st } = inp;
  const reasons: SafetyReason[] = [];
  const add = (state: SafetyState, category: ReasonCategory, code: string, text: string) => { if (!reasons.some((r) => r.code === code)) reasons.push({ state, category, code, text }); };
  if (ss.emergency.length) add('emergency', 'emergency', 'emergency', `緊急症状（${ss.emergency.map((e) => e.text).join('・')}）があります。医療対応を優先してください`);
  for (const r of ss.common) reasons.push(r);

  const comp = compositionOf(formulaId);
  const herbs = comp?.herbs ?? [];
  const compStatus: CandidateSafety['compositionStatus'] = comp?.status ?? 'none';
  const has = (h: string) => herbs.includes(h);

  // 製品情報（公式資料）
  const prods = inp.products ? inp.products.filter((p) => p.formulaId === formulaId) : productsOf(formulaId);
  const confirmed = prods.filter((p) => isConfirmed(p.review.status));
  if (!prods.length) add('pending', 'product', 'product_none', '医療用製品の情報（効能・効果、用法・用量、禁忌、相互作用、副作用）が未登録です');
  else if (!confirmed.length) add('pending', 'product', 'product_unverified', '製品情報が公式資料で確認されていません');
  for (const p of confirmed) {
    const ci = (p.contraindication_findings ?? []).filter((f) => isPresent(st, f));
    if (ci.length) add('excluded', 'product', `ci:${p.id}`, `${p.product_name}の禁忌に当たります（${ci.map(findingName).join('・')}）`);
    const ia = (p.interaction_findings ?? []).filter((f) => isPresent(st, f));
    if (ia.length) add('check', 'medication', `ia:${p.id}`, `${p.product_name}の相互作用の確認が必要です（${ia.map(findingName).join('・')}）`);
  }
  if (!comp) add('pending', 'herb', 'comp_none', '構成生薬が未登録です');
  else if (!isConfirmed(comp.status)) add('pending', 'herb', 'comp_draft', '構成生薬は草案（製品で未確認）です');

  // 妊娠・授乳
  const preg = isPresent(st, 'pregnancy') || isPresent(st, 'pregnancy_possible');
  const exH = SAFETY_RULES.pregnancyExcludeHerbs.filter(has);
  const chH = SAFETY_RULES.pregnancyCheckHerbs.filter(has);
  if (preg) {
    if (exH.length) add('excluded', 'pregnancy', 'preg_ex', `妊娠中（またはその可能性）：${exH.join('・')}を含むため通常候補から除外します（草案の規則）`);
    if (chH.length) add('check', 'pregnancy', 'preg_ch', `妊娠中（またはその可能性）：${chH.join('・')}を含むため慎重に判断してください`);
    add('check', 'pregnancy', 'preg', '妊娠中（またはその可能性）です。製品の添付文書と主治医の指示を確認してください');
  } else if (ss.common.some((r) => r.code === 'preg_unknown') && (exH.length || chH.length)) {
    add('pending', 'pregnancy', 'preg_unknown_herb', `妊娠の可能性が未確認で、${[...exH, ...chH].join('・')}を含みます`);
  }

  // 生薬 × 状態（草案）
  const ageF = inp.ageBand ? `age_${inp.ageBand}` : '';
  for (const r of SAFETY_RULES.herbChecks) {
    if (!has(r.herb)) continue;
    const hit = r.when.filter((f) => isPresent(st, f) || f === ageF);
    if (hit.length) add('check', 'herb', `herb:${r.herb}:${r.when.join(',')}`, `${r.text}（該当：${hit.map(findingName).join('・')}）`);
  }
  for (const r of SAFETY_RULES.formulaRules) {
    if (!r.formulas.includes(formulaId)) continue;
    const hit = r.when.filter((f) => isPresent(st, f) || f === ageF);
    if (hit.length) add(r.state, 'herb', `rule:${formulaId}:${r.when.join(',')}`, `${r.text}（該当：${hit.map(findingName).join('・')}）`);
  }

  // 副作用歴（生薬単位の除外）
  const commonAdverse = herbs.filter((h) => ss.adverse.excludedHerbs.some((e) => e.herb === h));
  if (ss.adverse.formulas.some((f) => f.formulaId === formulaId)) add('excluded', 'adverse', 'ar_same', `副作用歴のある漢方薬（${formulaName(formulaId)}）そのものです`);
  if (commonAdverse.length) {
    const prov = commonAdverse.filter((h) => ss.adverse.excludedHerbs.find((e) => e.herb === h)?.provisional);
    const from = [...new Set(ss.adverse.excludedHerbs.filter((e) => commonAdverse.includes(e.herb)).flatMap((e) => e.from))];
    add('excluded', 'adverse', 'ar_common',
      `副作用歴の漢方薬（${from.join('・')}）と共通する生薬（${commonAdverse.join('・')}）を含みます${prov.length ? `。${prov.join('・')}は原因生薬が特定されていないための暫定除外（保守的な方針で、原因と証明されたわけではありません）` : ''}${!confirmedStatus(compStatus) ? '。構成生薬は草案での照合です' : ''}`);
  } else if (ss.adverse.reported === 'yes' && ss.adverse.formulas.length) {
    const unv = ss.adverse.formulas.filter((f) => !confirmedStatus(f.compositionStatus)).map((f) => f.name);
    if (unv.length || !confirmedStatus(compStatus)) add('pending', 'adverse', 'ar_unverified', `副作用歴の漢方薬${unv.length ? `（${unv.join('・')}）` : ''}または候補の構成生薬が未確認のため、「共通生薬なし」と判断できません`);
  }

  // 併用漢方（生薬の重複）
  const commonCurrent: CandidateSafety['commonCurrentHerbs'] = [];
  for (const fid of ss.current.formulas) {
    if (fid === formulaId) add('check', 'duplicate', 'same_current', `同じ処方（${formulaName(fid)}）を服用中です`);
    const c = compositionOf(fid);
    for (const h of herbs.filter((x) => c?.herbs.includes(x))) {
      const e = commonCurrent.find((x) => x.herb === h);
      if (e) e.formulas.push(formulaName(fid)); else commonCurrent.push({ herb: h, formulas: [formulaName(fid)] });
    }
  }
  if (commonCurrent.length) add('check', 'duplicate', 'dup_herbs', `服用中の漢方薬と共通する生薬：${commonCurrent.map((x) => `${x.herb}（${x.formulas.join('・')}）`).join('、')}。重複による合計量を確認してください（重複だけで禁忌とはしません）`);

  const state = reasons.reduce<SafetyState>((s, r) => worst(s, r.state), 'done');
  return { state, reasons, herbs, compositionStatus: compStatus, commonAdverseHerbs: commonAdverse, commonCurrentHerbs: commonCurrent };
}
