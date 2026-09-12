// 公演検索（/events/）判定ロジックの回帰テスト。
//   node --experimental-strip-types scripts/events-test.mjs
// 日付境界（今日・明日・今週末、日曜→月曜、UTC境界）、人数判定、料金の1人あたり換算、
// 空席の有効期限、販売締切、終了・中止・非公開・テストデータの除外、並び順、条件の解釈を確認する。
import {
  parseCriteria, criteriaToQuery, dateWindow, eventState, salesState, seatState, ctaKind, perPerson,
  matchCriteria, resolveAll, resolveListings, isListing, search, nextAvailableDate, validateDataset, compareRows,
} from '../src/lib/events.ts';
import { fixtureDataset, fixtureOcc, fixtureWork, fixtureListing } from '../src/data/events/fixtures.ts';

let fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'OK ' : 'NG '} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
  if (!ok) fail++;
};
const jst = (s) => new Date(`${s}+09:00`);
const q = (s) => parseCriteria(new URLSearchParams(s));

// ---- 日付の窓（今日・明日・今週末は日本時間） ----
eq('today 水曜', dateWindow(q('when=today'), jst('2026-09-09T10:00:00')), ['2026-09-09']);
eq('tomorrow 水曜', dateWindow(q('when=tomorrow'), jst('2026-09-09T10:00:00')), ['2026-09-10']);
eq('weekend 水曜→土日', dateWindow(q('when=weekend'), jst('2026-09-09T10:00:00')), ['2026-09-12', '2026-09-13']);
eq('weekend 土曜→土日', dateWindow(q('when=weekend'), jst('2026-09-12T09:00:00')), ['2026-09-12', '2026-09-13']);
eq('weekend 日曜→当日のみ', dateWindow(q('when=weekend'), jst('2026-09-13T13:00:00')), ['2026-09-13']);
eq('weekend 日曜23:59→当日', dateWindow(q('when=weekend'), jst('2026-09-13T23:59:59')), ['2026-09-13']);
eq('weekend 月曜0:00→翌週末', dateWindow(q('when=weekend'), jst('2026-09-14T00:00:00')), ['2026-09-19', '2026-09-20']);
eq('today UTC境界（日曜15:00Z＝月曜0:00 JST）', dateWindow(q('when=today'), new Date('2026-09-13T15:00:00Z')), ['2026-09-14']);
eq('tomorrow 月末', dateWindow(q('when=tomorrow'), jst('2026-09-30T23:00:00')), ['2026-10-01']);
eq('date 指定', dateWindow(q('when=date&date=2026-10-03'), jst('2026-09-09T10:00:00')), ['2026-10-03']);
eq('all は窓なし', dateWindow(q(''), jst('2026-09-09T10:00:00')), null);

// ---- 条件の解釈（不正値は捨てる） ----
eq('parse 正常', q('when=weekend&party=2&area=shibuya&genre=murder-mystery&start=evening&end=19:00&budget=5000'), { when: 'weekend', party: 2, area: 'shibuya', genre: 'murder-mystery', start: 'evening', endBy: '19:00', budget: 5000 });
eq('parse 不正値', q('when=xxx&party=99&area=Sh!&genre=zzz&start=noon&end=25:00&budget=5&date=2026-02-30'), { when: 'all' });
eq('parse date のみ→when=date', q('date=2026-10-03'), { when: 'date', date: '2026-10-03' });
eq('query 往復', criteriaToQuery(q('when=today&party=3&budget=8000')), '?when=today&party=3&budget=8000');

// ---- 回の状態 ----
const now = jst('2026-09-13T13:00:00');
eq('前日は終了', eventState({ date: '2026-09-12', start: 900, eventStatus: 'scheduled' }, now), 'ended');
eq('当日・時刻不明', eventState({ date: '2026-09-13', eventStatus: 'scheduled' }, now), 'today-time-unknown');
eq('当日・開演前', eventState({ date: '2026-09-13', start: 15 * 60, end: 16 * 60, eventStatus: 'scheduled' }, now), 'upcoming');
eq('当日・開演済み（終了予定前）', eventState({ date: '2026-09-13', start: 12 * 60 + 30, end: 14 * 60, eventStatus: 'scheduled' }, now), 'started');
eq('当日・終了予定を過ぎた', eventState({ date: '2026-09-13', start: 11 * 60, end: 12 * 60 + 30, eventStatus: 'scheduled' }, now), 'ended');
eq('当日・開演済み・終了時刻不明は日付内は started', eventState({ date: '2026-09-13', start: 11 * 60, eventStatus: 'scheduled' }, now), 'started');
eq('中止', eventState({ date: '2026-09-13', eventStatus: 'cancelled' }, now), 'cancelled');
eq('開催未確認', eventState({ date: '2026-09-20', eventStatus: 'unknown' }, now), 'unknown');
eq('明日は upcoming', eventState({ date: '2026-09-14', eventStatus: 'confirmed' }, now), 'upcoming');

