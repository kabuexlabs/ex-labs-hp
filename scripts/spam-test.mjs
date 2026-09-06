// お問い合わせスパム判定の回帰テスト。実際に届いた本物・スパムのサンプルで、
// 「本物を弾かない」「既知のスパムを通さない」を確認する。
//   node --experimental-strip-types scripts/spam-test.mjs
import { spamCheck } from '../src/lib/spam.ts';

const cases = [
  // [期待, ラベル, 本文, source, email]
  [false, '東武タワースカイツリー（本物・施設からの制作相談）',
    '【name】\n松尾一真\n【company】\n東武タワースカイツリー株式会社\n【message】\n平素よりお世話になっております。弊施設内の一区画を活用した収益化施策を検討しており、貴社ホームページを拝見したうえでご連絡いたしました。初期費用を抑えた形での導入は可能でしょうか。レベニューシェア型で実施する場合の分配率の目安をご教示ください。',
    '参照元: (なし)\n最初に開いたページ: https://kabuexlabs.com/\n送信したページ: https://kabuexlabs.com/', 'k-matsuo@tokyo-skytree.jp'],
  [false, '短い本物（JSあり）', '【name】\n山田太郎\n【message】\n社内イベントで謎解きをお願いしたいです。見積りをください。', '参照元: https://www.google.com/\n最初に開いたページ: https://kabuexlabs.com/guide/shanai-event/', 'yamada@example.co.jp'],
  [false, 'JSなしだが長文で法人ドメイン', '【name】\n佐藤\n【company】\n株式会社サンプル商業\n【message】\n商業施設の催事スペースで体験型イベントを検討しています。11月の3週間で、周遊型の謎解きを想定しています。費用感と実施までの流れ、過去の商業施設での事例を教えていただけますでしょうか。よろしくお願いいたします。', '', 'sato@sample-shogyo.co.jp'],
  [true, 'mail.ru bot（サイト見出し貼り付け）', '【name】\n結衣 鈴木\n【message】\n詳しい情報を希望します。メールでご連絡ください — 場所やip、ブランドに合った 体験型イベントを実施しませんか.', '', 'madamtaisia@mail.ru'],
  [true, '被リンク営業', '【message】\n貴社サイトを拝見しました。相互リンクのご提案です。ドメインパワーが向上します。', '参照元: (なし)', 'seo@example.com'],
  [true, '日程調整URL営業', '【message】\n広告運用のご提案です。ご都合の良い日時を https://timerex.net/s/xxx からお選びください。', '', 'sales@ad-agency.jp'],
  [true, 'JSなし・短文・フリーメール', '【message】\nHello, I want more information.', '', 'abc@gmx.com'],
];
let ng = 0;
for (const [expect, label, text, source, email] of cases) {
  const got = spamCheck(text, source, email, text.length);
  const ok = got === expect;
  if (!ok) ng++;
  console.log(`${ok ? 'OK ' : 'NG '} ${expect ? 'spam ' : 'legit'}  ${label}${ok ? '' : `  → 判定: ${got}`}`);
}
if (ng) { console.error(`\n${ng} 件失敗`); process.exit(1); }
console.log('\nスパム判定テスト: 全件OK');
