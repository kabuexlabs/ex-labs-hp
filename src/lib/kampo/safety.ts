// ---------------------------------------------------------------------------
// 安全確認フラグ（純粋関数）。仕様書 第9節。
// スコアとは切り離し、回答からフラグ一覧を作ってスタッフ画面の最上部に出す。
// 来店客画面には内容を出さない。
// ---------------------------------------------------------------------------
import type { Answers } from './scoring.ts';
import { optionById, questionOfOption } from './masters.ts';
import { mainComplaintId, complaintLabel } from './complaints.ts';

export type SafetyLevel = 'refer' | 'warn' | 'info';
export interface SafetyFlag {
  code: string;
  level: SafetyLevel;
  label: string;
  detail?: string;
  /** 根拠になった設問・選択肢 */
  source: string;
}
export const SAFETY_LEVEL_LABEL: Record<SafetyLevel, string> = { refer: '受診勧奨', warn: '注意', info: '情報' };

/** 自由記入：選択肢ID（C1-1 等）または設問ID（C5）→ 入力文 */
export type FreeTexts = Record<string, string>;

const DISEASE: Record<string, { code: string; label: string; level: SafetyLevel; detail?: string }> = {
  'C2-1': { code: 'hypertension', label: '高血圧', level: 'warn', detail: '麻黄・附子・甘草を含む処方に注意' },
  'C2-2': { code: 'heart', label: '心臓の病気', level: 'warn', detail: '麻黄・附子・甘草を含む処方に注意' },
  'C2-3': { code: 'kidney', label: '腎臓の病気', level: 'info' },
  'C2-4': { code: 'liver', label: '肝臓の病気', level: 'info' },
  'C2-5': { code: 'thyroid', label: '甲状腺の病気', level: 'warn', detail: '麻黄・附子・甘草を含む処方に注意' },
  'C2-6': { code: 'glaucoma_bph', label: '緑内障・前立腺肥大', level: 'warn', detail: '麻黄・附子・甘草を含む処方に注意' },
  'C2-7': { code: 'diabetes', label: '糖尿病', level: 'info' },
  'C2-9': { code: 'cancer', label: 'がんの治療中', level: 'info' },
  'C2-10': { code: 'other_disease', label: 'その他の病気', level: 'info' },
};

export const FLAG_LABEL: Record<string, string> = {
  elderly: '高齢（70代以上）',
  meds: '服用中の薬あり', interferon: 'インターフェロン使用', hypertension: '高血圧', heart: '心臓の病気', thyroid: '甲状腺の病気',
  glaucoma_bph: '緑内障・前立腺肥大', kidney: '腎臓の病気', liver: '肝臓の病気', diabetes: '糖尿病', cancer: 'がん治療中', other_disease: 'その他の病気',
  gi_weak: '胃腸が弱い', pregnancy: '妊娠中・可能性あり', lactation: '授乳中', allergy: 'アレルギー歴', acute: '急性症状',
  severe: '生活への支障が大きい', tongue_refer: '舌の重症サイン', long_mood: '抑うつ・不眠が長期',
};

const has = (answers: Answers, id: string) => Object.values(answers).some((ids) => ids.includes(id));