// ---- 販売締切・空席期限 ----
const openOcc = fixtureOcc({ sales: { status: 'open', checkedAt: '2026-09-09T10:00:00+09:00', closesAt: '2026-09-13T12:00:00+09:00', channels: [{ channelId: 'ch', url: 'https://example.com/' }] } });
eq('販売締切前は受付中', salesState(openOcc, 'upcoming', jst('2026-09-13T11:59:00')), 'open');
eq('販売締切後は受付終了', salesState(openOcc, 'upcoming', jst('2026-09-13T12:00:00')), 'closed');
eq('終了した回は受付終了', salesState(fixtureOcc({ sales: { status: 'open', checkedAt: '2026-09-09T10:00:00+09:00', channels: [{ channelId: 'ch', url: 'https://example.com/' }] } }), 'ended', now), 'closed');
const seatOcc = fixtureOcc({ seats: { status: 'available', checkedAt: '2026-09-12T10:00:00+09:00', expiresAt: '2026-09-13T10:00:00+09:00' } });
eq('空席あり（期限内）', seatState(seatOcc, jst('2026-09-13T09:59:00')), 'available');
eq('空席あり（期限切れ→未確認）', seatState(seatOcc, jst('2026-09-13T10:00:00')), 'unknown');
eq('満席（期限切れ→未確認）', seatState(fixtureOcc({ seats: { status: 'soldout', checkedAt: '2026-09-12T10:00:00+09:00', expiresAt: '2026-09-13T10:00:00+09:00' } }), now), 'unknown');
eq('確認日時なしは未確認', seatState(fixtureOcc({ seats: { status: 'available' } }), now), 'unknown');

// ---- 予約ボタンの種類 ----
eq('開催予定だけでは予約可にしない', ctaKind('upcoming', 'unknown', 'unknown'), 'check');
eq('受付中＋空席未確認は確認', ctaKind('upcoming', 'open', 'unknown'), 'check');
eq('受付中＋空席ありで予約', ctaKind('upcoming', 'open', 'available'), 'book');
eq('満席', ctaKind('upcoming', 'open', 'soldout'), 'soldout');
eq('受付終了', ctaKind('upcoming', 'closed', 'available'), 'closed');
eq('発売前', ctaKind('upcoming', 'not-yet', 'unknown'), 'not-yet');
eq('開演済み', ctaKind('started', 'open', 'available'), 'started');
eq('中止', ctaKind('cancelled', 'open', 'available'), 'cancelled');

// ---- 料金（1人・1組・貸切を混同しない） ----
eq('1人料金', perPerson({ unit: 'per-person', amount: 4000 }, 3), 4000);
eq('1人料金・人数なし', perPerson({ unit: 'per-person', amount: 4000 }), 4000);
const grp = { unit: 'per-group', tiers: [{ party: 2, amount: 13000 }, { party: 3, amount: 16500 }, { party: 4, amount: 19600 }] };
eq('1組料金→2人', perPerson(grp, 2), 6500);
eq('1組料金→3人', perPerson(grp, 3), 5500);
eq('1組料金→4人（切上げ）', perPerson(grp, 4), 4900);
eq('1組料金→人数外は算出不可', perPerson(grp, 5), undefined);
eq('1組料金→人数未指定は算出不可', perPerson(grp), undefined);
eq('貸切総額→1人あたり', perPerson({ unit: 'charter', amount: 60000 }, 6), 10000);
eq('貸切総額→人数未指定', perPerson({ unit: 'charter', amount: 60000 }), undefined);

