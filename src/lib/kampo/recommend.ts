// ---------------------------------------------------------------------------
// 処方候補の提示（純粋関数）。仕様書 第8節。
// 最終判断は薬剤師。禁忌に該当する処方も除外せず「警告つき」で残す（-1.0）。
// 候補とスコアは Proposal.candidates に保存し、後で重みを調整する材料にする。
// ---------------------------------------------------------------------------
import { TYPE_DEFS, COMPLAINT_LABEL, DEFICIENCY_LABEL, THERMAL_LABEL, optionText, optionById, type Formula, type TypeKey, type Deficiency, type Thermal } from './masters.ts';
import { DEF_EXC_LABEL, THERMAL_STATE_LABEL, type Answers, type ScoreResult, type DefExcLabel, type ThermalLabel } from './scoring.ts';
import { FLAG_HERBS, FLAG_LABEL, hasRefer, type SafetyFlag } from './safety.ts';

export interface HerbCaution { herb: string; flag: string; flagLabel: string }
export interface Candidate {
  code: string;
  name: string;
  reading: string;
  score: number;
  /** 禁忌フラグに該当（薬剤師が見て判断。スコア -1.0） */
  warnings: string[];
  /** 注意生薬 × 該当フラグ（例: 甘草 — 高血圧） */
  herbCautions: HerbCaution[];
  reasons: string[];
  /** 体質の結果と矛盾する点（主な対象タイプが主体質・副体質にない／虚実が逆／寒熱が逆）。空なら整合 */
  conflicts: string[];
  cautionHerbs: string[];
  description: string;
  note?: string;
}
/** 来店客向けに出せる候補（矛盾・警告のないものだけ） */
export interface CustomerPick extends Candidate {
  /** 来店客向けの平易な根拠文 */
  customerReason: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 虚実の一致: 同じ +0.3 / 隣接 +0.1 / 逆 -0.3 */
export function defExcMatch(f: Deficiency, label: DefExcLabel): number {
  if (f === label) return 0.3;
  if (f === 'mid' || label === 'mid') return 0.1;
  return -0.3;
}
/** 寒熱の一致: warm×cold / cool×hot +0.2、warm×hot / cool×cold -0.3、neutral は 0 */
export function thermalMatch(f: Thermal, label: ThermalLabel): number {
  if (f === 'neutral' || label === 'neutral') return 0;
  if ((f === 'warm' && label === 'cold') || (f === 'cool' && label === 'hot')) return 0.2;
  return -0.3;
}

/** A3 の主訴タグ */
export function complaintTags(answers: Answers): Set<string> {
  const tags = new Set<string>();
  for (const id of answers['A3'] ?? []) {
    const tag = optionById(id)?.tag;
    if (tag) tags.add(tag);
  }
  return tags;
}

export function allChosenOptionIds(answers: Answers, tongueOverride?: string[]): Set<string> {
  const ids = new Set<string>();
  for (const [qid, arr] of Object.entries(answers)) {
    if (qid === 'B13' && tongueOverride && tongueOverride.length) continue;
    for (const id of arr) ids.add(id);
  }
  for (const id of tongueOverride ?? []) ids.add(id);
  return ids;
}

export function herbCautions(f: Formula, safety: SafetyFlag[]): HerbCaution[] {
  const out: HerbCaution[] = [];
  for (const fl of safety) {
    const herbs = FLAG_HERBS[fl.code];
    if (!herbs) continue;
    for (const herb of f.cautionHerbs) {
      if (herbs.includes(herb) && !out.some((x) => x.herb === herb && x.flag === fl.code)) {
        out.push({ herb, flag: fl.code, flagLabel: FLAG_LABEL[fl.code] ?? fl.label });
      }
    }
  }
  return out;
}

/** 処方の主な対象タイプ（重みが最大のもの） */
export function primaryType(f: Formula): TypeKey | undefined {
  return (Object.entries(f.types) as [TypeKey, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** 体質の結果と矛盾する点。来店客向けの表示ではこれが空のものだけを出す */
export function conflictsOf(f: Formula, result: ScoreResult): string[] {
  const out: string[] = [];
  const rel = new Set<TypeKey>([...result.mainTypes, ...result.subTypes]);
  const top = primaryType(f);
  if (top && !rel.has(top)) out.push(`主な対象タイプ（${TYPE_DEFS[top].name}）が主体質・副体質にない`);
  if (defExcMatch(f.deficiency, result.defExcLabel) < 0) out.push(`虚実が逆（${DEFICIENCY_LABEL[f.deficiency]}向け × ${DEF_EXC_LABEL[result.defExcLabel]}）`);
  if (thermalMatch(f.thermal, result.thermalLabel) < 0) out.push(`寒熱が逆（${THERMAL_LABEL[f.thermal]}処方 × ${THERMAL_STATE_LABEL[result.thermalLabel]}）`);
  return out;
}

export function recommend(result: ScoreResult, answers: Answers, safety: SafetyFlag[], formulas: Formula[], tongueOverride?: string[], limit = 3): Candidate[] {
  const tags = complaintTags(answers);
  const chosen = allChosenOptionIds(answers, tongueOverride);
  const scored = formulas.filter((f) => f.active).map((f) => {
    const reasons: string[] = [];
    // 1. 体質一致: Σ(処方のタイプ重み × pct/100)。主体質は ×1.5
    let s = 0;
    const typeParts: { t: TypeKey; v: number }[] = [];
    for (const [t, w] of Object.entries(f.types) as [TypeKey, number][]) {
      const main = result.mainTypes.includes(t);
      const v = w * (result.pct[t] / 100) * (main ? 1.5 : 1);
      s += v;
      if (result.pct[t] >= 20) typeParts.push({ t, v });
    }
    typeParts.sort((a, b) => b.v - a.v);
    if (typeParts.length) reasons.push(typeParts.map((p) => `${TYPE_DEFS[p.t].name} ${result.pct[p.t]}%${result.mainTypes.includes(p.t) ? '（主体質）' : ''}`).join('・'));
    // 2. 虚実
    const de = defExcMatch(f.deficiency, result.defExcLabel);
    s += de;
    if (de > 0) reasons.push(de >= 0.3 ? '虚実が一致' : '虚実が近い');
    // 3. 寒熱
    const th = thermalMatch(f.thermal, result.thermalLabel);
    s += th;
    if (th > 0) reasons.push(f.thermal === 'warm' ? '冷え寄りに温める処方' : '熱寄りに冷ます処方');
    // 4. 主訴タグ
    const matchedTags = f.complaints.filter((c) => tags.has(c));
    s += Math.min(0.5, 0.25 * matchedTags.length);
    if (matchedTags.length) reasons.push(`主訴: ${matchedTags.map((c) => COMPLAINT_LABEL[c] ?? c).join('・')}`);
    // 5. キー所見
    const matchedSigns = f.keySigns.filter((id) => chosen.has(id));
    s += Math.min(0.6, 0.3 * matchedSigns.length);
    for (const id of matchedSigns) reasons.push(`所見: ${optionText(id)}`);
    // 6. 禁忌：除外せず -1.0
    const warnings = f.contraindications.filter((c) => safety.some((fl) => fl.code === c));
    if (warnings.length) s -= 1.0;
    const cand: Candidate = {
      code: f.code, name: f.name, reading: f.reading, score: round2(s), warnings,
      herbCautions: herbCautions(f, safety), reasons, conflicts: result.isBalanced ? [] : conflictsOf(f, result),
      cautionHerbs: f.cautionHerbs, description: f.description, note: f.note,
    };
    return { cand, priority: f.priority };
  });
  return scored
    .sort((a, b) => b.cand.score - a.cand.score || a.priority - b.priority)
    .slice(0, limit)
    .map((x) => x.cand);
}

/** 来店客向けの平易な根拠文（タイプ・主訴・寒熱の方向だけ。所見の詳細は出さない） */
export function customerReason(f: Formula, result: ScoreResult, answers: Answers): string {
  const rel = new Set<TypeKey>([...result.mainTypes, ...result.subTypes]);
  const types = (Object.entries(f.types) as [TypeKey, number][])
    .filter(([t]) => rel.has(t))
    .sort((a, b) => result.pct[b[0]] - result.pct[a[0]])
    .map(([t]) => `${TYPE_DEFS[t].name}（${result.pct[t]}点）`);
  const tags = complaintTags(answers);
  const matched = f.complaints.filter((c) => tags.has(c)).map((c) => COMPLAINT_LABEL[c] ?? c);
  const parts: string[] = [];
  if (types.length) parts.push(`${types.join('・')}の傾向に合う漢方薬です。`);
  if (matched.length) parts.push(`気になっている「${matched.join('」「')}」にも使われます。`);
  if (f.thermal === 'warm' && result.thermalLabel === 'cold') parts.push('冷えを温める方向で働きます。');
  if (f.thermal === 'cool' && result.thermalLabel === 'hot') parts.push('こもった熱を冷ます方向で働きます。');
  return parts.join('');
}

/**
 * 来店客向けのおすすめ（最大3件）。矛盾や安全上の警告があるものは出さない：
 *  - バランス良好（全タイプ20%未満）や受診勧奨があるときは出さない
 *  - 主な対象タイプが主体質・副体質に含まれ、虚実・寒熱が逆でない
 *  - 禁忌フラグ・注意生薬の警告がない
 * 最終判断は薬剤師（担当者画面の候補は従来どおり警告つきで全部見える）。
 */
export function recommendForCustomer(result: ScoreResult, answers: Answers, safety: SafetyFlag[], formulas: Formula[], tongueOverride?: string[], limit = 3): CustomerPick[] {
  if (result.isBalanced || hasRefer(safety)) return [];
  const byCode = new Map(formulas.map((f) => [f.code, f]));
  return recommend(result, answers, safety, formulas, tongueOverride, formulas.length)
    .filter((c) => c.conflicts.length === 0 && c.warnings.length === 0 && c.herbCautions.length === 0)
    .slice(0, limit)
    .map((c) => ({ ...c, customerReason: customerReason(byCode.get(c.code)!, result, answers) }));
}
