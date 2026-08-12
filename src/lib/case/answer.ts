// 回答の正規化と正誤判定。
// 入力・正解の双方に同じ正規化をかけてから比較するため、問題データ側は
// 代表的な表記だけ登録すればよい。正規化ルールを増やす場合はこの
// ファイルだけを変更する。

export type NormalizeOptions = {
  /** カタカナをひらがなへ畳み込み、カナの表記揺れを吸収する。 */
  foldKana?: boolean;
};

const defaultOptions: Required<NormalizeOptions> = {
  foldKana: true,
};

/** カタカナ (ァ-ヶ) をひらがなへ変換する。 */
export function katakanaToHiragana(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/**
 * 回答文字列の正規化。
 * - NFKC 正規化（全角英数字・半角カナなどを標準形へ）
 * - 前後および文中の空白（全角スペース含む）を除去
 * - 大文字小文字を無視
 * - カタカナ→ひらがな（オプション、既定で有効）
 */
export function normalizeAnswer(
  input: string,
  options: NormalizeOptions = {},
): string {
  const opts = { ...defaultOptions, ...options };
  let s = input.normalize('NFKC');
  s = s.replace(/[\s　]+/g, '');
  s = s.toLowerCase();
  if (opts.foldKana) s = katakanaToHiragana(s);
  return s;
}

/** 入力が許容回答のいずれかに一致するかを判定する。 */
export function checkAnswer(
  input: string,
  answers: string[],
  options: NormalizeOptions = {},
): boolean {
  const normalized = normalizeAnswer(input, options);
  if (normalized === '') return false;
  return answers.some((a) => normalizeAnswer(a, options) === normalized);
}
