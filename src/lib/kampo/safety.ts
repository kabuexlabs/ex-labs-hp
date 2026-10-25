// ---------------------------------------------------------------------------
// 安全確認（純粋関数）。2026-10-25 改修計画 §6。
//  1) 安全フラグ：服用中の薬・治療中の病気・妊娠授乳・アレルギー・漢方で体調を崩した経験（C1〜C4・A3P）。
//     漢方薬ごとの「要確認」「除外」に使う（STEP 4）。
//  2) 安全確認タグ：主訴や選択肢に付けたタグ（頭痛・しびれ・動悸・精神症状など）。証のスコアとは別に持ち、
//     薬剤師画面に確認事項を出す。受診勧奨の判断は薬剤師が行う（システムは判断材料を示すだけ）。
//  3) 直ちに対応が必要な例外（急性の神経症状・呼吸困難を伴う急な腫れ）：患者画面に
//     「すぐに近くのスタッフにお声がけください」、スタッフ一覧に印。119番の一律表示はしない（改修指示 5-5）。
// 全員共通のレッドフラッグ質問・「日常生活への影響」×期間による機械的な受診勧奨はやめた（改修指示 5-1・4-7）。
// ---------------------------------------------------------------------------
import { optionById, optionText, complaintById, tagById, formulaByCode, type SafetyTagDef } from './masters.ts';
import { isPresent } from './findings.ts';
import { kampoCodes, type Answers, type WalkResult } from './flow.ts';

export type SafetyLevel = 'refer' | 'warn' | 'info';
export interface SafetyFlag {
  code: string;
  level: SafetyLevel;
  label: string;
  detail?: string;
  /** 根拠になった設問 */
  source: string;
}
export const SAFETY_LEVEL_LABEL: Record<SafetyLevel, string> = { refer: '受診勧奨', warn: '注意', info: '情報' };

export const FLAG_LABEL: Record<string, string> = {
  elderly: '高齢（70代以上）',
  meds: '服用中の薬あり', interferon: 'インターフェロン使用', kampo_current: '服用中の漢方薬', hypertension: '高血圧', heart: '心臓の病気', thyroid: '甲状腺の病気',
  glaucoma_bph: '緑内障・前立腺肥大', kidney: '腎臓の病気', liver: '肝臓の病気', diabetes: '糖尿病', cancer: 'がん治療中', other_disease: 'その他の病気',
  gi_weak: '胃腸が弱い', pregnancy: '妊娠中・可能性あり', lactation: '授乳中', allergy: 'アレルギー歴', adverse_kampo: '漢方で体調を崩した経験',
};
const DISEASE_DETAIL: Record<string, string> = {
  hypertension: '麻黄・附子・甘草を含む漢方薬に注意', heart: '麻黄・附子・甘草を含む漢方薬に注意',
  thyroid: '麻黄を含む漢方薬に注意', glaucoma_bph: '麻黄を含む漢方薬に注意',
};
const LEVEL_OF: Record<string, SafetyLevel> = { kidney: 'info', liver: 'info', diabetes: 'info', cancer: 'info', other_disease: 'info' };

const chosenIn = (answers: Answers, qid: string) => answers[qid] ?? [];
const nonExclusive = (ids: string[]) => ids.filter((id) => !optionById(id)?.exclusive);