export function safetyFlags(answers: Answers, texts: FreeTexts = {}, tongueOverride: string[] = []): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  const push = (f: SafetyFlag) => { if (!flags.some((x) => x.code === f.code)) flags.push(f); };

  // --- 受診勧奨（refer） ---
  const duration = (answers['A4'] ?? []).find((id) => /^A4-\d$/.test(id)) ?? '';
  const impactSevere = has(answers, 'A4s-3');
  // 「2週間以上」＝1か月以内・半年以内・それ以上（1〜2週間は短期として扱う）
  if (impactSevere && ['A4-3', 'A4-4', 'A4-5'].includes(duration)) {
    push({ code: 'severe', level: 'refer', label: '日常生活に大きな支障が2週間以上', detail: '医療機関の受診も案内する', source: 'A4' });
  }
  if (has(answers, 'B13-10') || tongueOverride.includes('B13-10')) {
    push({ code: 'tongue_refer', level: 'refer', label: '舌の所見に重症のサイン（灰黒苔・鏡面舌・運動異常）', detail: '受診を案内する', source: 'B13' });
  }
  // 「半年以上」＝A4-5（それ以上）
  if (has(answers, 'B9-2') && has(answers, 'B8-3') && duration === 'A4-5') {
    push({ code: 'long_mood', level: 'refer', label: '抑うつ・不眠が長期', detail: '必要に応じて受診を案内する', source: 'B9・B8・A4' });
  }
  // 主訴の詳細問診で選んだ「受診をおすすめする症状」（refer）と「受診も検討したい症状」（consult）
  const main = mainComplaintId(answers);
  for (const [qid, ids] of Object.entries(answers)) {
    for (const id of ids) {
      if (id === 'B13-10') continue;
      const o = optionById(id);
      if (!o?.flags) continue;
      const about = questionOfOption(id)?.role === 'detail' && main ? `「${complaintLabel(main, texts)}」：` : '';
      if (o.flags.includes('refer')) {
        push({ code: `refer:${id}`, level: 'refer', label: `受診をおすすめする症状 ${about}${o.text}`, detail: '医療機関の受診を案内する', source: qid });
      } else if (o.flags.includes('consult')) {
        push({ code: `consult:${id}`, level: 'warn', label: `受診も検討したい症状 ${about}${o.text}`, detail: '医療機関の受診もあわせて案内する。漢方薬は薬剤師が確認してから提案する', source: qid });
      }
    }
  }

  // --- 注意（warn） ---
  if (has(answers, 'C1-1')) {
    const meds = (texts['C1-1'] ?? '').trim();
    push({ code: 'meds', level: 'warn', label: '服用中の薬', detail: meds || '（薬名の記入なし）', source: 'C1' });
    if (/インターフェロン|interferon/i.test(meds)) {
      push({ code: 'interferon', level: 'warn', label: 'インターフェロン製剤を使用', detail: '小柴胡湯および柴胡剤との併用禁忌', source: 'C1' });
    }
  }
  for (const id of answers['C2'] ?? []) {
    const d = DISEASE[id];
    if (!d) continue;
    if (d.code === 'other_disease') {
      push({ code: d.code, level: d.level, label: d.label, detail: (texts['C2-10'] ?? '').trim() || undefined, source: 'C2' });
    } else {
      push({ code: d.code, level: d.level, label: d.label, detail: d.detail, source: 'C2' });
    }
  }
  if (has(answers, 'C2-8') || (has(answers, 'B6-1') && has(answers, 'B5-1'))) {
    push({ code: 'gi_weak', level: 'warn', label: has(answers, 'C2-8') ? '胃腸の病気' : '胃腸が弱い傾向（軟便＋食が細い）', detail: '大黄・石膏・地黄を含む処方は胃腸障害に注意', source: has(answers, 'C2-8') ? 'C2' : 'B6-1・B5-1' });
  }
  if (has(answers, 'C3-1') || has(answers, 'C3-3')) {
    push({ code: 'pregnancy', level: 'warn', label: has(answers, 'C3-1') ? '妊娠中' : '妊娠の可能性あり', detail: '大黄・芒硝・牡丹皮・桃仁・紅花・牛膝・附子を含む処方は避ける。麻黄は慎重', source: 'C3' });
  }
  if (has(answers, 'C4-1')) {
    push({ code: 'allergy', level: 'warn', label: 'アレルギー・漢方で体調を崩した経験', detail: (texts['C4-1'] ?? '').trim() || '（記入なし）', source: 'C4' });
  }

  // --- 情報（info） ---
  if (has(answers, 'C3-2')) push({ code: 'lactation', level: 'info', label: '授乳中', detail: '大黄含有処方は乳児の下痢に注意', source: 'C3' });
  if (duration === 'A4-1') push({ code: 'acute', level: 'info', label: '急性症状（3日以内）', detail: '体質より現在の症状を優先して対応', source: 'A4' });

  const order: Record<SafetyLevel, number> = { refer: 0, warn: 1, info: 2 };
  return flags.sort((a, b) => order[a.level] - order[b.level]);
}

export const hasRefer = (flags: SafetyFlag[]) => flags.some((f) => f.level === 'refer');