// ---- 条件との適合 ----
const row = (o = {}) => ({ id: 'r', workId: 'w', slug: 'w', title: 't', date: '2026-09-13', start: 19 * 60, end: 20 * 60 + 30, eventStatus: 'scheduled', region: 'tokyo', area: 'shibuya', genres: ['story-experience'], party: { min: 1, max: 6 }, price: { unit: 'per-person', amount: 4000 }, kind: 'own', ...o });
const n9 = jst('2026-09-09T10:00:00');
eq('週末＋人数2', matchCriteria(row(), q('when=weekend&party=2'), n9), 'match');
eq('人数が上限超', matchCriteria(row(), q('party=7'), n9), 'no');
eq('人数が下限未満', matchCriteria(row({ party: { min: 2, max: 4 } }), q('party=1'), n9), 'no');
eq('上限未確認＋複数人→要確認', matchCriteria(row({ party: { min: 1 } }), q('party=3'), n9), 'unknown');
eq('上限未確認＋1人→適合', matchCriteria(row({ party: { min: 1 } }), q('party=1'), n9), 'match');
eq('人数条件が未確認（party なし）＋人数指定→要確認', matchCriteria(row({ party: undefined }), q('party=2'), n9), 'unknown');
eq('人数条件が未確認＋人数未指定→適合', matchCriteria(row({ party: undefined }), q(''), n9), 'match');
eq('日付が窓の外', matchCriteria(row({ date: '2026-09-19' }), q('when=weekend'), n9), 'no');
eq('今日（時刻不明）', matchCriteria(row({ start: undefined, end: undefined }), q('when=today'), jst('2026-09-13T09:00:00')), 'match');
eq('夜の時間帯', matchCriteria(row(), q('start=evening'), n9), 'match');
eq('午前を指定→不一致', matchCriteria(row(), q('start=morning'), n9), 'no');
eq('時刻未確認で時間帯指定→要確認', matchCriteria(row({ start: undefined, end: undefined }), q('start=evening'), n9), 'unknown');
eq('終了上限 21:00 に収まる', matchCriteria(row(), q('end=21:00'), n9), 'match');
eq('終了上限 20:00 を超える', matchCriteria(row(), q('end=20:00'), n9), 'no');
eq('終了未確認で上限指定→要確認', matchCriteria(row({ end: undefined }), q('end=21:00'), n9), 'unknown');
eq('予算内', matchCriteria(row(), q('budget=5000'), n9), 'match');
eq('予算超', matchCriteria(row(), q('budget=3000'), n9), 'no');
eq('1組料金＋人数2＋予算8000', matchCriteria(row({ price: grp, party: { min: 2, max: 4 } }), q('party=2&budget=8000'), n9), 'match');
eq('1組料金＋人数2＋予算5000', matchCriteria(row({ price: grp, party: { min: 2, max: 4 } }), q('party=2&budget=5000'), n9), 'no');
eq('1組料金＋人数未指定＋予算→要確認', matchCriteria(row({ price: grp, party: { min: 2, max: 4 } }), q('budget=8000'), n9), 'unknown');
eq('ジャンル不一致', matchCriteria(row(), q('genre=murder-mystery'), n9), 'no');
eq('エリア不一致', matchCriteria(row(), q('area=roppongi'), n9), 'no');
eq('地域一致', matchCriteria(row(), q('region=tokyo'), n9), 'match');
eq('終了した回は窓内でも除外', matchCriteria(row({ date: '2026-09-12' }), q('when=weekend'), jst('2026-09-13T09:00:00')), 'no');
eq('中止は除外', matchCriteria(row({ eventStatus: 'cancelled' }), q(''), n9), 'no');
eq('開催未確認は要確認', matchCriteria(row({ eventStatus: 'unknown' }), q(''), n9), 'unknown');

