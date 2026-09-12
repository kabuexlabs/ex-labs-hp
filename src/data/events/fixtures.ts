// 動作確認・回帰テスト専用のダミーデータ。公開ページ・サイトマップから import しない
// （scripts/events-validate.mjs が src/pages からの参照を検出して止める）。
import type { EventsDataset, Occurrence, Work } from './types.ts';

const T = '2026-09-09T10:00:00+09:00';
const src = (id: string) => ({ id, label: `test ${id}`, url: 'https://example.com/' + id, kind: 'own-official' as const, checkedAt: T, checkedBy: 'test', terms: 'テスト用' });

export function fixtureWork(over: Partial<Work> = {}): Work {
  return {
    id: 'w1', slug: 'w1', title: 'テスト作品A', organizerId: 'org-own', genres: ['story-experience'],
    summary: 'テスト', description: ['テスト本文'], officialUrl: '/test/',
    duration: { minutes: 90, text: '約90分' },
    price: { unit: 'per-person', amount: 4000, text: '¥4,000', taxIncluded: true, feeNote: '手数料別' },
    party: { min: 1, max: 6, soloAllowed: true, soloRuns: false, format: 'shared', text: '1〜6名' },
    info: {}, sourceIds: ['s1'], verified: { at: T, by: 'test' }, verifyTtlDays: 14, published: true, updatedAt: '2026-09-09',
    ...over,
  };
}
export function fixtureOcc(over: Partial<Occurrence> = {}): Occurrence {
  return {
    id: 'o1', workId: 'w1', venueId: 'v1', date: '2026-09-13', eventStatus: 'scheduled',
    eventCheckedAt: T, eventCheckedBy: 'test',
    sales: { status: 'unknown', channels: [{ channelId: 'ch', url: 'https://example.com/ticket' }] },
    seats: { status: 'unknown' }, sourceIds: ['s1'], published: true,
    ...over,
  };
}
export function fixtureDataset(): EventsDataset {
  return {
    sources: [src('s1')],
    organizers: [
      { id: 'org-own', name: '株式会社ex Labs', relation: 'ex-labs', relationLabel: 'ex Labs 企画・制作', sourceIds: ['s1'] },
      { id: 'org-3rd', name: '他社テスト', relation: 'third-party', relationLabel: '主催：他社テスト', sourceIds: ['s1'] },
    ],
    venues: [
      { id: 'v1', name: '会場1', regionId: 'tokyo', areaId: 'shibuya', sourceIds: ['s1'] },
      { id: 'v2', name: '会場2', regionId: 'tokyo', areaId: 'roppongi', sourceIds: ['s1'] },
    ],
    channels: [{ id: 'ch', name: 'テスト販売', feeNote: '手数料は購入画面で確認' }],
    works: [
      fixtureWork(),
      fixtureWork({ id: 'w2', slug: 'w2', title: 'テスト作品B（他社）', organizerId: 'org-3rd', genres: ['murder-mystery'],
        price: { unit: 'per-group', tiers: [{ party: 2, amount: 13000 }, { party: 3, amount: 16500 }], text: '2人 ¥13,000／3人 ¥16,500', taxIncluded: true, feeNote: '手数料別' },
        party: { min: 2, max: 3, soloAllowed: false, format: 'private', text: '2〜3名' }, duration: { text: '未確認' } }),
      fixtureWork({ id: 'w3', slug: 'w3', title: '上限未確認', party: { min: 1, soloAllowed: true, format: 'unknown', text: '1名〜' } }),
      fixtureWork({ id: 'w4', slug: 'w4', title: '非公開作品', published: false }),
    ],
    occurrences: [
      fixtureOcc({ id: 'a-0913-19', date: '2026-09-13', startTime: '19:00' }),
      fixtureOcc({ id: 'a-0913-10', date: '2026-09-13', startTime: '10:00' }),
      fixtureOcc({ id: 'b-0913', workId: 'w2', venueId: 'v2', date: '2026-09-13' }),
      fixtureOcc({ id: 'a-0912', date: '2026-09-12', startTime: '14:00' }),
      fixtureOcc({ id: 'a-0919', date: '2026-09-19', startTime: '14:00', sales: { status: 'open', checkedAt: T, channels: [{ channelId: 'ch', url: 'https://example.com/ticket' }] }, seats: { status: 'available', checkedAt: T, expiresAt: '2026-09-16T10:00:00+09:00' } }),
      fixtureOcc({ id: 'c-0920', workId: 'w3', date: '2026-09-20' }),
      fixtureOcc({ id: 'x-cancel', date: '2026-09-13', startTime: '15:00', eventStatus: 'cancelled' }),
      fixtureOcc({ id: 'x-unpub', date: '2026-09-13', startTime: '16:00', published: false }),
      fixtureOcc({ id: 'x-test', date: '2026-09-13', startTime: '17:00', published: false, test: true }),
      fixtureOcc({ id: 'd-0913', workId: 'w4', date: '2026-09-13', startTime: '18:00' }),
    ],
  };
}
