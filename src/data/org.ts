// 会社情報の構造化データ（Organization）で共通に使う表記。BaseLayout（全ページ）と /company/ の両方がここを参照し、
// 法人名・別名・事業内容・専門領域・提供サービスの表記を揃える（2026-10-29 統一）。
export const ORG_NAME = '株式会社ex Labs';
export const ORG_ALT_NAMES = ['ex Labs', 'イーエックスラボ', 'ex Labs Inc.'];
export const ORG_DESCRIPTION =
  '商業施設・文化施設・観光施設やIP・ブランドの魅力を活かした体験型イベントの企画・制作会社。イマーシブ（没入型体験）・マーダーミステリー（マダミス）・謎解き・心理戦／頭脳戦の制作から、集客・運営まで一貫して手がける。';

export const ORG_KNOWS_ABOUT = [
  '体験型イベント・参加型イベントの企画・制作',
  'イマーシブ（没入型）体験・イマーシブシアターの企画・制作',
  'マーダーミステリー（マダミス）の制作',
  '謎解きイベントの企画・制作',
  '心理戦ゲーム・頭脳戦・交渉ゲームコンテンツの制作',
  '商業施設・観光施設・宿泊施設の集客イベント（施設活用）',
  '美術館・植物園など公共の文化施設での体験型イベント',
  'IP・キャラクターを活用した体験型イベント',
  '周遊型イベント・回遊施策の設計',
  '謎解き・マダミスを活用した企業研修・チームビルディング',
];

export const ORG_OFFERS: { name: string; path: string }[] = [
  { name: '体験型イベントの企画・制作', path: '/services/experience-event-production/' },
  { name: 'イマーシブコンテンツ制作', path: '/services/immersive/' },
  { name: 'マーダーミステリー（マダミス）制作', path: '/services/murder-mystery/' },
  { name: '頭脳戦制作', path: '/services/zunousen/' },
  { name: '施設活用イベントの企画・制作', path: '/services/shisetsu-event/' },
  { name: '公共施設・文化施設の体験型イベント', path: '/services/cultural-facility-event/' },
  { name: 'IPイベント企画・制作', path: '/services/ip-event/' },
  { name: '謎解き研修', path: '/services/nazotoki-kenshu/' },
];
