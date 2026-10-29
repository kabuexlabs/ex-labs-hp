// ---------------------------------------------------------------------------
// 安全確認（純粋関数）。2026-10-25 改修計画 §6。
//  1) 安全フラグ：服用中の薬・治療中の病気・妊娠授乳・アレルギー・漢方で体調を崩した経験（C1〜C4・A3P）。
//     漢方薬ごとの「要確認」「除外」に使う（STEP 4）。
//  2) 安全確認タグ：主訴や選択肢に付けたタグ（頭痛・しびれ・動悸・精神症状など）。証のスコアとは別に持ち、
//     薬剤師画面に確認事項を出す。受診勧奨の判断は薬剤師が行う（システムは判断材料を示すだけ）。
//  3) 直ちに対応が必要な例外（急性の神経症状・呼吸困難を伴う急な腫れ）：患者画面に
//     「すぐに近くのスタッフにお声がけください」、スタッフ一覧に印。119番の一律表示はしない（改修指示 5-5）。
// 全員共通のレッドフラッグ質問・「日常生活への影響」×期間による機械的な受診勧奨はやめた（改修指示 5-1・4-7）。
// 2026-10-28 修正依頼 第5章：アレルギーと副作用歴は1問（C3）にまとめ、記入内容は「口頭で確認」の印つきで分けて出す。
// 服用中・体調を崩した漢方薬は、ご本人が候補から選び（C1KP・C3KP。見つからなければ「見つからない」）、薬剤師が確認・修正する
// （X_kampo_current・X_kampo_adverse。2026-10-29 第2弾 6-3）。体調を崩した漢方薬と同じ漢方薬は候補から除外する（6-4）。
// 薬の名前・病名・手術・アレルギーの記入内容は、薬剤師が確認・修正した内容（texts の「<ID>#staff」）を優先して出す。
// 安全確認タグは薬剤師が「確認した」を記録するまで未確認として残す。妊娠・授乳が未回答なら口頭で確認するまで提案を確定しない。
// ---------------------------------------------------------------------------
import { optionById, optionText, complaintById, tagById, formulaByCode, type SafetyTagDef } from './masters.ts';
import { isPresent } from './findings.ts';
import { kampoOf, type Answers, type WalkResult } from './flow.ts';

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
  allergy_drug: '薬のアレルギー歴', allergy_food: '食品のアレルギー歴', surgery: '手術歴', preg_unconfirmed: '妊娠・授乳が未確認', minor: '10代',
  disease_note: '治療中の病気（病名・時期）', hypokalemia: '低カリウム血症', other_meds: 'その他の薬あり',
  med_diuretic: '利尿薬', med_steroid: 'ステロイドの飲み薬', med_bp: '血圧の薬', med_thyroid: '甲状腺の薬', med_asthma: 'ぜんそく・気管支の薬',
  med_antidep: '抗うつ薬', med_laxative: '便秘薬', med_otc: '市販のかぜ薬・胃腸薬', med_anticoag: '血液をサラサラにする薬',
};
FLAG_LABEL.glaucoma_bph = '前立腺肥大など尿が出にくい';
/** 安全確認の入力（患者の回答のほか、薬剤師の入力・記入欄・タグの確認） */
export interface SafetyInput {
  staffAnswers?: Answers;
  texts?: Record<string, string>;
  tagChecks?: Record<string, TagCheck>;
}
export interface TagCheck { by: string; at: string; note?: string }
const DISEASE_DETAIL: Record<string, string> = {
  hypertension: '麻黄・附子・甘草を含む漢方薬に注意', heart: '麻黄・附子・甘草を含む漢方薬に注意', kidney: '甘草・麻黄を含む漢方薬に注意',
  hypokalemia: '甘草を含む漢方薬に注意（甘草の量によっては禁忌）', thyroid: '麻黄を含む漢方薬に注意', glaucoma_bph: '麻黄を含む漢方薬に注意',
  liver: '黄芩を含む漢方薬に注意。小柴胡湯は肝硬変・肝がんの方には禁忌（病名を確認）',
};
const LEVEL_OF: Record<string, SafetyLevel> = { diabetes: 'info', other_disease: 'info', surgery: 'info' };
const DISEASE_NOTE: Record<string, string> = {
  cancer: '主治医の治療（抗がん剤・放射線治療など）との関係を確認するまで、提案を確定しません（扱いは店舗で決定待ち）',
  surgery: '手術の内容・時期を口頭で確認してください',
  other_disease: '病名を口頭で確認してください',
};