// ---------------------------------------------------------------------------
// 漢方薬ごとの安全性の判定（二段階選定の STEP 4）。
//   exclude … 推薦から除外（formulas.json の contraindications に当たる安全フラグ）
//   check   … 推薦を確定せず「薬剤師の確認が必要」にする（相談事項・情報不足）
//   notes   … 服用前に伝える一般的な注意（生薬ごと）。判定には影響しない
// 一般用医薬品の添付文書の「相談すること」を初期値の目安にしている。薬剤師が調整する。
// ---------------------------------------------------------------------------
export interface FormulaSafetyInput {
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

/** 生薬 × 安全フラグ → 確認が必要な理由 */
const HERB_CHECKS: { herb: string; flags: string[]; text: string }[] = [
  { herb: '甘草', flags: ['hypertension', 'heart', 'kidney'], text: '甘草を含むため、高血圧・心臓・腎臓の病気がある方は服用前に確認が必要です（むくみ・血圧上昇に注意）' },
  { herb: '甘草', flags: ['elderly'], text: '甘草を含むため、高齢の方は服用前に確認が必要です' },
  { herb: '麻黄', flags: ['hypertension', 'heart', 'thyroid', 'glaucoma_bph', 'elderly'], text: '麻黄を含むため、高血圧・心臓や甲状腺の病気・排尿困難がある方や高齢の方は服用前に確認が必要です' },
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
/** 生薬ごとの一般的な注意（来店客にも伝える） */
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

/** 安全確認の回答から、その人の安全フラグ（高齢など設問から読み取るものを含む）の集合を作る */
export function safetyContext(flags: SafetyFlag[], answers: Answers, texts: FreeTexts = {}): { codes: Set<string>; general: string[] } {
  const codes = new Set(flags.map((f) => f.code));
  if ((answers['A2'] ?? []).includes('A2-7')) codes.add('elderly');
  const general: string[] = [];
  // 安全確認の回答そのものが足りない → 推薦を確定しない
  const missing: string[] = [];
  if (!answers['C1']?.length) missing.push('服用中の薬');
  if (!answers['C2']?.length) missing.push('治療中の病気');
  if (!answers['C4']?.length) missing.push('アレルギー歴');
  if ((answers['A1'] ?? []).includes('A1-1') && !answers['C3']?.length) missing.push('妊娠・授乳');
  if (missing.length) general.push(`安全確認（${missing.join('・')}）の回答がないため、確認が必要です（情報不足）`);
  if (codes.has('meds')) {
    general.push((texts['C1-1'] ?? '').trim()
      ? '服用中のお薬があるため、飲み合わせ（甘草などの重複を含む）の確認が必要です'
      : '服用中のお薬の名前が未記入のため、飲み合わせを確認できていません（情報不足）');
  }
  const disease = ['kidney', 'liver', 'diabetes', 'cancer', 'other_disease', 'hypertension', 'heart', 'thyroid', 'glaucoma_bph'].filter((c) => codes.has(c));
  if (disease.length) general.push(`治療中の病気（${disease.map((c) => FLAG_LABEL[c] ?? c).join('・')}）があるため、主治医の指示とあわせて確認が必要です`);
  if (codes.has('allergy')) general.push('アレルギー・漢方で体調を崩した経験があるため、含まれる生薬との照合が必要です');
  if (codes.has('pregnancy')) general.push('妊娠中・妊娠の可能性があるため、服用前に確認が必要です');
  const consult = flags.filter((f) => f.code.startsWith('consult:')).map((f) => optionById(f.code.slice('consult:'.length))?.text ?? '');
  if (consult.length) general.push(`医療機関の受診も検討したい症状（${consult.join('・')}）があるため、薬剤師の確認が必要です`);
  return { codes, general };
}

export function assessFormulaSafety(f: FormulaSafetyInput, ctx: { codes: Set<string>; general: string[] }): FormulaSafety {
  const exclude = f.contraindications.filter((c) => ctx.codes.has(c)).map((c) => `${FLAG_LABEL[c] ?? c}に当たるため除外`);
  const check: string[] = [...ctx.general];
  for (const r of HERB_CHECKS) {
    if (f.cautionHerbs.includes(r.herb) && r.flags.some((c) => ctx.codes.has(c)) && !check.includes(r.text)) check.push(r.text);
  }
  const notes = [...new Set(f.cautionHerbs.map((h) => HERB_NOTES[h]).filter((x): x is string => !!x))];
  return { status: exclude.length ? 'excluded' : check.length ? 'check' : 'ok', exclude, check, notes };
}
