// 情報源。掲載する事実ごとに「どこから」「いつ」「どの条件で」を残す。
// 公開されているという理由だけで転載可とは判断しない（自社公式＝自社データ、他社＝許諾・明示条件のあるものだけ）。
import type { Source } from './types';

export const sources: Source[] = [
  {
    id: 'kaitou-official',
    label: '「怪盗と秘密の試験」公式サイト（自社運営）',
    url: 'https://kabuexlabs.com/kaitou/',
    kind: 'own-official',
    checkedAt: '2026-09-13T01:23:00+09:00',
    checkedBy: 'Claude（リポジトリ内の公式ページ src/pages/kaitou/index.astro の記載を確認）',
    terms: '自社サイトの記載。日程・料金・人数・年齢・注意事項を自社データとして使用可。画像は公演ブランド（IMMERSIVE ILLUSION）の表記があるため、掲載条件を確認するまで使わない',
  },
  {
    id: 'uwasabanashi-official',
    label: '「ウワサバナシ調査委員会」公式サイト（自社運営）',
    url: 'https://kabuexlabs.com/uwasabanashi/',
    kind: 'own-official',
    checkedAt: '2026-09-13T01:23:00+09:00',
    checkedBy: 'Claude（リポジトリ内の公式ページ src/pages/uwasabanashi/index.astro の記載を確認）',
    terms: '自社サイトの記載。日程・料金・所要時間・年齢・注意事項を自社データとして使用可。キービジュアルは協力先との条件を確認するまで使わない',
  },
  {
    id: 'escape-id-kaitou',
    label: 'escape.id「怪盗と秘密の試験」チケットページ',
    url: 'https://escape.id/ImmersiveIllusion-org/e-kaitou/',
    kind: 'ticket-site',
    checkedAt: '2026-09-13T01:23:00+09:00',
    checkedBy: 'Claude（実装環境から到達できず、内容は未確認）',
    terms: '未確認。開演時刻・受付状況・残席・所要時間はこのページで確認してから入力する。自動取得はしない（利用条件未確認）',
  },
  {
    id: 'escape-id-uwasabanashi',
    label: 'escape.id「ウワサバナシ調査委員会」チケットページ',
    url: 'https://escape.id/uwasabanashi-org/e-case1/',
    kind: 'ticket-site',
    checkedAt: '2026-09-13T01:23:00+09:00',
    checkedBy: 'Claude（実装環境から到達できず、内容は未確認）',
    terms: '未確認。開演時刻・受付状況・残席はこのページで確認してから入力する。自動取得はしない（利用条件未確認）',
  },
];
