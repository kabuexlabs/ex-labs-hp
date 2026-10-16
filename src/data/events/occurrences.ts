// 公演回。開催の確認（eventCheckedAt）と空席の確認（seats.checkedAt）は別に持つ。
// 販売状態・空席は公式チケットページで確認できた時だけ入れる。未確認は 'unknown'。
// 同じ作品・会場・日付・開演時刻の回を2つ入れない（scripts/events-validate.mjs が検出する）。
import type { Occurrence } from './types';

const KAITOU_DATES = ['2026-09-06', '2026-09-13', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04', '2026-10-11'];
const UWASA_DATES = ['2026-09-19', '2026-09-20', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04'];

const SOLDOUT_AT = '2026-10-05T12:00:00+09:00';
// case2「言祝ぎの家」（公式ページの PERFORMANCES と同じ。変更時は両方を直す）。販売は各回の開演2時間前まで
const KOTOHOGI: [string, string[]][] = [
  ['2026-10-23', ['16:00', '18:00', '20:00']],
  ['2026-10-24', ['13:00', '15:00', '17:30', '19:30']],
  ['2026-10-25', ['13:00', '15:00', '17:30', '19:30']],
  ['2026-10-30', ['16:00', '18:00', '20:00']],
  ['2026-11-01', ['13:00', '15:00', '17:30', '19:30']],
  ['2026-11-03', ['13:00', '15:00', '17:30', '19:30']],
];
// 午前零時の幻想集（公式ページ /gensou/ と同じ）。各日17:00〜20:00に12分おきに開始する回を、日ごとに1件（17:00〜20:50）で登録する。
// 販売は各回の開始2時間前まで（最終回20:00 → 18:00締切）
const GENSOU_DATES = ['05', '06', '07', '08', '12', '13', '14', '15', '19', '20', '21', '22'].map((d) => `2026-11-${d}`);
const GENSOU_CHECKED = '2026-10-16T12:00:00+09:00';
const KOTOHOGI_CHECKED = '2026-10-07T10:00:00+09:00';
const minus2h = (d: string, t: string) => new Date(Date.parse(`${d}T${t}:00+09:00`) - 2 * 3600000 + 9 * 3600000).toISOString().slice(0, 19) + '+09:00';
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
  ...KOTOHOGI.flatMap(([date, times]) => times.map<Occurrence>((startTime) => ({
    id: `kotohogi-${date}-${startTime.replace(':', '')}`,
    workId: 'kotohogi',
    venueId: 'kotohogi-house',
    date,
    startTime,
    eventStatus: 'scheduled',
    eventCheckedAt: KOTOHOGI_CHECKED,
    eventCheckedBy: 'Claude（自社公式ページの開催日・開演時刻を確認）',
    sales: { status: 'unknown', closesAt: minus2h(date, startTime), channels: [{ channelId: 'escape-id', url: 'https://escape.id/uwasabanashi-org/e-hanayome/' }] },
    // 2026-10-15 主催（株式会社ex Labs）からの連絡で全公演完売
    seats: { status: 'soldout', checkedAt: '2026-10-15T12:00:00+09:00', expiresAt: '2026-11-04T00:00:00+09:00' },
    sourceIds: ['kotohogi-official', 'escape-id-kotohogi'],
    published: true,
  }))),
  ...GENSOU_DATES.map<Occurrence>((date) => ({
    id: `gensou-${date}`,
    workId: 'gensou',
    venueId: 'yumenoshima-tropical',
    date,
    startTime: '17:00',
    endTime: '20:50',
    eventStatus: 'scheduled',
    eventCheckedAt: GENSOU_CHECKED,
    eventCheckedBy: 'Claude（自社公式ページの開催日・開始時刻を確認）',
    sales: { status: 'unknown', closesAt: `${date}T18:00:00+09:00`, channels: [{ channelId: 'escape-id', url: 'https://escape.id/gensou-org/e-ichi/' }] },
    seats: { status: 'unknown' },
    sourceIds: ['gensou-official', 'escape-id-gensou'],
    published: true,
  })),
];