/** 安全フラグ（回答から） */
export function safetyFlags(answers: Answers, w: WalkResult): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  const push = (f: SafetyFlag) => { if (!flags.some((x) => x.code === f.code)) flags.push(f); };
  const meds = nonExclusive(chosenIn(answers, 'C1'));
  if (meds.length) {
    push({ code: 'meds', level: 'warn', label: '服用中の薬', detail: `${meds.map(optionText).join('・')}（薬の名前は薬剤師が確認）`, source: 'C1' });
    if (meds.includes('C1-interferon')) push({ code: 'interferon', level: 'warn', label: 'インターフェロン製剤を使用', detail: '小柴胡湯との併用禁忌。柴胡を含む漢方薬は確認が必要', source: 'C1' });
  }
  const current = kampoCodes(answers, 'C1K');
  if (meds.includes('C1-kampo')) {
    const unknown = chosenIn(answers, 'C1K').some((id) => id === 'C1K-unknown' || id === 'C1K-other');
    push({ code: 'kampo_current', level: 'warn', label: '服用中の漢方薬', detail: [...current.map((c) => formulaByCode(c)?.name ?? c), ...(unknown ? ['名前が未確認のもの'] : [])].join('・') || '（名前は未回答）', source: 'C1K' });
  }
  for (const id of chosenIn(answers, 'C2')) {
    for (const code of optionById(id)?.flags ?? []) {
      push({ code, level: LEVEL_OF[code] ?? 'warn', label: FLAG_LABEL[code] ?? optionText(id), detail: DISEASE_DETAIL[code], source: 'C2' });
    }
  }
  if (chosenIn(answers, 'C2').includes('C2-8') || (isPresent(w.state, 'loose_stool') && isPresent(w.state, 'poor_appetite'))) {
    push({ code: 'gi_weak', level: 'warn', label: chosenIn(answers, 'C2').includes('C2-8') ? '胃腸の病気' : '胃腸が弱い傾向（軟便＋食欲がない）', detail: '大黄・石膏・地黄を含む漢方薬は胃腸障害に注意', source: chosenIn(answers, 'C2').includes('C2-8') ? 'C2' : '体質の回答' });
  }
  const preg = chosenIn(answers, 'A3P');
  if (preg.includes('A3P-preg') || preg.includes('A3P-maybe')) {
    push({ code: 'pregnancy', level: 'warn', label: preg.includes('A3P-preg') ? '妊娠中' : '妊娠の可能性あり', detail: '大黄・芒硝・牡丹皮・桃仁・紅花・牛膝・附子を含む漢方薬は避ける。麻黄は慎重', source: 'A3P' });
  }
  if (preg.includes('A3P-lact')) push({ code: 'lactation', level: 'info', label: '授乳中', detail: '大黄を含む漢方薬は乳児の下痢に注意', source: 'A3P' });
  const allergy = nonExclusive(chosenIn(answers, 'C3'));
  if (allergy.length) push({ code: 'allergy', level: 'warn', label: 'アレルギー歴', detail: allergy.map(optionText).join('・'), source: 'C3' });
  if (chosenIn(answers, 'C4').includes('C4-yes')) {
    const names = kampoCodes(answers, 'C4K').map((c) => formulaByCode(c)?.name ?? c);
    const unknownName = chosenIn(answers, 'C4K').some((id) => id === 'C4K-unknown' || id === 'C4K-other');
    const sym = chosenIn(answers, 'C4S').map(optionText);
    push({ code: 'adverse_kampo', level: 'warn', label: '漢方薬で体調を崩した経験', detail: `漢方薬：${[...names, ...(unknownName ? ['名前が未確認のもの'] : [])].join('・') || '未回答'}／症状：${sym.join('・') || '未回答'}（原因の生薬は未特定）`, source: 'C4' });
  }
  const order: Record<SafetyLevel, number> = { refer: 0, warn: 1, info: 2 };
  return flags.sort((a, b) => order[a.level] - order[b.level]);
}

// --- 安全確認タグ ---------------------------------------------------------------