// ---- データセットからの検索（非公開・テスト・終了・中止の除外、並び順、主催者優先なし） ----
const ds = fixtureDataset();
const all = resolveAll(ds, jst('2026-09-13T09:00:00'));
eq('公開・非テスト・公開作品のみ（終了・中止は含むが後で除外）', all.map((r) => r.occ.id), ['a-0912', 'a-0913-10', 'x-cancel', 'a-0913-19', 'b-0913', 'a-0919', 'c-0920']);
const r1 = search(all, q('when=today'), jst('2026-09-13T09:00:00'));
eq('今日：時刻順→時刻不明は末尾、中止・終了・非公開は出さない', r1.matched.map((r) => r.occ.id), ['a-0913-10', 'a-0913-19', 'b-0913']);
eq('今日：人数未指定なら1組料金の作品も要確認にしない', r1.unknown.map((r) => r.occ.id), []);
const r2 = search(all, q('when=today&party=2'), jst('2026-09-13T09:00:00'));
eq('人数2：作品B（2〜3名）も適合し、時刻不明は末尾', r2.matched.map((r) => r.occ.id), ['a-0913-10', 'a-0913-19', 'b-0913']);
eq('人数2：作品Bは時刻不明なので予約は「確認」', r2.matched.find((r) => r.occ.id === 'b-0913').cta, 'check');
const all11 = resolveAll(ds, jst('2026-09-13T11:00:00'));
const r3 = search(all11, q('when=today'), jst('2026-09-13T11:00:00'));
eq('11時：10時の回は開演済み（終了予定11:30前）で残る', r3.matched.map((r) => r.eventState), ['started', 'upcoming', 'today-time-unknown']);
eq('開演済みの回は予約ボタンを出さない', r3.matched[0].cta, 'started');
const all1130 = resolveAll(ds, jst('2026-09-13T11:30:00'));
const r4 = search(all1130, q('when=today'), jst('2026-09-13T11:30:00'));
eq('11:30：10時の回は終了して消える', r4.matched.map((r) => r.occ.id), ['a-0913-19', 'b-0913']);
eq('人数3・上限未確認の作品は要確認枠', search(all, q('party=3'), jst('2026-09-13T09:00:00')).unknown.map((r) => r.occ.id), ['c-0920']);
eq('受付中＋空席あり（期限内）は予約可', all.find((r) => r.occ.id === 'a-0919').cta, 'book');
eq('空席の期限切れ後は確認扱い', resolveAll(ds, jst('2026-09-17T09:00:00')).find((r) => r.occ.id === 'a-0919').cta, 'check');
eq('確認期限（14日）内は stale でない', all[0].stale, false);
eq('確認期限切れは stale', resolveAll(ds, jst('2026-09-24T09:00:00')).find((r) => r.occ.id === 'a-0919').stale, true);
eq('0件→次の候補日', nextAvailableDate(all, q('when=tomorrow'), jst('2026-09-13T09:00:00')), '2026-09-19');
eq('0件→次の候補日（人数3は 9/19 の作品Aが適合）', nextAvailableDate(all, q('when=today&party=3'), jst('2026-09-13T09:00:00')), '2026-09-19');
eq('0件→候補なし（人数7）', nextAvailableDate(all, q('when=today&party=7'), jst('2026-09-13T09:00:00')), null);
eq('自社と他社が同日なら時刻順（自社優先しない）', search(all, q('when=today&party=2'), jst('2026-09-13T09:00:00')).matched.map((r) => r.organizer.relation), ['ex-labs', 'ex-labs', 'third-party']);

// ---- 外部サイト掲載（listings） ----
const ext = resolveListings(ds, jst('2026-09-13T09:00:00'));
eq('掲載：公開・非テストのみ、日付→時刻順', ext.map((r) => r.listing.id), ['l2', 'l1', 'l-sold']);
eq('掲載：募集中は「確認」ボタン、満席は soldout', ext.map((r) => r.cta), ['check', 'check', 'soldout']);
eq('掲載：isListing', ext.map(isListing), [true, true, true]);
const mixed = [...all, ...ext].sort((a, b) => compareRows(a.row, b.row));
const rm = search(mixed, q('when=today'), jst('2026-09-13T09:00:00'));
eq('自社と外部を同じ並びで（時刻順、同時刻は作品名順、時刻不明は末尾）', rm.matched.map((r) => r.row.id), ['a-0913-10', 'listing:l2', 'a-0913-19', 'listing:l1', 'b-0913']);
eq('外部・1組料金で予算指定→要確認（l1 は人数条件未確認で要確認）', search(ext, q('when=today&party=2&budget=5000'), jst('2026-09-13T09:00:00')).unknown.map((r) => r.listing.id), ['l2', 'l1']);
eq('外部・人数未指定なら 1組料金だけ要確認', search(ext, q('when=today&budget=5000'), jst('2026-09-13T09:00:00')).unknown.map((r) => r.listing.id), ['l2']);
eq('外部・1人料金 4500 は予算 5000 に適合', search(ext, q('when=today&budget=5000'), jst('2026-09-13T09:00:00')).matched.map((r) => r.listing.id), ['l1']);
eq('外部・人数未確認＋人数指定→要確認', search(ext, q('when=today&party=3'), jst('2026-09-13T09:00:00')).unknown.map((r) => r.listing.id), ['l1']);
eq('外部・確認から8日で stale', resolveListings(ds, jst('2026-09-17T11:00:00'))[0].stale, true);
eq('外部・終了した回は結果に出ない', search(ext, q('when=today'), jst('2026-09-13T23:00:00')).matched.map((r) => r.listing.id), []);