const chosenIn = (answers: Answers, qid: string) => answers[qid] ?? [];
const nonExclusive = (ids: string[]) => ids.filter((id) => !optionById(id)?.exclusive);

const names = (codes: string[]) => codes.map((c) => formulaByCode(c)?.name ?? c).join('・');
/** 記入内容：薬剤師が確認・修正した内容があればそれ、なければご本人の記入 */
export function noteText(texts: Record<string, string> | undefined, id: string): { text: string; by: 'staff' | 'patient' | 'none' } {
  const st = (texts?.[`${id}#staff`] ?? '').trim();
  if (st) return { text: st, by: 'staff' };
  const p = (texts?.[id] ?? '').trim();
  return p ? { text: p, by: 'patient' } : { text: '', by: 'none' };
}
const noteLine = (input: SafetyInput, id: string) => {
  const n = noteText(input.texts, id);
  return n.by === 'staff' ? `「${n.text}」（薬剤師が確認）` : n.by === 'patient' ? `記入：「${n.text}」（口頭で確認）` : '記入なし（口頭で確認）';
};
/**
 * 妊娠・授乳の回答：薬剤師が口頭で確認した入力（X_preg）が患者の回答（A3P）より優先。
 * 「回答せずに次へ」と「妊娠の可能性がある」は、薬剤師が口頭で確定するまで未確認（第3弾 8）。
 */
export function pregnancyAnswer(answers: Answers, w: WalkResult, input: SafetyInput = {}): { ids: string[]; source: 'A3P' | 'X_preg'; unconfirmed: boolean } {
  const staff = input.staffAnswers?.['X_preg'] ?? [];
  if (staff.length) return { ids: staff.map((id) => id.replace(/^X_preg-/, 'A3P-')), source: 'X_preg', unconfirmed: false };
  const asked = w.steps.some((x) => x.q.id === 'A3P');
  const ids = chosenIn(answers, 'A3P');
  return { ids, source: 'A3P', unconfirmed: asked && (ids.length === 0 || ids.includes('A3P-maybe')) };
}
/**
 * 漢方の提案をしない理由（第3弾 10-1：妊娠中・授乳中の方には漢方を提案しない）。
 * 妊娠・授乳が未確認（回答なし・妊娠の可能性がある）なら、口頭で確定するまで提案しない。
 */
export function noKampoReason(flags: SafetyFlag[]): string | null {
  const has = (c: string) => flags.some((f) => f.code === c);
  if (has('pregnancy') && flags.find((f) => f.code === 'pregnancy')?.label === '妊娠中') return '妊娠中のため漢方の提案は行いません（養生のご案内のみ）';
  if (has('lactation')) return '授乳中のため漢方の提案は行いません（養生のご案内のみ）';
  const pf = flags.find((f) => f.code === 'pregnancy');
  if (pf && pf.source === '薬剤師が口頭で確認') return '妊娠の可能性があるため漢方の提案は行いません（養生のご案内のみ）';
  if (has('preg_unconfirmed') || pf) return '妊娠・授乳が確認できていないため、口頭で確認して ② に入力するまで漢方の提案は行いません';
  return null;
}
/** 選ばれた選択肢の受診のおすすめ（refer）。患者の回答と薬剤師の観察の両方 */
export function referrals(w: WalkResult, staffAnswers?: Answers): { text: string; message: string; source: string }[] {
  const out: { text: string; message: string; source: string }[] = [];
  for (const st of w.steps) for (const id of st.ids) { const o = optionById(id); if (o?.refer) out.push({ text: o.text, message: o.refer, source: st.q.id }); }
  for (const [qid, ids] of Object.entries(staffAnswers ?? {})) for (const id of ids) { const o = optionById(id); if (o?.refer) out.push({ text: o.text, message: o.refer, source: `薬剤師の観察（${qid}）` }); }
  return out;
}

