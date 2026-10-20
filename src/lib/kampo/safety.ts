// ---------------------------------------------------------------------------
// 安全確認フラグ（純粋関数）。仕様書 第9節。
// スコアとは切り離し、回答からフラグ一覧を作ってスタッフ画面の最上部に出す。
// 来店客画面には内容を出さない。
// ---------------------------------------------------------------------------
import type { Answers } from './scoring.ts';

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

/** 安全フラグ → 候補カードで赤字にする注意生薬 */
export const FLAG_HERBS: Record<string, string[]> = {
  hypertension: ['麻黄', '附子', '甘草'],
  heart: ['麻黄', '附子', '甘草'],
  thyroid: ['麻黄', '附子', '甘草'],
  glaucoma_bph: ['麻黄', '附子', '甘草'],
  gi_weak: ['大黄', '石膏', '地黄'],
  pregnancy: ['大黄', '芒硝', '牡丹皮', '桃仁', '紅花', '牛膝', '附子', '麻黄'],
  lactation: ['大黄'],
  interferon: ['柴胡'],
};
export const FLAG_LABEL: Record<string, string> = {
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
