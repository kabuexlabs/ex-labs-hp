// 外部サイトに掲載中の公演回（他社公演の簡易掲載）。/events/ の検索結果と「ほかのサイトに掲載中の公演」に並ぶ。
// ルール：
//  - 各サイトを実際に開いて確認した回だけ入れる（自動取得・推測はしない）。url は掲載元の該当ページ。
//  - 料金は「1人」「1組」「貸切」を priceUnit で区別し、amount は 1人あたりが確定している場合だけ。
//  - 人数条件が読み取れなければ party を省く（人数で絞ると「判定できない」枠に出る）。
//  - 残席は remainingText に掲載元の文言をそのまま（確認時点として checkedAt と並べて表示）。
//  - 掲載停止は published: false。テスト用は test: true（公開されない）。
// 入力例（コメント）：
// {
//   id: 'rabbithole-2026-09-20-xxx', title: '作品名', siteId: 'rabbithole', organizerName: 'Rabbithole 渋谷店',
//   url: 'https://rabbithole.jp/…', genres: ['murder-mystery'], regionId: 'tokyo', areaId: 'shibuya', venueName: 'Rabbithole 渋谷店',
//   date: '2026-09-20', startTime: '19:00', durationMinutes: 180,
//   priceText: '¥4,500（1人）', priceUnit: 'per-person', amount: 4500, party: { min: 1, max: 6, text: '1名から相席' },
//   status: 'open', remainingText: '残り2席', checkedAt: '2026-09-13T12:00:00+09:00', checkedBy: '飯田', published: true,
// },
import type { Listing } from './types';

export const listings: Listing[] = [];
