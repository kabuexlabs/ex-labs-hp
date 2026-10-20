// ---------------------------------------------------------------------------
// 処方候補の提示（純粋関数）。仕様書 第8節。
// 最終判断は薬剤師。禁忌に該当する処方も除外せず「警告つき」で残す（-1.0）。
// 候補とスコアは Proposal.candidates に保存し、後で重みを調整する材料にする。
// ---------------------------------------------------------------------------
import { TYPE_DEFS, COMPLAINT_LABEL, optionText, optionById, type Formula, type TypeKey, type Deficiency, type Thermal } from './masters.ts';
import type { Answers, ScoreResult, DefExcLabel, ThermalLabel } from './scoring.ts';
import { FLAG_HERBS, FLAG_LABEL, type SafetyFlag } from './safety.ts';

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
  cautionHerbs: string[];
  note?: string;
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
      herbCautions: herbCautions(f, safety), reasons, cautionHerbs: f.cautionHerbs, note: f.note,
    };
    return { cand, priority: f.priority };
  });
  return scored
    .sort((a, b) => b.cand.score - a.cand.score || a.priority - b.priority)
    .slice(0, limit)
    .map((x) => x.cand);
}