// ---- 登録時の検証 ----
eq('正常データは検証エラーなし', validateDataset(ds), []);
const bad = fixtureDataset();
bad.occurrences.push(fixtureOcc({ id: 'dup', date: '2026-09-13', startTime: '19:00' }));
bad.occurrences.push(fixtureOcc({ id: 'badtime', startTime: '19:00', endTime: '18:00' }));
bad.occurrences.push(fixtureOcc({ id: 'seat-nocheck', seats: { status: 'available' } }));
bad.occurrences.push(fixtureOcc({ id: 'sales-nocheck', sales: { status: 'open', channels: [{ channelId: 'ch', url: 'https://example.com/' }] } }));
bad.occurrences.push(fixtureOcc({ id: 'badurl', sales: { status: 'unknown', channels: [{ channelId: 'ch', url: 'javascript:alert(1)' }] } }));
bad.occurrences.push(fixtureOcc({ id: 'test-pub', test: true, published: true, date: '2026-09-21' }));
bad.occurrences.push(fixtureOcc({ id: 'nosrc', date: '2026-09-22', sourceIds: [] }));
bad.works.push(fixtureWork({ id: 'w-nounit', slug: 'w-nounit', price: { unit: undefined, text: '', taxIncluded: true, feeNote: '' } }));
bad.works.push(fixtureWork({ id: 'w-img', slug: 'w-img', image: { path: '/x.webp', holder: '', terms: '', confirmedAt: '', confirmedBy: '' } }));
bad.listings.push(fixtureListing({ id: 'l-dup', date: '2026-09-13', startTime: '19:00' }));
bad.listings.push(fixtureListing({ id: 'l-nosite', siteId: 'nope', date: '2026-09-21' }));
bad.listings.push(fixtureListing({ id: 'l-nounit', priceUnit: undefined, date: '2026-09-22' }));
bad.listings.push(fixtureListing({ id: 'l-testpub', test: true, published: true, date: '2026-09-23' }));
const errs = validateDataset(bad);
const has = (s) => errs.some((e) => e.includes(s));
eq('重複回を検出', has('同じ公演回の重複'), true);
eq('終了≤開演を検出', has('終了時刻が開演時刻以前'), true);
eq('空席の確認日時欠落を検出', has('seats.checkedAt/expiresAt'), true);
eq('販売状態の確認日時欠落を検出', has('sales.checkedAt'), true);
eq('不正URLを検出', has('販売先 URL が不正'), true);
eq('テストデータの公開を検出', has('テストデータ（test:true）が published'), true);
eq('情報源欠落を検出', has('情報源（sourceIds）が空'), true);
eq('料金単位欠落を検出', has('price.unit'), true);
eq('画像の利用条件未確認を検出', has('画像の利用条件'), true);
eq('掲載の重複を検出', has('同じ掲載の重複'), true);
eq('掲載元サイト不明を検出', has('sourceSites に無い'), true);
eq('掲載の料金単位欠落を検出', has('priceUnit（1人／1組／貸切）'), true);
eq('掲載のテストデータ公開を検出', errs.filter((e) => e.includes('listing') && e.includes('test:true')).length, 1);

console.log(fail ? `\n公演検索テスト: ${fail} 件失敗` : '\n公演検索テスト: 全件OK');
process.exit(fail ? 1 : 0);