/** 安全フラグ（回答・薬剤師の入力から） */
export function safetyFlags(answers: Answers, w: WalkResult, input: SafetyInput = {}): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  const push = (f: SafetyFlag) => { if (!flags.some((x) => x.code === f.code)) flags.push(f); };
  const meds = nonExclusive(chosenIn(answers, 'C1'));
  const otherMeds = meds.filter((id) => id !== 'C1-kampo' && id !== 'C1-other' && !id.startsWith('C1KP-'));
  if (otherMeds.length) {
    push({ code: 'meds', level: 'warn', label: '服用中の薬', detail: otherMeds.map((id) => `${optionText(id)}：${noteLine(input, id)}`).join('／'), source: 'C1' });
    if (meds.includes('C1-interferon')) push({ code: 'interferon', level: 'warn', label: 'インターフェロン製剤を使用', detail: '小柴胡湯との併用禁忌。柴胡を含む漢方薬は確認が必要', source: 'C1' });
  }
  for (const id of otherMeds) for (const code of optionById(id)?.flags ?? []) if (code.startsWith('med_') && !flags.some((x) => x.code === code)) flags.push({ code, level: 'info', label: FLAG_LABEL[code] ?? optionText(id), detail: '漢方薬との飲み合わせを候補ごとに確認します', source: 'C1' });
  if (meds.includes('C1-other')) push({ code: 'other_meds', level: 'warn', label: 'その他の薬あり：確認', detail: `${noteLine(input, 'C1-other')}。自動では飲み合わせを判定できません`, source: 'C1' });
  const cur = kampoOf(answers, input.staffAnswers, 'X_kampo_current');
  if (meds.includes('C1-kampo') || cur.codes.length) {
    const who = cur.source === 'staff' ? '（薬剤師が確認）' : cur.source === 'patient' ? '（ご本人が選択。薬剤師が確認・修正）' : '';
    push({
      code: 'kampo_current', level: 'warn', label: '服用中の漢方薬',
      detail: `${cur.codes.length ? `${names(cur.codes)}${who}` : '名前は未確認'}${cur.notfound ? '／ご本人が「見つからない」を選択（口頭で確認）' : ''}`,
      source: cur.source === 'staff' ? '薬剤師の入力' : 'C1',
    });
  }
  for (const id of chosenIn(answers, 'C2')) {
    for (const code of optionById(id)?.flags ?? []) {
      push({ code, level: LEVEL_OF[code] ?? 'warn', label: FLAG_LABEL[code] ?? optionText(id), detail: DISEASE_DETAIL[code] ?? DISEASE_NOTE[code], source: 'C2' });
    }
  }
  const diseases = nonExclusive(chosenIn(answers, 'C2')).filter((id) => id !== 'C2-surgery');
  if (diseases.length) push({ code: 'disease_note', level: 'info', label: '治療中の病気（病名・時期）', detail: diseases.map((id) => `${optionText(id)}：${noteLine(input, id)}`).join('／'), source: 'C2' });
  if (chosenIn(answers, 'C2').includes('C2-surgery')) {
    const f = flags.find((x) => x.code === 'surgery');
    if (f) f.detail = `何の手術か・いつ頃か：${noteLine(input, 'C2-surgery')}`;
  }
  if (chosenIn(answers, 'C2').includes('C2-8') || (isPresent(w.state, 'loose_stool') && isPresent(w.state, 'poor_appetite'))) {
    push({ code: 'gi_weak', level: 'warn', label: chosenIn(answers, 'C2').includes('C2-8') ? '胃腸が弱い・胃腸の病気' : '胃腸が弱い傾向（軟便＋食欲がない）', detail: '地黄・麻黄・大黄・石膏を含む漢方薬は胃腸障害に注意', source: chosenIn(answers, 'C2').includes('C2-8') ? 'C2' : '体質の回答' });
  }
  const pg = pregnancyAnswer(answers, w, input);
  const preg = pg.ids;
  const pSrc = pg.source === 'X_preg' ? '薬剤師が口頭で確認' : 'A3P';
  if (preg.includes('A3P-preg') || preg.includes('A3P-maybe')) {
    push({ code: 'pregnancy', level: 'warn', label: preg.includes('A3P-preg') ? '妊娠中' : '妊娠の可能性あり', detail: preg.includes('A3P-preg') ? '妊娠中の方には漢方の提案は行いません（養生のご案内のみ）' : '口頭で確認して ② に入力してください。確定するまで漢方の提案は行いません', source: pSrc });
  }
  if (preg.includes('A3P-lact')) push({ code: 'lactation', level: 'warn', label: '授乳中', detail: '授乳中の方には漢方の提案は行いません（養生のご案内のみ）', source: pSrc });
  if (pg.unconfirmed && !preg.includes('A3P-maybe')) push({ code: 'preg_unconfirmed', level: 'warn', label: '妊娠・授乳：未確認（口頭で確認）', detail: 'ご本人が回答せずに進めました。口頭で確認して ② に入力するまで、漢方の提案は行いません', source: 'A3P' });
  for (const r of referrals(w, input.staffAnswers)) push({ code: `refer:${r.text}`, level: 'refer', label: `受診のおすすめ：${r.text}`, detail: r.message, source: r.source });
  const c3 = chosenIn(answers, 'C3');
  if (c3.includes('C3-drug')) push({ code: 'allergy_drug', level: 'warn', label: '薬のアレルギー歴', detail: noteLine(input, 'C3-drug'), source: 'C3' });
  if (c3.includes('C3-food')) push({ code: 'allergy_food', level: 'warn', label: '食品のアレルギー歴', detail: `${noteLine(input, 'C3-food')}。生薬と重なる食品がないか、「食品と生薬の対応」で確認`, source: 'C3' });
  const adv = kampoOf(answers, input.staffAnswers, 'X_kampo_adverse');
  if (c3.includes('C3-kampo') || adv.codes.length) {
    const sym = c3.filter((id) => id.startsWith('C3S-'));
    const serious = sym.some((id) => optionById(id)?.flags?.includes('serious'));
    const who = adv.source === 'staff' ? '（薬剤師が確認）' : adv.source === 'patient' ? '（ご本人が選択。薬剤師が確認・修正）' : '';
    push({
      code: 'adverse_kampo', level: 'warn', label: '漢方薬で体調を崩した経験',
      detail: `漢方薬：${adv.codes.length ? `${names(adv.codes)}${who}` : '未確認（口頭で確認して入力）'}${adv.notfound ? '（ご本人が「見つからない」を選択）' : ''}／症状：${sym.map(optionText).join('・') || '未回答'}（原因の生薬は未特定）${serious ? '。空咳・息苦しさ（間質性肺炎）や肝機能の異常は重い副作用のサインのことがあるため、原因の漢方薬・生薬を必ず確認' : ''}`,
      source: c3.includes('C3-kampo') ? 'C3' : '薬剤師の入力',
    });
  }
  if (w.ageBand === '10s') push({ code: 'minor', level: 'warn', label: '10代', detail: '保護者の同意と、漢方薬を提案してよいかを確認してください（扱いは店舗で決定待ち）', source: 'A2' });
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
  /** 薬剤師が確認した記録（なければ未確認） */
  checked?: TagCheck;
}
/** 回答（主訴・選択肢）と薬剤師の入力に付いた安全確認タグを集める。薬剤師の確認（tagChecks）を付ける */
export function safetyTags(w: WalkResult, staffAnswers?: Answers, tagChecks?: Record<string, TagCheck>): TagHit[] {
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
  for (const h of hits.values()) if (tagChecks?.[h.id]) h.checked = tagChecks[h.id];
  return [...hits.values()].sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(!!a.checked) - Number(!!b.checked));
}
export const uncheckedTags = (tags: TagHit[]) => tags.filter((t) => !t.checked);
/** 薬剤師が口頭で確認するメモ（選択肢の staffNote、シミの状態からの肝斑の可能性。安全確認タグとは別で、提案の確定は止めない） */
export interface StaffCheck { label: string; detail: string }
export function staffChecks(w: WalkResult): StaffCheck[] {
  const out: StaffCheck[] = [];
  const add = (c: StaffCheck) => { if (!out.some((x) => x.label === c.label)) out.push(c); };
  for (const st of w.steps) for (const o of st.q.options) if (o.staffNote && (o.locked || st.ids.includes(o.id))) add({ label: o.text, detail: o.staffNote });
  // 第2弾 3-2：「シミ・色素沈着」で頬骨のあたりに左右対称 → 肝斑の典型的な見え方と重なる（患者画面には出さない）
  if (w.complaints.includes('spots') && !w.complaints.includes('melasma') && isPresent(w.state, 'spots_symmetric')) {
    add({ label: '肝斑の可能性あり（確認）', detail: '「シミ・色素沈着」で「頬骨のあたりに左右対称に広がる」を選んでいます。肝斑の典型的な見え方と重なるため確認してください（患者画面には表示していません）' });
  }
  return out;
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
  /** 処方の対象（駆瘀血の判定に使う。瘀血 0.5 以上） */
  types?: Partial<Record<string, number>>;
}
export interface FormulaSafety {
  status: 'ok' | 'check' | 'excluded';
  exclude: string[];
  check: string[];
  notes: string[];
}
export interface SafetyCtx { codes: Set<string>; general: string[]; adverse: Set<string>; current: Set<string> }

