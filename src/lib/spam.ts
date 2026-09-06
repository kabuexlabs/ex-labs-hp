// お問い合わせフォームの営業・bot スパム判定。api/contact.ts から分離し、
// scripts/spam-test.mjs で実際の受信サンプルに対して回帰テストできるようにしている。

// --- 営業スパム自動判定 ------------------------------------------------------
// 実際に届いた営業メールに共通する高精度シグナルだけを見る。
// 該当しても破棄はしない（KV保存・管理者通知はそのまま）。件名に
// 【営業・スパムの疑い】を付けて仕分けし、お客様向け自動控えメールだけ止める。
// 誤判定してもメール自体は届くので、問い合わせを取りこぼす事故は起きない。
export const SPAM_STRONG: RegExp[] = [
  // 被リンク・相互リンク営業（nocode-sol型）
  /相互リンク|被リンク|リンク設置|ドメインパワー|dofollow/i,
  // 日程調整URLを貼ってくる営業（Wedia型）
  /timerex\.net|youcanbook\.me|calendly\.com|meetings\.hubspot/i,
  // 営業代行・広告運用・SEO業者の定型文
  /営業代行|テレアポ|アポ(?:イント)?(?:獲得)?代行/,
  /広告運用(?:代行)?の|リスティング広告|MEO対策/,
  /SEO(?:対策|コンサル)(?:の)?(?:ご案内|ご提案|サービス)|検索順位を(?:上げ|改善)/i,
  // 一斉配信メールの常套句（通常の問い合わせには絶対に現れない）
  /配信(?:の)?(?:停止|解除)|受信を希望(?:され)?ない|一斉(?:送信|配信)/,
  // フォーム自動投稿 bot の定型文（サイトの見出しをそのまま貼り付けてくる）
  /詳しい情報を希望します|メールでご連絡ください\s*[—–‐-]/,
  /体験型イベントを実施しませんか/,
];
export const SPAM_WEAK: RegExp[] = [
  /補助金|助成金/,
  /貴社(?:の)?(?:ホームページ|ＨＰ|HP|サイト)を拝見/i,
  /無料(?:診断|トライアル)/,
];
// bot の送信元に多いフリーメールドメイン（日本の法人問い合わせにはまず現れない）
export const BOT_MAIL_RE = /@(?:[a-z0-9-]+\.)?(?:mail\.ru|list\.ru|bk\.ru|inbox\.ru|yandex\.(?:ru|com)|rambler\.ru|gmx\.(?:com|de|net)|proton\.me|protonmail\.com|tutanota\.com)$/i;
export function spamCheck(text: string, source: string, email: string, bodyLen: number): boolean {
  const strong = SPAM_STRONG.some((re) => re.test(text));
  let weak = SPAM_WEAK.filter((re) => re.test(text)).length;
  if (BOT_MAIL_RE.test(email)) weak += 1;
  // 本文が極端に短く、かつ流入元の記録が無い（JSを経由していない）のは bot の典型
  if (!source && bodyLen < 120) weak += 1;
  // _source が空＝ブラウザのJSを経由していない直POSTの可能性が高い。
  // 単独では判定せず、弱シグナルと組み合わせたときだけ効かせる。
  return strong || weak >= 2 || (weak >= 1 && !source);
}
