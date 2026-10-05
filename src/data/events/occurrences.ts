// 公演回。開催の確認（eventCheckedAt）と空席の確認（seats.checkedAt）は別に持つ。
// 販売状態・空席は公式チケットページで確認できた時だけ入れる。未確認は 'unknown'。
// 同じ作品・会場・日付・開演時刻の回を2つ入れない（scripts/events-validate.mjs が検出する）。
import type { Occurrence } from './types';

const KAITOU_DATES = ['2026-09-06', '2026-09-13', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04', '2026-10-11'];
const UWASA_DATES = ['2026-09-19', '2026-09-20', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04'];

const SOLDOUT_AT = '2026-10-05T12:00:00+09:00';
const CHECKED = '2026-09-17T03:02:00+09:00'; // 自社公式ページの開催日一覧を再確認（escape.id の開演時刻・受付状況は未確認）

export const occurrences: Occurrence[] = [
  ...KAITOU_DATES.map<Occurrence>((date) => ({
    id: `kaitou-${date}`,
    workId: 'kaitou',
    venueId: 'bar-neon-roppongi',
    date,
    // 開演時刻は公式チケットページ（escape.id）にのみ掲載されており未確認
    eventStatus: 'scheduled',
    eventCheckedAt: CHECKED,
    eventCheckedBy: 'Claude（自社公式ページの開催日一覧を確認）',
    sales: { status: 'unknown', channels: [{ channelId: 'escape-id', url: 'https://escape.id/ImmersiveIllusion-org/e-kaitou/' }] },
    // 2026-10-05 主催（株式会社ex Labs）からの連絡で全回完売
    seats: { status: 'soldout', checkedAt: SOLDOUT_AT, expiresAt: '2026-10-12T00:00:00+09:00' },
    sourceIds: ['kaitou-official', 'escape-id-kaitou'],
    published: true,
  })),
  ...UWASA_DATES.map<Occurrence>((date) => ({
    id: `uwasabanashi-${date}`,
    workId: 'uwasabanashi',
    venueId: 'shibuya-sakura-stage',
    date,
    eventStatus: 'scheduled',
    eventCheckedAt: CHECKED,
    eventCheckedBy: 'Claude（自社公式ページの開催日一覧を確認）',
    sales: { status: 'unknown', channels: [{ channelId: 'escape-id', url: 'https://escape.id/uwasabanashi-org/e-case1/' }] },
    // 2026-10-05 主催（株式会社ex Labs）からの連絡で完売
    seats: { status: 'soldout', checkedAt: SOLDOUT_AT, expiresAt: '2026-10-12T00:00:00+09:00' },
    sourceIds: ['uwasabanashi-official', 'escape-id-uwasabanashi'],
    published: true,
  })),
];