/** 生薬 × 安全フラグ → 確認が必要な理由 */
const HERB_CHECKS: { herb: string; flags: string[]; text: string }[] = [
  { herb: '甘草', flags: ['hypertension', 'heart', 'kidney'], text: '甘草を含むため、高血圧・心臓・腎臓の病気がある方は服用前に確認が必要です（むくみ・血圧上昇に注意）' },
  { herb: '甘草', flags: ['hypokalemia'], text: '甘草を含むため、低カリウム血症と言われたことがある方は服用前に確認が必要です（甘草の量によっては禁忌）' },
  // 飲み合わせ（2026-10-29 第3弾 4。一般的な併用注意の案。添付文書データの登録後に照合する）
  { herb: '甘草', flags: ['med_diuretic', 'med_steroid'], text: '甘草を含むため、利尿薬・ステロイドの飲み薬との併用は低カリウム血症に注意が必要です（併用注意）' },
  { herb: '甘草', flags: ['med_bp'], text: '甘草を含むため、血圧の薬との飲み合わせに注意が必要です（むくみ・血圧上昇）' },
  { herb: '甘草', flags: ['med_otc'], text: '甘草を含むため、市販のかぜ薬・胃腸薬と成分が重なることがあります（甘草の重複）' },
  { herb: '麻黄', flags: ['med_bp', 'med_thyroid', 'med_asthma', 'med_antidep'], text: '麻黄を含むため、血圧・甲状腺・ぜんそく／気管支の薬、抗うつ薬との飲み合わせを確認する必要があります（併用注意）' },
  { herb: '麻黄', flags: ['med_otc'], text: '麻黄を含むため、市販のかぜ薬と成分（エフェドリン類）が重なることがあります' },
  { herb: '大黄', flags: ['med_laxative'], text: '大黄を含むため、便秘薬と作用が重なります（併用注意）' },
  { herb: '芒硝', flags: ['med_laxative'], text: '芒硝を含むため、便秘薬と作用が重なります（併用注意）' },
  { herb: '麻黄', flags: ['kidney', 'gi_weak'], text: '麻黄を含むため、腎臓の病気がある方・胃腸が弱い方は服用前に確認が必要です' },
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
export function safetyContext(flags: SafetyFlag[], answers: Answers, w: WalkResult, tags: TagHit[] = [], input: SafetyInput = {}): SafetyCtx {
  const codes = new Set(flags.map((f) => f.code));
  if (w.ageBand === '70s') codes.add('elderly');
  const general: string[] = [];
  // 安全確認の回答が足りない・「わからない」→ 推薦を確定しない（情報不足）。妊娠・授乳の未回答は preg_unconfirmed で扱う
  const missing: string[] = [];
  const unknown: string[] = [];
  const LABEL: Record<string, string> = { C1: '服用中の薬', C2: '治療中の病気', C3: 'アレルギー・体調を崩した経験', A3P: '妊娠・授乳' };
  const pg = pregnancyAnswer(answers, w, input);
  for (const qid of ['C1', 'C2', 'C3', 'A3P']) {
    if (qid === 'A3P' && (pg.unconfirmed || pg.source === 'X_preg' || !w.steps.some((x) => x.q.id === 'A3P'))) continue;
    const ids = answers[qid] ?? [];
    if (!ids.length) missing.push(LABEL[qid]);
    else if (ids.some((id) => optionById(id)?.exclusive === 'unknown' || optionById(id)?.exclusive === 'declined')) unknown.push(LABEL[qid]);
  }
  if (missing.length) general.push(`安全確認（${missing.join('・')}）の回答がないため、確認が必要です（情報不足）`);
  if (unknown.length) general.push(`安全確認（${unknown.join('・')}）が「わからない」「回答しない」のため、確認が必要です（情報不足）`);
  if (codes.has('meds')) general.push('服用中の薬があるため、薬剤師がお薬手帳などで名前を確認し、飲み合わせ（甘草などの重複を含む）を確認する必要があります');
  if (codes.has('other_meds')) general.push('その他の薬あり：確認（自動では飲み合わせを判定できません）');
  const disease = ['kidney', 'hypokalemia', 'liver', 'diabetes', 'cancer', 'other_disease', 'hypertension', 'heart', 'thyroid', 'glaucoma_bph'].filter((c) => codes.has(c));
  if (disease.length) general.push(`治療中の病気（${disease.map((c) => FLAG_LABEL[c] ?? c).join('・')}）があるため、主治医の指示とあわせて確認が必要です`);
  if (codes.has('allergy_drug') || codes.has('allergy_food')) general.push('アレルギー歴があるため、何に出たかを口頭で確認し、含まれる生薬・添加物との照合が必要です');
  if (codes.has('adverse_kampo')) general.push('漢方薬で体調を崩した経験があるため、その漢方薬の構成生薬と照合し、副作用の内容・原因として疑われる生薬・再投与の危険性を確認する必要があります（原因の生薬は未特定）');
  const cur = kampoOf(answers, input.staffAnswers, 'X_kampo_current');
  const adv = kampoOf(answers, input.staffAnswers, 'X_kampo_adverse');
  if (codes.has('kampo_current') && (!cur.codes.length || cur.notfound)) general.push('服用中の漢方薬の名前が確認できていません。確認して入力するまで、重複の照合ができません');
  if (codes.has('pregnancy')) general.push('妊娠中・妊娠の可能性があるため、服用前に確認が必要です');
  if (codes.has('preg_unconfirmed')) general.push('妊娠・授乳が未確認です。口頭で確認して入力するまで、提案を確定しません');
  if (codes.has('minor')) general.push('10代のため、保護者の同意と漢方薬を提案してよいかを確認するまで、提案を確定しません');
  const open = uncheckedTags(tags);
  if (open.length) general.push(`安全確認タグ（${open.map((t) => t.label).join('・')}）の確認が済むまで、提案を確定しません`);
  return { codes, general, adverse: new Set(adv.codes), current: new Set(cur.codes) };
}

/** 服用中・体調を崩した漢方薬と候補の重複（同じ漢方薬・注意生薬の重複）。注意生薬（cautionHerbs）の範囲で照合する */
export function overlapChecks(f: FormulaSafetyInput, ctx: Pick<SafetyCtx, 'current' | 'adverse'>): string[] {
  const out: string[] = [];
  for (const code of ctx.current) {
    const cf = formulaByCode(code);
    if (!cf) continue;
    if (code === f.code) { out.push(`服用中の${cf.name}と同じ漢方薬です`); continue; }
    const shared = f.cautionHerbs.filter((h) => cf.cautionHerbs.includes(h));
    if (shared.length) out.push(`服用中の${cf.name}と${shared.join('・')}が重複します${shared.includes('甘草') ? '（甘草の合計量に注意：むくみ・血圧上昇・低カリウム血症）' : ''}`);
  }
  for (const code of ctx.adverse) {
    const af = formulaByCode(code);
    if (!af || code === f.code) continue;
    const shared = f.cautionHerbs.filter((h) => af.cautionHerbs.includes(h));
    if (shared.length) out.push(`${shared.join('・')}が共通（体調を崩した${af.name}と。原因の生薬は未特定）`);
  }
  return out;
}

export function assessFormulaSafety(f: FormulaSafetyInput, ctx: SafetyCtx): FormulaSafety {
  const exclude = f.contraindications.filter((c) => ctx.codes.has(c)).map((c) => `${FLAG_LABEL[c] ?? c}に当たるため除外`);
  if (f.code && ctx.adverse.has(f.code)) exclude.unshift('この漢方薬で体調を崩したことがあるため除外');
  const check: string[] = [...ctx.general];
  for (const x of overlapChecks(f, ctx)) if (!check.includes(x)) check.push(x);
  for (const r of HERB_CHECKS) {
    if (f.cautionHerbs.includes(r.herb) && r.flags.some((c) => ctx.codes.has(c)) && !check.includes(r.text)) check.push(r.text);
  }
  if (ctx.codes.has('med_anticoag') && (f.types?.blood_stasis ?? 0) >= 0.5) check.push('瘀血を改善する漢方薬（駆瘀血剤）のため、血液をサラサラにする薬との併用は薬剤師が確認します');
  const notes = [...new Set(f.cautionHerbs.map((h) => HERB_NOTES[h]).filter((x): x is string => !!x))];
  return { status: exclude.length ? 'excluded' : check.length ? 'check' : 'ok', exclude, check, notes };
}

/**
 * 食品アレルギーと重なる生薬（薬剤師画面の参照用。2026-10-28 修正依頼 5-1）。
 * 一般的な対応の参考で、どの漢方薬に含まれるかは製品の添付文書の構成生薬で確認する（構成生薬のマスタは未登録）。
 */
export const FOOD_HERBS: { food: string; herb: string }[] = [
  { food: 'シナモン', herb: '桂皮（けいひ）・桂枝（けいし）' },
  { food: '山芋・長芋', herb: '山薬（さんやく）' },
  { food: '小麦', herb: '小麦（しょうばく）・浮小麦（ふしょうばく）' },
  { food: '牡蠣（カキ）', herb: '牡蛎（ぼれい：カキの殻）' },
  { food: 'ショウガ', herb: '生姜（しょうきょう）・乾姜（かんきょう）' },
  { food: 'ナツメ', herb: '大棗（たいそう）' },
  { food: 'ゴマ', herb: '胡麻（ごま）' },
  { food: '米', herb: '粳米（こうべい）' },
  { food: 'ハトムギ', herb: '薏苡仁（よくいにん）' },
  { food: 'みかんの皮', herb: '陳皮（ちんぴ）' },
  { food: 'シソ', herb: '蘇葉（そよう）' },
  { food: '桃（種）', herb: '桃仁（とうにん）' },
  { food: 'アンズ（種）', herb: '杏仁（きょうにん）' },
  { food: 'ゼラチン', herb: '阿膠（あきょう：動物の皮のにかわ）' },
  { food: '水あめ（麦芽）', herb: '膠飴（こうい）' },
  { food: 'ミント', herb: '薄荷（はっか）' },
  { food: '山椒', herb: '山椒（さんしょう）' },
];
