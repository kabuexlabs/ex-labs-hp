// 「今週遊べる公演」判定の回帰テスト。
//   node --experimental-strip-types scripts/this-week-test.mjs
// 日曜→月曜の切替、月・年をまたぐ週、終了回、中止・完売、時刻不明、対象なし、確認期限切れを確認する。
import { weekRange, occurrenceState, thisWeekShows, nextOccurrence, jstDateString, fmtDateJa } from '../src/lib/thisWeek.ts';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const jst = (s) => new Date(`${s}+09:00`);
const show = (occ, over = {}) => ({
  id: 't', name: 't', area: '', feature: '', url: '/t/', ticketUrl: 'https://x/', ticketSite: 'x', duration: '', capacity: '', age: '',
  price: { text: '', unit: '1人あたり', note: '' }, conditions: [], occurrences: occ,
  verifiedAt: '2026-09-09T10:30:00+09:00', verifyTtlDays: 14, verifiedFrom: [], published: true, ...over,
});

// 週の範囲：水曜 9/9 → 9/7（月）〜9/14（月）未満、週末 9/12・9/13
eq('weekRange 水曜', weekRange(jst('2026-09-09T10:00:00')), { start: '2026-09-07', end: '2026-09-14', weekend: ['2026-09-12', '2026-09-13'] });
// 日曜 23:59 はまだ同じ週、月曜 0:00 は翌週
eq('weekRange 日曜23:59', weekRange(jst('2026-09-13T23:59:59')).start, '2026-09-07');
eq('weekRange 月曜0:00', weekRange(jst('2026-09-14T00:00:00')).start, '2026-09-14');
// UTC では日曜でも JST で月曜になる境界（日曜 15:00Z ＝ 月曜 0:00 JST）
eq('weekRange UTC境界', weekRange(new Date('2026-09-13T15:00:00Z')).start, '2026-09-14');
// 月またぎ：9/30（水）→ 9/28〜10/5
eq('weekRange 月またぎ', weekRange(jst('2026-09-30T12:00:00')), { start: '2026-09-28', end: '2026-10-05', weekend: ['2026-10-03', '2026-10-04'] });
// 年またぎ：2026-12-31（木）→ 12/28〜2027-01-04
eq('weekRange 年またぎ', weekRange(jst('2026-12-31T12:00:00')), { start: '2026-12-28', end: '2027-01-04', weekend: ['2027-01-02', '2027-01-03'] });

// 回の状態
const now = jst('2026-09-13T13:00:00');
eq('前日以前は終了', occurrenceState({ date: '2026-09-12', status: 'scheduled' }, now), 'ended');
eq('当日・時刻不明', occurrenceState({ date: '2026-09-13', status: 'scheduled' }, now), 'today-time-unknown');
eq('当日・開演前', occurrenceState({ date: '2026-09-13', time: '15:00', status: 'scheduled' }, now), 'upcoming');
eq('当日・開演済み', occurrenceState({ date: '2026-09-13', time: '12:30', status: 'scheduled' }, now), 'started');
eq('当日・終了済み（90分後）', occurrenceState({ date: '2026-09-13', time: '11:00', status: 'scheduled' }, now), 'ended');
eq('中止', occurrenceState({ date: '2026-09-13', status: 'cancelled' }, now), 'cancelled');
eq('完売', occurrenceState({ date: '2026-09-13', status: 'soldout' }, now), 'soldout');

// 今週の抽出
const s1 = show([{ date: '2026-09-06', status: 'scheduled' }, { date: '2026-09-13', status: 'scheduled' }, { date: '2026-09-26', status: 'scheduled' }]);
const r1 = thisWeekShows([s1], jst('2026-09-09T10:00:00'));
eq('今週に1回（9/13）だけ残る', r1.map((r) => r.occurrences.map((o) => o.date)), [['2026-09-13']]);
eq('週末フラグ', r1[0].occurrences[0].isWeekend, true);
eq('予約案内可', r1[0].bookable, true);
// 日曜 23:59（時刻不明の当日回）はまだ表示、月曜 0:00 で消える
eq('日曜深夜は表示', thisWeekShows([s1], jst('2026-09-13T23:59:00')).length, 1);
eq('月曜0:00で対象なし', thisWeekShows([s1], jst('2026-09-14T00:00:00')).length, 0);
// 中止のみ → 対象なし、完売のみ → 表示するが予約案内しない
eq('中止のみは対象外', thisWeekShows([show([{ date: '2026-09-13', status: 'cancelled' }])], now).length, 0);
const so = thisWeekShows([show([{ date: '2026-09-13', status: 'soldout' }])], jst('2026-09-09T10:00:00'));
eq('完売は表示・予約不可', [so.length, so[0]?.bookable], [1, false]);
// 非公開は出さない
eq('非公開は出さない', thisWeekShows([show([{ date: '2026-09-13', status: 'scheduled' }], { published: false })], now).length, 0);
// 確認期限切れ
eq('期限内', thisWeekShows([s1], jst('2026-09-09T10:00:00'))[0].stale, false);
eq('期限切れ（15日後）', thisWeekShows([show([{ date: '2026-09-24T'.slice(0, 10), status: 'scheduled' }])], jst('2026-09-24T10:00:00'))[0].stale, true);
// 次回
eq('次回＝来週以降の最初', nextOccurrence(s1, jst('2026-09-09T10:00:00'))?.date, '2026-09-26');
eq('次回なし', nextOccurrence(show([{ date: '2026-09-13', status: 'scheduled' }]), jst('2026-09-09T10:00:00')), null);
eq('日付表記', fmtDateJa('2026-09-13'), '2026年9月13日（日）');
eq('JST日付', jstDateString(new Date('2026-09-13T15:30:00Z')), '2026-09-14');

console.log(fail ? `\n今週判定テスト: ${fail} 件失敗` : '\n今週判定テスト: 全件OK');
process.exit(fail ? 1 : 0);