export interface TagHit {
  id: string;
  label: string;
  checks: string[];
  /** 直ちに対応が必要な例外か */
  urgent: boolean;
  /** タグが付いた回答（主訴名・選択肢の文言） */
  sources: string[];
}
/** 回答（主訴・選択肢）と薬剤師の入力に付いた安全確認タグを集める */
export function safetyTags(w: WalkResult, staffAnswers?: Answers): TagHit[] {
  const hits = new Map<string, TagHit>();
  const add = (tagId: string, source: string, urgent = false) => {
    const t: SafetyTagDef | undefined = tagById(tagId);
    if (!t) return;
    const h = hits.get(tagId) ?? { id: tagId, label: t.label, checks: t.checks, urgent: false, sources: [] };
    if (!h.sources.includes(source)) h.sources.push(source);
    h.urgent ||= urgent;
    hits.set(tagId, h);
  };
  for (const cid of w.complaints) {
    const c = complaintById(cid);
    for (const t of c?.tags ?? []) add(t, `主訴「${c!.name}」${cid === w.primary ? '（いちばん改善したい）' : ''}`);
  }
  for (const s of w.steps) {
    if (s.q.section === 'complaint') continue;
    for (const id of s.ids) {
      const o = s.q.options.find((x) => x.id === id);
      for (const t of o?.tags ?? []) add(t, `回答「${o!.text}」`, !!o!.urgent);
    }
  }
  for (const ids of Object.values(staffAnswers ?? {})) for (const id of ids) for (const t of optionById(id)?.tags ?? []) add(t, `薬剤師の観察「${optionText(id)}」`);
  return [...hits.values()].sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
/** 直ちに対応が必要な回答があるか（回答の途中でも判定する） */
export const isUrgent = (w: WalkResult) => w.steps.some((s) => s.ids.some((id) => s.q.options.find((o) => o.id === id)?.urgent));

// ---------------------------------------------------------------------------
// 漢方薬ごとの安全性の判定（二段階選定の STEP 4）。
//   exclude … 推薦から除外（formulas.json の contraindications に当たる安全フラグ）
//   check   … 推薦を確定せず「薬剤師の確認が必要」にする（相談事項・情報不足・安全確認タグの未確認）
//   notes   … 服用前に伝える一般的な注意（生薬ごと）。判定には影響しない
// 一般用医薬品の添付文書の「相談すること」を初期値の目安にした草案。添付文書の登録はフェーズ5。
// ---------------------------------------------------------------------------
export interface FormulaSafetyInput {
  code?: string;
  name: string;
  cautionHerbs: string[];
  contraindications: string[];
}
export interface FormulaSafety {
  status: 'ok' | 'check' | 'excluded';
  exclude: string[];
  check: string[];
  notes: string[];
}
export interface SafetyCtx { codes: Set<string>; general: string[]; adverse: Set<string> }

/** 生薬 × 安全フラグ → 確認が必要な理由 */
const HERB_CHECKS: { herb: string; flags: string[]; text: string }[] = [
  { herb: '甘草', flags: ['hypertension', 'heart', 'kidney'], text: '甘草を含むため、高血圧・心臓・腎臓の病気がある方は服用前に確認が必要です（むくみ・血圧上昇に注意）' },
  { herb: '甘草', flags: ['elderly'], text: '甘草を含むため、高齢の方は服用前に確認が必要です' },
  { herb: '甘草', flags: ['kampo_current'], text: '甘草を含むため、服用中の漢方薬との甘草の重複を確認する必要があります' },
  { herb: '麻黄', flags: ['hypertension', 'heart', 'thyroid', 'glaucoma_bph', 'elderly'], text: '麻黄を含むため、高血圧・心臓や甲状腺の病気・緑内障・排尿困難がある方や高齢の方は服用前に確認が必要です' },
  { herb: '大黄', flags: ['lactation'], text: '大黄を含むため、授乳中は服用前に確認が必要です（乳児の下痢）' },
  { herb: '大黄', flags: ['gi_weak'], text: '大黄を含むため、胃腸が弱く下痢しやすい方は服用前に確認が必要です' },
  { herb: '芒硝', flags: ['gi_weak', 'pregnancy'], text: '芒硝を含むため、胃腸が弱い方・妊娠中の方は服用前に確認が必要です' },
  { herb: '附子', flags: ['pregnancy', 'heart'], text: '附子を含むため、妊娠中・妊娠の可能性がある方や心臓の病気がある方は服用前に確認が必要です' },
  { herb: '柴胡', flags: ['interferon'], text: '柴胡を含むため、インターフェロン製剤を使用中の方は服用前に確認が必要です（間質性肺炎）' },
  { herb: '桃仁', flags: ['pregnancy'], text: '桃仁を含むため、妊娠中・妊娠の可能性がある方は服用前に確認が必要です' },
  { herb: '牡丹皮', flags: ['pregnancy'], text: '牡丹皮を含むため、妊娠中・妊娠の可能性がある方は服用前に確認が必要です' },
  { herb: '紅花', flags: ['pregnancy'], text: '紅花を含むため、妊娠中・妊娠の可能性がある方は服用前に確認が必要です' },
  { herb: '牛膝', flags: ['pregnancy'], text: '牛膝を含むため、妊娠中・妊娠の可能性がある方は服用前に確認が必要です' },
  { herb: '地黄', flags: ['gi_weak'], text: '地黄を含むため、胃腸が弱い方は服用前に確認が必要です（胃の不快感・下痢）' },
  { herb: '石膏', flags: ['gi_weak'], text: '石膏を含むため、胃腸が弱い方は服用前に確認が必要です' },
  { herb: '黄芩', flags: ['liver'], text: '黄芩を含むため、肝臓の病気がある方は服用前に確認が必要です' },
];
/** 生薬ごとの一般的な注意 */
export const HERB_NOTES: Record<string, string> = {
  甘草: '甘草を含みます。長く飲む場合や、甘草を含むほかの薬と一緒に飲む場合は、むくみ・血圧上昇などに注意します。',
  麻黄: '麻黄を含みます。動悸・不眠・発汗過多・排尿困難などに注意します。',
  大黄: '大黄を含みます。下痢・腹痛に注意し、ほかの下剤とは併用しません。',
  芒硝: '芒硝を含みます。下痢・腹痛に注意し、ほかの下剤とは併用しません。',
  附子: '附子を含みます。のぼせ・動悸・舌のしびれなどが出たら服用を中止して相談します。',
  地黄: '地黄を含みます。胃の不快感・食欲不振・下痢に注意します。',
  石膏: '石膏を含みます。胃腸の弱い方は注意します。',
  桃仁: '桃仁を含みます。妊娠中・妊娠の可能性がある方は服用前に相談してください。',
  牡丹皮: '牡丹皮を含みます。妊娠中・妊娠の可能性がある方は服用前に相談してください。',
  紅花: '紅花を含みます。妊娠中・妊娠の可能性がある方は服用前に相談してください。',
  牛膝: '牛膝を含みます。妊娠中・妊娠の可能性がある方は服用前に相談してください。',
  山梔子: '山梔子を含みます。長期間（多くは5年以上）続けて飲む場合は、定期的に相談してください。',
  黄芩: '黄芩を含みます。まれに間質性肺炎・肝機能障害の報告があります。から咳・息切れ・発熱や、強いだるさ・皮膚や白目が黄色くなるなどが出たら服用を中止して相談します。',
};
export const GENERAL_NOTES = [
  '服用後に発疹・かゆみ・胃の不快感などが出たら、服用を中止して相談してください。',
  'しばらく（目安として1か月ほど）服用しても改善がみられない場合は、薬剤師にご相談ください。',
];

/** 安全確認の回答から、その人の安全フラグの集合と、全候補に共通の確認事項を作る */
export function safetyContext(flags: SafetyFlag[], answers: Answers, w: WalkResult, tags: TagHit[] = []): SafetyCtx {
  const codes = new Set(flags.map((f) => f.code));
  if (w.ageBand === '70s') codes.add('elderly');
  const general: string[] = [];
  // 安全確認の回答が足りない・「わからない」→ 推薦を確定しない（情報不足）
  const asked = new Set(w.steps.map((s) => s.q.id));
  const missing: string[] = [];
  const unknown: string[] = [];
  const LABEL: Record<string, string> = { C1: '服用中の薬', C2: '治療中の病気', C3: 'アレルギー歴', C4: '漢方で体調を崩した経験', A3P: '妊娠・授乳' };
  for (const qid of ['C1', 'C2', 'C3', 'C4', 'A3P']) {
    if (qid === 'A3P' && !asked.has('A3P')) continue;
    const ids = answers[qid] ?? [];
    if (!ids.length) missing.push(LABEL[qid]);
    else if (ids.some((id) => optionById(id)?.exclusive === 'unknown' || optionById(id)?.exclusive === 'declined')) unknown.push(LABEL[qid]);
  }
  if (missing.length) general.push(`安全確認（${missing.join('・')}）の回答がないため、確認が必要です（情報不足）`);
  if (unknown.length) general.push(`安全確認（${unknown.join('・')}）が「わからない」「回答しない」のため、確認が必要です（情報不足）`);
  if (codes.has('meds')) general.push('服用中の薬があるため、薬剤師がお薬手帳などで名前を確認し、飲み合わせ（甘草などの重複を含む）を確認する必要があります');
  const disease = ['kidney', 'liver', 'diabetes', 'cancer', 'other_disease', 'hypertension', 'heart', 'thyroid', 'glaucoma_bph'].filter((c) => codes.has(c));
  if (disease.length) general.push(`治療中の病気（${disease.map((c) => FLAG_LABEL[c] ?? c).join('・')}）があるため、主治医の指示とあわせて確認が必要です`);
  if (codes.has('allergy')) general.push('アレルギー歴があるため、含まれる生薬・添加物との照合が必要です');
  if (codes.has('adverse_kampo')) general.push('漢方薬で体調を崩した経験があるため、その漢方薬の構成生薬と照合し、副作用の内容・原因として疑われる生薬・再投与の危険性を確認する必要があります（原因の生薬は未特定）');
  if (codes.has('pregnancy')) general.push('妊娠中・妊娠の可能性があるため、服用前に確認が必要です');
  if (tags.length) general.push(`安全確認タグ（${tags.map((t) => t.label).join('・')}）の確認が済むまで、提案を確定しません`);
  return { codes, general, adverse: new Set(kampoCodes(answers, 'C4K')) };
}

export function assessFormulaSafety(f: FormulaSafetyInput, ctx: SafetyCtx): FormulaSafety {
  const exclude = f.contraindications.filter((c) => ctx.codes.has(c)).map((c) => `${FLAG_LABEL[c] ?? c}に当たるため除外`);
  const check: string[] = [...ctx.general];
  if (f.code && ctx.adverse.has(f.code)) check.unshift('この漢方薬で体調を崩したことがあると回答されています。再び使うかは薬剤師が判断します');
  for (const r of HERB_CHECKS) {
    if (f.cautionHerbs.includes(r.herb) && r.flags.some((c) => ctx.codes.has(c)) && !check.includes(r.text)) check.push(r.text);
  }
  const notes = [...new Set(f.cautionHerbs.map((h) => HERB_NOTES[h]).filter((x): x is string => !!x))];
  return { status: exclude.length ? 'excluded' : check.length ? 'check' : 'ok', exclude, check, notes };
}
